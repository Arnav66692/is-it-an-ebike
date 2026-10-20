// An independent check of the engine. It reads the raw JSON itself and lists every reason
// a case must NOT get a "yes", and separately every rule that says a ride is definitely not
// allowed. It shares no logic with lib/rules: conditions are run as plain JavaScript and
// dates are compared directly. If the engine says "yes" while the first list is non-empty,
// that is a false-legal result and the test fails.

import statesJson from "@/data/rules/all_states.normalized.json";
import sdJson from "@/data/rules/san_diego_local.json";
import overlayJson from "@/data/overlay.json";

interface AgeRuleRaw {
  applies_to: string;
  min_age: number;
  effective_date: string | null;
}
interface CautionRaw {
  applies_to: string;
  rider_under_age: number | null;
  condition: string | null;
  /** "not_an_ebike" when the rule puts the bike outside the definition. */
  verdict: string;
  valid_until: string | null;
  /** Overlay cautions only: the first day it applies. */
  valid_from?: string | null;
}
interface StateRaw {
  confidence: string;
  /** The day the state's record was last checked against statute text. */
  last_checked: string;
  never_return_legal: boolean;
  definition: {
    requires_pedals: boolean | null;
    max_motor_watts: number | null;
    motor_watts_comparison: string;
    max_motor_hp: number | null;
  };
  min_age: AgeRuleRaw[] | null;
  verdict_cautions: CautionRaw[];
}
interface Effect {
  type: string;
  applies_to?: string;
  min_age?: number;
  exception?: { from_age: number };
}

const STATES = statesJson as unknown as Record<string, StateRaw>;
const OVERLAY = overlayJson as unknown as {
  supplemental_cautions: (CautionRaw & { state: string })[];
  age_exceptions: { state: string; applies_to: string; min_age: number; from_age: number }[];
  scheduled_changes: { state: string; effective_date: string; effects: Effect[] }[];
  watt_fallbacks: { state: string; from: string | null; min_watts: number; max_watts: number | null }[];
};
interface SdRuleRaw {
  rule: string;
  min_age?: number | null;
  effective_date: string | null;
  /** The rule's own end date, or null when its text gives none. */
  ends?: string | null;
}
const SD = sdJson as unknown as {
  jurisdictions: {
    id: string;
    verification_level: string;
    /** The day the place's records were last read. */
    checked_through: string;
    local_age_limits: SdRuleRaw[];
    campus_class_limits: SdRuleRaw[];
  }[];
};
/** VC 21214.7, the under-12 power, is repealed on this date. */
const UNDER_12_POWER_ENDS = "2029-01-01";
/** A new city or county ordinance normally takes effect this many days after adoption. */
const NEW_ORDINANCE_DAYS = 30;
/** A state record vouches for ride dates this many days after its check, the same horizon as a local record. */
const STATE_RECHECK_DAYS = 30;

function plusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

type Cls = 1 | 2 | 3;
const ALL_CLASSES: Cls[] = [1, 2, 3];

export interface OracleFacts {
  cls: Cls;
  /** The classes on the label. Defaults to [cls]. Empty means no class is known. */
  classes?: Cls[];
  /** Working pedals. Defaults to true. Null means unknown. */
  pedals?: boolean | null;
  /** The stated facts contradict each other. */
  conflict?: boolean;
  /** The throttle answer is "not sure", but the text still states this throttle speed. */
  throttleUnsureMph?: number;
  /** The throttle answer is blank or "not sure", and no throttle speed is stated. */
  throttleUnknown?: boolean;
  /** A top speed whose mode the text doesn't say, given on top of the class's assist speed. */
  topSpeed?: number;
  /** Rated watts. Always given, so they settle the cap. */
  watts: number;
  /**
   * A peak figure the listing gives next to the rated watts. The rules read a peak or up-to
   * figure only when rated watts are missing, so the checker reads no rule from these. They are
   * here so the bottom line is tested with them as read facts the family must check.
   */
  peakWatts?: number;
  /** A "watts up to" figure the listing gives next to the rated watts, read the same way. */
  wattsUpTo?: number;
  front: number | null;
  rear: number | null;
  wheelCount: 2 | 3 | null;
  weight: number | null;
  pegs: boolean | null;
  kit: boolean | null;
  motorOver20: boolean | null;
  assistOver28: boolean | null;
  unsure: string[];
}

const FIELD_GROUP: Record<string, string> = {
  max_wheel_diameter_in: "wheels",
  min_wheel_diameter_in: "wheels",
  wheel_count: "wheels",
  throttle_max_mph: "fast_mode",
  motor_only_max_mph: "fast_mode",
  switchable_out_of_class: "fast_mode",
  assist_over_28: "fast_mode",
  bike_weight_lb: "weight",
  has_foot_pegs: "pegs_kit",
  needs_pedal_kit: "pegs_kit",
  label_watts: "watts",
};

export function classesOf(f: OracleFacts): Cls[] {
  return f.classes ?? [f.cls];
}

/** A throttle comes with a Class 2 label. A bike with no class known is taken to have none. */
export function hasThrottle(f: OracleFacts): boolean {
  return classesOf(f).includes(2);
}

export function pedalsOf(f: OracleFacts): boolean | null {
  return f.pedals === undefined ? true : f.pedals;
}

/** Each class a label promises: Class 1 and 2 top out at 20 mph, Class 3 at 28. */
const LABEL_MAX_MPH: Record<Cls, number> = { 1: 20, 2: 20, 3: 28 };

/**
 * Why the stated class can't be trusted, if it can't. A stated throttle speed on a label with no
 * Class 2 means a throttle the class doesn't allow, even when the throttle answer is "not sure".
 * A top speed of unknown mode above every class the label names, but within 28 mph, doesn't
 * match the label either.
 */
function classConflict(f: OracleFacts): string | null {
  const classes = classesOf(f);
  if (classes.length === 0) return null;
  if (f.throttleUnsureMph !== undefined && !classes.includes(2)) return "class_conflict_throttle";
  const cap = Math.max(...classes.map((c) => LABEL_MAX_MPH[c]));
  if (f.topSpeed !== undefined && f.topSpeed > cap && f.topSpeed <= 28) return "class_conflict_speed";
  return null;
}

function fieldValues(f: OracleFacts): Record<string, number | boolean | undefined> {
  const wheelsKnown = f.front !== null && f.rear !== null && f.wheelCount !== null;
  const fastKnown = f.motorOver20 !== null && f.assistOver28 !== null;
  const motor = f.motorOver20 ? 25 : f.throttleUnsureMph ?? (hasThrottle(f) ? 20 : 0);
  return {
    max_wheel_diameter_in: wheelsKnown ? Math.max(f.front as number, f.rear as number) : undefined,
    min_wheel_diameter_in: wheelsKnown ? Math.min(f.front as number, f.rear as number) : undefined,
    wheel_count: wheelsKnown ? (f.wheelCount as number) : undefined,
    throttle_max_mph: fastKnown ? motor : undefined,
    motor_only_max_mph: fastKnown ? motor : undefined,
    switchable_out_of_class: fastKnown ? Boolean(f.motorOver20 || f.assistOver28) : undefined,
    assist_over_28: f.assistOver28 ?? undefined,
    bike_weight_lb: f.weight ?? undefined,
    has_foot_pegs: f.pegs ?? undefined,
    needs_pedal_kit: f.kit ?? undefined,
    label_watts: f.watts,
  };
}

/** Runs a condition string as JavaScript. Returns undefined when any field it reads is unknown. */
function runCondition(condition: string, values: Record<string, number | boolean | undefined>): boolean | undefined {
  const fields = Object.keys(FIELD_GROUP).filter((name) => new RegExp(`\\b${name}\\b`).test(condition));
  if (fields.some((name) => values[name] === undefined)) return undefined;
  const js = condition.replace(/\band\b/g, "&&").replace(/\bor\b/g, "||").replace(/==/g, "===");
  const fn = new Function(...fields, `return (${js});`) as (...args: unknown[]) => boolean;
  return Boolean(fn(...fields.map((name) => values[name])));
}

function referencedGroups(condition: string): string[] {
  return Object.keys(FIELD_GROUP)
    .filter((name) => new RegExp(`\\b${name}\\b`).test(condition))
    .map((name) => FIELD_GROUP[name]);
}

function iso(value: string | null): string | null {
  const m = value ? /\d{4}-\d{2}-\d{2}/.exec(value) : null;
  return m ? m[0] : null;
}

function classOk(appliesTo: string, cls: number): boolean {
  return appliesTo === "all_ebikes" || appliesTo === `class_${cls}`;
}

const FAST_FIELDS = /\b(throttle_max_mph|motor_only_max_mph|switchable_out_of_class|assist_over_28)\b/;

function cautionsOf(code: string): CautionRaw[] {
  return [...STATES[code].verdict_cautions, ...OVERLAY.supplemental_cautions.filter((c) => c.state === code)];
}

function cautionApplies(c: CautionRaw, cls: Cls, age: number, date: string): boolean {
  if (c.valid_until !== null && date >= c.valid_until) return false;
  if (c.valid_from && date < c.valid_from) return false;
  if (!classOk(c.applies_to, cls)) return false;
  return !(c.rider_under_age !== null && age >= c.rider_under_age);
}

/** Every reason the table gives for "not yes" in this state on this date. Empty means yes. */
export function stateBlockers(code: string, f: OracleFacts, age: number, date: string): string[] {
  const s = STATES[code];
  const reasons: string[] = [];
  if (s.never_return_legal) reasons.push("never_return_legal");
  const pedals = pedalsOf(f);
  if (pedals === false) reasons.push(s.definition.requires_pedals === true ? "no_pedals" : "no_pedals_unclear");
  if (pedals === null) reasons.push("pedals_unknown");
  if (f.conflict) reasons.push("facts_conflict");
  const classes = classesOf(f);
  if (classes.length === 0) reasons.push("class_unknown");
  const conflict = classConflict(f);
  if (conflict) reasons.push(conflict);
  // Class 1 and 3 help only while the rider pedals, so only a clear "no throttle" fits those labels.
  if (!conflict && f.throttleUnknown && classes.length > 0 && !classes.includes(2)) reasons.push("throttle_unknown");
  if (f.topSpeed !== undefined && f.topSpeed > 28) reasons.push("fits_no_class_speed");
  for (const cls of classes.length > 0 ? classes : ALL_CLASSES) reasons.push(...classBlockers(code, f, cls, age, date));
  return [...new Set(reasons)];
}

/** Reasons for "not yes" that depend on the class: watts, the table's cautions, fast modes and age. */
function classBlockers(code: string, f: OracleFacts, cls: Cls, age: number, date: string): string[] {
  const s = STATES[code];
  const reasons: string[] = [];

  const { motor_watts_comparison: cmp, max_motor_watts: max, max_motor_hp: hp } = s.definition;
  if (cmp === "at_most" && max !== null && f.watts > max) reasons.push("watts_over");
  if (cmp === "less_than" && max !== null && f.watts >= max) reasons.push("watts_at_or_over_strict");
  if (cmp === "other" && max !== null && f.watts > max) reasons.push("watts_over");
  // Rhode Island: "not more than" 2 SAE horsepower, at 745.7 W per hp.
  if (cmp === "other" && max === null && hp !== null && f.watts > hp * 745.7) reasons.push("watts_over_hp");

  const values = fieldValues(f);
  const cautions = cautionsOf(code);
  for (const c of cautions) {
    if (!cautionApplies(c, cls, age, date)) continue;
    if (c.condition === null) {
      reasons.push(`caution:${c.applies_to}`);
      continue;
    }
    const result = runCondition(c.condition, values);
    if (result === true) reasons.push(`caution:${c.condition}`);
    if (result === undefined) reasons.push(`caution_unknown:${referencedGroups(c.condition).join("+")}`);
  }

  const explicitFast = cautions.some((c) => c.condition !== null && FAST_FIELDS.test(c.condition));
  if (f.motorOver20 === true || f.assistOver28 === true) reasons.push("fast_mode");
  if (f.motorOver20 === null || f.assistOver28 === null) {
    const answeredUnsure = f.unsure.includes("fast_mode");
    if (!answeredUnsure || explicitFast) reasons.push("fast_mode_unknown");
  }

  reasons.push(...ageBlocks(code, cls, age, date));
  return reasons;
}

/** Each age rule that bars this rider from this class on this date. */
function ageBlocks(code: string, cls: Cls, age: number, date: string): string[] {
  const s = STATES[code];
  const reasons: string[] = [];
  const changes = OVERLAY.scheduled_changes.filter((c) => c.state === code && c.effective_date <= date);
  const ended = (rule: AgeRuleRaw) =>
    changes.some((c) =>
      c.effects.some((e) => e.type === "end_age_rule" && e.applies_to === rule.applies_to && e.min_age === rule.min_age),
    );
  const rules: { applies_to: string; min_age: number; fromAge: number | null }[] = [];
  for (const rule of s.min_age ?? []) {
    const from = iso(rule.effective_date);
    if (from !== null && date < from) continue;
    if (ended(rule)) continue;
    const ex = OVERLAY.age_exceptions.find(
      (e) => e.state === code && e.applies_to === rule.applies_to && e.min_age === rule.min_age,
    );
    rules.push({ applies_to: rule.applies_to, min_age: rule.min_age, fromAge: ex ? ex.from_age : null });
  }
  for (const c of changes) {
    for (const e of c.effects) {
      if (e.type !== "add_age_rule" || e.applies_to === undefined || e.min_age === undefined) continue;
      rules.push({ applies_to: e.applies_to, min_age: e.min_age, fromAge: e.exception ? e.exception.from_age : null });
    }
  }
  for (const r of rules) {
    if (!classOk(r.applies_to, cls) || age >= r.min_age) continue;
    if (r.fromAge !== null && age >= r.fromAge) continue;
    reasons.push(`under_${r.min_age}`);
  }
  return reasons;
}

/**
 * Extra San Diego reasons for one class on top of the state reasons. Read from the raw San Diego
 * records. An under-12 ban with its own end date is gone after it. A ban whose text gives no end
 * date can't be confirmed after the state power behind it lapses. A place with no ban in force
 * can't be confirmed for an under-12 rider more than 30 days after its records were checked.
 */
export function localBlockers(place: string, cls: Cls, age: number, date: string): string[] {
  const reasons: string[] = [];
  const j = SD.jurisdictions.find((x) => x.id === place);
  if (!j) return [`unknown_place:${place}`];
  const classOneOrTwo = cls === 1 || cls === 2;
  if (place === "sduhsd_campuses" && cls === 3) {
    const limit = j.campus_class_limits.find((r) => r.rule === "class_1_and_2_only_on_campus");
    if (limit && (limit.effective_date === null || date >= limit.effective_date)) reasons.push("campus_class_3");
  }
  const ban = j.local_age_limits.find((r) => r.rule === "under_12_ban");
  if (ban && ban.effective_date && classOneOrTwo && age < (ban.min_age ?? 12) && date >= ban.effective_date) {
    const repealed = typeof ban.ends === "string" && date >= ban.ends;
    if (!repealed) reasons.push(date < UNDER_12_POWER_ENDS ? "local_under_12" : "local_under_12_no_end");
  }
  // With no ban in force, the record only vouches for ride dates up to the time a new ban
  // would need to take effect after the check. School rules don't come from this power.
  const banned = reasons.includes("local_under_12") || reasons.includes("local_under_12_no_end");
  const vouchedThrough = plusDays(j.checked_through, NEW_ORDINANCE_DAYS);
  if (place !== "sduhsd_campuses" && !banned && classOneOrTwo && age < 12 && date > vouchedThrough) {
    reasons.push("local_under_12_after_check");
  }
  const unclear = j.local_age_limits.some((r) => r.rule === "authority_exists_no_adoption_found");
  if (unclear && classOneOrTwo && age < 12 && date < UNDER_12_POWER_ENDS) reasons.push("local_under_12_unclear");
  return reasons;
}

/** San Diego rules that definitely bar this class at this place on this date. */
function localIllegal(place: string, cls: Cls, age: number, date: string): string[] {
  return localBlockers(place, cls, age, date).filter((r) => r === "campus_class_3" || r === "local_under_12");
}

/** A rated watt figure at the cap of a "less than" state that the overlay files under another vehicle type. */
function wattFallback(code: string, watts: number, date: string): boolean {
  return OVERLAY.watt_fallbacks.some(
    (w) => w.state === code && (w.from === null || date >= w.from) && watts >= w.min_watts && (w.max_watts === null || watts <= w.max_watts),
  );
}

/**
 * State rules that definitely bar this class for this rider: a motor over the watt cap, a table
 * caution that puts the bike outside the definition, or an age rule. Unclear cautions, unknown
 * answers and fast modes the table doesn't name are not here, because they leave the answer open.
 */
function classIllegal(code: string, f: OracleFacts, cls: Cls, age: number, date: string): string[] {
  const { motor_watts_comparison: cmp, max_motor_watts: max, max_motor_hp: hp } = STATES[code].definition;
  const reasons: string[] = [];
  if ((cmp === "at_most" || cmp === "other" || cmp === "less_than") && max !== null && f.watts > max) reasons.push("watts_over");
  // A motor over a horsepower cap is outside the definition, like one over a watt cap.
  if (cmp === "other" && max === null && hp !== null && f.watts > hp * 745.7) reasons.push("watts_over_hp");
  if (cmp === "less_than" && max !== null && f.watts === max && wattFallback(code, f.watts, date)) reasons.push("watts_other_vehicle");
  const values = fieldValues(f);
  for (const c of cautionsOf(code)) {
    if (c.verdict !== "not_an_ebike" || !cautionApplies(c, cls, age, date)) continue;
    if (c.condition === null || runCondition(c.condition, values) === true) reasons.push(`not_an_ebike:${c.condition ?? c.applies_to}`);
  }
  reasons.push(...ageBlocks(code, cls, age, date));
  return reasons;
}

/**
 * Every rule that says the ride is definitely not allowed, in the state or at any picked place.
 * The bottom line must say "NO, not allowed" exactly when this list is non-empty.
 *
 * A pedal-less machine is out wherever the definition requires pedals. Otherwise a state that
 * never confirms an e-bike, unknown pedals and facts that disagree leave everything open. With
 * one or more known classes, any class that is barred is enough, since the bike can run as each.
 * With no class known, a card says no only when every class it could be is barred there.
 */
export function illegalReasons(code: string, f: OracleFacts, age: number, date: string, places: string[]): string[] {
  const s = STATES[code];
  const pedals = pedalsOf(f);
  if (pedals === false) return s.definition.requires_pedals === true ? ["no_pedals"] : [];
  if (s.never_return_legal || pedals === null || f.conflict) return [];
  const barred = (cls: Cls, place: string | null) =>
    place === null ? classIllegal(code, f, cls, age, date) : [...classIllegal(code, f, cls, age, date), ...localIllegal(place, cls, age, date)];
  // A label the other facts contradict says nothing about the class, so every class counts.
  const classes = classConflict(f) ? [] : classesOf(f);
  if (classes.length > 0) {
    return classes.flatMap((cls) => [...barred(cls, null), ...places.flatMap((p) => localIllegal(p, cls, age, date).map((r) => `${p}:${r}`))]);
  }
  return [null, ...places]
    .filter((place) => ALL_CLASSES.every((cls) => barred(cls, place).length > 0))
    .map((place) => `every_class:${place ?? "state"}`);
}

/**
 * Every reason the bottom line must not say YES. That is every card reason, plus a fast-mode
 * answer left at "not sure", plus any record that was not read in enacted text, plus a ride date
 * past what the state's last check vouches for.
 */
export function bottomLineBlockers(code: string, f: OracleFacts, age: number, date: string, places: string[]): string[] {
  const reasons = [...stateBlockers(code, f, age, date)];
  if (STATES[code].confidence !== "statute_verified") reasons.push("state_not_statute_verified");
  if (stateStaleInData(code, date)) reasons.push("state_after_check");
  if ((f.motorOver20 === null || f.assistOver28 === null) && !reasons.includes("fast_mode_unknown")) {
    reasons.push("fast_mode_not_answered");
  }
  const classes = classesOf(f);
  for (const place of places) {
    for (const cls of classes.length > 0 ? classes : ALL_CLASSES) {
      reasons.push(...localBlockers(place, cls, age, date).map((r) => `${place}:${r}`));
    }
    const level = SD.jurisdictions.find((x) => x.id === place)?.verification_level;
    if (level !== "primary_verified") reasons.push(`${place}:not_primary_verified`);
  }
  return reasons;
}

/** True when the ride date is past what the state's last check can vouch for. */
export function stateStaleInData(code: string, date: string): boolean {
  return date > plusDays(STATES[code].last_checked, STATE_RECHECK_DAYS);
}

/** True when the raw data says the record behind this card was read in enacted text. */
export function topVerifiedInData(scope: "state" | "local", id: string): boolean {
  if (scope === "state") return STATES[id].confidence === "statute_verified";
  return SD.jurisdictions.find((x) => x.id === id)?.verification_level === "primary_verified";
}
