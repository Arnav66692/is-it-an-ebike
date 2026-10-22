// Types for the place search: the compact index file in public/places/ and the entries the
// search returns. scripts/build-places.ts writes the file and lib/places/parse.ts reads it.

import type { NotCountyLand } from "./sanDiego";

/** What kind of place an entry is. "community" is a Census CDP, an unincorporated community. "district" is a public school district. */
export type PlaceKind =
  | "state"
  | "county"
  | "city"
  | "town"
  | "village"
  | "borough"
  | "municipality"
  | "community"
  | "township"
  | "plantation"
  | "neighborhood"
  | "district"
  | "zip";

/** Where an entry comes from, which also fixes the shape of its id. */
export type PlaceSourceKind = "state" | "county" | "place" | "cousub" | "neighborhood" | "district" | "zip";

export interface PlaceEntry {
  /** Stable id, unique in the index: "s-CA", "c-06073", "p-0611194", "m-3400112345", "n-carmel-valley" or "d-0634380". The share link names checked records, not these ids (lib/places/linked.ts). */
  id: string;
  /** The name without the Census suffix, like "Carlsbad" for "Carlsbad city". */
  name: string;
  kind: PlaceKind;
  source: PlaceSourceKind;
  /** Two-letter postal code of the state, or DC. */
  state: string;
  /** Five-digit county FIPS codes, the county with the most people first. Empty for a state. */
  counties: string[];
  /** The Census GEOID for a county, place or county subdivision, or the NCES LEAID for a school district. Null for a state or neighborhood. */
  geoid: string | null;
  /** Position by population, 0 for the most people. States sort first with ranks below 0, and neighborhoods share the City of San Diego's. */
  rank: number;
  /** Normalized names the search matches, the display name first. */
  keys: string[];
  /** A school district's office city, as NCES publishes it. */
  city?: string;
  /** A school district's NCES LEA type, 1 to 9. Types 1 and 2 are regular districts. */
  districtType?: number;
  /** True when another district has the same name, office city, county and type, so its label adds the NCES ID. */
  sharesLabel?: boolean;
  /** What a ZIP code covers, for a "zip" entry only (lib/places/zips.ts). */
  zip?: ZipCover;
}

/**
 * What a ZIP code (a Census ZCTA) covers, measured by land area in the Census 2020 relationship
 * files. A ZIP is never a place of its own. Picking it picks the place it covers, or asks which one.
 */
export interface ZipCover {
  /** The id of the incorporated place or CDP that holds at least 99 percent of the ZIP's land, or null. */
  place: string | null;
  /**
   * For a ZIP with no such place that touches a county with checked records: the places it
   * covers, by id, most land first. Empty for every other ZIP.
   */
  places: string[];
  /** For the same ZIPs: the counties, by FIPS, where some of the ZIP's land is in no place. */
  unincorporated: string[];
  /** True when less than 99 percent of the ZIP's land is in one state. */
  manyStates: boolean;
}

export interface PlaceDataSource {
  /** What the file is, in plain words. */
  name: string;
  /** The file name as published. */
  file: string;
  url: string;
  /** The Census vintage or release, like "2026 Gazetteer". */
  vintage: string;
  /** What the index takes from it. */
  use: string;
}

/**
 * The file in public/places/. Rows are sorted by population, so a row's position is its rank.
 * A row is "kind|county indexes|name|code": the kind letter (KIND_LETTERS), the indexes into
 * `counties` joined by ".", the display name, and the place or county subdivision code that
 * completes its GEOID (empty for a county).
 */
export interface PlaceIndexFile {
  format: 1;
  built: string;
  about: string;
  sources: PlaceDataSource[];
  counts: Record<string, number>;
  /** [postal code, state FIPS], most people first. */
  states: [string, string][];
  /** [county FIPS, county name], in FIPS order. */
  counties: [string, string][];
  /** San Diego County communities the build measured as mostly base or reservation land. */
  notCountyLand: NotCountyLand[];
  /** Other names people type for an entry, by entry id, like "Louisville" for "Louisville/Jefferson County". */
  aliases: Record<string, string[]>;
  rows: string[];
}

export const KIND_LETTERS: Record<string, { kind: PlaceKind; source: PlaceSourceKind }> = {
  C: { kind: "county", source: "county" },
  c: { kind: "city", source: "place" },
  t: { kind: "town", source: "place" },
  v: { kind: "village", source: "place" },
  b: { kind: "borough", source: "place" },
  m: { kind: "municipality", source: "place" },
  d: { kind: "community", source: "place" },
  T: { kind: "town", source: "cousub" },
  S: { kind: "township", source: "cousub" },
  P: { kind: "plantation", source: "cousub" },
};

/** The loaded index, ready to search. */
export interface PlaceIndex {
  built: string;
  sources: PlaceDataSource[];
  /** Every state and DC, then every row, then the City of San Diego neighborhoods. */
  entries: PlaceEntry[];
  byId: Map<string, PlaceEntry>;
  /** County FIPS to its Census name, like "06073" to "San Diego County". */
  countyNames: Map<string, string>;
  /** Every US ZIP code, in number order, when the ZIP file loaded. They are kept out of `entries`, since only digits find them. */
  zips?: readonly PlaceEntry[];
}
