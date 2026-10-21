// The answer for each mod: YES when the bike is still legal to ride as an e-bike in California,
// NO otherwise. YES needs an outcome the source reads as the same class or a new class, with no
// rule broken. An outcome the source doesn't settle, a question not answered, or "something else"
// is NO, never YES. Every reason, rule and penalty comes from the data, word for word. The one
// line about what the result means is the app's own, in English and Spanish.

import type { ClassNum } from "@/lib/rules/types";
import { FROM_2027, type ModPenalty, type ModResult, type ModRule, type ModsData, type ModView, type OutcomeView } from "./types";

/** The outcome the family picked: its index in the source, "other" for something else or not sure, or null before they pick. */
export type ModChoice = number | "other" | null;

/**
 * What the answer's first line says. sd_breaks and sd_unresolved come from the City of San Diego
 * passenger rule. under_16_class_3 is a bike that is Class 3 after the mod with a rider under 16.
 * The engine kinds are the rules engine's bottom line for the bike after the mod (lib/mods/ride.ts).
 */
export type AnswerKind =
  | ModResult
  | "unanswered"
  | "other"
  | "sd_breaks"
  | "sd_unresolved"
  | "under_16_class_3"
  | "engine_yes"
  | "engine_illegal"
  | "engine_unconfirmed";

/** The kinds that leave a legal e-bike. Every other kind is NO. */
export const YES_KINDS: readonly AnswerKind[] = ["same_class", "becomes_class_2", "becomes_class_3", "engine_yes"];

/** NO kinds where a rule the ride breaks, or the bike no longer being an e-bike, is settled. */
export const BREAKS_KINDS: readonly AnswerKind[] = ["not_an_ebike", "breaks_rule", "sd_breaks", "under_16_class_3", "engine_illegal"];

/** NO kinds the sources don't settle. The answer is NO because it can't be confirmed as legal. */
export const UNSURE_KINDS: readonly AnswerKind[] = ["unresolved", "other", "unclear_until_2027", "depends_on_result", "sd_unresolved", "engine_unconfirmed"];

/** The kinds where the bike stays an e-bike, so the penalties for a motor vehicle are left out. */
const STILL_EBIKE: readonly AnswerKind[] = [...YES_KINDS, "breaks_rule", "sd_breaks", "sd_unresolved", "under_16_class_3"];

/** The kinds where the bike may no longer be an e-bike, so the page shows what that means. */
const MAYBE_NOT_EBIKE: readonly AnswerKind[] = ["not_an_ebike", "unclear_until_2027", "depends_on_result", "unresolved", "other"];

/** The youngest rider California lets ride a Class 3 e-bike, VC 21213(a). */
export const CLASS_3_MIN_AGE = 16;

/** The app's own line about what a result means, shown under the source's reason. */
export type EffectKey = "different_class" | "not_an_ebike" | "unresolved" | "depends_on_result" | "unclear_until_2027" | "class_3_age" | "under_16_class_3";

export interface ModAnswer {
  id: string;
  yes: boolean;
  kind: AnswerKind;
  /** The class the bike is after the mod, while it is still an e-bike. */
  classAfter: ClassNum | null;
  /** Why, in the source's words. */
  reasons: string[];
  /** What the result means, as the app's own words. */
  effects: EffectKey[];
  /** The rule the ride breaks, for breaks_rule. */
  breaks: ModRule | null;
  rules: ModRule[];
  sanDiego: ModRule[];
  notEbike: ModRule[];
  from2027: ModRule[];
  penalties: ModPenalty[];
}

/** True when a rule or penalty is in effect on the ride date. An end date is the rule's last day. */
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
export function pickedOutcome(mod: ModView, bikeClass: ClassNum, choice: ModChoice): OutcomeView | "unanswered" | "other" {
  const outcomes = outcomesFor(mod, bikeClass);
  if (!mod.ask && outcomes.length === 1) return outcomes[0];
  if (choice === "other") return "other";
  if (choice === null) return "unanswered";
  return outcomes.find((o) => o.index === choice) ?? "unanswered";
}

function classAfter(kind: AnswerKind, bikeClass: ClassNum): ClassNum | null {
  if (kind === "becomes_class_2") return 2;
  if (kind === "becomes_class_3") return 3;
  return STILL_EBIKE.includes(kind) ? bikeClass : null;
}

/** The app's line for what a result means, or none. */
function effectFor(kind: AnswerKind): EffectKey | null {
  if (kind === "becomes_class_2" || kind === "becomes_class_3") return "different_class";
  if (kind === "not_an_ebike") return "not_an_ebike";
  if (kind === "unresolved" || kind === "other") return "unresolved";
  if (kind === "depends_on_result") return "depends_on_result";
  if (kind === "unclear_until_2027") return "unclear_until_2027";
  if (kind === "under_16_class_3") return "under_16_class_3";
  return null;
}

/** True for a penalty that only applies once the bike is no longer an e-bike. */
function notEbikePenalty(data: ModsData, p: ModPenalty): boolean {
  return data.notEbikePenaltyFors.includes(p.for) || p.section.startsWith("see if_no_longer_an_ebike");
}

/**
 * The penalties to show. None before the family answers what the mod does. The motor vehicle
 * penalties only when the bike may no longer be an e-bike. A City of San Diego fine only when they
 * ride in the City while its passenger rule is in effect.
 */
function penaltiesFor(data: ModsData, mod: ModView, kind: AnswerKind, rideDate: string, cityRuleOn: boolean): ModPenalty[] {
  if (kind === "unanswered") return [];
  const stillEbike = STILL_EBIKE.includes(kind);
  return mod.penalties.filter((p) => inEffect(p, rideDate) && !(stillEbike && notEbikePenalty(data, p)) && (cityRuleOn || !p.section.startsWith("SDMC")));
}

/**
 * The answer for one ticked mod on a bike of `bikeClass`, ridden on `rideDate`. `cityOfSanDiego`
 * is true when the family rides in the City of San Diego, whose passenger rule can turn a state YES
 * into a NO while the rule is in effect. `riderAge` is the rider's age, or null when not given. A
 * bike that is Class 3 after the mod is NO for a rider under 16.
 */
export function answerMod(
  data: ModsData,
  mod: ModView,
  bikeClass: ClassNum,
  choice: ModChoice,
  rideDate: string,
  cityOfSanDiego: boolean,
  riderAge: number | null = null,
): ModAnswer {
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
    reasons = [];
  } else if (cityRule && picked.sanDiego) {
    kind = picked.sanDiego === "breaks" ? "sd_breaks" : "sd_unresolved";
    reasons = [cityRule.says];
  } else {
    kind = picked.result === "unclear_until_2027" && rideDate >= FROM_2027 ? "not_an_ebike" : picked.result;
    breaks = picked.breaks;
    reasons = [picked.why];
  }

  const after = classAfter(kind, bikeClass);
  if (after === 3 && riderAge !== null && riderAge < CLASS_3_MIN_AGE && YES_KINDS.includes(kind)) kind = "under_16_class_3";
  const effect = effectFor(kind);
  const ageLine = kind === "becomes_class_3" && riderAge === null ? (["class_3_age"] as EffectKey[]) : [];
  return {
    id: mod.id,
    yes: YES_KINDS.includes(kind),
    kind,
    classAfter: after,
    reasons,
    effects: [...(effect ? [effect] : []), ...ageLine],
    breaks,
    rules: mod.rules.filter((r) => inEffect(r, rideDate)),
    sanDiego: cityOfSanDiego ? mod.sanDiego.filter((r) => inEffect(r, rideDate)) : [],
    notEbike: MAYBE_NOT_EBIKE.includes(kind) ? mod.notEbike.filter((r) => inEffect(r, rideDate)) : [],
    from2027: rideDate >= FROM_2027 ? mod.from2027.filter((r) => inEffect(r, rideDate)) : [],
    penalties: penaltiesFor(data, mod, kind, rideDate, cityRule !== undefined),
  };
}

/** YES for the whole bike only when every ticked mod is YES. Null with no mod ticked. */
export function overallYes(answers: readonly ModAnswer[]): boolean | null {
  if (answers.length === 0) return null;
  return answers.every((a) => a.yes);
}

/** How many ticked mods break a rule or end e-bike status, can't be confirmed, or still need an answer. */
export function overallCounts(answers: readonly ModAnswer[]): { breaks: number; unsure: number; ask: number } {
  return {
    breaks: answers.filter((a) => BREAKS_KINDS.includes(a.kind)).length,
    unsure: answers.filter((a) => UNSURE_KINDS.includes(a.kind)).length,
    ask: answers.filter((a) => a.kind === "unanswered").length,
  };
}
