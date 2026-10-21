// Every operating US public school district, from the NCES district directory, for the "Where do
// they ride?" search. scripts/build-districts.mjs writes public/places/us-districts.json, and this
// file turns it into search entries. Only San Dieguito Union High School District has checked
// campus rules. Every other district is named in the answer as not checked.

import { normalizeName } from "./normalize";
import { SD_COUNTY_FIPS, SD_STATE } from "./sanDiego";
import type { PlaceDataSource, PlaceEntry, PlaceIndex } from "./types";

/** Where the build puts the district file, served from public/ on the app's own origin. */
export const DISTRICT_INDEX_URL = "/places/us-districts.json";

/** San Dieguito Union High School District, the one district with a checked campus record. */
export const SDUHSD_LEAID = "0634380";

/** NCES LEA types 1 and 2 are regular school districts. Every other type is named in the label. */
export const REGULAR_DISTRICT_TYPES: ReadonlySet<number> = new Set([1, 2]);

/** A row: NCES LEAID, name, state, county FIPS (blank when unknown), office city, NCES type. */
export type DistrictRow = [string, string, string, string, string, number];

export interface DistrictIndexFile {
  format: 1;
  built: string;
  about: string;
  schoolYear: string;
  sources: PlaceDataSource[];
  /** LEAIDs with checked campus rules. Only SDUHSD. */
  checked: string[];
  checkedNote: string;
  columns: string[];
  /** NCES LEA type number to its NCES name. */
  types: Record<string, string>;
  counts: Record<string, number>;
  /** [county FIPS, county name] for every county a row names. */
  counties: [string, string][];
  rows: DistrictRow[];
}

/** Other names people type for a district, by LEAID. */
const DISTRICT_ALIASES: Record<string, readonly string[]> = {
  [SDUHSD_LEAID]: ["SDUHSD", "San Dieguito Union High School District"],
};

/** Districts rank after every place, so a city named like its district comes first. */
const DISTRICT_RANK_BASE = 1_000_000;

const LEAID = /^\d{7}$/;
const COUNTY = /^\d{5}$/;

export function districtId(leaid: string): string {
  return `d-${leaid}`;
}

/** The keys a district is found by: its name, and its name with "school district" when it doesn't say "district". */
function districtKeys(leaid: string, name: string): string[] {
  const key = normalizeName(name);
  const keys = [key];
  if (!/\bdistrict\b/.test(key)) keys.push(`${key} school district`);
  for (const alias of DISTRICT_ALIASES[leaid] ?? []) keys.push(normalizeName(alias));
  return [...new Set(keys)];
}

function districtEntry(row: DistrictRow, n: number, states: ReadonlySet<string>, counties: ReadonlyMap<string, string>): PlaceEntry {
  if (!Array.isArray(row) || row.length !== 6) throw new Error(`District row ${n} is not six fields`);
  const [leaid, name, state, county, city, type] = row;
  if (!LEAID.test(leaid)) throw new Error(`District row ${n} has LEAID "${leaid}"`);
  if (typeof name !== "string" || name.trim() === "") throw new Error(`District ${leaid} has no name`);
  if (!states.has(state)) throw new Error(`District ${leaid} is in "${state}", which the rules table doesn't cover`);
  if (county !== "" && (!COUNTY.test(county) || !counties.has(county))) throw new Error(`District ${leaid} names county "${county}", which the file doesn't list`);
  if (!Number.isInteger(type) || type < 1 || type > 9) throw new Error(`District ${leaid} has NCES type "${type}"`);
  return {
    id: districtId(leaid),
    name,
    kind: "district",
    source: "district",
    state,
    counties: county === "" ? [] : [county],
    geoid: leaid,
    rank: DISTRICT_RANK_BASE + n,
    keys: districtKeys(leaid, name),
    city,
    districtType: type,
  };
}

/** The district file as search entries. Throws when the file is not one this code can read. */
export function parseDistricts(file: DistrictIndexFile, states: readonly string[]): { entries: PlaceEntry[]; countyNames: Map<string, string> } {
  if (!file || file.format !== 1 || !Array.isArray(file.rows) || !Array.isArray(file.counties)) throw new Error("Not a district file in format 1");
  if (file.checked?.length !== 1 || file.checked[0] !== SDUHSD_LEAID) throw new Error("The district file says a district other than SDUHSD is checked");
  const countyNames = new Map(file.counties);
  const stateSet = new Set(states);
  const parsed = file.rows.map((row, n) => districtEntry(row, n, stateSet, countyNames));
  // Two districts, like the Excel Academy Charter Districts in Irvine, can read the same in every
  // way NCES gives. Their labels add the NCES ID, so a family can tell them apart.
  const labelKey = (e: PlaceEntry) => [e.name, e.state, e.counties[0] ?? "", e.city ?? "", e.districtType ?? 0].join("|");
  const seen = new Map<string, number>();
  for (const e of parsed) seen.set(labelKey(e), (seen.get(labelKey(e)) ?? 0) + 1);
  const entries = parsed.map((e) => ((seen.get(labelKey(e)) ?? 0) > 1 ? { ...e, sharesLabel: true } : e));
  const sduhsd = entries.find((e) => e.geoid === SDUHSD_LEAID);
  if (!sduhsd || sduhsd.state !== SD_STATE || sduhsd.counties[0] !== SD_COUNTY_FIPS) throw new Error("The district file has no San Dieguito Union High in San Diego County");
  return { entries, countyNames };
}

/** The place index with every district added, for one search over both. */
export function withDistricts(index: PlaceIndex, file: DistrictIndexFile): PlaceIndex {
  const states = index.entries.filter((e) => e.kind === "state").map((e) => e.state);
  const { entries, countyNames } = parseDistricts(file, states);
  const byId = new Map(index.byId);
  for (const e of entries) {
    if (byId.has(e.id)) throw new Error(`The search has two entries with id ${e.id}`);
    byId.set(e.id, e);
  }
  // The place index names every county. A district's county keeps the place index's name.
  const names = new Map([...countyNames, ...index.countyNames]);
  return { built: index.built, sources: [...index.sources, ...file.sources], entries: [...index.entries, ...entries], byId, countyNames: names };
}

/** True when the entry is the SDUHSD district, which turns on the checked campus record. */
export function isSduhsd(entry: PlaceEntry): boolean {
  return entry.kind === "district" && entry.geoid === SDUHSD_LEAID && entry.state === SD_STATE;
}
