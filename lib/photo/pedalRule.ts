// The whole-bike pedal rule from photo pilot v3, read straight from the frozen pilot/v3/method.json so
// the app and the tested scorer share one definition. It passed its preregistered test (12 of 12
// no-pedal machines, 23 of 24 overall), so the app may use it, but only to fill the "pedals" fact.
// It never gives a verdict.

import method from "@/pilot/v3/method.json";
import type { BikeFacts, ReadField } from "@/lib/rules/types";

export const PEDAL_MODEL = {
  id: method.model,
  file: method.model_file,
  bytes: method.model_bytes,
  sha256: method.model_sha256,
} as const;

/** Download size shown before anything loads. */
export const PEDAL_MODEL_MB = Math.round(method.model_bytes / 1_000_000);

/** The same 20 queries, in the same order, as the dev and test runs. Only 5 of them enter the rule. */
export const PEDAL_QUERIES: readonly string[] = method.text_batch;

export const PEDAL_THRESHOLD: number = method.threshold;

/**
 * Within this many logit units of the line, the app asks "Does it have pedals?" instead of filling the
 * fact. This is product behavior, not part of the tested bar. Dev pedal bikes and no-pedal machines
 * overlap from about 0.6 below the line to just above it.
 */
export const CLOSE_CALL_MARGIN = 0.5;

export type PedalCall = "pedals" | "no_pedals" | "ask";

/** Best logit per query over all boxes, keyed by query text. */
export type BestLogits = Readonly<Record<string, number>>;

function best(logits: BestLogits, queries: readonly string[]): number {
  return Math.max(
    ...queries.map((q) => {
      const v = logits[q];
      if (v === undefined) throw new Error(`No score for query "${q}"`);
      return v;
    }),
  );
}

/** The frozen score: best pedal-part logit, minus pegs if any, plus the bicycle minus motorcycle term. */
export function pedalScore(logits: BestLogits): number {
  const { rule } = method;
  const pegs = rule.peg_queries.length > 0 ? best(logits, rule.peg_queries) : 0;
  const whole = best(logits, rule.whole_object_plus) - best(logits, rule.whole_object_minus);
  return best(logits, rule.pedal_queries) - pegs + rule.whole_object_weight * whole;
}

/** The tested call is "pedals" at or above the threshold. Close to the line, the app asks instead. */
export function pedalCall(score: number): PedalCall {
  if (Math.abs(score - PEDAL_THRESHOLD) < CLOSE_CALL_MARGIN) return "ask";
  return score >= PEDAL_THRESHOLD ? "pedals" : "no_pedals";
}

/** Fills only the pedals fact, and only on a clear call. Every other fact stays as it was. */
export function applyPedalCall(facts: BikeFacts, call: PedalCall): BikeFacts {
  if (call === "ask") return facts;
  return { ...facts, hasPedals: call === "pedals" };
}

/** How the family changed the pedals answer: picked an answer, or ticked or unticked its box. */
export type AnswerChange = "picked" | "ticked";

/** What one photo check knows about the family's pedals answer since it started. */
export interface AnswerWatch {
  /** True until the family picks a pedals answer or uses the pedals box. */
  untouched: () => boolean;
  /** How they changed the pedals answer since the check started, or null. A pick counts over a tick. */
  change: () => AnswerChange | null;
}

/** Tracks the family's own pedals answers, so a photo check never replaces one given while it ran. */
export interface AnswerGate {
  /** Call each time the family picks a pedals answer, or ticks or unticks the pedals box. */
  edited: (how: AnswerChange) => void;
  /** Call when a photo check starts. */
  start: () => AnswerWatch;
}

/**
 * A photo check can take about 10 seconds. If the family picks a pedals answer or uses the pedals
 * box in that time, their answer is newer than the photo, so it wins and the photo's call is
 * dropped. An answer given before the check started is not guarded, since the family then asked
 * the photo for an answer.
 */
export function answerGate(): AnswerGate {
  const changes: AnswerChange[] = [];
  return {
    edited(how) {
      changes.push(how);
    },
    start() {
      const at = changes.length;
      const since = () => changes.slice(at);
      return {
        untouched: () => changes.length === at,
        change: () => (since().includes("picked") ? "picked" : since().length > 0 ? "ticked" : null),
      };
    },
  };
}

/**
 * The facts card's tick handler. A tick or untick on the pedals box is the family's own pedals
 * answer, so it tells the gate before it is passed on, and a photo check still running is dropped.
 */
export function confirmThroughGate(gate: AnswerGate, onConfirm: (field: ReadField, confirmed: boolean) => void): (field: ReadField, confirmed: boolean) => void {
  return (field, confirmed) => {
    if (field === "hasPedals") gate.edited("ticked");
    onConfirm(field, confirmed);
  };
}

/**
 * Runs a photo check and passes its call on only if the card that asked for it is still on
 * screen. The check can take many seconds, and in that time the family can read a new label or
 * start over. A call for the old bike must never fill in the new bike's pedals.
 */
export async function callIfCurrent(
  run: () => Promise<{ call: PedalCall }>,
  isCurrent: () => boolean,
  onCall: (call: PedalCall) => void,
): Promise<PedalCall | null> {
  const result = await run();
  if (!isCurrent()) return null;
  onCall(result.call);
  return result.call;
}
