// Types and constants the mods check shares between the server, which reads the data files, and
// the page, which gets only the view. Nothing here imports the data, so the page bundle stays small.

import type { Lang } from "@/lib/i18n/names";
import type { ClassNum } from "@/lib/rules/types";

/** The day the 2026 bills SB 1167 and AB 2346 take effect, from the source's effective_date_rule. */
export const FROM_2027 = "2027-01-01";

/** What one mod outcome means for the bike, as the page shows it. */
export type ModResult =
  | "same_class"
  | "becomes_class_2"
  | "becomes_class_3"
  | "not_an_ebike"
  | "unresolved"
  | "unclear_until_2027"
  | "depends_on_result"
  | "breaks_rule";

export const MOD_RESULTS: readonly ModResult[] = [
  "same_class",
  "becomes_class_2",
  "becomes_class_3",
  "not_an_ebike",
  "unresolved",
  "unclear_until_2027",
  "depends_on_result",
  "breaks_rule",
];

/** The source's legal_effect each result may stand for. */
export const RESULT_FROM_EFFECT: Record<string, readonly ModResult[]> = {
  same_class: ["same_class", "breaks_rule"],
  different_class: ["becomes_class_2", "becomes_class_3"],
  not_an_ebike: ["not_an_ebike"],
  unresolved: ["unresolved"],
  unresolved_until_2027_then_not_an_ebike: ["unclear_until_2027"],
  depends_on_result: ["depends_on_result"],
};

export interface ModRule {
  section: string;
  url: string;
  says: string;
  effective: string | null;
  /** The last day the rule is in effect, when the source gives one. */
  ends: string | null;
}

export interface ModPenalty {
  who: string;
  for: string;
  section: string;
  url: string;
  penaltyAsWritten: string;
  effective: string | null;
}

export interface OutcomeView {
  /** The outcome's place in the source's list. */
  index: number;
  if: Record<Lang, string>;
  why: string;
  result: ModResult;
  /** For breaks_rule, the rule in this mod's rules the ride breaks. */
  breaks: ModRule | null;
  /** The starting classes this outcome can happen to. Null for any class. */
  onlyFor: ClassNum[] | null;
  /** What the City of San Diego passenger rule does to this outcome while it is in effect. */
  sanDiego: "breaks" | "unresolved" | null;
}

export interface ModView {
  id: string;
  name: Record<Lang, string>;
  examples: Record<Lang, string>;
  appliesTo: ClassNum[];
  summary: string;
  /** True when the page asks which outcome happened, even with one outcome. */
  ask: boolean;
  outcomes: OutcomeView[];
  rules: ModRule[];
  sanDiego: ModRule[];
  notEbike: ModRule[];
  from2027: ModRule[];
  penalties: ModPenalty[];
  selling: { summary: string; rules: ModRule[]; penalties: ModPenalty[] } | null;
  confidence: string;
  confidenceNote: string;
}

export interface ModsData {
  title: string;
  readOn: string;
  howRead: string;
  /** The source's plain words for each legal effect. */
  effectWords: Record<string, string>;
  leftOut: { mod: string; why: string }[];
  /** The penalties that apply once a bike is no longer an e-bike. A bike that stays an e-bike leaves them out. */
  notEbikePenaltyFors: string[];
  mods: ModView[];
}
