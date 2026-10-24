// The rider and bike a finished check hands to the Map (lib/route/ride.ts). Storage can hold
// anything, so a ride is read back only when every field is sound.

import { describe, expect, it } from "vitest";
import { parseRide, type StoredRide } from "@/lib/route/ride";
import { emptyFacts } from "@/lib/rules";

const RIDE: StoredRide = {
  facts: { ...emptyFacts(), hasPedals: true, classes: [2], ratedWatts: 350, hasThrottle: true, throttleMph: 20, switchable: false, unsure: [] },
  riderAge: 15,
  rideDate: "2026-10-23",
  sduhsdCampus: false,
  bikeId: "aventon-soltera-2-5",
};

describe("the ride the checker hands to the Map", () => {
  it("reads back a sound ride exactly", () => {
    expect(parseRide(JSON.stringify(RIDE))).toEqual(RIDE);
    expect(parseRide(JSON.stringify({ ...RIDE, bikeId: null }))?.bikeId).toBeNull();
  });

  it("refuses nothing stored, broken JSON, and a ride with any bad field", () => {
    expect(parseRide(null)).toBeNull();
    expect(parseRide("{not json")).toBeNull();
    expect(parseRide(JSON.stringify({ ...RIDE, riderAge: 2 }))).toBeNull();
    expect(parseRide(JSON.stringify({ ...RIDE, rideDate: "tomorrow" }))).toBeNull();
    expect(parseRide(JSON.stringify({ ...RIDE, bikeId: "../secret" }))).toBeNull();
    expect(parseRide(JSON.stringify({ ...RIDE, facts: { ...RIDE.facts, ratedWatts: "350" } }))).toBeNull();
    expect(parseRide(JSON.stringify({ ...RIDE, facts: { ...RIDE.facts, classes: [4] } }))).toBeNull();
    expect(parseRide(JSON.stringify({ ...RIDE, facts: { ...RIDE.facts, hasPedals: "yes" } }))).toBeNull();
  });
});
