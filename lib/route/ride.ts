// The rider and bike a finished check hands to the Map. It is kept in sessionStorage, so it lives
// only in this browser tab and is gone when the tab closes. Storage can hold anything, so every
// field is checked again when it is read back, and the engine checks the age and date itself.

import { validateInput, type BikeFacts, type ClassNum, type QuestionId } from "@/lib/rules";

export const RIDE_KEY = "route-ride";

export interface StoredRide {
  facts: BikeFacts;
  riderAge: number;
  /** YYYY-MM-DD. */
  rideDate: string;
  /** The family picked an SDUHSD campus in the checker. */
  sduhsdCampus: boolean;
  /** The catalog bike the finder sent, for its battery size. */
  bikeId: string | null;
}

const YES_NO_FIELDS = ["hasPedals", "hasThrottle", "motorOver20", "assistOver28", "switchable", "hasFootPegs", "needsPedalKit", "weightOver100"] as const;
const NUMBER_FIELDS = ["ratedWatts", "peakWatts", "wattsUpTo", "throttleMph", "assistMph", "topSpeedMph", "wheelCount", "wheelFrontIn", "wheelRearIn", "weightLb"] as const;
const BIKE_ID = /^[a-z0-9-]{1,80}$/;
const QUESTION_ID = /^[a-z0-9_]{1,40}$/;

function isClass(v: unknown): v is ClassNum {
  return v === 1 || v === 2 || v === 3;
}

/** Facts with exactly the engine's fields, each of the right kind, or null. */
export function factsOf(v: unknown): BikeFacts | null {
  if (!v || typeof v !== "object") return null;
  const raw = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of YES_NO_FIELDS) {
    const value = raw[key] ?? null;
    if (value !== null && typeof value !== "boolean") return null;
    out[key] = value;
  }
  for (const key of NUMBER_FIELDS) {
    const value = raw[key] ?? null;
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) return null;
    out[key] = value;
  }
  if (!Array.isArray(raw.classes) || !raw.classes.every(isClass)) return null;
  if (!Array.isArray(raw.unsure) || !raw.unsure.every((q) => typeof q === "string" && QUESTION_ID.test(q))) return null;
  return { ...out, classes: [...raw.classes], unsure: [...raw.unsure] as QuestionId[] } as BikeFacts;
}

/** A stored ride, or null when it is missing or not sound. */
export function parseRide(text: string | null): StoredRide | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.riderAge !== "number" || typeof r.rideDate !== "string" || typeof r.sduhsdCampus !== "boolean") return null;
  const bikeId = r.bikeId ?? null;
  if (bikeId !== null && (typeof bikeId !== "string" || !BIKE_ID.test(bikeId))) return null;
  const facts = factsOf(r.facts);
  if (!facts) return null;
  if (validateInput({ state: "CA", places: [], riderAge: r.riderAge, rideDate: r.rideDate, facts }) !== null) return null;
  return { facts, riderAge: r.riderAge, rideDate: r.rideDate, sduhsdCampus: r.sduhsdCampus, bikeId };
}

/** Reads the ride this tab's check left, or null. Private windows can refuse storage, so that counts as none. */
export function readRide(): StoredRide | null {
  try {
    return parseRide(window.sessionStorage.getItem(RIDE_KEY));
  } catch {
    return null;
  }
}

/** Keeps the ride for this tab. A refused write only means the Map asks for a check. */
export function writeRide(ride: StoredRide): void {
  try {
    window.sessionStorage.setItem(RIDE_KEY, JSON.stringify(ride));
  } catch {
    // Storage refused, as in some private windows. The Map then asks for a check.
  }
}
