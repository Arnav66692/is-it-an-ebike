// Turns what we know about a bike into the values the condition checker reads.
// Partly known facts become intervals, so "front wheel 20 inches, rear unknown"
// still settles "max wheel diameter <= 14" as false.

import { ANY, exactly, type Env, type Interval } from "./condition";
import type { BikeFacts, Tri } from "./types";

const INF = Number.POSITIVE_INFINITY;

/** Walk-mode cap. A bike with no throttle can't push itself past this on the motor alone. */
const WALK_MODE_MAX_MPH = 4;

function wheelIntervals(f: BikeFacts): { max: Interval; min: Interval } {
  const known = [f.wheelFrontIn, f.wheelRearIn].filter((v): v is number => v !== null);
  if (known.length === 2) {
    const big = Math.max(known[0], known[1]);
    const small = Math.min(known[0], known[1]);
    return { max: exactly(big), min: exactly(small) };
  }
  if (known.length === 1) {
    return {
      max: { lo: known[0], loOpen: false, hi: INF, hiOpen: true },
      min: { lo: 0, loOpen: false, hi: known[0], hiOpen: false },
    };
  }
  return { max: ANY, min: ANY };
}

/** Top speed on the motor alone, across every mode the bike has. */
export function motorOnlyInterval(f: BikeFacts): Interval {
  let lo = 0;
  let loOpen = false;
  let hi = INF;
  let hiOpen = true;
  if (f.throttleMph !== null) {
    lo = Math.max(lo, f.throttleMph);
  }
  if (f.motorOver20 === true && (lo < 20 || (lo === 20 && !loOpen))) {
    lo = 20;
    loOpen = true;
  }
  if (f.motorOver20 === false) {
    hi = 20;
    hiOpen = false;
  }
  if (f.hasThrottle === false && f.motorOver20 !== true && f.switchable !== true) {
    if (WALK_MODE_MAX_MPH < hi) {
      hi = WALK_MODE_MAX_MPH;
      hiOpen = false;
    }
  }
  return { lo, loOpen, hi, hiOpen };
}

export function switchableValue(f: BikeFacts): Tri {
  if (f.switchable === true || f.motorOver20 === true || f.assistOver28 === true) return true;
  if (f.motorOver20 === false && f.assistOver28 === false) return false;
  return null;
}

function weightInterval(f: BikeFacts): Interval {
  if (f.weightLb !== null) return exactly(f.weightLb);
  if (f.weightOver100 === true) return { lo: 100, loOpen: true, hi: INF, hiOpen: true };
  if (f.weightOver100 === false) return { lo: 0, loOpen: false, hi: 100, hiOpen: false };
  return ANY;
}

/** Rated watts. If only a peak figure is known, rated watts are at most the peak. */
export function ratedWattsInterval(f: BikeFacts): Interval {
  if (f.ratedWatts !== null) return exactly(f.ratedWatts);
  if (f.peakWatts !== null) return { lo: 0, loOpen: false, hi: f.peakWatts, hiOpen: false };
  return ANY;
}

export interface FactsEnv {
  env: Env;
  /** The facts contradict each other, for example a stated 28 mph throttle and "never over 20". */
  conflict: boolean;
}

export function factsEnv(f: BikeFacts): FactsEnv {
  const wheels = wheelIntervals(f);
  const motor = motorOnlyInterval(f);
  const count: Interval =
    f.wheelCount === null ? { lo: 2, loOpen: false, hi: 3, hiOpen: false } : exactly(f.wheelCount);
  const conflict =
    motor.lo > motor.hi || (motor.lo === motor.hi && (motor.loOpen || motor.hiOpen));
  return {
    conflict,
    env: {
      max_wheel_diameter_in: { kind: "num", iv: wheels.max },
      min_wheel_diameter_in: { kind: "num", iv: wheels.min },
      wheel_count: { kind: "num", iv: count },
      throttle_max_mph: { kind: "num", iv: motor },
      motor_only_max_mph: { kind: "num", iv: motor },
      bike_weight_lb: { kind: "num", iv: weightInterval(f) },
      label_watts: { kind: "num", iv: ratedWattsInterval(f) },
      switchable_out_of_class: { kind: "bool", v: switchableValue(f) },
      has_foot_pegs: { kind: "bool", v: f.hasFootPegs },
      needs_pedal_kit: { kind: "bool", v: f.needsPedalKit },
    },
  };
}
