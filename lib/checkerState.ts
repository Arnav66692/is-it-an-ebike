// Pure pieces of the checker's state, kept out of the component so tests can run them.

import { PLACE_IDS } from "@/lib/rules/local";
import { STATE_CODES } from "@/lib/rules/compile";
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
 * The ride date to check, or null when the date field holds something we can't check. The
 * rules table keeps only the rules in force from now on, so a past date could miss a rule that
 * applied then. A date input's min and max don't stop a typed date, so this check does.
 */
export function rideDateIn(value: string, today: string, last: string = LAST_RIDE_DATE): string | null {
  if (!isIsoDate(value)) return null;
  return value >= today && value <= last ? value : null;
}

/**
 * The ride date the answer is for. With no date picked it is always today, read fresh, so a tab
 * left open past midnight never answers for yesterday. A picked date is checked against the same
 * fresh today, so it can't fall behind it either.
 */
export function rideDateFor(pickDate: boolean, dateText: string, today: string, last: string = LAST_RIDE_DATE): string | null {
  return rideDateIn(pickDate ? dateText : today, today, last);
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

/** True when the facts hold one wheel size, so the single size field shows every size in use. */
export function sameWheelSize(facts: BikeFacts): boolean {
  return facts.wheelRearIn === null || facts.wheelRearIn === facts.wheelFrontIn;
}

/** The facts after switching back to one wheel size. The rear takes the front size, so no hidden size is left behind. */
export function withOneWheelSize(facts: BikeFacts): BikeFacts {
  return { ...facts, wheelRearIn: facts.wheelFrontIn };
}

/** Wheel sizes a family can type, in inches. Kids' bikes start near 12, and 700c is about 28. */
export const WHEEL_MIN_IN = 6;
export const WHEEL_MAX_IN = 30;

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
