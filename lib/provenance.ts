// Where each bike fact came from, and whether the family has checked it against the bike.
//
// A fact read from a product link, pasted text, a label photo or the whole-bike pedal photo check
// can be wrong, however careful the reader is. So it comes in "not checked", and stays that way
// until the family ticks "It matches the bike" or changes it. The bottom line can't say YES while
// any read fact is not checked (lib/rules/bottomLine.ts). A fact the family typed or picked is
// theirs from the start. Nothing here is saved, so a reload or a shared link starts with nothing
// checked. Kept apart from the page so tests can run it.

import { applyPedalCall, type PedalCall } from "@/lib/photo/pedalRule";
import { emptyFacts, READ_FIELDS, type BikeFacts, type ReadField } from "@/lib/rules/types";

/** "text" for a product link, pasted text or a label photo. "photo" for the whole-bike pedal check. */
export type FactSource = "text" | "photo";

export interface FactCheck {
  source: FactSource;
  /** True once the family ticked "It matches the bike" or changed the value. */
  confirmed: boolean;
}

/** One entry per fact whose value was read. A fact the family typed has none, since it is already theirs. */
export type FactChecks = Readonly<Partial<Record<ReadField, FactCheck>>>;

/** The bike facts and where each one came from. The two always change together. */
export interface CheckedFacts {
  facts: BikeFacts;
  checks: FactChecks;
}

/** One fact's value as a string, so two values can be compared. */
export function fieldValue(facts: BikeFacts, field: ReadField): string {
  switch (field) {
    case "wheelSize":
      return JSON.stringify([facts.wheelFrontIn, facts.wheelRearIn]);
    case "classes":
      return JSON.stringify([...facts.classes].sort());
    default:
      return JSON.stringify(facts[field]);
  }
}

/** True when the fact holds a value. An empty class list means no class was given. */
export function hasValue(facts: BikeFacts, field: ReadField): boolean {
  switch (field) {
    case "wheelSize":
      return facts.wheelFrontIn !== null || facts.wheelRearIn !== null;
    case "classes":
      return facts.classes.length > 0;
    default:
      return facts[field] !== null;
  }
}

/** No facts and nothing to check. A new start, a reload and a shared link all begin here. */
export function emptyChecked(): CheckedFacts {
  return { facts: emptyFacts(), checks: {} };
}

/**
 * Facts read from a product link, pasted text or a label photo. They replace the bike before, so
 * every value comes in not checked, even one the family checked on the last bike.
 */
export function fromRead(facts: BikeFacts, source: FactSource = "text"): CheckedFacts {
  const check: FactCheck = { source, confirmed: false };
  const checks: FactChecks = Object.fromEntries(READ_FIELDS.filter((f) => hasValue(facts, f)).map((f) => [f, check]));
  return { facts, checks };
}

/**
 * The family changed the facts by hand, on the facts card or in a follow-up question. Each read
 * fact whose value changed is now theirs, so it counts as checked. A read fact they cleared is no
 * longer a read value, so it has nothing left to check. Facts they didn't touch keep their state.
 */
export function withEdit(cur: CheckedFacts, next: BikeFacts): CheckedFacts {
  const checks: FactChecks = Object.fromEntries(
    READ_FIELDS.flatMap((field) => {
      const check = cur.checks[field];
      if (!check) return [];
      if (fieldValue(cur.facts, field) === fieldValue(next, field)) return [[field, check]];
      return hasValue(next, field) ? [[field, { ...check, confirmed: true }]] : [];
    }),
  );
  return { facts: next, checks };
}

/** The family ticked, or cleared, "It matches the bike" on one read fact. A fact that wasn't read has nothing to check. */
export function withConfirmed(cur: CheckedFacts, field: ReadField, confirmed: boolean): CheckedFacts {
  const check = cur.checks[field];
  if (!check || check.confirmed === confirmed) return cur;
  return { ...cur, checks: { ...cur.checks, [field]: { ...check, confirmed } } };
}

/**
 * The whole-bike photo check made a call. It only ever fills the pedals answer. When the call
 * changes that answer, the new answer came from the photo and is not checked, even if the family
 * checked the old one. A close call, or a call that matches the answer already there, changes
 * nothing. The page drops a call that lands after the family picked a pedals answer while the
 * check ran (answerGate in lib/photo/pedalRule.ts), so a call never replaces their answer.
 */
export function withPedalCall(cur: CheckedFacts, call: PedalCall): CheckedFacts {
  const facts = applyPedalCall(cur.facts, call);
  if (facts.hasPedals === cur.facts.hasPedals) return cur;
  return { facts, checks: { ...cur.checks, hasPedals: { source: "photo", confirmed: false } } };
}

/** The read facts not yet checked, in the order the facts card shows them. */
export function unconfirmedFields(checks: FactChecks): ReadField[] {
  return READ_FIELDS.filter((f) => checks[f]?.confirmed === false);
}

/** How many facts were read, and how many of those the family has checked. */
export function checkCounts(checks: FactChecks): { read: number; confirmed: number } {
  const all = READ_FIELDS.filter((f) => checks[f] !== undefined);
  return { read: all.length, confirmed: all.filter((f) => checks[f]?.confirmed).length };
}
