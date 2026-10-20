// Where each bike fact came from, and whether the family has checked it against the bike.
//
// A fact read from a product link, pasted text, a label photo or the whole-bike pedal photo check
// can be wrong, however careful the reader is. So it comes in "not checked", and stays that way
// until the family ticks "It matches the bike", changes it or answers it in a follow-up question.
// A value changed and then put back to the value that was read is as read again, still to check,
// so a stray arrow key or mouse wheel that nudges a fact away and back never counts as checking
// it. The bottom line can't say YES while any read fact is not checked (lib/rules/bottomLine.ts).
// A fact the family typed or picked is theirs from the start. Nothing here is saved, so a reload
// or a shared link starts with nothing checked. Kept apart from the page so tests can run it.

import { applyPedalCall, type PedalCall } from "@/lib/photo/pedalRule";
import { bottomLine, type BottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, READ_FIELDS, type BikeFacts, type EngineResult, type ReadField } from "@/lib/rules/types";

/** "text" for a product link, pasted text or a label photo. "photo" for the whole-bike pedal check. */
export type FactSource = "text" | "photo";

/**
 * "unchecked" while the fact holds the value that was read and the family hasn't ticked it.
 * "ticked" once they tick "It matches the bike". "theirs" while the value is one they set, so
 * there is nothing left to tick, or once they answered the fact in a follow-up question.
 */
export type CheckStatus = "unchecked" | "ticked" | "theirs";

/** A wheel whose size can be read. */
export type Wheel = "front" | "rear";

export interface FactCheck {
  source: FactSource;
  status: CheckStatus;
  /**
   * The facts as this fact was read. A value equal to the one read here is as read, and needs a
   * tick. For the wheel size, each wheel's read size is compared on its own.
   */
  asRead: BikeFacts;
  /**
   * Set once the family answered the fact in a follow-up question that didn't already show the
   * read value. Their answer stays theirs, even when it matches what was read.
   */
  answered?: true;
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

/** A read fact held in one field of the facts. The wheel size is held in two, one per wheel. */
export type OneValueField = Exclude<ReadField, "wheelSize">;

/**
 * One fact's value as a string, so two values can be compared. The wheel size is compared wheel
 * by wheel instead (wheelsLeftAsRead), since each wheel's read size is checked on its own.
 */
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
  const checks = buildChecks((field) => (hasValue(facts, field) ? { source, status: "unchecked", asRead: facts } : undefined));
  return { facts, checks };
}

const WHEELS: readonly Wheel[] = ["front", "rear"];

function wheelIn(facts: BikeFacts, wheel: Wheel): number | null {
  return wheel === "front" ? facts.wheelFrontIn : facts.wheelRearIn;
}

/**
 * The wheels whose size is still the size that was read. Two different sizes share one check, so
 * the check is the family's own only once no read size is left as read. Changing the front size
 * alone leaves the rear size as read, still to check.
 */
export function wheelsLeftAsRead(check: FactCheck, facts: BikeFacts): Wheel[] {
  return WHEELS.filter((w) => wheelIn(check.asRead, w) !== null && wheelIn(facts, w) === wheelIn(check.asRead, w));
}

/** True when the fact, or for the wheel size any one wheel, still holds the value that was read. */
function stillAsRead(check: FactCheck, field: ReadField, facts: BikeFacts): boolean {
  if (field === "wheelSize") return wheelsLeftAsRead(check, facts).length > 0;
  return fieldValue(facts, field) === fieldValue(check.asRead, field);
}

/**
 * True when the edit from `before` to `after` put a wheel the family had changed back at its read
 * size. The wheel size check can be ticked while one wheel holds a size the family typed, and that
 * tick didn't cover the wheel they changed, so the wheel back at its read size needs a tick again.
 */
export function wheelPutBack(check: FactCheck, before: BikeFacts, after: BikeFacts): boolean {
  const was = wheelsLeftAsRead(check, before);
  return wheelsLeftAsRead(check, after).some((w) => !was.includes(w));
}

/**
 * One read fact's check after an edit from `before` to `after`. A value the family set is theirs.
 * A value put back to the one read is as read again, so it needs a tick, even if it was ticked
 * before it was changed. A follow-up answer stays theirs.
 */
function editedCheck(check: FactCheck, field: ReadField, before: BikeFacts, after: BikeFacts, answered: boolean): FactCheck {
  if (answered) return check.status === "theirs" && check.answered ? check : { ...check, status: "theirs", answered: true };
  if (check.answered) return check;
  if (!stillAsRead(check, field, after)) return check.status === "theirs" ? check : { ...check, status: "theirs" };
  // Back at the value read. A value the family set is theirs, so putting it back makes it as read again.
  if (check.status === "theirs") return { ...check, status: "unchecked" };
  // Any other fact is ticked only while it holds its read value, since an edit away makes it
  // theirs. Only the wheel size, with a size per wheel, can be ticked with one wheel changed.
  if (check.status === "ticked" && field === "wheelSize" && wheelPutBack(check, before, after)) return { ...check, status: "unchecked" };
  return check;
}

/**
 * The family changed the facts by hand, on the facts card or in a follow-up question, starting
 * from `cur.facts`. Each read fact whose value now differs from the one read is theirs. That
 * includes a fact they cleared, which is also what a number box passes on midway through typing
 * a new number, like the "6" of "64". A read fact whose value is back at the one read is as read
 * again and needs a tick, so a nudge away and back never checks it. A fact in `answered` is one
 * they just answered in a follow-up question, so it is theirs even if the answer matches what
 * was read. Facts they didn't touch keep their state.
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
 * has nothing to check, and one that holds a value they set has no box.
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
 * nothing. The page drops a call that lands after the family picked a pedals answer or used the
 * pedals box while the check ran (answerGate in lib/photo/pedalRule.ts). An answer picked before
 * the check started is replaced, since the family asked for the check, and the new answer then
 * needs a tick.
 */
export function withPedalCall(cur: CheckedFacts, call: PedalCall): CheckedFacts {
  const facts = applyPedalCall(cur.facts, call);
  if (facts.hasPedals === cur.facts.hasPedals) return cur;
  return { facts, checks: withCheck(cur.checks, "hasPedals", { source: "photo", status: "unchecked", asRead: facts }) };
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

/** The read facts not yet checked, in the order the facts card shows them. */
export function unconfirmedFields(checks: FactChecks): ReadField[] {
  return READ_FIELDS.filter((f) => checks[f]?.status === "unchecked");
}

/**
 * The bottom line the page shows, or null before there is a result to sum up. Every read fact the
 * family hasn't checked keeps it from a YES. The page works it out on every draw from the checks
 * on screen, with nothing kept from an earlier draw, so a tick, an untick or a new read always
 * reaches it.
 */
export function summaryFor(result: EngineResult | null, rideDate: string | null, checks: FactChecks): BottomLine | null {
  return result && rideDate ? bottomLine(result, rideDate, unconfirmedFields(checks)) : null;
}

/** How many facts were read, and how many of those the family has checked. */
export function checkCounts(checks: FactChecks): { read: number; confirmed: number } {
  const all = READ_FIELDS.filter((f) => checks[f] !== undefined);
  return { read: all.length, confirmed: all.filter((f) => isConfirmed(checks[f])).length };
}
