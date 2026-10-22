// Builds the test matrix from the data: every state, class, age band, caution condition
// and switch date, for each place card and for the bottom line. Used by
// tests/engine.matrix.test.ts and scripts/build-results.ts.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { evaluate } from "@/lib/rules";
import { announcement, BottomLineCard, subtitle } from "@/components/BottomLineCard";
import { cardAnswer, VerdictCard } from "@/components/VerdictCard";
import { bottomLine, type BottomLine, type BottomLineKind } from "@/lib/rules/bottomLine";
import { STATE_CODES } from "@/lib/rules/compile";
import { PLACE_IDS } from "@/lib/rules/local";
import {
  CAUTION_FAST_MODE_UNVERIFIED,
  emptyFacts,
  type BikeFacts,
  type PlaceId,
  type QuestionId,
  type Status,
  type Verdict,
} from "@/lib/rules/types";
import { t, type UiKey } from "@/lib/i18n/ui";
import { announcementProblems, headlineProblems, hedgeProblems, visibleLines, type Answer } from "./answerWords";
import {
  bottomLineBlockers,
  classesOf,
  hasThrottle,
  illegalReasons,
  localBlockers,
  pedalsOf,
  stateBlockers,
  stateStaleInData,
  topVerifiedInData,
  type OracleFacts,
} from "./oracle";

export const AGES = [7, 11, 12, 13, 14, 15, 16, 17, 18, 30];
export const DATES = [
  "2026-10-17",
  "2026-11-15",
  "2026-11-16",
  "2026-11-19",
  "2026-11-20",
  "2026-11-30",
  "2026-12-01",
  "2026-12-31",
  "2027-01-01",
  "2027-05-04",
  "2027-05-05",
  "2029-01-01",
];

type Variant = { name: string } & Partial<Omit<OracleFacts, "cls">>;

/**
 * Each variant flips the facts one caution condition reads, including unknown answers. The 750 W
 * bike also lists a peak and an up-to figure, as many listings do. Rated watts settle the cap, so
 * they change no card, but each is a fact read from a link or photo that the family must check.
 */
export const VARIANTS: Variant[] = [
  { name: "standard" },
  { name: "watts_745", watts: 745 },
  { name: "watts_746", watts: 746 },
  { name: "watts_750", watts: 750, peakWatts: 1200, wattsUpTo: 1200 },
  { name: "watts_1000", watts: 1000 },
  { name: "watts_1600", watts: 1600 },
  { name: "wheels_10", front: 10, rear: 10 },
  { name: "wheels_12", front: 12, rear: 12 },
  { name: "wheels_14", front: 14, rear: 14 },
  { name: "wheels_16", front: 16, rear: 16 },
  { name: "wheels_20_and_12", front: 20, rear: 12 },
  { name: "trike_16", wheelCount: 3, front: 16, rear: 16 },
  { name: "trike_20", wheelCount: 3, front: 20, rear: 20 },
  { name: "weight_120", weight: 120 },
  { name: "foot_pegs", pegs: true },
  { name: "pedal_kit", kit: true },
  { name: "motor_over_20", motorOver20: true },
  { name: "assist_over_28", assistOver28: true },
  { name: "wheels_unsure", front: null, rear: null, wheelCount: null, unsure: ["wheels"] },
  { name: "wheels_unasked", front: null, rear: null, wheelCount: null },
  { name: "fast_mode_unsure", motorOver20: null, assistOver28: null, unsure: ["fast_mode"] },
  { name: "fast_mode_unasked", motorOver20: null, assistOver28: null },
  { name: "weight_unsure", weight: null, unsure: ["weight"] },
  { name: "pegs_kit_unsure", pegs: null, kit: null, unsure: ["pegs_kit"] },
];

type Shape = { name: string; cls: 1 | 2 | 3 } & Partial<OracleFacts>;

/**
 * Bike shapes that are not one plain class: pedals unknown or missing, no class, more than
 * one class, facts that disagree, a throttle answered "not sure" with a throttle speed still
 * stated, a throttle left blank with no speed, and a top speed of unknown mode on top of the assist speed. Each runs on the standard bike, across every state,
 * age, date and place set.
 */
export const SHAPES: Shape[] = [
  { name: "pedals_unknown_class_1", cls: 1, pedals: null },
  { name: "pedals_unknown_class_3", cls: 3, pedals: null },
  { name: "no_pedals_class_2", cls: 2, pedals: false },
  { name: "class_unknown", cls: 1, classes: [] },
  { name: "classes_1_and_2", cls: 1, classes: [1, 2] },
  { name: "classes_1_and_3", cls: 1, classes: [1, 3] },
  { name: "classes_2_and_3", cls: 2, classes: [2, 3] },
  { name: "facts_conflict", cls: 2, conflict: true },
  { name: "throttle_unsure_with_speed_class_1", cls: 1, throttleUnsureMph: 20 },
  { name: "throttle_unsure_with_speed_class_2", cls: 2, throttleUnsureMph: 20 },
  { name: "throttle_unsure_with_speed_class_3", cls: 3, throttleUnsureMph: 20 },
  { name: "throttle_unanswered_class_1", cls: 1, throttleUnknown: true },
  { name: "throttle_unanswered_class_2", cls: 2, throttleUnknown: true },
  { name: "throttle_unanswered_class_3", cls: 3, throttleUnknown: true },
  { name: "top_speed_25_class_1", cls: 1, topSpeed: 25 },
  { name: "top_speed_32_class_1", cls: 1, topSpeed: 32 },
  { name: "top_speed_32_class_3", cls: 3, topSpeed: 32 },
];

function oracleFacts(cls: 1 | 2 | 3, v: Partial<OracleFacts>): OracleFacts {
  return {
    cls,
    classes: v.classes,
    pedals: v.pedals,
    conflict: v.conflict,
    throttleUnsureMph: v.throttleUnsureMph,
    throttleUnknown: v.throttleUnknown,
    topSpeed: v.topSpeed,
    watts: v.watts ?? 500,
    peakWatts: v.peakWatts,
    wattsUpTo: v.wattsUpTo,
    front: v.front === undefined ? 20 : v.front,
    rear: v.rear === undefined ? 20 : v.rear,
    wheelCount: v.wheelCount === undefined ? 2 : v.wheelCount,
    weight: v.weight === undefined ? 60 : v.weight,
    pegs: v.pegs === undefined ? false : v.pegs,
    kit: v.kit === undefined ? false : v.kit,
    motorOver20: v.motorOver20 === undefined ? false : v.motorOver20,
    assistOver28: v.assistOver28 === undefined ? false : v.assistOver28,
    unsure: v.unsure ?? [],
  };
}

function engineFacts(o: OracleFacts): BikeFacts {
  const classes = classesOf(o);
  const throttle = hasThrottle(o);
  return {
    ...emptyFacts(),
    hasPedals: pedalsOf(o),
    classes,
    ratedWatts: o.watts,
    peakWatts: o.peakWatts ?? null,
    wattsUpTo: o.wattsUpTo ?? null,
    // "Not sure" about the throttle, with the throttle speed the text gave still filled in.
    // A blank throttle answer leaves both the answer and its speed empty.
    hasThrottle: o.throttleUnsureMph !== undefined || o.throttleUnknown ? null : throttle,
    // A stated 28 mph throttle against a "never over 20 on the motor" answer is a conflict.
    throttleMph: o.conflict ? 28 : (o.throttleUnsureMph ?? (throttle && !o.throttleUnknown ? 20 : null)),
    assistMph: classes.length === 0 ? null : classes.includes(3) ? 28 : 20,
    topSpeedMph: o.topSpeed ?? null,
    motorOver20: o.motorOver20,
    assistOver28: o.assistOver28,
    switchable: o.motorOver20 === null && o.assistOver28 === null ? null : false,
    wheelCount: o.wheelCount,
    wheelFrontIn: o.front,
    wheelRearIn: o.rear,
    weightLb: o.weight,
    weightOver100: o.weight === null ? null : o.weight > 100,
    hasFootPegs: o.pegs,
    needsPedalKit: o.kit,
    unsure: o.unsure as QuestionId[],
  };
}

/** Every bike the matrices run: each class with each variant, then each shape. */
function bikes(): { name: string; cls: number; facts: OracleFacts }[] {
  const out: { name: string; cls: number; facts: OracleFacts }[] = [];
  for (const cls of [1, 2, 3] as const) {
    for (const v of VARIANTS) out.push({ name: v.name, cls, facts: oracleFacts(cls, v) });
  }
  for (const s of SHAPES) out.push({ name: s.name, cls: s.cls, facts: oracleFacts(s.cls, s) });
  return out;
}

/** The facts of every bike the matrices run, so a test can see which read facts they cover. */
export function matrixBikeFacts(): BikeFacts[] {
  return bikes().map((b) => engineFacts(b.facts));
}

const localBlockersAllClasses = (place: string, f: OracleFacts, age: number, date: string): string[] => {
  const classes = classesOf(f);
  return (classes.length > 0 ? classes : ([1, 2, 3] as const)).flatMap((cls) => localBlockers(place, cls, age, date));
};

export interface MatrixCase {
  scope: string;
  state: string;
  cls: number;
  age: number;
  date: string;
  variant: string;
  status: Status;
  blockers: string[];
}

export interface MatrixSummary {
  cases: number;
  stateCases: number;
  localCases: number;
  byStatus: Record<Status, number>;
  /**
   * How each engine verdict is drawn on its place card, YES or NO, with the facts typed in. An
   * allowed card is drawn NO when the bottom line can't confirm it, like a ride past the state check.
   */
  shownAs: Record<Status, Record<Answer, number>>;
  /** A card drawn YES or NO other than the raw data gives it. */
  shownWrong: MatrixCase[];
  falseLegal: MatrixCase[];
  missedYes: MatrixCase[];
  /** A rendered place card whose answer is not a plain YES or NO, or that gives a hedge as the answer. */
  hedged: MatrixCase[];
  /** How many distinct rendered place cards were read for that check. */
  answerCards: number;
}

/** Only an allowed card may read YES. Every other status reads NO. Worked out here, not taken from the card. */
const answerFor = (allowed: boolean): Answer => (allowed ? "yes" : "no");

/**
 * True when the card must read YES, worked out from the raw data here, not from the card or the
 * bottom line: the card is allowed, its record was read in enacted text, a state card's ride is no
 * more than 30 days after the state check, and the fast modes were not answered "not sure".
 * Anything else is a NO on the card too, the same as on the bottom line.
 */
function cardMustSayYes(v: Verdict, state: string, date: string): boolean {
  if (v.status !== "yes") return false;
  if (!topVerifiedInData(v.scope, v.id)) return false;
  // A San Diego card's YES rests on the state's rules too, so a ride past the state check holds it back as well.
  if (stateStaleInData(state, date)) return false;
  return !v.cautions.some((c) => c.code === CAUTION_FAST_MODE_UNVERIFIED);
}

/**
 * Renders the real place card in both languages and lists every way its answer is not a plain YES
 * or NO: the headline, its mark and the reason line under it, and any hedge label anywhere on it.
 */
function verdictAnswerProblems(v: Verdict, stateCode: string, showLocalNotice: boolean, rideDate: string): string[] {
  const expected = answerFor(cardMustSayYes(v, stateCode, rideDate));
  return (["en", "es"] as const).flatMap((lang) => {
    const html = renderToStaticMarkup(createElement(VerdictCard, { verdict: v, lang, stateCode, rideDate, showLocalNotice }));
    return [...headlineProblems(html, lang, expected), ...hedgeProblems(visibleLines(html))].map((p) => `${lang}: ${p}`);
  });
}

/** The same for the bottom-line card and the sentence screen readers hear. */
function bottomAnswerProblems(bl: BottomLine, stateCode: string): string[] {
  const expected = answerFor(bl.kind === "yes");
  return (["en", "es"] as const).flatMap((lang) => {
    const html = renderToStaticMarkup(createElement(BottomLineCard, { line: bl, lang, stateCode }));
    return [
      ...headlineProblems(html, lang, expected),
      ...hedgeProblems(visibleLines(html)),
      ...announcementProblems(announcement(bl, lang), lang, expected, t(lang, "blTitle")),
    ].map((p) => `${lang}: ${p}`);
  });
}

export function runMatrix(): MatrixSummary {
  const byStatus: Record<Status, number> = { yes: 0, no: 0, not_ebike: 0, cant_confirm: 0, need_info: 0 };
  const shownAs = Object.fromEntries((Object.keys(byStatus) as Status[]).map((st) => [st, { yes: 0, no: 0 }])) as Record<Status, Record<Answer, number>>;
  const shownWrong: MatrixCase[] = [];
  const falseLegal: MatrixCase[] = [];
  const missedYes: MatrixCase[] = [];
  const hedged: MatrixCase[] = [];
  const answerCards = new Set<string>();
  let stateCases = 0;
  let localCases = 0;

  // The answer depends on the status and the place, and the rest of the card on its lines, so one
  // rendered card per combination covers every case.
  const readCard = (c: MatrixCase, v: Verdict, showLocalNotice: boolean) => {
    const lines = [v.reason, ...v.requirements, ...v.cautions, ...v.notes].map((l) => l.code).join(",");
    const key = `${c.state}|${v.id}|${v.status}|${lines}|${showLocalNotice}|${cardMustSayYes(v, c.state, c.date)}`;
    if (answerCards.has(key)) return;
    answerCards.add(key);
    const problems = verdictAnswerProblems(v, c.state, showLocalNotice, c.date);
    if (problems.length > 0) hedged.push({ ...c, blockers: problems });
  };

  const check = (c: MatrixCase, v: Verdict) => {
    byStatus[c.status] += 1;
    const shown = cardAnswer(v, c.date, c.state);
    shownAs[c.status][shown] += 1;
    if (shown !== answerFor(cardMustSayYes(v, c.state, c.date))) shownWrong.push(c);
    if (c.status === "yes" && c.blockers.length > 0) falseLegal.push(c);
    if (c.status !== "yes" && c.blockers.length === 0) missedYes.push(c);
  };

  for (const state of STATE_CODES) {
    for (const bike of bikes()) {
      const facts = engineFacts(bike.facts);
      for (const age of AGES) {
        for (const date of DATES) {
          const places = state === "CA" ? PLACE_IDS : [];
          const result = evaluate({ state, riderAge: age, rideDate: date, facts, places });
          const blockers = stateBlockers(state, bike.facts, age, date);
          const base = { state, cls: bike.cls, age, date, variant: bike.name };
          stateCases += 1;
          check({ ...base, scope: "state", status: result.state.status, blockers }, result.state);
          readCard({ ...base, scope: "state", status: result.state.status, blockers: [] }, result.state, result.localNotice);
          for (const v of result.local) {
            localCases += 1;
            check({ ...base, scope: v.id, status: v.status, blockers: [...blockers, ...localBlockersAllClasses(v.id, bike.facts, age, date)] }, v);
            readCard({ ...base, scope: v.id, status: v.status, blockers: [] }, v, false);
          }
        }
      }
    }
  }
  return { cases: stateCases + localCases, stateCases, localCases, byStatus, shownAs, shownWrong, falseLegal, missedYes, hedged, answerCards: answerCards.size };
}

/** California place sets for the bottom line: none, each place alone, and all of them. */
export const PLACE_SETS: PlaceId[][] = [[], ...PLACE_IDS.map((p) => [p]), [...PLACE_IDS]];

export interface BottomLineCase {
  state: string;
  cls: number;
  age: number;
  date: string;
  variant: string;
  places: string;
  otherPlaces: boolean;
  kind: BottomLineKind;
  statuses: string[];
  why: string[];
}

export interface BottomLineSummary {
  /** Rides checked, each one bottom line: state, bike, age, date, place set and Somewhere else. */
  cases: number;
  byKind: Record<BottomLineKind, number>;
  /** YES while the independent checker lists a reason against it. */
  falseYes: BottomLineCase[];
  /** Not YES while the independent checker lists no reason against it. */
  missedYes: BottomLineCase[];
  /** "NO, not allowed" while the independent checker finds no rule that says no. */
  falseIllegal: BottomLineCase[];
  /** A rule says no, but the bottom line is something else. */
  missedIllegal: BottomLineCase[];
  /** YES or NO of the wrong kind for the cards on the page. */
  wrongKind: BottomLineCase[];
  /** The rendered card leaves out, or wrongly adds, the line that says which places were not checked. */
  missingCaveat: BottomLineCase[];
  /** How many distinct rendered cards were read for the caveat check. */
  renderedCards: number;
  /** A rendered bottom line or announcement whose answer is not a plain YES or NO, or that gives a hedge as the answer. */
  hedged: BottomLineCase[];
  /** How many distinct rendered bottom lines were read for that check. */
  answerCards: number;
  /**
   * A place card whose YES or NO is not the one the raw data gives it on this ride, or a place card
   * that says YES while the bottom line's NO names that card.
   */
  cardYesUnderNo: BottomLineCase[];
  /** How many distinct rendered place cards were read for that check. */
  placeCards: number;
}

/**
 * The caveat the card must show, from the inputs alone. No city or county picked: say city and
 * county rules were not checked. A town picked plus "Somewhere else": say other places were not
 * checked. Every place the rider goes picked: no caveat. A "NO, not allowed" needs none.
 */
function expectedCaveat(state: string, places: PlaceId[], otherPlaces: boolean, kind: BottomLineKind): UiKey | null {
  if (kind === "no_illegal") return null;
  const townChecked = state === "CA" && places.some((p) => p !== "sduhsd_campuses");
  if (!townChecked) return "blNoCity";
  return otherPlaces ? "blOtherPlaces" : null;
}

/** Renders the real card in both languages and lists what is wrong with its caveat line. */
function caveatProblems(bl: BottomLine, state: string, expected: UiKey | null): string[] {
  const problems: string[] = [];
  for (const lang of ["en", "es"] as const) {
    const html = renderToStaticMarkup(createElement(BottomLineCard, { line: bl, lang, stateCode: state }));
    for (const key of ["blNoCity", "blOtherPlaces"] as const) {
      const shown = html.includes(t(lang, key));
      if (key === expected && !shown) problems.push(`${lang}: missing ${key}`);
      if (key !== expected && shown) problems.push(`${lang}: extra ${key}`);
    }
  }
  return problems;
}

/**
 * Every state, bike, age and date, and in California every place set with and without
 * "Somewhere else". Each bottom line is checked against the independent checker for YES and for
 * "NO, not allowed", against the cards on the page, and for the caveat on the rendered card.
 */
export function runBottomLineMatrix(): BottomLineSummary {
  const byKind: Record<BottomLineKind, number> = { yes: 0, no_illegal: 0, no_unconfirmed: 0 };
  const falseYes: BottomLineCase[] = [];
  const missedYes: BottomLineCase[] = [];
  const falseIllegal: BottomLineCase[] = [];
  const missedIllegal: BottomLineCase[] = [];
  const wrongKind: BottomLineCase[] = [];
  const missingCaveat: BottomLineCase[] = [];
  const hedged: BottomLineCase[] = [];
  const answerCards = new Set<string>();
  const rendered = new Set<string>();
  const cardYesUnderNo: BottomLineCase[] = [];
  const placeRendered = new Set<string>();
  let cases = 0;

  for (const state of STATE_CODES) {
    const placeSets = state === "CA" ? PLACE_SETS : [[]];
    const otherOptions = state === "CA" ? [false, true] : [false];
    for (const bike of bikes()) {
      const facts = engineFacts(bike.facts);
      for (const age of AGES) {
        for (const date of DATES) {
          for (const places of placeSets) {
            for (const otherPlaces of otherOptions) {
              const result = evaluate({ state, riderAge: age, rideDate: date, facts, places, otherPlaces });
              const cards = [result.state, ...result.local];
              const statuses = cards.map((v) => v.status);
              const blockers = bottomLineBlockers(state, bike.facts, age, date, places);
              const illegal = illegalReasons(state, bike.facts, age, date, places);
              const anyNo = statuses.some((st) => st === "no" || st === "not_ebike");
              const open = statuses.some((st) => st === "cant_confirm" || st === "need_info");
              const unverified = cards.filter((v) => !topVerifiedInData(v.scope, v.id)).map((v) => v.id);
              const unsure = cards.some((v) => v.cautions.some((c) => c.code === CAUTION_FAST_MODE_UNVERIFIED));
              const stale = stateStaleInData(state, date);
              cases += 1;

              const bl = bottomLine(result, date);
              byKind[bl.kind] += 1;
              const base = {
                state,
                cls: bike.cls,
                age,
                date,
                variant: bike.name,
                places: places.join("+") || "none",
                otherPlaces,
                kind: bl.kind,
                statuses,
              };

              if (bl.kind === "yes" && blockers.length > 0) falseYes.push({ ...base, why: blockers });
              if (bl.kind !== "yes" && blockers.length === 0) missedYes.push({ ...base, why: [] });

              if (bl.kind === "no_illegal" && illegal.length === 0) {
                falseIllegal.push({ ...base, why: bl.blocked.map((b) => b.line.code) });
              }
              if (bl.kind !== "no_illegal" && illegal.length > 0) missedIllegal.push({ ...base, why: illegal });

              if (anyNo && bl.kind !== "no_illegal") wrongKind.push({ ...base, why: ["a card is not allowed"] });
              if (!anyNo && bl.kind === "no_illegal") wrongKind.push({ ...base, why: ["no card is illegal"] });
              if (bl.kind === "yes" && (open || unverified.length > 0 || unsure || stale)) {
                wrongKind.push({
                  ...base,
                  why: [open ? "open card" : "", unsure ? "not sure" : "", stale ? "state check too old" : "", ...unverified].filter(Boolean),
                });
              }
              if (!anyNo && !open && !unsure && !stale && unverified.length === 0 && bl.kind !== "yes") {
                wrongKind.push({ ...base, why: ["every card is a verified yes"] });
              }

              // The caveat depends only on the state, the places, Somewhere else and the kind,
              // so one rendered card per combination covers every case.
              const key = `${state}|${base.places}|${otherPlaces}|${bl.kind}`;
              if (!rendered.has(key)) {
                rendered.add(key);
                const problems = caveatProblems(bl, state, expectedCaveat(state, places, otherPlaces, bl.kind));
                if (problems.length > 0) missingCaveat.push({ ...base, why: problems });
              }

              // Each place card on the page says YES only when the raw data gives it a YES on this
              // ride, and never YES under a NO that names that card.
              for (const v of cards) {
                const shown = cardAnswer(v, date, state);
                const must = cardMustSayYes(v, state, date);
                const named = bl.missing.some((m) => m.where.some((w) => w.scope === v.scope && w.id === v.id));
                if ((shown === "yes") !== must) cardYesUnderNo.push({ ...base, why: [`${v.id} shows ${shown}, data gives ${must ? "yes" : "no"}`] });
                if (shown === "yes" && bl.kind !== "yes" && named) cardYesUnderNo.push({ ...base, why: [`${v.id} shows yes under a NO that names it`] });
                // One rendered card per combination checks the drawn headline says the same.
                const cardKey = `${state}|${v.id}|${v.status}|${v.reason.code}|${v.cautions.map((c) => c.code).join(",")}|${must}`;
                if (!placeRendered.has(cardKey)) {
                  placeRendered.add(cardKey);
                  const problems = verdictAnswerProblems(v, state, false, date);
                  if (problems.length > 0) cardYesUnderNo.push({ ...base, why: [`${v.id}`, ...problems] });
                }
              }

              // The answer and the line under it depend on the kind and on the reason line, so
              // one rendered card per pair in each place set covers every case.
              const answerKey = `${key}|${bl.notEbikeOnly}|${subtitle(bl, "en")}`;
              if (!answerCards.has(answerKey)) {
                answerCards.add(answerKey);
                const problems = bottomAnswerProblems(bl, state);
                if (problems.length > 0) hedged.push({ ...base, why: problems });
              }
            }
          }
        }
      }
    }
  }
  return {
    cases,
    byKind,
    falseYes,
    missedYes,
    falseIllegal,
    missedIllegal,
    wrongKind,
    missingCaveat,
    renderedCards: rendered.size,
    hedged,
    answerCards: answerCards.size,
    cardYesUnderNo,
    placeCards: placeRendered.size,
  };
}
