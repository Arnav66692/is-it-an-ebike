// An independent check of the engine. It reads the raw JSON itself and lists every reason
// a case must NOT get a "yes". It shares no logic with lib/rules: conditions are run as
// plain JavaScript and dates are compared directly. If the engine says "yes" while this
// list is non-empty, that is a false-legal result and the test fails.

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
  verdict: string;
  valid_until: string | null;
}
interface StateRaw {
  confidence: string;
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
};
interface SdRuleRaw {
  rule: string;
  min_age?: number | null;
  effective_date: string | null;
}
const SD = sdJson as unknown as {
  jurisdictions: {
    id: string;
    verification_level: string;
    local_age_limits: SdRuleRaw[];
    campus_class_limits: SdRuleRaw[];
  }[];
};
/** VC 21214.7, the under-12 power, is repealed on this date. */
const UNDER_12_POWER_ENDS = "2029-01-01";

export interface OracleFacts {
  cls: 1 | 2 | 3;
  watts: number;
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
  bike_weight_lb: "weight",
  has_foot_pegs: "pegs_kit",
  needs_pedal_kit: "pegs_kit",
  label_watts: "watts",
};

function fieldValues(f: OracleFacts): Record<string, number | boolean | undefined> {
  const wheelsKnown = f.front !== null && f.rear !== null && f.wheelCount !== null;
  const fastKnown = f.motorOver20 !== null && f.assistOver28 !== null;
  const motor = f.motorOver20 ? 25 : f.cls === 2 ? 20 : 0;
  return {
    max_wheel_diameter_in: wheelsKnown ? Math.max(f.front as number, f.rear as number) : undefined,
    min_wheel_diameter_in: wheelsKnown ? Math.min(f.front as number, f.rear as number) : undefined,
    wheel_count: wheelsKnown ? (f.wheelCount as number) : undefined,
    throttle_max_mph: fastKnown ? motor : undefined,
    motor_only_max_mph: fastKnown ? motor : undefined,
    switchable_out_of_class: fastKnown ? Boolean(f.motorOver20 || f.assistOver28) : undefined,
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

const FAST_FIELDS = /\b(throttle_max_mph|motor_only_max_mph|switchable_out_of_class)\b/;

/** Every reason the table gives for "not yes" in this state on this date. Empty means yes. */
export function stateBlockers(code: string, f: OracleFacts, age: number, date: string): string[] {
  const s = STATES[code];
  const reasons: string[] = [];
  if (s.never_return_legal) reasons.push("never_return_legal");

  const { motor_watts_comparison: cmp, max_motor_watts: max, max_motor_hp: hp } = s.definition;
  if (cmp === "at_most" && max !== null && f.watts > max) reasons.push("watts_over");
  if (cmp === "less_than" && max !== null && f.watts >= max) reasons.push("watts_at_or_over_strict");
  if (cmp === "other" && max !== null && f.watts > max) reasons.push("watts_over");
  if (cmp === "other" && max === null && hp !== null && f.watts >= hp * 745.7) reasons.push("watts_over_hp");

  const values = fieldValues(f);
  const cautions = [
    ...s.verdict_cautions,
    ...OVERLAY.supplemental_cautions.filter((c) => c.state === code),
  ];
  for (const c of cautions) {
    if (c.valid_until !== null && date >= c.valid_until) continue;
    if (!classOk(c.applies_to, f.cls)) continue;
    if (c.rider_under_age !== null && age >= c.rider_under_age) continue;
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
    if (!classOk(r.applies_to, f.cls) || age >= r.min_age) continue;
    if (r.fromAge !== null && age >= r.fromAge) continue;
    reasons.push(`under_${r.min_age}`);
  }
  return reasons;
}

/** Extra San Diego reasons on top of the state reasons. Read from the raw San Diego records. */
export function localBlockers(place: string, f: OracleFacts, age: number, date: string): string[] {
  const reasons: string[] = [];
  const j = SD.jurisdictions.find((x) => x.id === place);
  if (!j) return [`unknown_place:${place}`];
  const classOneOrTwo = f.cls === 1 || f.cls === 2;
  if (place === "sduhsd_campuses" && f.cls === 3) {
    const limit = j.campus_class_limits.find((r) => r.rule === "class_1_and_2_only_on_campus");
    if (limit && (limit.effective_date === null || date >= limit.effective_date)) reasons.push("campus_class_3");
  }
  const ban = j.local_age_limits.find((r) => r.rule === "under_12_ban");
  if (ban && ban.effective_date && classOneOrTwo && age < (ban.min_age ?? 12) && date >= ban.effective_date && date < UNDER_12_POWER_ENDS) {
    reasons.push("local_under_12");
  }
  const unclear = j.local_age_limits.some((r) => r.rule === "authority_exists_no_adoption_found");
  if (unclear && classOneOrTwo && age < 12 && date < UNDER_12_POWER_ENDS) reasons.push("local_under_12_unclear");
  return reasons;
}

/**
 * Every reason the bottom line must not say YES. That is every card reason, plus a fast-mode
 * answer left at "not sure", plus any record that was not read in enacted text.
 */
export function bottomLineBlockers(code: string, f: OracleFacts, age: number, date: string, places: string[]): string[] {
  const reasons = [...stateBlockers(code, f, age, date)];
  if (STATES[code].confidence !== "statute_verified") reasons.push("state_not_statute_verified");
  if ((f.motorOver20 === null || f.assistOver28 === null) && !reasons.includes("fast_mode_unknown")) {
    reasons.push("fast_mode_not_answered");
  }
  for (const place of places) {
    reasons.push(...localBlockers(place, f, age, date).map((r) => `${place}:${r}`));
    const level = SD.jurisdictions.find((x) => x.id === place)?.verification_level;
    if (level !== "primary_verified") reasons.push(`${place}:not_primary_verified`);
  }
  return reasons;
}

/** True when the raw data says the record behind this card was read in enacted text. */
export function topVerifiedInData(scope: "state" | "local", id: string): boolean {
  if (scope === "state") return STATES[id].confidence === "statute_verified";
  return SD.jurisdictions.find((x) => x.id === id)?.verification_level === "primary_verified";
}
