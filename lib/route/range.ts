// A battery estimate for one route, from standard bike physics. The force to ride is rolling
// resistance plus air drag plus the climb, times the distance. The motor does its share of that
// work, set by the assist level, and the battery pays for the motor's share after motor and
// controller losses. Nothing here is fitted to real rides yet: every number below is an
// assumption, written down, and the answer is a range from an optimistic set to a pessimistic
// set. private/RANGE_PILOT.md sets the pass bar for the first ride test before anyone rides.

import type { RoutePoint } from "./types";

export type AssistLevel = "eco" | "medium" | "high" | "max" | "throttle";

export const ASSIST_LEVELS: readonly AssistLevel[] = ["eco", "medium", "high", "max", "throttle"];

/** The motor's share of the work at each assist level. An assumption, moved by shareShift in each set. */
export const MOTOR_SHARE: Record<AssistLevel, number> = { eco: 0.4, medium: 0.6, high: 0.75, max: 0.85, throttle: 1 };

export interface RangeAssumptions {
  /** Rolling resistance coefficient for e-bike tires on pavement. */
  crr: number;
  /** Drag area of an upright rider, in square meters. */
  cda: number;
  /** Battery to wheel: motor, controller and drivetrain together. */
  efficiency: number;
  /** The share of the label's watt-hours the battery really gives, after its cutoff and age. */
  usable: number;
  /** Extra energy for stops, starts and turns in town. */
  stopGo: number;
  /** The share of the wind forecast at 10 m that reaches a rider near the ground. */
  windAtRider: number;
  /** How far the rider's own effort moves the motor's share, less work for the motor when negative. */
  shareShift: number;
}

export const OPTIMISTIC: RangeAssumptions = { crr: 0.006, cda: 0.5, efficiency: 0.85, usable: 0.95, stopGo: 1.05, windAtRider: 0.5, shareShift: -0.1 };
export const PESSIMISTIC: RangeAssumptions = { crr: 0.01, cda: 0.7, efficiency: 0.7, usable: 0.8, stopGo: 1.25, windAtRider: 0.9, shareShift: 0.1 };

const GRAVITY = 9.81;
/** Air density near sea level at about 15 C, in kg per cubic meter. */
const AIR_DENSITY = 1.2;
const JOULES_PER_WH = 3600;
const METERS_PER_MILE = 1609.344;
const EARTH_M = 6_371_000;
/** A climb is a run of steps at least this steep, in rise over run. */
const CLIMB_GRADE = 0.03;
/** A climb shorter than this isn't worth naming. */
const CLIMB_MIN_M = 100;
/** Grades past this are noise in the height data, not road. */
const MAX_GRADE = 0.3;
/** Charge kept in hand when judging a trip there and back, in percent. */
const RESERVE_PCT = 10;

export interface Wind {
  speedMps: number;
  /** The direction the wind blows from, in degrees, 0 for north. */
  fromDeg: number;
}

export interface RangeInput {
  /** The battery's label capacity in watt-hours. */
  batteryWh: number;
  /** The charge now, in percent. */
  chargePct: number;
  /** Rider, cargo and bike together, in kilograms. */
  massKg: number;
  speedMps: number;
  assist: AssistLevel;
  wind: Wind | null;
}

export interface Step {
  meters: number;
  /** Rise over run, positive uphill. */
  grade: number;
  headingDeg: number;
  /** Meters from the start to this step's start. */
  atM: number;
}

export interface Climb {
  atM: number;
  meters: number;
  grade: number;
  riseM: number;
}

export interface RangeEstimate {
  /** Battery watt-hours for the trip one way, low and high. */
  tripWh: [number, number];
  /** Percent of the battery gauge the trip uses, low and high. */
  usedPct: [number, number];
  /** Percent left at the end, low and high. */
  leftPct: [number, number];
  /** Percent of the gauge for there and back, low and high. */
  roundTripPct: [number, number];
  roundTrip: "fits" | "tight" | "short";
  /** Miles a full charge goes on flat ground with no wind at this speed and assist, low and high. */
  flatMiles: [number, number];
  /** The longest climbs, biggest rise first, at most two. */
  climbs: Climb[];
  /** True when the route had no heights, so the trip was taken as flat. */
  assumedFlat: boolean;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function meters(a: RoutePoint, b: RoutePoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function heading(a: RoutePoint, b: RoutePoint): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The route as steps between its points. A step with a missing height counts as flat. */
export function stepsOf(points: readonly RoutePoint[], heights: readonly (number | null)[] | null | undefined): Step[] {
  const steps: Step[] = [];
  let atM = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const d = meters(points[i], points[i + 1]);
    if (d <= 0) continue;
    const h0 = heights?.[i] ?? null;
    const h1 = heights?.[i + 1] ?? null;
    const raw = h0 !== null && h1 !== null ? (h1 - h0) / d : 0;
    steps.push({ meters: d, grade: Math.max(-MAX_GRADE, Math.min(MAX_GRADE, raw)), headingDeg: heading(points[i], points[i + 1]), atM });
    atM += d;
  }
  return steps;
}

/** The same steps ridden the other way. */
export function reversed(steps: readonly Step[]): Step[] {
  const total = steps.reduce((sum, s) => sum + s.meters, 0);
  return [...steps].reverse().map((s) => ({ meters: s.meters, grade: -s.grade, headingDeg: (s.headingDeg + 180) % 360, atM: total - s.atM - s.meters }));
}

function motorShare(level: AssistLevel, a: RangeAssumptions): number {
  if (level === "throttle") return 1;
  return Math.min(1, Math.max(0, MOTOR_SHARE[level] + a.shareShift));
}

/** Battery watt-hours for the steps under one set of assumptions. Coasting downhill costs nothing and gives nothing back. */
export function tripWattHours(steps: readonly Step[], input: RangeInput, a: RangeAssumptions): number {
  let joules = 0;
  for (const s of steps) {
    const theta = Math.atan(s.grade);
    const headwind = input.wind ? input.wind.speedMps * a.windAtRider * Math.cos(rad(input.wind.fromDeg - s.headingDeg)) : 0;
    const air = input.speedMps + headwind;
    const force = input.massKg * GRAVITY * (a.crr * Math.cos(theta) + Math.sin(theta)) + 0.5 * AIR_DENSITY * a.cda * air * Math.abs(air);
    if (force > 0) joules += force * s.meters;
  }
  return (joules * a.stopGo * motorShare(input.assist, a)) / a.efficiency / JOULES_PER_WH;
}

/** Miles a full charge goes on flat ground with no wind. */
function flatMiles(input: RangeInput, a: RangeAssumptions): number {
  const force = input.massKg * GRAVITY * a.crr + 0.5 * AIR_DENSITY * a.cda * input.speedMps ** 2;
  const whPerMeter = (force * a.stopGo * motorShare(input.assist, a)) / a.efficiency / JOULES_PER_WH;
  return whPerMeter > 0 ? (input.batteryWh * a.usable) / whPerMeter / METERS_PER_MILE : Number.POSITIVE_INFINITY;
}

/** The longest steady climbs, by how much they rise. */
export function climbsOf(steps: readonly Step[]): Climb[] {
  const climbs: Climb[] = [];
  let run: Step[] = [];
  const close = () => {
    const length = run.reduce((sum, s) => sum + s.meters, 0);
    const rise = run.reduce((sum, s) => sum + s.grade * s.meters, 0);
    if (length >= CLIMB_MIN_M) climbs.push({ atM: run[0].atM, meters: length, grade: rise / length, riseM: rise });
    run = [];
  };
  for (const s of steps) {
    if (s.grade >= CLIMB_GRADE) run.push(s);
    else if (run.length > 0) close();
  }
  if (run.length > 0) close();
  return climbs.sort((x, y) => y.riseM - x.riseM).slice(0, 2);
}

/** Percent of the battery gauge a trip uses: its watt-hours over what the battery really gives. */
function gaugePct(wh: number, input: RangeInput, a: RangeAssumptions): number {
  return (100 * wh) / (input.batteryWh * a.usable);
}

export function estimateRange(points: readonly RoutePoint[], heights: readonly (number | null)[] | null | undefined, input: RangeInput): RangeEstimate {
  const steps = stepsOf(points, heights);
  const back = reversed(steps);
  const lowWh = tripWattHours(steps, input, OPTIMISTIC);
  const highWh = tripWattHours(steps, input, PESSIMISTIC);
  const used: [number, number] = [gaugePct(lowWh, input, OPTIMISTIC), gaugePct(highWh, input, PESSIMISTIC)];
  const round: [number, number] = [
    used[0] + gaugePct(tripWattHours(back, input, OPTIMISTIC), input, OPTIMISTIC),
    used[1] + gaugePct(tripWattHours(back, input, PESSIMISTIC), input, PESSIMISTIC),
  ];
  const roundTrip = round[1] <= input.chargePct - RESERVE_PCT ? "fits" : round[0] > input.chargePct ? "short" : "tight";
  return {
    tripWh: [lowWh, highWh],
    usedPct: used,
    leftPct: [Math.max(0, input.chargePct - used[1]), Math.max(0, input.chargePct - used[0])],
    roundTripPct: round,
    roundTrip,
    flatMiles: [flatMiles(input, PESSIMISTIC), flatMiles(input, OPTIMISTIC)],
    climbs: climbsOf(steps),
    assumedFlat: !heights || heights.every((h) => h === null),
  };
}
