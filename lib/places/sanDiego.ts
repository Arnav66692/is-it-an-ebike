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

/**
 * The 18 incorporated cities with a checked record in data/rules/san_diego_local.json. Each GEOID
 * was read from public/places/us-places.json as the one city row in county 06073 with that name,
 * and scripts/build-places.ts stops if a GEOID no longer names that city in San Diego County.
 */
export const CHECKED_CITIES: readonly CheckedCity[] = [
  { geoid: "0666000", name: "San Diego", record: "city_of_san_diego" },
  { geoid: "0611194", name: "Carlsbad", record: "carlsbad" },
  { geoid: "0622678", name: "Encinitas", record: "encinitas" },
  { geoid: "0672506", name: "Solana Beach", record: "solana_beach" },
  { geoid: "0618506", name: "Del Mar", record: "del_mar" },
  { geoid: "0613392", name: "Chula Vista", record: "chula_vista" },
  { geoid: "0616378", name: "Coronado", record: "coronado" },
  { geoid: "0621712", name: "El Cajon", record: "el_cajon" },
  { geoid: "0622804", name: "Escondido", record: "escondido" },
  { geoid: "0636294", name: "Imperial Beach", record: "imperial_beach" },
  { geoid: "0640004", name: "La Mesa", record: "la_mesa" },
  { geoid: "0641124", name: "Lemon Grove", record: "lemon_grove" },
  { geoid: "0650398", name: "National City", record: "national_city" },
  { geoid: "0653322", name: "Oceanside", record: "oceanside" },
  { geoid: "0658520", name: "Poway", record: "poway" },
  { geoid: "0668196", name: "San Marcos", record: "san_marcos" },
  { geoid: "0670224", name: "Santee", record: "santee" },
  { geoid: "0682996", name: "Vista", record: "vista" },
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
