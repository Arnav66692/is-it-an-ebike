// Turns the bike's class, one mod and the family's answer about what it does now into the facts
// the rules engine reads. Every state's answer for a mod comes from the engine on these facts.
//
// The bike before the mods is the class the family picked, with pedals, and a throttle only for
// Class 2, since Class 1 and Class 3 have none by definition. The rated watts and the follow-up
// answers (fast modes, wheels, weight, foot pegs) are the family's own, about the bike as it is now.
// A mod's answer can only set a fact the family told us. An answer that doesn't say what the mod
// does, like "something else, or not sure", sets nothing, so it can never lead to a YES.

import type { BikeFacts, ClassNum } from "@/lib/rules/types";

/** The facts a mod's outcome changes. Empty for a mod that changes nothing the engine reads. */
export interface FactChange extends Partial<Pick<BikeFacts, "classes" | "hasPedals" | "hasThrottle" | "motorOver20" | "assistOver28" | "assistMph" | "switchable" | "hasFootPegs" | "ratedWatts">> {
  /** The motor now puts out more than 750 W. The rated watts typed in count only when they are over 750, or else they are unknown. */
  overWattsLine?: true;
}

/** A change, or "unsettled" when the outcome itself says it depends, so no facts can be set. */
export type OutcomeFacts = FactChange | "unsettled";

/** Watts above this are over the 750 W line most states draw. */
export const WATTS_LINE = 750;

const NONE: FactChange = {};
// The class stays the one picked, and the engine says the bike now fits no class or no single class.
const MOTOR_OVER_20: FactChange = { motorOver20: true };
const ASSIST_OVER_28: FactChange = { assistOver28: true };
/** "The motor now puts out more than 750 watts." The rated watts typed in are used only when they are over 750. */
const OVER_750: FactChange = { overWattsLine: true };
/** A Class 1 bike that now assists to 28 mph with pedaling only and no throttle: a Class 3 bike. */
const CLASS_1_TO_3: FactChange = { classes: [3], hasThrottle: false, motorOver20: false, assistOver28: false, assistMph: 28 };

/**
 * Each mod's outcomes, in the order data/mods/ca-mods.json lists them. tests/modFacts.test.ts
 * checks that every mod and every outcome has an entry, so a new mod in the data can't go unmapped.
 */
export const MOD_FACTS: Record<string, readonly OutcomeFacts[]> = {
  speed_unlock_kit: [MOTOR_OVER_20, OVER_750, ASSIST_OVER_28, CLASS_1_TO_3],
  speed_unlock_app_or_code: [MOTOR_OVER_20, OVER_750, ASSIST_OVER_28, CLASS_1_TO_3, { switchable: true }],
  add_throttle_class1_or_class3: [
    { classes: [2], hasThrottle: true, motorOver20: false },
    { hasThrottle: true, motorOver20: false },
    { ...MOTOR_OVER_20, hasThrottle: true },
  ],
  throttle_past_20_mph: [{ ...MOTOR_OVER_20, hasThrottle: true }],
  motor_over_750w: [OVER_750],
  higher_voltage_battery: [MOTOR_OVER_20, OVER_750, ASSIST_OVER_28, NONE],
  remove_pedals: [{ hasPedals: false }],
  rider_foot_pegs: [{ hasFootPegs: true }, { hasPedals: false, hasFootPegs: true }],
  passenger_seat_or_pegs: [NONE, NONE],
  kid_seat: [NONE],
  kid_trailer: [NONE],
  lights: [NONE],
  horn_or_bell: [NONE],
  turn_signals: [NONE],
  wheel_or_tire_change: [NONE, "unsettled"],
  class_label_removed_or_changed: [NONE, NONE],
  remove_brake_motor_cutoff: [NONE],
  raised_handlebars: [NONE],
};

/** The bike before the mods: its class, pedals, a throttle only for Class 2, and the family's own answers. */
export function baseFacts(bikeClass: ClassNum, ratedWatts: number | null, answers: BikeFacts): BikeFacts {
  return { ...answers, classes: [bikeClass], hasPedals: true, hasThrottle: bikeClass === 2, ratedWatts, peakWatts: null, wattsUpTo: null };
}

/** The change for one outcome, or "unsettled". Throws for a mod or outcome with no entry. */
export function outcomeFacts(modId: string, index: number): OutcomeFacts {
  const change = MOD_FACTS[modId]?.[index];
  if (change === undefined) throw new Error(`${modId} outcome ${index} has no facts`);
  return change;
}

/** The rated watts for "now over 750 W": the typed watts when they are over 750, or unknown. */
function overWatts(base: BikeFacts): number | null {
  return base.ratedWatts !== null && base.ratedWatts > WATTS_LINE ? base.ratedWatts : null;
}

/** The change as plain facts, with "over 750 W" turned into the rated watts it stands for. */
function resolved(change: FactChange, base: BikeFacts): Omit<FactChange, "overWattsLine"> {
  const { overWattsLine, ...facts } = change;
  return overWattsLine ? { ...facts, ratedWatts: overWatts(base) } : facts;
}

/** The facts after one mod. A fact the outcome sets replaces the family's answer for that fact. */
export function withMod(base: BikeFacts, change: FactChange): BikeFacts {
  return { ...base, ...resolved(change, base) };
}

/** True for the facts where "yes" is the riskier answer, so it wins when two mods disagree. */
const RISKY_TRUE = ["hasThrottle", "motorOver20", "assistOver28", "switchable", "hasFootPegs"] as const;

/**
 * The facts after every mod at once. When mods set the same fact differently, the riskier answer
 * wins: a throttle, a fast mode or foot pegs if any mod adds one, no pedals if any mod removes them,
 * every class any mod moves the bike to, and unknown watts if any mod leaves them unknown.
 */
export function withMods(base: BikeFacts, changes: readonly FactChange[]): BikeFacts {
  const done = changes.map((c) => resolved(c, base));
  const out: BikeFacts = { ...base };
  const classChanges = done.filter((c) => c.classes !== undefined).map((c) => c.classes as ClassNum[]);
  // The bike may be any class a mod moves it to, so the engine checks each one.
  if (classChanges.length > 0) out.classes = [...new Set(classChanges.flat())].sort() as ClassNum[];
  for (const key of RISKY_TRUE) {
    const set = done.filter((c) => c[key] !== undefined).map((c) => c[key]);
    if (set.length > 0) out[key] = set.includes(true) ? true : set.includes(null) ? null : false;
  }
  if (done.some((c) => c.hasPedals === false)) out.hasPedals = false;
  const watts = done.filter((c) => c.ratedWatts !== undefined).map((c) => c.ratedWatts ?? null);
  if (watts.length > 0) out.ratedWatts = watts.includes(null) ? null : Math.max(...(watts as number[]));
  const assist = done.flatMap((c) => (typeof c.assistMph === "number" ? [c.assistMph] : []));
  if (assist.length > 0) out.assistMph = Math.max(...assist);
  return out;
}
