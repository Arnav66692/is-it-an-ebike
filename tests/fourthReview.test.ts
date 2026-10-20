// End-to-end cases from the fourth review (Oct 19, 2026): listing text, through the parser and
// the engine, to the bottom line. The family's only answer is No and No to the fast-mode questions.

import { describe, expect, it } from "vitest";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText } from "@/lib/extract/parse";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, type BikeFacts, type PlaceId } from "@/lib/rules/types";

const DATE = "2026-10-20";

function flow(text: string, state: string, age: number, over: Partial<BikeFacts> = {}, places: PlaceId[] = []) {
  const extraction = parseSpecText(text, "listing");
  const facts: BikeFacts = { ...factsFromExtraction(extraction, emptyFacts()), motorOver20: false, assistOver28: false, ...over };
  const result = evaluate({ state, riderAge: age, rideDate: DATE, facts, places });
  return { extraction, facts, result, kind: bottomLine(result, DATE).kind };
}

describe("speeds", () => {
  it("a 120 km/h e-moto stays blocked, since its speed is read whole", () => {
    const { facts, result, kind } = flow("Class 2 e-bike with pedals, 500W rated, throttle. Top speed 120 km/h.", "CA", 30);
    expect(facts.topSpeedMph).toBe(74.6);
    expect(result.state.status).toBe("cant_confirm");
    expect(result.state.reason).toMatchObject({ code: "fits_no_class_speed", params: { mph: 74.6 } });
    expect(kind).toBe("no_unconfirmed");
  });
});
