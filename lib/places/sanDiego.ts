// Which Census places have a checked San Diego record. A place maps by its Census GEOID, its
// state and its county, never by its name alone, so Carlsbad, New Mexico or a Del Mar in
// another county can never pick up a San Diego record.

import type { PlaceId } from "@/lib/rules/types";

/** San Diego County, California. */
export const SD_COUNTY_FIPS = "06073";
export const SD_STATE = "CA";

export interface CheckedCity {
  /** The Census place GEOID, state FIPS plus place FIPS. */
  geoid: string;
  /** The place name without "city", as the Census lists it. */
  name: string;
  record: PlaceId;
}

/** The five incorporated cities with a checked record in data/rules/san_diego_local.json. */
export const CHECKED_CITIES: readonly CheckedCity[] = [
  { geoid: "0666000", name: "San Diego", record: "city_of_san_diego" },
  { geoid: "0611194", name: "Carlsbad", record: "carlsbad" },
  { geoid: "0622678", name: "Encinitas", record: "encinitas" },
  { geoid: "0672506", name: "Solana Beach", record: "solana_beach" },
  { geoid: "0618506", name: "Del Mar", record: "del_mar" },
];

export type NotCountyLandReason = "military" | "tribal";

export interface NotCountyLand {
  geoid: string;
  name: string;
  reason: NotCountyLandReason;
  /** The share of the community's land, measured on the Census boundary files, in percent. */
  share: number;
  /** The federal area the measure found. */
  area: string;
}

/**
 * San Diego County communities (Census CDPs) where more than half the land is a military base
 * or a tribal reservation. County ordinances don't govern that land, and the base's or tribe's
 * own rules were not checked, so these get California law only, with the line that local rules
 * were not checked. scripts/build-places.ts measures every CDP in the county again on each build
 * and stops if this list no longer matches.
 */
export const NOT_COUNTY_LAND: readonly NotCountyLand[] = [
  { geoid: "0610554", name: "Camp Pendleton Mainside", reason: "military", share: 100, area: "Marine Corps Base Camp Pendleton" },
  { geoid: "0610561", name: "Camp Pendleton South", reason: "military", share: 98, area: "Marine Corps Base Camp Pendleton" },
  { geoid: "0655058", name: "Pala", reason: "tribal", share: 94.3, area: "Pala Reservation" },
];

/** More than this share of a CDP's land on a base or reservation takes it off the county record. */
export const NOT_COUNTY_LAND_SHARE = 50;
