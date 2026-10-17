import { evaluate } from "@/lib/rules";
import { emptyFacts, type BikeFacts, type ClassNum, type EngineResult, type PlaceId } from "@/lib/rules/types";

export const TODAY = "2026-10-17";

/** A plain, fully described bike of one class. Override any fact to make a test case. */
export function classBike(cls: ClassNum, over: Partial<BikeFacts> = {}): BikeFacts {
  return {
    ...emptyFacts(),
    hasPedals: true,
    classes: [cls],
    ratedWatts: 500,
    hasThrottle: cls === 2,
    throttleMph: cls === 2 ? 20 : null,
    assistMph: cls === 3 ? 28 : 20,
    motorOver20: false,
    assistOver28: false,
    switchable: false,
    wheelCount: 2,
    wheelFrontIn: 20,
    wheelRearIn: 20,
    weightLb: 60,
    weightOver100: false,
    hasFootPegs: false,
    needsPedalKit: false,
    ...over,
  };
}

export function run(
  state: string,
  age: number,
  facts: BikeFacts,
  date: string = TODAY,
  places: PlaceId[] = [],
): EngineResult {
  return evaluate({ state, riderAge: age, rideDate: date, facts, places });
}

export function codes(lines: { code: string }[]): string[] {
  return lines.map((l) => l.code);
}
