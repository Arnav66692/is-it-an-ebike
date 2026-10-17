// Entry point for the rules engine. Validates input, runs the state check,
// then the San Diego local layer when the rider is in California.

import { STATE_CODES } from "./compile";
import { isIsoDate } from "./dates";
import { evaluateLocal, PLACE_IDS } from "./local";
import { evaluateState } from "./state";
import type { EngineInput, EngineResult } from "./types";

export { STATE_CODES } from "./compile";
export { PLACE_IDS } from "./local";
export { emptyFacts } from "./types";
export type * from "./types";

export const MIN_AGE_INPUT = 3;
export const MAX_AGE_INPUT = 100;

export function validateInput(input: EngineInput): string | null {
  if (!STATE_CODES.includes(input.state)) return `Unknown state "${input.state}"`;
  if (!Number.isInteger(input.riderAge) || input.riderAge < MIN_AGE_INPUT || input.riderAge > MAX_AGE_INPUT) {
    return `Rider age must be a whole number from ${MIN_AGE_INPUT} to ${MAX_AGE_INPUT}`;
  }
  if (!isIsoDate(input.rideDate)) return `Ride date must look like 2026-10-17`;
  if (input.places.some((p) => !PLACE_IDS.includes(p))) return "Unknown San Diego place";
  return null;
}

export function evaluate(input: EngineInput & { otherPlaces?: boolean }): EngineResult {
  const problem = validateInput(input);
  if (problem) throw new Error(problem);
  const se = evaluateState(input);
  const inCalifornia = input.state === "CA";
  const places = inCalifornia ? input.places : [];
  const local = places.map((place) => evaluateLocal(place, se, input));
  const coveredTowns = places.filter((p) => p !== "sduhsd_campuses");
  return {
    state: se.verdict,
    local,
    localNotice: !inCalifornia || coveredTowns.length === 0 || input.otherPlaces === true,
  };
}
