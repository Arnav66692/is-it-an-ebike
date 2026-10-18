// The whole-bike pedal rule from photo pilot v3, read straight from the frozen pilot/v3/method.json so
// the app and the tested scorer share one definition. It passed its preregistered test (12 of 12
// no-pedal machines, 23 of 24 overall), so the app may use it, but only to fill the "pedals" fact.
// It never gives a verdict.

import method from "@/pilot/v3/method.json";
import type { BikeFacts } from "@/lib/rules/types";

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
