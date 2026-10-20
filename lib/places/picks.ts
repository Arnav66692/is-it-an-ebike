// The places a family picked in the search box, shown as chips. All picks are in one state, since
// one answer covers one state's law. Picking a place in another state starts over in that state.

import type { PlaceId } from "@/lib/rules/types";
import { resolvePlace } from "./resolve";
import { SD_COUNTY_FIPS, SD_STATE } from "./sanDiego";
import type { PlaceEntry, PlaceIndex } from "./types";

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

/** True when a pick is in San Diego County, so the page offers the SDUHSD campus choice. */
export function inSanDiegoCounty(current: PlacePicks): boolean {
  return current.picks.some((p) => p.state === SD_STATE && p.counties.includes(SD_COUNTY_FIPS));
}

/** The pick ids for a share link, in order. */
export function pickIds(current: PlacePicks): string[] {
  return current.picks.map((p) => p.id);
}

/**
 * The picks a share link names. Unknown ids are dropped, and so is any id in a state other than
 * the first known one, so a link can never mix states.
 */
export function picksFromIds(index: PlaceIndex, ids: readonly string[]): PlacePicks {
  const known = ids.map((id) => index.byId.get(id)).filter((e): e is PlaceEntry => e !== undefined);
  if (known.length === 0) return NO_PICKS;
  const state = known[0].state;
  const picks = known.filter((e, i) => e.state === state && known.findIndex((k) => k.id === e.id) === i);
  return { state, picks };
}
