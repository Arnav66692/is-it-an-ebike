// Picks for the checked records an old share link names, like the QR flyer's
// ?state=CA&place=city_of_san_diego,sduhsd_campuses. They are made here, without the place index,
// so a link works at once, and each one has the same id, name and Census code as its index entry.

import type { Lang } from "@/lib/i18n/names";
import type { PlaceId } from "@/lib/rules/types";
import { CHECKED_CITIES, SD_COUNTY_FIPS, SD_STATE } from "./sanDiego";
import { normalizeName } from "./normalize";
import { placeLabel, type CountyNames, type PlaceLabel } from "./search";
import { addPick, isCampusPick, NO_PICKS, type PlacePicks } from "./picks";
import type { PlaceEntry } from "./types";

/** The only county a linked pick can be in, with its Census name. */
export const SD_COUNTY_NAMES: CountyNames = { countyNames: new Map([[SD_COUNTY_FIPS, "San Diego County"]]) };

/** A pick's label in both languages, made once when it is picked. */
export type PickLabels = Record<Lang, PlaceLabel>;

export function pickLabels(index: CountyNames, entry: PlaceEntry): PickLabels {
  return { en: placeLabel(index, entry, "en"), es: placeLabel(index, entry, "es") };
}

/**
 * The pick an old link's checked record stands for. Null for the SDUHSD campus record, which stays
 * its own choice, not a place in the search.
 */
export function linkedPick(record: PlaceId): PlaceEntry | null {
  if (record === "unincorporated_san_diego_county") {
    const name = "San Diego County";
    return { id: `c-${SD_COUNTY_FIPS}`, name, kind: "county", source: "county", state: SD_STATE, counties: [SD_COUNTY_FIPS], geoid: SD_COUNTY_FIPS, rank: 0, keys: [normalizeName(name)] };
  }
  const city = CHECKED_CITIES.find((c) => c.record === record);
  if (!city) return null;
  return {
    id: `p-${city.geoid}`,
    name: city.name,
    kind: "city",
    source: "place",
    state: SD_STATE,
    counties: [SD_COUNTY_FIPS],
    geoid: city.geoid,
    rank: 0,
    keys: [normalizeName(city.name)],
  };
}

export interface LinkedWhere {
  where: PlacePicks;
  labels: Record<string, PickLabels>;
  /** True when the link names the SDUHSD campus, which turns on its own choice. */
  campus: boolean;
}

/**
 * The picks an old share link names, like the QR flyer's ?state=CA&place=city_of_san_diego,sduhsd_campuses.
 * Each checked record becomes the place it stands for. The records are San Diego County's, so a
 * link for another state keeps only its state, as it always did.
 */
export function linkedWhere(state: string, places: readonly PlaceId[]): LinkedWhere {
  const entries = state === SD_STATE ? places.map(linkedPick).filter((e): e is PlaceEntry => e !== null) : [];
  return {
    where: entries.length > 0 ? { state, picks: entries } : NO_PICKS,
    labels: Object.fromEntries(entries.map((e) => [e.id, pickLabels(SD_COUNTY_NAMES, e)])),
    campus: state === SD_STATE && places.includes("sduhsd_campuses"),
  };
}

/** The most picks a link can carry. The search allows no more on one page in practice. */
const MAX_LINKED_PICKS = 20;
const PICK_ID = /^[a-z]{1,3}-[A-Za-z0-9_-]{1,40}$/;

/**
 * The search picks a "Check this bike" link names in ?pick=, like d-0631530 for Poway Unified.
 * They are the picks with no checked record, which ?place= can't carry, so the checker can name
 * them as not checked too.
 */
export function linkedPickIds(search: string): string[] {
  const raw = new URLSearchParams(search).get("pick") ?? "";
  return [...new Set(raw.split(",").filter((id) => PICK_ID.test(id)))].slice(0, MAX_LINKED_PICKS);
}

/**
 * The picks once a link's ?pick= entries are found in the search index. Only entries in the link's
 * state are added, so a link never starts over in another state, and the SDUHSD district stays the
 * campus choice ?place= already turned on.
 */
export function withLinkedPicks(current: PlacePicks, state: string, entries: readonly PlaceEntry[]): PlacePicks {
  if (current.state !== null && current.state !== state) return current;
  const adds = entries.filter((e) => e.state === state && e.kind !== "state" && !isCampusPick(e));
  return adds.reduce((cur, entry) => addPick(cur, entry).next, current);
}
