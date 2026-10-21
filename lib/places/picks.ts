// The places a family picked in the search box, shown as chips. All picks are in one state, since
// one answer covers one state's law. Picking a place in another state starts over in that state.

import type { PlaceId } from "@/lib/rules/types";
import { resolvePlace } from "./resolve";
import { SD_COUNTY_FIPS, SD_STATE } from "./sanDiego";
import type { PlaceEntry } from "./types";

export interface PlacePicks {
  /** The state every pick is in, or null before anything is picked. */
  state: string | null;
  picks: PlaceEntry[];
}

export const NO_PICKS: PlacePicks = { state: null, picks: [] };

export interface PickChange {
  next: PlacePicks;
  /** Set when the pick was in another state, so the earlier picks were dropped. The page says so in a status line. */
  startedOver: { from: string; to: string } | null;
}

/** The picks after one more place. Picking a place that is already a chip changes nothing. */
export function addPick(current: PlacePicks, entry: PlaceEntry): PickChange {
  if (current.picks.some((p) => p.id === entry.id)) return { next: current, startedOver: null };
  if (current.state !== null && current.state !== entry.state && current.picks.length > 0) {
    return { next: { state: entry.state, picks: [entry] }, startedOver: { from: current.state, to: entry.state } };
  }
  return { next: { state: entry.state, picks: [...current.picks, entry] }, startedOver: null };
}

/**
 * True when the pick is San Dieguito Union High School District. It turns on the SDUHSD campus
 * choice instead of adding a chip, so the campus counts once and shows as one ticked box.
 */
export function isCampusPick(entry: PlaceEntry): boolean {
  return resolvePlace(entry).localRecord === "sduhsd_campuses";
}

/**
 * The picks after the SDUHSD district is picked. The chips stay when they are in California. Picks
 * in another state are dropped, the same start-over rule as any other place.
 */
export function campusPick(current: PlacePicks, entry: PlaceEntry): PickChange {
  if (current.state === entry.state) return { next: current, startedOver: null };
  const next = { state: entry.state, picks: [] };
  if (current.state !== null && current.picks.length > 0) return { next, startedOver: { from: current.state, to: entry.state } };
  return { next, startedOver: null };
}

/** The picks without one chip. The state stays, so the page keeps showing that state's law. */
export function removePick(current: PlacePicks, id: string): PlacePicks {
  return { state: current.state, picks: current.picks.filter((p) => p.id !== id) };
}

/** What the rules engine needs from the picks. */
export interface EngineWhere {
  state: string;
  /** The checked local records, once each, in the order they were picked. */
  places: PlaceId[];
  /** True when a pick has no checked record, so the answer says that place's own rules were not checked. */
  otherPlaces: boolean;
}

/** The engine's state, places and "somewhere else" flag, or null before a state is known. */
export function engineWhere(current: PlacePicks): EngineWhere | null {
  if (current.state === null) return null;
  const resolved = current.picks.map(resolvePlace);
  const places = [...new Set(resolved.flatMap((r) => (r.localRecord ? [r.localRecord] : [])))];
  return { state: current.state, places, otherPlaces: resolved.some((r) => !r.checked) };
}

/**
 * The picks whose own city or county rules are not in the checked table, so the answer names them
 * as not checked. A state pick is left out, since its law is the one the answer uses. A school
 * district other than SDUHSD is in the list too, and the answer names its campus rules.
 */
export function uncheckedPicks(current: PlacePicks): PlaceEntry[] {
  return current.picks.filter((p) => p.kind !== "state" && !resolvePlace(p).checked);
}

/** True when a pick is in San Diego County, so the page offers the SDUHSD campus choice. */
export function inSanDiegoCounty(current: PlacePicks): boolean {
  return current.picks.some((p) => p.state === SD_STATE && p.counties.includes(SD_COUNTY_FIPS));
}

/** What the rules engine gets for the ride, and whether the page shows the SDUHSD campus choice. */
export interface RideWhere {
  /** The checked local records, then the SDUHSD campus when it is picked. Empty outside California. */
  places: PlaceId[];
  /** True when a pick has no checked record, so the answer says that place's own rules were not checked. */
  otherPlaces: boolean;
  /** True when the page shows the SDUHSD campus choice: the ride is in San Diego County, or the choice is already on. */
  campusShown: boolean;
}

/**
 * The engine's places for the picks and the campus choice. The campus choice shows for a ride in San
 * Diego County, and stays on the page while it is ticked, so the campus never counts without being
 * seen. `kept` keeps it on the page once the family has used it, so unticking it never takes the box
 * from under their finger, or their keyboard focus with it. Picks only count in their own state, so
 * one state's places never mix into another's answer.
 */
export function rideWhere(current: PlacePicks, stateCode: string, campus: boolean, kept: boolean = false): RideWhere {
  const where = current.state === stateCode ? engineWhere(current) : null;
  if (stateCode !== SD_STATE) return { places: [], otherPlaces: where?.otherPlaces ?? false, campusShown: false };
  const campusShown = inSanDiegoCounty(current) || campus || kept;
  const places: PlaceId[] = [...new Set<PlaceId>([...(where?.places ?? []), ...(campusShown && campus ? (["sduhsd_campuses"] as PlaceId[]) : [])])];
  return { places, otherPlaces: where?.otherPlaces ?? false, campusShown };
}
