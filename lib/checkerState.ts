// Pure pieces of the checker's state, kept out of the component so tests can run them.

import { jurisdiction, PLACE_IDS } from "@/lib/rules/local";
import { STATE_CODES, STATES } from "@/lib/rules/compile";
import { isIsoDate } from "@/lib/rules/dates";
import type { BikeFacts, PlaceId, QuestionId, Tri } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";

/** The last ride date the picker offers. */
export const LAST_RIDE_DATE = "2029-12-31";

export interface ShareLink {
  lang: Lang | null;
  state: string;
  /** Only the places the link names. With no link, nothing is ticked, so every place is the family's own choice. */
  places: PlaceId[];
}

/** Reads ?lang=, ?state= and ?place= from a QR or shared link. */
export function parseShareLink(search: string): ShareLink {
  const params = new URLSearchParams(search);
  const lang = params.get("lang");
  const state = params.get("state")?.toUpperCase();
  const places = (params.get("place") ?? "")
    .split(",")
    .filter((p): p is PlaceId => PLACE_IDS.includes(p as PlaceId));
  return {
    lang: lang === "en" || lang === "es" ? lang : null,
    state: state && STATE_CODES.includes(state) ? state : "CA",
    places: [...new Set(places)],
  };
}

/**
 * The latest day any record in the rules table was checked. The table keeps only the rules in
 * force from its check on. A rule that ended before then, like Tennessee's old Class 3 age of 14,
 * is gone, so a ride date before this day could get a YES that was never true.
 */
export const DATA_CHECKED_ON: string = [
  ...STATE_CODES.map((code) => STATES[code].last_checked),
  ...PLACE_IDS.map((place) => jurisdiction(place).checked_through),
].reduce((a, b) => (b > a ? b : a));

/**
 * Today for the checker. A device clock that runs behind can't be earlier than the day the rules
 * were checked, so the earlier of the two never wins.
 */
export function checkerToday(deviceToday: string, checkedOn: string = DATA_CHECKED_ON): string {
  return deviceToday > checkedOn ? deviceToday : checkedOn;
}

/**
 * The ride date to check, or null when the date field holds something we can't check. The
 * rules table keeps only the rules in force from its check on, so a past date could miss a rule
 * that applied then. The first date is today or the table's check date, whichever is later. A date
 * input's min and max don't stop a typed date, so this check does.
 */
export function rideDateIn(
  value: string,
  today: string,
  last: string = LAST_RIDE_DATE,
  checkedOn: string = DATA_CHECKED_ON,
): string | null {
  if (!isIsoDate(value)) return null;
  return value >= checkerToday(today, checkedOn) && value <= last ? value : null;
}

/**
 * The ride date the answer is for. With no date picked it is always today, read fresh, so a tab
 * left open past midnight never answers for yesterday. A picked date is checked against the same
 * fresh today, so it can't fall behind it either. Today is never earlier than the table's check.
 */
export function rideDateFor(
  pickDate: boolean,
  dateText: string,
  today: string,
  last: string = LAST_RIDE_DATE,
  checkedOn: string = DATA_CHECKED_ON,
): string | null {
  return rideDateIn(pickDate ? dateText : checkerToday(today, checkedOn), today, last, checkedOn);
}

/** Milliseconds from now until the next local midnight, plus a second so the new day has begun. */
export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * The follow-up questions to show. A question stays once it has been asked, so an answer of
 * "not sure", or a wrong click, can always be changed. New questions are added at the end.
 */
export function keepAsked(asked: readonly QuestionId[], pending: readonly QuestionId[]): QuestionId[] {
  return [...asked, ...pending.filter((q) => !asked.includes(q))];
}

/** The follow-up questions on screen, for one set of bike facts. */
export interface AskedQuestions {
  /** Goes up each time new bike facts are read or typed in. */
  round: number;
  ids: QuestionId[];
}

/**
 * The questions to show next. The list starts over only with new bike facts. It does not start
 * over when the state changes, because the answers stay in the facts, and only these questions
 * can change them. Hiding an answered question would leave a "not sure" no one can undo.
 */
export function nextAsked(prev: AskedQuestions, round: number, pending: readonly QuestionId[]): AskedQuestions {
  const before = prev.round === round ? prev.ids : [];
  return { round, ids: keepAsked(before, pending) };
}

/**
 * The facts after a wheel size is typed in. The number of wheels is left as it was, so a
 * three-wheeler is never taken for a two-wheeler just because only the size was filled in.
 */
export function withWheelSize(facts: BikeFacts, inches: number | null, sameSize: boolean): BikeFacts {
  return {
    ...facts,
    wheelFrontIn: inches,
    wheelRearIn: sameSize ? inches : facts.wheelRearIn,
    unsure: facts.unsure.filter((q) => q !== "wheels"),
  };
}

/** The facts after the number of wheels is picked. */
export function withWheelCount(facts: BikeFacts, count: 2 | 3): BikeFacts {
  return { ...facts, wheelCount: count, unsure: facts.unsure.filter((q) => q !== "wheels") };
}

/**
 * The answer a follow-up shows, read from the facts. "Not sure" is stored as an unknown fact plus
 * the question in facts.unsure, so it must come back as "unsure", or a card that is shown again
 * would show nothing picked while the answer still says "not sure".
 */
export function answerShown(value: Tri, unsure: boolean): "yes" | "no" | "unsure" | null {
  if (value === true) return "yes";
  if (value === false) return "no";
  return unsure ? "unsure" : null;
}

type Shown = "yes" | "no" | "unsure" | null;

function withoutUnsure(facts: BikeFacts, q: QuestionId): QuestionId[] {
  return facts.unsure.filter((x) => x !== q);
}

/**
 * The weight answer shown in the follow-up, read from the facts every time. A weight typed on the
 * facts card decides it, so the two places never show different answers.
 */
export function weightShown(facts: BikeFacts): Shown {
  if (facts.weightLb !== null) return facts.weightLb > 100 ? "yes" : "no";
  return answerShown(facts.weightOver100, facts.unsure.includes("weight"));
}

/**
 * The "foot pegs or a pedal kit" answer shown in the follow-up, read from the facts every time.
 * Yes when either is true, no only when both are false, so a pegs answer changed on the facts card
 * shows here at once.
 */
export function pegsKitShown(facts: BikeFacts): Shown {
  if (facts.hasFootPegs === true || facts.needsPedalKit === true) return "yes";
  if (facts.hasFootPegs === false && facts.needsPedalKit === false) return "no";
  return facts.unsure.includes("pegs_kit") ? "unsure" : null;
}

/** The facts after the foot pegs answer on the facts card. "Not sure" is the same answer as in the follow-up. */
export function withFootPegs(facts: BikeFacts, value: "yes" | "no" | "unsure"): BikeFacts {
  if (value === "unsure") {
    return { ...facts, hasFootPegs: null, needsPedalKit: null, unsure: [...withoutUnsure(facts, "pegs_kit"), "pegs_kit"] };
  }
  return { ...facts, hasFootPegs: value === "yes", unsure: withoutUnsure(facts, "pegs_kit") };
}

/** The facts after a weight is typed on the facts card. A typed weight replaces a "not sure". */
export function withWeight(facts: BikeFacts, lb: number | null): BikeFacts {
  return { ...facts, weightLb: lb, unsure: lb === null ? facts.unsure : withoutUnsure(facts, "weight") };
}

/** True when the facts hold one wheel size, so the single size field shows every size in use. */
export function sameWheelSize(facts: BikeFacts): boolean {
  return facts.wheelRearIn === null || facts.wheelRearIn === facts.wheelFrontIn;
}

/**
 * True when the facts card shows Front and Rear boxes instead of one wheel size box. Once it has
 * shown two boxes it keeps them. A number box passes on an unknown size midway through typing,
 * like the "1" of "18", and a front size can be typed to match the rear. Going back to one box
 * then would remove the box being typed in, drop keyboard focus and hide the other size.
 */
export function twoWheelBoxes(shownBefore: boolean, facts: BikeFacts): boolean {
  return shownBefore || !sameWheelSize(facts);
}

/** The facts after switching back to one wheel size. The rear takes the front size, so no hidden size is left behind. */
export function withOneWheelSize(facts: BikeFacts): BikeFacts {
  return { ...facts, wheelRearIn: facts.wheelFrontIn };
}

/** Wheel sizes a family can type, in inches. Kids' bikes start near 12, and 700c is about 28. */
export const WHEEL_MIN_IN = 6;
export const WHEEL_MAX_IN = 30;
/** Bike weights a family can type, in pounds, with the battery. */
export const WEIGHT_MIN_LB = 10;
export const WEIGHT_MAX_LB = 999;

/**
 * The number a form field holds, or null when it is blank, not a number, or outside min to max.
 * Null means unknown, so the question stays open. A wheel size of 57, read off a tire's
 * millimeter size like 57-203, must never count as 57 inches.
 */
export function numberInRange(raw: string, min?: number, max?: number): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;
  return n;
}

/** True while a bike read is still the newest one. */
export type IsCurrent = () => boolean;

export interface RequestGate {
  /** Call when a read starts. The check it returns stays true until a newer read starts or the gate is cancelled. */
  start: () => IsCurrent;
  /** Call when the family moves on: another tab, typing the facts in, or starting over. */
  cancel: () => void;
}

/**
 * Lets only the newest bike read deliver its result. A label photo or a product link can take
 * many seconds. In that time the family can switch tabs, type the facts in, read another label
 * or start over. A result for the old bike must never replace the bike they moved on to.
 */
export function requestGate(): RequestGate {
  let latest = 0;
  return {
    start() {
      latest += 1;
      const mine = latest;
      return () => mine === latest;
    },
    cancel() {
      latest += 1;
    },
  };
}

/** The three ways to give the bike: a label photo, a product link or pasted text, or typing it in. */
export type InputTab = "label" | "link" | "type";

/**
 * What a tap on an input tab does. A tap on the tab already open does nothing, so a stray tap on
 * "Type it in" never wipes the typed facts, the answers and the result. Moving to another tab
 * drops any read still loading, and moving to "Type it in" starts an empty facts card.
 */
export function tabTap(current: InputTab, next: InputTab): { change: boolean; manual: boolean } {
  if (next === current) return { change: false, manual: false };
  return { change: true, manual: next === "type" };
}
