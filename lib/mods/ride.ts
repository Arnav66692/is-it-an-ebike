// Each mod's answer for one ride in any state. The bike after the mod goes through the rules engine
// for the state, the places, the rider's age and the ride date, and the answer is YES only when the
// engine's bottom line is YES. In California the verified mods data (lib/mods/answer.ts) applies
// too, exactly as before, so a California YES needs both. A mod that changes nothing the engine reads
// keeps the engine's answer for the bike as it is.

import { bottomLine, evaluate, type BottomLine } from "@/lib/rules";
import type { BikeFacts, ClassNum, EngineResult, PlaceId, QuestionId } from "@/lib/rules/types";
import { answerMod, overallYes, pickedOutcome, type AnswerKind, type ModAnswer, type ModChoice } from "./answer";
import { outcomeFacts, withMod, withMods, type FactChange } from "./facts";
import type { ModsData, ModView } from "./types";

/** The state whose mod rules, penalties and dates are in data/mods/ca-mods.json. */
export const MODS_DATA_STATE = "CA";

/** Where and when the bike is ridden, and by whom. */
export interface ModRide {
  state: string;
  /** The checked local records the picks stand for, like city_of_san_diego. */
  places: PlaceId[];
  /** True when a pick has no checked record, so its own rules were not checked. */
  otherPlaces: boolean;
  riderAge: number;
  rideDate: string;
}

export interface EngineRun {
  facts: BikeFacts;
  line: BottomLine;
  /** The engine's follow-up questions, so the page can ask them. */
  questions: QuestionId[];
}

export interface RideAnswer extends ModAnswer {
  state: string;
  /** California's answer from the mods data, unchanged. Null in every other state. */
  ca: ModAnswer | null;
  /** The engine on the bike after the mod. Null when the answer doesn't say what the mod does. */
  engine: EngineRun | null;
}

/** The engine's bottom line for these facts on this ride. */
export function runEngine(ride: ModRide, facts: BikeFacts): EngineRun {
  const result: EngineResult = evaluate({ state: ride.state, places: ride.places, otherPlaces: ride.otherPlaces, riderAge: ride.riderAge, rideDate: ride.rideDate, facts });
  const questions = [...new Set([...result.state.questions, ...result.local.flatMap((v) => v.questions)])];
  return { facts, line: bottomLine(result, ride.rideDate), questions };
}

/** The facts change the family's answer stands for, or the reason there is none. */
export function modChange(mod: ModView, bikeClass: ClassNum, choice: ModChoice): FactChange | "unanswered" | "other" | "unsettled" {
  const picked = pickedOutcome(mod, bikeClass, choice);
  return typeof picked === "string" ? picked : outcomeFacts(mod.id, picked.index);
}

function engineKind(run: EngineRun): AnswerKind {
  if (run.line.kind === "yes") return "engine_yes";
  return run.line.kind === "no_illegal" ? "engine_illegal" : "engine_unconfirmed";
}

/** An answer with none of California's rules, penalties or reasons, for every other state. */
function plain(mod: ModView, kind: AnswerKind, engine: EngineRun | null, state: string): RideAnswer {
  const classes = engine?.facts.classes ?? [];
  return {
    id: mod.id,
    yes: kind === "engine_yes",
    kind,
    classAfter: kind === "engine_yes" && classes.length === 1 ? classes[0] : null,
    reasons: [],
    effects: kind === "depends_on_result" ? ["depends_on_result"] : kind === "other" ? ["unresolved"] : [],
    breaks: null,
    rules: [],
    sanDiego: [],
    notEbike: [],
    from2027: [],
    penalties: [],
    state,
    ca: null,
    engine,
  };
}

/**
 * The answer for one ticked mod on this ride. `base` is the bike before the mod, from
 * lib/mods/facts.ts baseFacts. YES only when the engine's bottom line on the bike after the mod is
 * YES, and in California only when the mods data says YES too.
 */
export function answerRide(data: ModsData, mod: ModView, bikeClass: ClassNum, choice: ModChoice, base: BikeFacts, ride: ModRide): RideAnswer {
  const change = modChange(mod, bikeClass, choice);
  const engine = typeof change === "string" ? null : runEngine(ride, withMod(base, change));
  if (ride.state !== MODS_DATA_STATE) {
    if (change === "unanswered" || change === "other") return plain(mod, change, null, ride.state);
    if (change === "unsettled" || engine === null) return plain(mod, "depends_on_result", null, ride.state);
    return plain(mod, engineKind(engine), engine, ride.state);
  }
  const ca = answerMod(data, mod, bikeClass, choice, ride.rideDate, ride.places.includes("city_of_san_diego"), ride.riderAge);
  const common = { ...ca, state: ride.state, ca, engine };
  if (!ca.yes) return common;
  if (engine === null) return { ...common, yes: false, kind: "unresolved" };
  if (engine.line.kind === "yes") return common;
  return { ...common, yes: false, kind: engineKind(engine) };
}

/** The engine's questions the page must still ask: only from runs that could still end in YES. */
export function openQuestions(answers: readonly RideAnswer[], combined: EngineRun | null): QuestionId[] {
  const runs = answers.filter((a) => a.engine !== null && (a.ca === null || a.ca.yes)).map((a) => a.engine as EngineRun);
  return [...new Set([...runs, ...(combined ? [combined] : [])].flatMap((r) => r.questions))];
}

/**
 * The engine on the bike with every ticked mod at once, so two mods that are each fine alone, like a
 * throttle and a 28 mph unlock on a Class 1 bike, can't add up to a YES. Null when a mod's answer
 * doesn't say what it does, since that mod is already NO.
 */
export function combinedRun(mods: readonly { mod: ModView; choice: ModChoice }[], bikeClass: ClassNum, base: BikeFacts, ride: ModRide): EngineRun | null {
  const changes = mods.map(({ mod, choice }) => modChange(mod, bikeClass, choice));
  if (changes.some((c) => typeof c === "string")) return null;
  return runEngine(ride, withMods(base, changes as FactChange[]));
}

/**
 * YES for the whole bike only when every ticked mod is YES and the engine says YES for all of them
 * together. Null with no mod ticked.
 */
export function overallRideYes(answers: readonly RideAnswer[], combined: EngineRun | null): boolean | null {
  const each = overallYes(answers);
  if (each !== true) return each;
  return combined !== null && combined.line.kind === "yes";
}
