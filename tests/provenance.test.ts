// Facts read from a link or photo keep a note of where they were read, so the facts card can show
// the words they came from. The note never holds the answer back: a read bike gets the same bottom
// line as the same bike typed in. Runs the pure pieces the checker uses.

import { describe, expect, it } from "vitest";
import { withWeight, withWheelSize } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText } from "@/lib/extract/parse";
import { editOn, emptyChecked, fromRead, hasValue, isAsRead, pedalCallOn, readCount, summaryFor, withPedalCall, type CheckedFacts } from "@/lib/provenance";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, READ_FIELDS, type BikeFacts, type PlaceId } from "@/lib/rules/types";
import { classBike } from "./helpers";

const DAY = "2026-10-19";

/** A listing for a plain Class 2 kids' e-bike, the kind a family pastes in. */
const CLASS_2_LISTING =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";

function read(text: string): CheckedFacts {
  return fromRead(factsFromExtraction(parseSpecText(text, "listing"), emptyFacts()));
}

function answer(state: string, age: number, facts: BikeFacts, places: PlaceId[]) {
  return bottomLine(evaluate({ state, riderAge: age, rideDate: DAY, facts, places }), DAY);
}

describe("where each fact came from", () => {
  it("notes every value a link gave as read from the text, and nothing it didn't give", () => {
    const bike = read(CLASS_2_LISTING);
    const noted = READ_FIELDS.filter((f) => bike.checks[f] !== undefined);
    expect(noted).toEqual(["hasPedals", "classes", "ratedWatts", "hasThrottle", "throttleMph", "assistMph", "wheelSize", "weightLb"]);
    for (const field of READ_FIELDS) {
      expect(bike.checks[field] !== undefined, field).toBe(hasValue(bike.facts, field));
      if (bike.checks[field]) expect(bike.checks[field]).toEqual({ source: "text", asRead: bike.facts });
    }
    expect(readCount(bike.checks)).toBe(8);
  });

  it("counts a wheel size from either wheel, and a class only when one is given", () => {
    expect(readCount(fromRead({ ...emptyFacts(), wheelRearIn: 16 }).checks)).toBe(1);
    expect(readCount(fromRead({ ...emptyFacts(), classes: [] }).checks)).toBe(0);
    // Follow-up answers are the family's own, never read.
    expect(readCount(fromRead({ ...emptyFacts(), motorOver20: false, assistOver28: false, weightOver100: false, needsPedalKit: false }).checks)).toBe(0);
  });

  it("starts with no notes, so typed facts have none", () => {
    expect(emptyChecked().checks).toEqual({});
    const typed = editOn(emptyChecked().facts, classBike(2))(emptyChecked());
    expect(typed.checks).toEqual({});
    expect(readCount(typed.checks)).toBe(0);
  });

  it("knows whether a read fact still holds the value read, wheel by wheel for the wheel size", () => {
    const bike = read(CLASS_2_LISTING);
    const weight = bike.checks.weightLb;
    const wheels = bike.checks.wheelSize;
    if (!weight || !wheels) throw new Error("the listing gives a weight and a wheel size");
    expect(isAsRead(weight, "weightLb", bike.facts)).toBe(true);
    expect(isAsRead(weight, "weightLb", withWeight(bike.facts, 64))).toBe(false);
    expect(isAsRead(wheels, "wheelSize", { ...bike.facts, wheelFrontIn: 24 })).toBe(true);
    expect(isAsRead(wheels, "wheelSize", withWheelSize(bike.facts, 24, true))).toBe(false);
  });

  it("keeps the notes through an edit, so the card still shows the words a fact was read from", () => {
    const bike = read(CLASS_2_LISTING);
    const edited = editOn(bike.facts, { ...bike.facts, ratedWatts: 750 })(bike);
    expect(edited.facts.ratedWatts).toBe(750);
    expect(edited.checks).toBe(bike.checks);
  });

  it("drops an edit made on facts that are gone, like the last bike's card after a new link is read", () => {
    const old = read(CLASS_2_LISTING);
    const next = read(`${CLASS_2_LISTING} Foot pegs: No.`);
    expect(editOn(old.facts, { ...old.facts, weightLb: 70 })(next)).toBe(next);
  });
});

describe("the pedal photo check", () => {
  it("fills an empty pedals answer as read by the photo", () => {
    const typed = editOn(emptyChecked().facts, { ...classBike(2), hasPedals: null })(emptyChecked());
    const called = withPedalCall(typed, "pedals");
    expect(called.facts.hasPedals).toBe(true);
    expect(called.checks.hasPedals?.source).toBe("photo");
    // It changes only the pedals answer.
    expect({ ...called.facts, hasPedals: null }).toEqual(typed.facts);
  });

  it("keeps an answer the photo agrees with as it was, and a close call changes nothing", () => {
    const bike = read(CLASS_2_LISTING);
    expect(withPedalCall(bike, "pedals")).toBe(bike);
    expect(withPedalCall(bike, "ask")).toBe(bike);
  });

  it("drops a call for a bike that is no longer on screen", () => {
    const old = read(CLASS_2_LISTING);
    const next = read(`${CLASS_2_LISTING} Foot pegs: No.`);
    expect(pedalCallOn(old.facts, "no_pedals")(next)).toBe(next);
    expect(pedalCallOn(next.facts, "no_pedals")(next).facts.hasPedals).toBe(false);
  });
});

describe("read facts and the bottom line", () => {
  it("gives a read bike the same answer as the same bike typed in", () => {
    let bike = read(CLASS_2_LISTING);
    // The family answers the fast-mode follow-up. Those answers are theirs, not read.
    bike = editOn(bike.facts, { ...bike.facts, motorOver20: false, assistOver28: false })(bike);
    const result = evaluate({ state: "CA", riderAge: 11, rideDate: DAY, facts: bike.facts, places: ["encinitas"] });
    const line = summaryFor(result, DAY);
    expect(line?.kind).toBe("yes");
    expect(line?.requirements.map((l) => l.code)).toContain("req_helmet_under");
    expect(line).toEqual(answer("CA", 11, { ...bike.facts }, ["encinitas"]));
  });

  it("names no read facts anywhere on the bottom line", () => {
    const bike = read(CLASS_2_LISTING);
    const line = answer("CA", 11, bike.facts, ["encinitas"]);
    expect(line.missing.every((m) => m.where.length > 0)).toBe(true);
    expect(JSON.stringify(line)).not.toMatch(/unconfirmed_facts|unchecked_facts|factsNote/);
  });

  it("keeps a NO, not allowed for a rule that says no", () => {
    const bike = read(CLASS_2_LISTING);
    const line = answer("CA", 11, bike.facts, ["city_of_san_diego"]);
    expect(line.kind).toBe("no_illegal");
    expect(line.blocked[0].line.code).toBe("local_under_12");
  });

  it("is null before there is a result", () => {
    expect(summaryFor(null, DAY)).toBeNull();
  });
});
