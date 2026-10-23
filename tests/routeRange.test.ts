// The battery estimate (lib/route/range.ts). These check the physics behaves the way physics does,
// and one trip worked by hand. They don't show the estimate matches real rides: that is the ride
// test in private/RANGE_PILOT.md, with its pass bar set before anyone rides.

import { describe, expect, it } from "vitest";
import { climbsOf, estimateRange, OPTIMISTIC, PESSIMISTIC, reversed, stepsOf, tripWattHours, type RangeInput } from "@/lib/route/range";

/** Degrees of latitude in one meter, near enough for test routes. */
const DEG_PER_M = 1 / 111_195;

/** A straight route north, one point every 100 m, with heights from a function of distance. */
function line(totalM: number, height: (m: number) => number | null = () => 0) {
  const points = [];
  const heights = [];
  for (let m = 0; m <= totalM; m += 100) {
    points.push({ lat: 32.9 + m * DEG_PER_M, lon: -117.2 });
    heights.push(height(m));
  }
  return { points, heights };
}

const BASE: RangeInput = { batteryWh: 500, chargePct: 100, massKg: 100, speedMps: 6, assist: "medium", wind: null };

describe("the battery estimate", () => {
  it("matches a trip worked by hand: 1 km flat, 100 kg, 6 m/s, medium assist, optimistic set", () => {
    // Force = 100 x 9.81 x 0.006 + 0.5 x 1.2 x 0.5 x 6^2 = 5.886 + 10.8 = 16.686 N, over 1,000 m = 16,686 J.
    // Battery = 16,686 x 1.05 stops x 0.5 motor share / 0.85 efficiency / 3,600 = 2.863 Wh.
    const { points, heights } = line(1000);
    expect(tripWattHours(stepsOf(points, heights), BASE, OPTIMISTIC)).toBeCloseTo(2.863, 2);
  });

  it("gives a low end below the high end, and grows with distance", () => {
    const short = estimateRange(line(2000).points, line(2000).heights, BASE);
    const long = estimateRange(line(8000).points, line(8000).heights, BASE);
    expect(short.tripWh[0]).toBeLessThan(short.tripWh[1]);
    expect(long.tripWh[0]).toBeCloseTo(short.tripWh[0] * 4, 1);
    expect(short.usedPct[0]).toBeLessThan(short.usedPct[1]);
  });

  it("costs more uphill than flat, and coasting downhill costs less but never gives energy back", () => {
    const up = line(1000, (m) => m * 0.05);
    const down = line(1000, (m) => 50 - m * 0.05);
    const flat = line(1000);
    const wh = (r: { points: typeof flat.points; heights: (number | null)[] }) => tripWattHours(stepsOf(r.points, r.heights), BASE, PESSIMISTIC);
    expect(wh(up)).toBeGreaterThan(wh(flat) * 2);
    expect(wh(down)).toBeLessThan(wh(flat));
    expect(wh(down)).toBeGreaterThanOrEqual(0);
  });

  it("costs more into a headwind than with a tailwind, more at higher speed, and more on the throttle than in eco", () => {
    const { points, heights } = line(3000);
    const steps = stepsOf(points, heights);
    const head = tripWattHours(steps, { ...BASE, wind: { speedMps: 6, fromDeg: 0 } }, OPTIMISTIC);
    const tail = tripWattHours(steps, { ...BASE, wind: { speedMps: 6, fromDeg: 180 } }, OPTIMISTIC);
    expect(head).toBeGreaterThan(tail);
    expect(tripWattHours(steps, { ...BASE, speedMps: 9 }, OPTIMISTIC)).toBeGreaterThan(tripWattHours(steps, BASE, OPTIMISTIC));
    expect(tripWattHours(steps, { ...BASE, assist: "throttle" }, OPTIMISTIC)).toBeGreaterThan(tripWattHours(steps, { ...BASE, assist: "eco" }, OPTIMISTIC));
  });

  it("goes farther on flat ground at a slower speed", () => {
    const { points, heights } = line(1000);
    const slow = estimateRange(points, heights, { ...BASE, speedMps: 5 });
    const fast = estimateRange(points, heights, { ...BASE, speedMps: 9 });
    expect(slow.flatMiles[0]).toBeGreaterThan(fast.flatMiles[0]);
    expect(slow.flatMiles[0]).toBeLessThan(slow.flatMiles[1]);
  });

  it("counts the climb back on a ride there and back, and says when charge runs short", () => {
    // Downhill all the way out, so the whole climb is on the way back.
    const hill = line(4000, (m) => 160 - m * 0.04);
    const r = estimateRange(hill.points, hill.heights, BASE);
    expect(r.roundTripPct[0]).toBeGreaterThan(r.usedPct[0]);
    expect(r.roundTrip).toBe("fits");
    expect(estimateRange(hill.points, hill.heights, { ...BASE, chargePct: 1 }).roundTrip).toBe("short");
    expect(r.roundTripPct[0]).toBeGreaterThan(r.usedPct[0] * 3);
    expect(reversed(stepsOf(hill.points, hill.heights))[0].grade).toBeCloseTo(0.04, 3);
  });

  it("names the biggest climb, and treats a route with no heights as flat", () => {
    const hill = line(3000, (m) => (m >= 1000 && m <= 1500 ? (m - 1000) * 0.06 : m > 1500 ? 30 : 0));
    const [climb] = climbsOf(stepsOf(hill.points, hill.heights));
    expect(climb.atM).toBeCloseTo(1000, -1);
    expect(climb.meters).toBeCloseTo(500, -1);
    expect(climb.grade).toBeCloseTo(0.06, 2);
    const none = line(1000, () => null);
    expect(estimateRange(none.points, none.heights, BASE).assumedFlat).toBe(true);
    expect(estimateRange(none.points, null, BASE).assumedFlat).toBe(true);
  });
});
