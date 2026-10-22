// Where each bike fact came from. A fact read from a product link, pasted text, a label photo or
// the whole-bike pedal photo check keeps a note of where it was read, so the facts card shows the
// words it was read from under it, and the family can see the source and change the fact. A fact
// the family typed or picked has no note. Nothing here is saved, so a reload or a shared link
// starts with no notes. Kept apart from the page so tests can run it.

import { applyPedalCall, type PedalCall } from "@/lib/photo/pedalRule";
import { bottomLine, type BottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, READ_FIELDS, type BikeFacts, type EngineResult, type ReadField } from "@/lib/rules/types";

/** "text" for a product link, pasted text or a label photo. "photo" for the whole-bike pedal check. */
export type FactSource = "text" | "photo";

/** A wheel whose size can be read. */
export type Wheel = "front" | "rear";

export interface FactCheck {
  source: FactSource;
  /** The facts as this fact was read, so the card can tell whether the fact still holds the value read. */
  asRead: BikeFacts;
}

/** One entry per fact whose value was read. A fact the family typed has none. */
export type FactChecks = Readonly<Partial<Record<ReadField, FactCheck>>>;

/** The bike facts and where each one came from. The two always change together. */
export interface CheckedFacts {
  facts: BikeFacts;
  checks: FactChecks;
}

/** A state update for the page, run on the newest facts and notes. */
export type CheckedUpdate = (cur: CheckedFacts) => CheckedFacts;

/** A read fact held in one field of the facts. The wheel size is held in two, one per wheel. */
export type OneValueField = Exclude<ReadField, "wheelSize">;

/** One fact's value as a string, so two values can be compared. */
export function fieldValue(facts: BikeFacts, field: OneValueField): string {
  return JSON.stringify(field === "classes" ? [...facts.classes].sort() : facts[field]);
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

/** Builds a notes object field by field, so every key and value is type-checked. */
function buildChecks(entry: (field: ReadField) => FactCheck | undefined): FactChecks {
  const out: Partial<Record<ReadField, FactCheck>> = {};
  for (const field of READ_FIELDS) {
    const check = entry(field);
    if (check) out[field] = check;
  }
  return out;
}

/** No facts and no notes. A new start, a reload and a shared link all begin here. */
export function emptyChecked(): CheckedFacts {
  return { facts: emptyFacts(), checks: {} };
}

/** Facts read from a product link, pasted text or a label photo. They replace the bike before. */
export function fromRead(facts: BikeFacts, source: FactSource = "text"): CheckedFacts {
  const checks = buildChecks((field) => (hasValue(facts, field) ? { source, asRead: facts } : undefined));
  return { facts, checks };
}

function wheelIn(facts: BikeFacts, wheel: Wheel): number | null {
  return wheel === "front" ? facts.wheelFrontIn : facts.wheelRearIn;
}

/**
 * True when the fact still holds the value that was read. For the wheel size, any one wheel still
 * at its read size counts. The card then marks the fact "Read from the text". Once the family
 * changes it, the card shows the words it was read from as "Read from" instead.
 */
export function isAsRead(check: FactCheck, field: ReadField, facts: BikeFacts): boolean {
  if (field === "wheelSize") return (["front", "rear"] as const).some((w) => wheelIn(check.asRead, w) !== null && wheelIn(facts, w) === wheelIn(check.asRead, w));
  return fieldValue(facts, field) === fieldValue(check.asRead, field);
}

/**
 * An edit as an update for the page's state. `seen` is the facts on the card when the family made
 * the edit, and `next` was built from them. A product link, a label photo or the pedal photo check
 * can land after the card was drawn and before the edit is applied. The edit was then made on
 * facts that are gone, so it is dropped. The card then shows the new facts, and they can make the
 * change again.
 */
export function editOn(seen: BikeFacts, next: BikeFacts): CheckedUpdate {
  return (cur) => (cur.facts === seen ? { facts: next, checks: cur.checks } : cur);
}

/**
 * The whole-bike photo check made a call. It only ever fills the pedals answer. When the call
 * changes that answer, the new answer is noted as read by the photo check. A close call, or a call
 * that matches the answer already there, changes nothing. The page drops a call that lands after
 * the family picked a pedals answer while the check ran (answerGate in lib/photo/pedalRule.ts).
 */
export function withPedalCall(cur: CheckedFacts, call: PedalCall): CheckedFacts {
  const facts = applyPedalCall(cur.facts, call);
  if (facts.hasPedals === cur.facts.hasPedals) return cur;
  return { facts, checks: buildChecks((f) => (f === "hasPedals" ? { source: "photo", asRead: facts } : cur.checks[f])) };
}

/**
 * A photo check's call as an update for the page's state. `seen` is the facts on the card as the
 * call lands, not as the check started, so edits the family made while it ran keep the call. A
 * product link or label read that lands first is a new bike, and the old card stays on the page
 * for a moment after it. A call that lands then was made for the old bike, so it is dropped
 * rather than filling in the new bike's pedals.
 */
export function pedalCallOn(seen: BikeFacts, call: PedalCall): CheckedUpdate {
  return (cur) => (cur.facts === seen ? withPedalCall(cur, call) : cur);
}

/** The bottom line the page shows, or null before there is a result to sum up. */
export function summaryFor(result: EngineResult | null, rideDate: string | null): BottomLine | null {
  return result && rideDate ? bottomLine(result, rideDate) : null;
}

/** How many facts were read. */
export function readCount(checks: FactChecks): number {
  return READ_FIELDS.filter((f) => checks[f] !== undefined).length;
}
