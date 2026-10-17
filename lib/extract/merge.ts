// Turns what the parser read into engine facts. Only fields the text actually gave are set.

import { emptyFacts, type BikeFacts } from "@/lib/rules/types";
import type { Extraction } from "./parse";

export function factsFromExtraction(e: Extraction, base: BikeFacts = emptyFacts()): BikeFacts {
  const f = e.facts;
  return {
    ...base,
    hasPedals: f.hasPedals ?? base.hasPedals,
    classes: f.classes ?? base.classes,
    ratedWatts: f.ratedWatts ?? base.ratedWatts,
    peakWatts: f.peakWatts ?? base.peakWatts,
    wattsUpTo: f.wattsUpTo ?? base.wattsUpTo,
    hasThrottle: f.hasThrottle ?? base.hasThrottle,
    throttleMph: f.throttleMph ?? base.throttleMph,
    assistMph: f.assistMph ?? base.assistMph,
    topSpeedMph: f.topSpeedMph ?? base.topSpeedMph,
    switchable: f.switchable ?? base.switchable,
    hasFootPegs: f.hasFootPegs ?? base.hasFootPegs,
    wheelCount: f.wheelCount ?? base.wheelCount,
    wheelFrontIn: f.wheelFrontIn ?? base.wheelFrontIn,
    wheelRearIn: f.wheelRearIn ?? base.wheelRearIn,
    weightLb: f.weightLb ?? base.weightLb,
  };
}
