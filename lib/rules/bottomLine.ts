// The bottom line under the answer. One strict YES or NO for the whole ride: state law,
// every San Diego place the user picked and the SDUHSD campus if picked, on the ride date.
//
// YES needs every card allowed, no question left open and every rule behind the cards read
// in enacted text. Anything illegal is NO. Anything uncertain is NO, not confirmed, with the
// exact gap named. Uncertainty never turns into a YES.

import type { EngineResult, Line, QuestionId, Verdict, VerificationLevel } from "./types";

export type BottomLineKind = "yes" | "no_illegal" | "no_unconfirmed";

/** Points at one verdict card: the state card, or a San Diego place. */
export interface CardRef {
  scope: Verdict["scope"];
  id: string;
}

/** One sentence and every card it applies to. */
export interface BottomLineItem {
  where: CardRef[];
  line: Line;
}

export type GapKind = "cant_confirm" | "unanswered" | "unsure" | "unverified";

export interface BottomLineGap extends BottomLineItem {
  kind: GapKind;
}

export interface BottomLine {
  kind: BottomLineKind;
  rideDate: string;
  /** Every card the answer covers, in page order. */
  covered: CardRef[];
  /** no_illegal: each card that is not allowed, with its reason. Cards with the same reason share an item. */
  blocked: BottomLineItem[];
  /** no_unconfirmed: exactly what keeps the answer from a YES. Empty for the other kinds. */
  missing: BottomLineGap[];
  /** yes: everything the rider must still do, merged across cards with duplicates removed. */
  requirements: Line[];
  /** At least one city or county was checked, not only state law or the campus. */
  citiesChecked: boolean;
  /** The rider may ride somewhere we did not check (Somewhere else, or a state without a local layer). */
  uncheckedPlaces: boolean;
}

/** Cautions the engine adds only because the user answered "not sure". They block a YES. */
const UNSURE_CAUTIONS: Record<string, QuestionId> = {
  caution_fast_mode_unverified: "fast_mode",
};

const GAP_ORDER: GapKind[] = ["cant_confirm", "unanswered", "unsure", "unverified"];

/** State cards need statute-verified rules. Local cards need a primary_verified record. */
export function isTopVerified(v: Verdict): boolean {
  return v.scope === "state" ? v.verified === "statute_verified" : v.level === "primary_verified";
}

function refOf(v: Verdict): CardRef {
  return { scope: v.scope, id: v.id };
}

function lineKey(l: Line): string {
  return `${l.code}|${JSON.stringify(l.params ?? {})}`;
}

/** Merges items that say the same thing, keeping the order each first appeared in. */
function merge<T extends BottomLineItem>(items: T[], extraKey: (item: T) => string = () => ""): T[] {
  const out: T[] = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const key = `${extraKey(item)}#${lineKey(item.line)}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ ...item, where: [...item.where] });
    } else {
      out[at] = { ...out[at], where: [...out[at].where, ...item.where] };
    }
  }
  return out;
}

function unverifiedLine(v: Verdict): Line {
  if (v.scope === "state") return { code: "bl_unverified_state" };
  const level: VerificationLevel = v.level ?? "primary_not_found";
  return { code: `bl_unverified_${level}`, params: { place: v.id } };
}

/** Every reason this card keeps the answer from a YES, short of being illegal. */
function gapsOf(v: Verdict): BottomLineGap[] {
  const where = [refOf(v)];
  const gaps: BottomLineGap[] = [];
  if (v.status === "cant_confirm") gaps.push({ kind: "cant_confirm", where, line: v.reason });
  if (v.status === "need_info") {
    gaps.push({ kind: "unanswered", where, line: { code: "bl_unanswered", params: { questions: v.questions.join(",") } } });
  }
  for (const caution of v.cautions) {
    const question = UNSURE_CAUTIONS[caution.code];
    if (question) gaps.push({ kind: "unsure", where, line: { code: `bl_unsure_${question}` } });
  }
  if (!isTopVerified(v)) gaps.push({ kind: "unverified", where, line: unverifiedLine(v) });
  return gaps;
}

export function bottomLine(result: EngineResult, rideDate: string): BottomLine {
  const cards = [result.state, ...result.local];
  const base = {
    rideDate,
    covered: cards.map(refOf),
    citiesChecked: result.local.some((v) => v.id !== "sduhsd_campuses"),
    uncheckedPlaces: result.localNotice,
  };

  const illegal = cards.filter((v) => v.status === "no" || v.status === "not_ebike");
  if (illegal.length > 0) {
    return {
      ...base,
      kind: "no_illegal",
      blocked: merge(illegal.map((v) => ({ where: [refOf(v)], line: v.reason }))),
      missing: [],
      requirements: [],
    };
  }

  const gaps = cards.flatMap(gapsOf);
  if (gaps.length > 0) {
    const ordered = [...gaps].sort((a, b) => GAP_ORDER.indexOf(a.kind) - GAP_ORDER.indexOf(b.kind));
    return {
      ...base,
      kind: "no_unconfirmed",
      blocked: [],
      missing: merge(ordered, (g) => g.kind),
      requirements: [],
    };
  }

  const seen = new Set<string>();
  const requirements = cards
    .flatMap((v) => v.requirements)
    .filter((l) => {
      const key = lineKey(l);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { ...base, kind: "yes", blocked: [], missing: [], requirements };
}
