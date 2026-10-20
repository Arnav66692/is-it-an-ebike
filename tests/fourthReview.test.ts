// End-to-end cases from the fourth review (Oct 19, 2026): listing text, through the parser and
// the engine, to the bottom line. The family's only answer is No and No to the fast-mode questions.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactsCard } from "@/components/FactsCard";
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

describe("a negated throttle after a speed", () => {
  it("'Top speed 20 mph, no throttle' is a plain Class 1 yes, not facts that disagree", () => {
    const { facts, result, kind } = flow("Class 1 e-bike. 250W rated. Top speed 20 mph, no throttle. Pedals.", "CA", 30, {}, ["encinitas"]);
    expect(facts.throttleMph).toBeNull();
    expect(facts.hasThrottle).toBe(false);
    expect(result.state.status).toBe("yes");
    expect(kind).toBe("yes");
  });

  it("a throttle speed in the facts stays on the card even when the throttle answer is no", () => {
    const html = renderToStaticMarkup(
      createElement(FactsCard, {
        lang: "en",
        facts: { ...emptyFacts(), hasPedals: true, classes: [1], hasThrottle: false, throttleMph: 20 },
        evidence: {},
        flags: [],
        onChange: () => undefined,
        onCheck: () => undefined,
      }),
    );
    expect(html).toContain("Throttle top speed (mph)");
    expect(html).toContain('value="20"');
  });
});

describe("pedals in a FAQ or an options list", () => {
  const base = "Class 2 electric bike. 500W rated motor. Thumb throttle up to 20 mph. 20 x 4.0 tires.";
  it("'Does it have pedals? No.' is a no-pedal machine, never a YES", () => {
    const { facts, result, kind } = flow(`${base} FAQ: Does it have pedals? No.`, "CA", 14, {}, ["encinitas"]);
    expect(facts.hasPedals).toBe(false);
    expect(result.state.status).toBe("not_ebike");
    expect(kind).toBe("no_illegal");
  });
  it("'Pedals Included: No' and 'Pedals (sold separately)' leave pedals to the family, so no YES yet", () => {
    for (const tail of ["Pedals Included: No", "Includes pedals: No", "Pedals (sold separately)", "Pedals: Optional"]) {
      const { facts, result, kind } = flow(`${base} ${tail}`, "CA", 14, {}, ["encinitas"]);
      expect(facts.hasPedals, tail).toBeNull();
      expect(result.state.status, tail).toBe("cant_confirm");
      expect(result.state.reason.code, tail).toBe("pedals_unknown");
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });
});

describe("weights", () => {
  it("a 108 lb cargo bike in Pennsylvania is over the 100 lb line, not 12 lb from its battery", () => {
    const { facts, result, kind } = flow(
      "Hauler Cargo E-Bike. Class 1 pedal assist, no throttle. Motor: 500W rated. Battery: 48V 20Ah, battery weight: 12 lbs. Tires: 20 x 4.0 front and rear. Bike weight: 108 lbs. Payload capacity: 400 lbs.",
      "PA",
      30,
    );
    expect(facts.weightLb).toBe(108);
    expect(result.state.status).toBe("not_ebike");
    expect(result.state.reason.code).toBe("caution_weight");
    expect(kind).toBe("no_illegal");
  });
  it("two different weights leave the weight to the family in Pennsylvania", () => {
    const { result, kind } = flow("Class 1 pedal assist, no throttle. 500W rated. Pedals. 20 x 4.0 tires. Weight: 62 lbs. Weight: 108 lbs.", "PA", 30);
    expect(result.state.status).toBe("need_info");
    expect(result.state.questions).toContain("weight");
    expect(kind).not.toBe("yes");
  });
});
