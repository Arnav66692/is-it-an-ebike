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

describe("a list of other products in the middle of a page never hides this bike's own spec table", () => {
  const top = "Acme Commuter Class 1 Electric Bike. About this item. 500W motor with pedal assist only, no throttle. Max assist speed 20 mph. Alloy platform pedals.";
  const carousel = "Frequently bought together. This item: Acme Commuter. Acme Bike Lock. Acme Helmet.";
  const specs = "Product information. Wattage: 1000 watts. Thumb throttle: yes. Maximum speed: 28 mph.";

  it("reads the spec table after 'Frequently bought together', so its throttle and 1000 W block a YES", () => {
    const { extraction, kind } = flow(`${top}\n${carousel}\n${specs}`, "CA", 14, ["carlsbad"]);
    expect(extraction.flags).toContain("other_products_skipped");
    expect(extraction.flags).toContain("throttle_unclear");
    expect(extraction.facts.wattsUpTo).toBe(1000);
    expect(extraction.facts.topSpeedMph).toBe(28);
    expect(kind).toBe("no_unconfirmed");
    expect(Object.values(extraction.evidence).every((list) => (list ?? []).every((ev) => extraction.text.includes(ev.text)))).toBe(true);
  });

  it("gives the same facts as the page without the carousel", () => {
    expect(flow(`${top}\n${carousel}\n${specs}`, "CA", 14).facts).toEqual(flow(`${top}\n${specs}`, "CA", 14).facts);
  });

  it("still skips the other products themselves, up to the next heading for this bike", () => {
    const e = parseSpecText(`${top} ${carousel} Zoom Cruiser 1000W thumb throttle 28 mph. Specifications: Wheels 20 x 4.0`, "listing");
    expect(e.facts.wattsUpTo).toBe(500);
    expect(e.facts.hasThrottle).toBe(false);
    expect(e.facts.topSpeedMph).toBeUndefined();
    expect(e.facts.wheelFrontIn).toBe(20);
    const tail = parseSpecText(`${top} Customers who viewed this item also viewed Zoom 1000W thumb throttle`, "listing");
    expect(tail.facts.wattsUpTo).toBe(500);
    expect(tail.facts.hasThrottle).toBe(false);
  });

  it("the flag no longer says everything after the heading was skipped", () => {
    expect(t("en", "flag_other_products_skipped")).toContain("Reading starts again");
    expect(t("es", "flag_other_products_skipped")).toContain("La lectura sigue");
  });
});

describe("pedals that are gone, broken, add-on or not shipped are left to the family", () => {
  const base = "Class 2 e-bike. 750W rated motor. Thumb throttle up to 20 mph. ";

  it("reads 'n't' wordings, with a straight or curly apostrophe, as doubt, never as working pedals", () => {
    for (const tail of ["Doesn't come with pedals.", "Doesn't include pedals.", "Didn't come with pedals.", "Doesn’t come with pedals.", "It isn't sold with pedals.", "Pedals aren't included."]) {
      const { facts, extraction, kind } = flow(base + tail, "CA", 30, ["encinitas"]);
      expect(facts.hasPedals, tail).toBeNull();
      expect(extraction.flags, tail).toContain("pedals_unclear");
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });

  it("reads add-on, sold-separately, missing, removed and broken wordings as doubt", () => {
    const tails = [
      "Pedals can be installed.", "Pedals can be added.", "Can I add pedals? Yes.", "Pedals sold as an accessory.", "Pedals purchased separately.",
      "Pedals sold as an add on.", "Pedals not provided.", "Pedals are not provided.", "Pedals are missing.", "Missing pedals.", "Pedals missing.",
      "Took the pedals off.", "Pedals off.", "Pedals deleted for a cleaner look.", "No longer has pedals.", "Pedals not on this model.", "Pedals broken.",
    ];
    for (const tail of tails) {
      const { facts, kind } = flow(base + tail, "CA", 30, ["encinitas"]);
      expect(facts.hasPedals, tail).toBeNull();
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });

  it("'ships without pedals' is about the box, so it is left to the family, not a definite no", () => {
    for (const tail of ["Comes without pedals.", "Ships without pedals.", "Sold without pedals.", "Arrives without pedals.", "Shipped without pedals, crank arms installed.", "Comes with no pedals."]) {
      const { facts, result, kind } = flow(base + tail, "CA", 30, ["encinitas"]);
      expect(facts.hasPedals, tail).toBeNull();
      expect(result.state.status, tail).toBe("cant_confirm");
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });

  it("still reads clear text the same way", () => {
    expect(flow(`${base}No pedals.`, "CA", 30).facts.hasPedals).toBe(false);
    expect(flow(`${base}Doesn't have pedals.`, "CA", 30).facts.hasPedals).toBe(false);
    expect(flow(`${base}Ride without pedals, it's an e-moto.`, "CA", 30).facts.hasPedals).toBe(false);
    expect(flow(`${base}Alloy platform pedals.`, "CA", 30).kind).toBe("yes");
    expect(flow(`${base}Turn pedal assist off to use the throttle. Alloy pedals.`, "CA", 30).facts.hasPedals).toBe(true);
    expect(flow(`${base}Install the pedals and handlebar, then ride. Alloy pedals.`, "CA", 30).facts.hasPedals).toBe(true);
  });
});
