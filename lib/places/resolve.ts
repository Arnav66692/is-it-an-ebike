// What a picked place means for the rules: its state, and the checked local record when there is
// one. A place maps by its Census GEOID, state and county, never by its name alone, so a Carlsbad
// in New Mexico or a Carmel Valley in Monterey County never gets a San Diego record.

import type { PlaceId } from "@/lib/rules/types";
import { CHECKED_CITIES, NOT_COUNTY_LAND, SD_COUNTY_FIPS, SD_STATE } from "./sanDiego";
import { neighborhoodId, SD_CITY_NEIGHBORHOODS, SD_NEIGHBORHOODS } from "./sdNeighborhoods";
import type { PlaceEntry } from "./types";

/**
 * Why a place got the record it did.
 * checked_city: one of the five cities with its own checked record.
 * sd_neighborhood: a City of San Diego community planning area or neighborhood, so the City record.
 * sd_community: a Census CDP in San Diego County, so the county's record for unincorporated land.
 * sd_county: San Diego County itself, so the county's record for unincorporated land.
 * base_or_reservation: a San Diego County community that is mostly base or reservation land, which county ordinances don't govern, so state law only.
 * state_only: everything else. State law applies, and the place's own rules were not checked.
 */
export type ResolveWhy = "checked_city" | "sd_neighborhood" | "sd_community" | "sd_county" | "base_or_reservation" | "state_only";

export interface PlaceResolution {
  state: string;
  localRecord: PlaceId | null;
  /** True when the place's own local rules are in the checked table. */
  checked: boolean;
  why: ResolveWhy;
}

const NEIGHBORHOOD_IDS = new Set([...SD_NEIGHBORHOODS, ...SD_CITY_NEIGHBORHOODS].map((n) => neighborhoodId(n.slug)));
const NOT_COUNTY_GEOIDS = new Set(NOT_COUNTY_LAND.map((p) => p.geoid));
const UNINCORPORATED: PlaceId = "unincorporated_san_diego_county";

/** True when every part of the place is in San Diego County, California. */
function onlyInSanDiegoCounty(entry: PlaceEntry): boolean {
  return entry.state === SD_STATE && entry.counties.length === 1 && entry.counties[0] === SD_COUNTY_FIPS;
}

function local(entry: PlaceEntry, record: PlaceId, why: ResolveWhy): PlaceResolution {
  return { state: entry.state, localRecord: record, checked: true, why };
}

function stateOnly(entry: PlaceEntry, why: ResolveWhy = "state_only"): PlaceResolution {
  return { state: entry.state, localRecord: null, checked: false, why };
}

export function resolvePlace(entry: PlaceEntry): PlaceResolution {
  if (!onlyInSanDiegoCounty(entry)) return stateOnly(entry);
  switch (entry.source) {
    case "neighborhood":
      return NEIGHBORHOOD_IDS.has(entry.id) ? local(entry, "city_of_san_diego", "sd_neighborhood") : stateOnly(entry);
    case "county":
      return entry.geoid === SD_COUNTY_FIPS ? local(entry, UNINCORPORATED, "sd_county") : stateOnly(entry);
    case "place": {
      const city = CHECKED_CITIES.find((c) => c.geoid === entry.geoid);
      if (city) return local(entry, city.record, "checked_city");
      if (entry.kind !== "community" || entry.geoid === null) return stateOnly(entry);
      return NOT_COUNTY_GEOIDS.has(entry.geoid) ? stateOnly(entry, "base_or_reservation") : local(entry, UNINCORPORATED, "sd_community");
    }
    default:
      return stateOnly(entry);
  }
}
