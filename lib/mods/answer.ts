// The answer for each mod: YES when the bike is still legal to ride as an e-bike in California,
// NO otherwise. YES needs an outcome the source reads as the same class or a new class, with no
// rule broken. An outcome the source doesn't settle, a question not answered, or "something else"
// is NO, never YES. Every reason, rule and penalty comes from the data, word for word.

import type { ClassNum } from "@/lib/rules/types";
import { FROM_2027, type ModPenalty, type ModResult, type ModRule, type ModsData, type ModView, type OutcomeView } from "./types";

/** The outcome the family picked: its index in the source, "other" for something else or not sure, or null before they pick. */
export type ModChoice = number | "other" | null;

/** What the answer's first line says. sd_breaks and sd_unresolved come from the City of San Diego passenger rule. */
export type AnswerKind = ModResult | "unanswered" | "other" | "sd_breaks" | "sd_unresolved";

/** The kinds that leave a legal e-bike. Every other kind is NO. */
export const YES_KINDS: readonly AnswerKind[] = ["same_class", "becomes_class_2", "becomes_class_3"];

/** The kinds where the bike stays an e-bike, so the penalties for a motor vehicle are left out. */
const STILL_EBIKE: readonly AnswerKind[] = [...YES_KINDS, "breaks_rule", "sd_breaks", "sd_unresolved"];

/** The kinds where the bike may no longer be an e-bike, so the page shows what that means. */
const MAYBE_NOT_EBIKE: readonly AnswerKind[] = ["not_an_ebike", "unclear_until_2027", "depends_on_result", "unresolved", "other"];

export interface ModAnswer {
  id: string;
  yes: boolean;
  kind: AnswerKind;
  /** The class the bike is after the mod, while it is still an e-bike. */
  classAfter: ClassNum | null;
  /** Why, in the source's words. */
  reasons: string[];
  /** The rule the ride breaks, for breaks_rule. */
  breaks: ModRule | null;
  rules: ModRule[];
  sanDiego: ModRule[];
  notEbike: ModRule[];
  from2027: ModRule[];
  penalties: ModPenalty[];
}

/** True when a rule or penalty is in effect on the ride date. A source's end date is its last day. */
export function inEffect(item: { effective: string | null; ends?: string | null }, date: string): boolean {
  return (item.effective === null || item.effective <= date) && (item.ends === undefined || item.ends === null || date <= item.ends);
}

/** True when the mod can be made to a bike of this class, like a throttle added to Class 1 or Class 3. */
export function modApplies(mod: ModView, bikeClass: ClassNum): boolean {
  return mod.appliesTo.includes(bikeClass);
}

/** The outcomes that can happen to a bike of this class, in the source's order. */
export function outcomesFor(mod: ModView, bikeClass: ClassNum): OutcomeView[] {
  return mod.outcomes.filter((o) => o.onlyFor === null || o.onlyFor.includes(bikeClass));
}

/** The outcome the answer is for, or the reason there is none. */
function pickedOutcome(mod: ModView, bikeClass: ClassNum, choice: ModChoice): OutcomeView | "unanswered" | "other" {
  const outcomes = outcomesFor(mod, bikeClass);
  if (!mod.ask && outcomes.length === 1) return outcomes[0];
  if (choice === "other") return "other";
  if (choice === null) return "unanswered";
  return outcomes.find((o) => o.index === choice) ?? "unanswered";
}

/** The source's first sentence for a legal effect, like "The sources read do not settle it." */
function effectLine(data: ModsData, effect: string): string[] {
  const words = data.effectWords[effect];
  return words ? [words] : [];
}

function classAfter(kind: AnswerKind, bikeClass: ClassNum): ClassNum | null {
  if (kind === "becomes_class_2") return 2;
  if (kind === "becomes_class_3") return 3;
  return STILL_EBIKE.includes(kind) ? bikeClass : null;
}

/**
 * The answer for one ticked mod on a bike of `bikeClass`, ridden on `rideDate`. `cityOfSanDiego`
 * is true when the family rides in the City of San Diego, whose passenger rule can turn a state YES
 * into a NO while the rule is in effect.
 */
export function answerMod(data: ModsData, mod: ModView, bikeClass: ClassNum, choice: ModChoice, rideDate: string, cityOfSanDiego: boolean): ModAnswer {
  const picked = pickedOutcome(mod, bikeClass, choice);
  let kind: AnswerKind;
  let reasons: string[];
  let breaks: ModRule | null = null;
  // The City's passenger rule is the first rule in a mod's San Diego list. The others only explain it.
  const passengerRule = mod.sanDiego[0];
  const cityRule = cityOfSanDiego && passengerRule && inEffect(passengerRule, rideDate) ? passengerRule : undefined;

  if (picked === "unanswered") {
    kind = "unanswered";
    reasons = [];
  } else if (picked === "other") {
    kind = "other";
    reasons = effectLine(data, "unresolved");
  } else if (cityRule && picked.sanDiego) {
    kind = picked.sanDiego === "breaks" ? "sd_breaks" : "sd_unresolved";
    reasons = [cityRule.says];
  } else {
    kind = picked.result === "unclear_until_2027" && rideDate >= FROM_2027 ? "not_an_ebike" : picked.result;
    breaks = picked.breaks;
    const effect = picked.result === "unclear_until_2027" ? "unresolved_until_2027_then_not_an_ebike" : picked.result;
    reasons = [picked.why, ...(MAYBE_NOT_EBIKE.includes(kind) ? effectLine(data, effect) : [])];
  }

  const stillEbike = STILL_EBIKE.includes(kind);
  return {
    id: mod.id,
    yes: YES_KINDS.includes(kind),
    kind,
    classAfter: classAfter(kind, bikeClass),
    reasons,
    breaks,
    rules: mod.rules.filter((r) => inEffect(r, rideDate)),
    sanDiego: cityOfSanDiego ? mod.sanDiego.filter((r) => inEffect(r, rideDate)) : [],
    notEbike: MAYBE_NOT_EBIKE.includes(kind) ? mod.notEbike.filter((r) => inEffect(r, rideDate)) : [],
    from2027: rideDate >= FROM_2027 ? mod.from2027.filter((r) => inEffect(r, rideDate)) : [],
    penalties: mod.penalties.filter((p) => inEffect(p, rideDate) && !(stillEbike && data.notEbikePenaltyFors.includes(p.for))),
  };
}

/** YES for the whole bike only when every ticked mod is YES. Null with no mod ticked. */
export function overallYes(answers: readonly ModAnswer[]): boolean | null {
  if (answers.length === 0) return null;
  return answers.every((a) => a.yes);
}
