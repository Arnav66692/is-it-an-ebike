// The bottom line under the answer. One strict YES or NO for the whole ride: state law,
// every San Diego place the user picked and the SDUHSD campus if picked, on the ride date.
//
// YES needs every card allowed, no question left open, every rule behind the cards read in
// enacted text, and every fact read from a link or photo checked by the family against the bike.
// Anything illegal is NO. Anything uncertain is NO, not confirmed, with the exact gap named.
// Uncertainty never turns into a YES.

import { addDays } from "./dates";
import {
  CAUTION_FAST_MODE_UNVERIFIED,
  READ_FIELDS,
  ROAD_LIMIT_CODES,
  type EngineResult,
  type Line,
  type ReadField,
  type Verdict,
  type VerificationLevel,
} from "./types";

export type BottomLineKind = "yes" | "no_illegal" | "no_unconfirmed";

/** Points at one verdict card: the state card, or a San Diego place. */
export interface CardRef {
  scope: Verdict["scope"];
  id: string;
}

/** One sentence and every card it applies to. Empty for the bike's facts, which every card rests on. */
export interface BottomLineItem {
  where: CardRef[];
  line: Line;
}

/** "facts": facts read from a link or photo that the family has not checked against the bike. */
export type GapKind = "facts" | "cant_confirm" | "unanswered" | "unsure" | "unverified" | "stale";

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
  /** yes: a requirement limits which public streets the rider may use, like New York's 30 mph roads. */
  roadLimit: boolean;
  /**
   * no_illegal: every card that says no says the bike is not an e-bike, and no rule bars the rider
   * outright. It may still be legal as another vehicle, like Vermont's motor-assisted bicycle.
   */
  notEbikeOnly: boolean;
  /** At least one city or county was checked, not only state law or the campus. */
  citiesChecked: boolean;
  /** The rider may ride somewhere we did not check (Somewhere else, or a state without a local layer). */
  uncheckedPlaces: boolean;
}

/** The sentence for a "not sure" answer that blocks a YES. */
export type UnsureCode = "bl_unsure_fast_mode";

/**
 * Every line code the bottom line itself writes. lib/i18n/verdicts.ts must have a sentence for
 * each one in both languages, and the compiler checks that.
 */
export type BottomLineCode =
  | "bl_unconfirmed_facts"
  | "bl_unanswered"
  | UnsureCode
  | `bl_unverified_${"state" | UnverifiedLevel}`
  | "bl_state_after_check";

/** The levels that keep a local card from a YES. */
type UnverifiedLevel = Exclude<VerificationLevel, "primary_verified">;

/** Cautions the engine adds only because the user answered "not sure". They block a YES. */
const UNSURE_CAUTIONS: ReadonlyMap<string, UnsureCode> = new Map([[CAUTION_FAST_MODE_UNVERIFIED, "bl_unsure_fast_mode"]]);

const GAP_ORDER: GapKind[] = ["facts", "cant_confirm", "unanswered", "unsure", "unverified", "stale"];

/**
 * A state record vouches for ride dates up to this many days after it was last checked, the same
 * re-check horizon a San Diego record has. A later ride could fall under a law passed after the
 * check, so it can't be a YES until the table is checked again.
 */
export const STATE_RECHECK_DAYS = 30;

/** The last ride date a state record checked on this date can vouch for. */
export function stateCheckedThrough(lastChecked: string): string {
  return addDays(lastChecked, STATE_RECHECK_DAYS);
}

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
  if (v.scope === "state") return { code: "bl_unverified_state" satisfies BottomLineCode, params: { verified: v.verified } };
  const found = v.level;
  // Only called for a card that is not primary_verified. No level means nothing was found.
  const level: UnverifiedLevel = found === undefined || found === "primary_verified" ? "primary_not_found" : found;
  const code: BottomLineCode = `bl_unverified_${level}`;
  return { code, params: { place: v.id } };
}

/** Every reason this card keeps the answer from a YES, short of being illegal. */
function gapsOf(v: Verdict, rideDate: string): BottomLineGap[] {
  const where = [refOf(v)];
  const gaps: BottomLineGap[] = [];
  if (v.status === "cant_confirm") gaps.push({ kind: "cant_confirm", where, line: v.reason });
  if (v.status === "need_info") {
    const code: BottomLineCode = "bl_unanswered";
    gaps.push({ kind: "unanswered", where, line: { code, params: { questions: v.questions.join(",") } } });
  }
  for (const caution of v.cautions) {
    const code = UNSURE_CAUTIONS.get(caution.code);
    if (code) gaps.push({ kind: "unsure", where, line: caution.params ? { code, params: caution.params } : { code } });
  }
  // A state that never confirms an e-bike (Alaska, Kentucky) already says why on its card line,
  // and the unverified sentence would only say the same thing again.
  const saysUnverified = v.scope === "state" && v.status === "cant_confirm" && v.reason.code === "never_legal";
  if (!isTopVerified(v) && !saysUnverified) gaps.push({ kind: "unverified", where, line: unverifiedLine(v) });
  if (v.scope === "state") {
    const through = stateCheckedThrough(v.lastChecked);
    if (rideDate > through) {
      const code: BottomLineCode = "bl_state_after_check";
      gaps.push({ kind: "stale", where, line: { code, params: { checked: v.lastChecked, through } } });
    }
  }
  return gaps;
}

/**
 * The gap for read facts not yet checked. It names every one, in the order the facts card shows
 * them, not only the facts a card happened to use, since a wrong fact can change which rules apply.
 */
function factsGap(unconfirmed: readonly ReadField[]): BottomLineGap[] {
  const fields = READ_FIELDS.filter((f) => unconfirmed.includes(f));
  if (fields.length === 0) return [];
  const code: BottomLineCode = "bl_unconfirmed_facts";
  return [{ kind: "facts", where: [], line: { code, params: { fields: fields.join(",") } } }];
}

/**
 * The bottom line for one ride. `unconfirmed` lists the facts read from a product link, a label
 * photo or the pedal photo check that the family has not checked against the bike. While any is
 * left, the answer can't be YES. A rule that says no still says no.
 */
export function bottomLine(result: EngineResult, rideDate: string, unconfirmed: readonly ReadField[] = []): BottomLine {
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
      roadLimit: false,
      notEbikeOnly: illegal.every((v) => v.status === "not_ebike"),
    };
  }

  const gaps = [...factsGap(unconfirmed), ...cards.flatMap((v) => gapsOf(v, rideDate))];
  if (gaps.length > 0) {
    const ordered = [...gaps].sort((a, b) => GAP_ORDER.indexOf(a.kind) - GAP_ORDER.indexOf(b.kind));
    return {
      ...base,
      kind: "no_unconfirmed",
      blocked: [],
      missing: merge(ordered, (g) => g.kind),
      requirements: [],
      roadLimit: false,
      notEbikeOnly: false,
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
  const roadLimit = requirements.some((l) => ROAD_LIMIT_CODES.includes(l.code));
  return { ...base, kind: "yes", blocked: [], missing: [], requirements, roadLimit, notEbikeOnly: false };
}
