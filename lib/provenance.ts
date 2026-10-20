// Where each bike fact came from, and whether the family has checked it against the bike.
//
// A fact read from a product link, pasted text, a label photo or the whole-bike pedal photo check
// can be wrong, however careful the reader is. So it comes in "not checked", and stays that way
// until the family ticks "It matches the bike", changes it or answers it themselves. The bottom
// line can't say YES while any read fact is not checked (lib/rules/bottomLine.ts). A fact the
// family typed or picked is theirs from the start. Nothing here is saved, so a reload or a shared
// link starts with nothing checked. Kept apart from the page so tests can run it.

import { applyPedalCall, type PedalCall } from "@/lib/photo/pedalRule";
import { emptyFacts, READ_FIELDS, type BikeFacts, type ReadField } from "@/lib/rules/types";

/** "text" for a product link, pasted text or a label photo. "photo" for the whole-bike pedal check. */
export type FactSource = "text" | "photo";

/**
 * "unchecked" until the family looks at the bike. "ticked" once they tick "It matches the bike".
 * "theirs" once they change the fact or answer it themselves, so the value is their own and
 * there is nothing left to tick. A fact stays theirs, even if they type the read value back in.
 */
export type CheckStatus = "unchecked" | "ticked" | "theirs";

/** A wheel whose size can be read. */
export type Wheel = "front" | "rear";

export interface FactCheck {
  source: FactSource;
  status: CheckStatus;
  /**
   * Wheel size only: the read sizes the family hasn't changed yet. Two different sizes share one
   * check, so it becomes theirs once they have changed every size that was read, both at once or
   * one box at a time.
   */
  wheelsAsRead?: readonly Wheel[];
}

/** One entry per fact whose value was read. A fact the family typed has none, since it is already theirs. */
export type FactChecks = Readonly<Partial<Record<ReadField, FactCheck>>>;

/** The bike facts and where each one came from. The two always change together. */
export interface CheckedFacts {
  facts: BikeFacts;
  checks: FactChecks;
}

/** A state update for the page, run on the newest facts and checks. */
export type CheckedUpdate = (cur: CheckedFacts) => CheckedFacts;

/** True when the family has ticked the fact or made it their own. */
export function isConfirmed(check: FactCheck | undefined): boolean {
  return check !== undefined && check.status !== "unchecked";
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

/** Builds a checks object field by field, so every key and value is type-checked. */
function buildChecks(entry: (field: ReadField) => FactCheck | undefined): FactChecks {
  const out: Partial<Record<ReadField, FactCheck>> = {};
  for (const field of READ_FIELDS) {
    const check = entry(field);
    if (check) out[field] = check;
  }
  return out;
}

/** The same checks with one entry replaced. */
function withCheck(checks: FactChecks, field: ReadField, check: FactCheck): FactChecks {
  return buildChecks((f) => (f === field ? check : checks[f]));
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
  const checks = buildChecks((field) => {
    if (!hasValue(facts, field)) return undefined;
    if (field === "wheelSize") return { source, status: "unchecked", wheelsAsRead: wheelsHeld(facts) };
    return { source, status: "unchecked" };
  });
  return { facts, checks };
}

const WHEELS: readonly Wheel[] = ["front", "rear"];

function wheelIn(facts: BikeFacts, wheel: Wheel): number | null {
  return wheel === "front" ? facts.wheelFrontIn : facts.wheelRearIn;
}

/** The wheels whose size the facts hold. */
function wheelsHeld(facts: BikeFacts): Wheel[] {
  return WHEELS.filter((w) => wheelIn(facts, w) !== null);
}

function theirs(check: FactCheck): FactCheck {
  return { source: check.source, status: "theirs" };
}

/**
 * The wheel size check after an edit. A read size counts as changed once the family changes it,
 * and stays changed, so they can fix the Front box and then the Rear box. The check is theirs
 * once every read size has changed. Fixing the front size alone leaves the rear size as it was
 * read, still to be checked.
 */
function wheelEdit(check: FactCheck, before: BikeFacts, after: BikeFacts): FactCheck {
  const held = check.wheelsAsRead ?? wheelsHeld(before);
  if (held.length === 0) return fieldValue(before, "wheelSize") === fieldValue(after, "wheelSize") ? check : theirs(check);
  const left = held.filter((w) => wheelIn(before, w) === wheelIn(after, w));
  if (left.length === 0) return theirs(check);
  return left.length === held.length && check.wheelsAsRead ? check : { ...check, wheelsAsRead: left };
}

/** One read fact's check after an edit from `before` to `after`. */
function editedCheck(check: FactCheck, field: ReadField, before: BikeFacts, after: BikeFacts, answered: boolean): FactCheck {
  if (check.status === "theirs") return check;
  if (answered) return theirs(check);
  if (field === "wheelSize") return wheelEdit(check, before, after);
  return fieldValue(before, field) === fieldValue(after, field) ? check : theirs(check);
}

/**
 * The family changed the facts by hand, on the facts card or in a follow-up question, starting
 * from `cur.facts`. Each read fact whose value they replaced is now theirs. That includes a fact
 * they cleared, which is also what a number box passes on midway through typing a new number,
 * like the "6" of "64", so the fact stays theirs instead of asking to be checked again. A fact in
 * `answered` is one they just answered, so it is theirs even if the answer matches what was read.
 * Facts they didn't touch keep their state.
 */
export function withEdit(cur: CheckedFacts, next: BikeFacts, answered: readonly ReadField[] = []): CheckedFacts {
  const checks = buildChecks((field) => {
    const check = cur.checks[field];
    return check ? editedCheck(check, field, cur.facts, next, answered.includes(field)) : undefined;
  });
  return { facts: next, checks };
}

/**
 * The family ticked, or cleared, "It matches the bike" on one read fact. A fact that wasn't read
 * has nothing to check, and one that is already theirs has no box.
 */
export function withConfirmed(cur: CheckedFacts, field: ReadField, confirmed: boolean): CheckedFacts {
  const check = cur.checks[field];
  if (!check || check.status === "theirs") return cur;
  const status: CheckStatus = confirmed ? "ticked" : "unchecked";
  if (check.status === status) return cur;
  return { facts: cur.facts, checks: withCheck(cur.checks, field, { ...check, status }) };
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
  return { facts, checks: withCheck(cur.checks, "hasPedals", { source: "photo", status: "unchecked" }) };
}

/**
 * True when the pedals answer still has to be ticked once this photo call is applied. The photo
 * check's message is picked from this when the call lands, so ticking the box or picking an
 * answer later never changes the words a screen reader already heard.
 */
export function pedalCallNeedsTick(cur: CheckedFacts, call: PedalCall): boolean {
  return withPedalCall(cur, call).checks.hasPedals?.status === "unchecked";
}

/**
 * An edit as an update for the page's state. `seen` is the facts on the card when the family made
 * the edit, and `next` was built from them. A product link, a label photo or the pedal photo check
 * can land after the card was drawn and before the edit is applied. The edit was then made on
 * facts that are gone, so it is dropped, rather than counting new read facts the family never saw
 * as theirs. The card then shows the new facts, and they can make the change again.
 */
export function editOn(seen: BikeFacts, next: BikeFacts, answered: readonly ReadField[] = []): CheckedUpdate {
  return (cur) => (cur.facts === seen ? withEdit(cur, next, answered) : cur);
}

/** A tick or untick as an update for the page's state. Dropped the same way when the facts changed since the card was drawn. */
export function confirmOn(seen: BikeFacts, field: ReadField, confirmed: boolean): CheckedUpdate {
  return (cur) => (cur.facts === seen ? withConfirmed(cur, field, confirmed) : cur);
}

/** The read facts not yet checked, in the order the facts card shows them. */
export function unconfirmedFields(checks: FactChecks): ReadField[] {
  return READ_FIELDS.filter((f) => checks[f]?.status === "unchecked");
}

/** How many facts were read, and how many of those the family has checked. */
export function checkCounts(checks: FactChecks): { read: number; confirmed: number } {
  const all = READ_FIELDS.filter((f) => checks[f] !== undefined);
  return { read: all.length, confirmed: all.filter((f) => isConfirmed(checks[f])).length };
}
