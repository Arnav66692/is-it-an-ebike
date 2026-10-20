// Regression tests for the sixth review (Oct 19, 2026). Each block names the problem it closes.

import { describe, expect, it } from "vitest";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type TextSource } from "@/lib/extract/parse";
import { t } from "@/lib/i18n/ui";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, type BikeFacts, type PlaceId } from "@/lib/rules/types";

const DATE = "2026-10-20";

/** Text through the parser and the engine to the bottom line, with No and No to the fast-mode questions. */
function flow(text: string, state: string, age: number, places: PlaceId[] = [], over: Partial<BikeFacts> = {}, source: TextSource = "listing") {
  const extraction = parseSpecText(text, source);
  const facts: BikeFacts = { ...factsFromExtraction(extraction, emptyFacts()), motorOver20: false, assistOver28: false, ...over };
  const result = evaluate({ state, riderAge: age, rideDate: DATE, facts, places });
  return { extraction, facts, result, kind: bottomLine(result, DATE).kind };
}

describe("a number split by a space is never read from its last group", () => {
  it("an OCR '1 500W' motor is not read as 500 W, so a 1,500 W bike can't get a California YES", () => {
    const label = "CLASS 2 ELECTRIC BICYCLE\nMOTOR 1 500W\nTOP ASSISTED SPEED 20 MPH";
    const { extraction, kind } = flow(label, "CA", 14, ["city_of_san_diego"], { hasPedals: true }, "label");
    expect(extraction.facts.ratedWatts).toBeUndefined();
    expect(extraction.flags).toContain("number_split");
    expect(kind).not.toBe("yes");
  });

  it("a thousands space like '1 200 W' or a thin space is not read as 200 W", () => {
    for (const text of ["Class 1 e-bike. Pedal assist only, no throttle. Motor: 1 200 W. Max assist 20 mph. Pedals: aluminum platform.", "Motor 1 200 W", "Motor 1 200 W"]) {
      const e = parseSpecText(text, "listing");
      expect(e.facts.wattsUpTo, text).toBeUndefined();
      expect(e.facts.ratedWatts, text).toBeUndefined();
      expect(e.flags, text).toContain("number_split");
    }
    expect(flow("Class 1 e-bike. Pedal assist only, no throttle. Motor: 1 200 W. Max assist 20 mph. Pedals: aluminum platform.", "CA", 30, ["city_of_san_diego"]).kind).not.toBe("yes");
  });

  it("'2 8 MPH' is not read as 8 mph, so a 28 mph bike is never inferred as Class 1", () => {
    const { extraction, result, kind } = flow("Electric bicycle. No throttle. Pedals: alloy. Motor 500W rated. Max assist speed 2 8 MPH", "CA", 14, [], {}, "label");
    expect(extraction.facts.assistMph).toBeUndefined();
    expect(extraction.flags).toContain("number_split");
    expect(result.state.classes).not.toEqual([1]);
    expect(kind).not.toBe("yes");
  });

  it("'Weight: 1 20 lbs' is not read as 20 lb", () => {
    const e = parseSpecText("Weight: 1 20 lbs", "listing");
    expect(e.facts.weightLb).toBeUndefined();
    expect(e.flags).toContain("number_split");
  });

  it("still reads a figure after a class number, a separator or a word with digits in it", () => {
    expect(parseSpecText("CLASS 2 750W 20 MPH", "label").facts).toMatchObject({ classes: [2], ratedWatts: 750, topSpeedMph: 20 });
    expect(parseSpecText("CLASS 3 28 MPH 750 W", "label").facts).toMatchObject({ classes: [3], ratedWatts: 750, topSpeedMph: 28 });
    expect(parseSpecText("Class 1 & 2 500W", "listing").facts.wattsUpTo).toBe(500);
    expect(parseSpecText("Class I 500W", "label").facts.ratedWatts).toBe(500);
    expect(parseSpecText("CLASS 2 | 750W | 20 MPH", "label").facts.ratedWatts).toBe(750);
    expect(parseSpecText("IP65 500W motor", "listing").facts.wattsUpTo).toBe(500);
    expect(parseSpecText("2026 model, 750W motor", "listing").facts.wattsUpTo).toBe(750);
    for (const text of ["CLASS 2 750W 20 MPH", "IP65 500W motor"]) expect(parseSpecText(text, "listing").flags).not.toContain("number_split");
  });

  it("the flag tells the family in both languages", () => {
    expect(t("en", "flag_number_split")).toContain("1 500 W");
    expect(t("es", "flag_number_split")).toContain("1 500 W");
  });
});
