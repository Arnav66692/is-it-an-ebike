// Picks for the checked records an old share link names, like the QR flyer's
// ?state=CA&place=city_of_san_diego,sduhsd_campuses. They are made here, without the place index,
// so a link works at once, and each one has the same id, name and Census code as its index entry.

import type { Lang } from "@/lib/i18n/names";
import type { PlaceId } from "@/lib/rules/types";
import { CHECKED_CITIES, SD_COUNTY_FIPS, SD_STATE } from "./sanDiego";
import { normalizeName } from "./normalize";
import { placeLabel, type CountyNames, type PlaceLabel } from "./search";
import { NO_PICKS, type PlacePicks } from "./picks";
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
