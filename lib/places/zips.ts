// US ZIP codes for the "Where do they ride?" search. scripts/build-zips.ts writes
// public/places/us-zips.json from the Census 2020 ZCTA relationship files, and this file turns it
// into search entries. A ZIP is never a place of its own, and it never guesses a city. It maps to
// a place only when that place holds at least 99 percent of its land. A ZIP split across places
// that touches a county with checked records asks which place they ride in. Any other split ZIP
// stays a ZIP, which uses its state's law and says local rules were not checked.

import { SD_COUNTY_FIPS } from "./sanDiego";
import type { PlaceDataSource, PlaceEntry, PlaceIndex, ZipCover } from "./types";

/** Where the build puts the ZIP file, served from public/ on the app's own origin. */
export const ZIP_INDEX_URL = "/places/us-zips.json";

/** A ZIP maps to one place only when that place holds at least this share of the ZIP's land. */
export const ZIP_PLACE_SHARE = 0.99;

/** The counties with checked local records. A split ZIP that touches one asks which place they ride in. */
export const CHECKED_COUNTIES: ReadonlySet<string> = new Set([SD_COUNTY_FIPS]);

/**
 * The file in public/places/. A row is "zip|counties|place|places|unincorporated|m", with the
 * empty fields at the end left off: the five-digit ZIP, its counties by FIPS joined by "." with
 * the most land first (led by the two-digit state FIPS when the place index has none of its
 * counties in that state, as in Connecticut), the GEOID of the place with at least 99 percent of its land, then, for a
 * split ZIP in a checked county, the GEOIDs of the places it covers and the counties where some
 * of it is in no place, and "m" when less than 99 percent of it is in one state.
 */
export interface ZipIndexFile {
  format: 1;
  built: string;
  about: string;
  sources: PlaceDataSource[];
  counts: Record<string, number>;
  /** The counties with checked records when the file was built. */
  checkedCounties: string[];
  rows: string[];
}

const ZIP = /^\d{5}$/;
const COUNTY = /^\d{5}$/;
const STATE = /^\d{2}$/;
const PLACE = /^\d{7}$/;

/** One place's part of a ZIP, or one county's, by land area in square meters. */
export interface LandPart {
  id: string;
  land: number;
}

/**
 * The place that holds at least 99 percent of a ZIP's land, or null. The build uses this rule and
 * nothing else to map a ZIP to one place, so a ZIP split across places never gets one.
 */
export function placeHolding(zipLand: number, places: readonly LandPart[]): string | null {
  if (!(zipLand > 0)) return null;
  const top = [...places].sort((a, b) => b.land - a.land || a.id.localeCompare(b.id))[0];
  return top && top.land >= ZIP_PLACE_SHARE * zipLand ? top.id : null;
}

export function zipId(zip: string): string {
  return `z-${zip}`;
}

function list(text: string | undefined): string[] {
  return text ? text.split(".") : [];
}

function zipEntry(row: string, n: number, index: PlaceIndex, fipsToState: ReadonlyMap<string, string>): PlaceEntry {
  if (typeof row !== "string") throw new Error(`ZIP row ${n} is not text`);
  const [zip, countyText, place, placesText, uninc, many, ...extra] = row.split("|");
  if (!ZIP.test(zip) || extra.length > 0) throw new Error(`ZIP row ${n} is "${row}"`);
  const items = list(countyText);
  // A ZIP whose counties the place index can't name, like Connecticut's 2020 counties, starts with its state's FIPS.
  const stateItem = items.length > 0 && STATE.test(items[0]) ? items[0] : null;
  const counties = stateItem ? items.slice(1) : items;
  if (items.length === 0 || counties.some((c) => !COUNTY.test(c) || !index.countyNames.has(c))) throw new Error(`ZIP ${zip} names a county the place index doesn't list`);
  const state = fipsToState.get(stateItem ?? counties[0].slice(0, 2));
  if (!state) throw new Error(`ZIP ${zip} is in no state the rules table covers`);
  const placeId = (geoid: string) => {
    if (!PLACE.test(geoid) || !index.byId.has(`p-${geoid}`)) throw new Error(`ZIP ${zip} names place ${geoid}, which the place index doesn't list`);
    return `p-${geoid}`;
  };
  const unincorporated = list(uninc);
  if (unincorporated.some((c) => !counties.includes(c))) throw new Error(`ZIP ${zip} has unincorporated land in a county it is not in`);
  if (many !== undefined && many !== "" && many !== "m") throw new Error(`ZIP ${zip} has a bad state flag "${many}"`);
  const cover: ZipCover = { place: place ? placeId(place) : null, places: list(placesText).map(placeId), unincorporated, manyStates: many === "m" };
  return { id: zipId(zip), name: zip, kind: "zip", source: "zip", state, counties, geoid: zip, rank: n, keys: [zip], zip: cover };
}

/** The ZIP file as entries, in number order. Throws when the file is not one this code can read. */
export function parseZips(file: ZipIndexFile, index: PlaceIndex): PlaceEntry[] {
  if (!file || file.format !== 1 || !Array.isArray(file.rows)) throw new Error("Not a ZIP file in format 1");
  const states = index.entries.filter((e) => e.kind === "state").map((e) => e.state);
  // Every county's state, from the counties the place index puts in each state.
  const fipsToState = new Map<string, string>();
  for (const e of index.entries) if (e.counties.length > 0 && states.includes(e.state)) fipsToState.set(e.counties[0].slice(0, 2), e.state);
  const entries = file.rows.map((row, n) => zipEntry(row, n, index, fipsToState));
  for (let i = 1; i < entries.length; i++) if (entries[i - 1].name >= entries[i].name) throw new Error(`ZIP rows are not in number order at ${entries[i].name}`);
  return entries;
}

/** The search index with every ZIP added. ZIPs go in `zips` and `byId`, not `entries`, so a name search never scans them. */
export function withZips(index: PlaceIndex, file: ZipIndexFile): PlaceIndex {
  const zips = parseZips(file, index);
  const byId = new Map(index.byId);
  for (const e of zips) {
    if (byId.has(e.id)) throw new Error(`The search has two entries with id ${e.id}`);
    byId.set(e.id, e);
  }
  return { ...index, sources: [...index.sources, ...file.sources], byId, zips };
}

/** A ZIP typed in the box: one to five digits, with a ZIP+4 ending allowed. Null when the text is not a ZIP. */
export function zipQuery(text: string): string | null {
  const m = /^\s*(\d{1,5})(?:-\d{0,4})?\s*$/.exec(text);
  return m ? m[1] : null;
}

/** The ZIPs that start with the typed digits, in number order. */
export function searchZips(zips: readonly PlaceEntry[], digits: string, limit: number): PlaceEntry[] {
  let lo = 0;
  let hi = zips.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (zips[mid].name < digits) lo = mid + 1;
    else hi = mid;
  }
  const out: PlaceEntry[] = [];
  for (let i = lo; i < zips.length && out.length < limit && zips[i].name.startsWith(digits); i++) out.push(zips[i]);
  return out;
}

/** One choice a split ZIP offers: a place it covers, or the unincorporated part of a county. */
export interface ZipOption {
  entry: PlaceEntry;
  /** True for a county entry that stands for the parts of the ZIP in no city or community. */
  unincorporated: boolean;
}

/**
 * What picking a ZIP does.
 * place: it adds the place that holds at least 99 percent of the ZIP's land.
 * choose: the ZIP is split, so the page lists its places and unincorporated parts to pick from.
 * zip: the ZIP is split and touches no county with checked records, so the ZIP itself is the pick,
 * with its state's law and the line that local rules were not checked.
 */
export type ZipTarget = { kind: "place"; entry: PlaceEntry } | { kind: "choose"; options: ZipOption[] } | { kind: "zip" };

export function zipTarget(index: Pick<PlaceIndex, "byId">, zip: PlaceEntry): ZipTarget {
  const cover = zip.zip;
  if (!cover) return { kind: "zip" };
  const place = cover.place ? index.byId.get(cover.place) : undefined;
  if (place) return { kind: "place", entry: place };
  const counties = (fips: readonly string[]) =>
    fips.flatMap((c) => {
      const entry = index.byId.get(`c-${c}`);
      return entry ? [{ entry, unincorporated: true }] : [];
    });
  if (cover.manyStates) return { kind: "choose", options: counties(zip.counties).map((o) => ({ ...o, unincorporated: false })) };
  if (!zip.counties.some((c) => CHECKED_COUNTIES.has(c))) return { kind: "zip" };
  const places = cover.places.flatMap((id) => {
    const entry = index.byId.get(id);
    return entry ? [{ entry, unincorporated: false }] : [];
  });
  return { kind: "choose", options: [...places, ...counties(cover.unincorporated)] };
}
