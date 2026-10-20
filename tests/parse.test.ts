// Parser tests. The sample strings are written for these tests in the style of real
// labels and listings. No store text is copied here.

import { describe, expect, it } from "vitest";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";

function allEvidenceGrounded(e: Extraction): boolean {
  return Object.values(e.evidence).every((list) => (list ?? []).every((ev) => e.text.includes(ev.text)));
}

describe("class labels (OCR text)", () => {
  it("reads a California-style label", () => {
    const e = parseSpecText("CLASS 2 ELECTRIC BICYCLE  TOP ASSISTED SPEED: 20 MPH  MOTOR WATTAGE: 750W", "label");
    expect(e.facts.classes).toEqual([2]);
    expect(e.facts.ratedWatts).toBe(750);
    expect(e.facts.assistMph).toBe(20);
    expect(allEvidenceGrounded(e)).toBe(true);
  });
  it("tolerates OCR mistakes like C1ass and Roman numerals", () => {
    expect(parseSpecText("C1ass 3 E-Bike | Max assisted speed 28 mph | 500 W", "label").facts.classes).toEqual([3]);
    expect(parseSpecText("CLASS II", "label").facts.classes).toEqual([2]);
    expect(parseSpecText("CIass 1", "label").facts.classes).toEqual([1]);
  });
  it("invents nothing from text with no label on it", () => {
    const e = parseSpecText("SUPER RIDER  urban series  matte black", "label");
    expect(e.facts).toEqual({});
  });
});

describe("listings", () => {
  it("keeps sustained and peak watts apart, and treats an unlabeled figure as a cap", () => {
    const e = parseSpecText(
      "Motor: 500W rear hub (864W peak). Class 2 with a half-twist throttle up to 20 mph. Pedal assist up to 20 mph.",
      "listing",
    );
    expect(e.facts.classes).toEqual([2]);
    expect(e.facts.wattsUpTo).toBe(500);
    expect(e.facts.ratedWatts).toBeUndefined();
    expect(e.facts.peakWatts).toBe(864);
    expect(e.facts.hasThrottle).toBe(true);
    expect(e.facts.throttleMph).toBe(20);
    expect(e.facts.assistMph).toBe(20);
    expect(e.facts.hasPedals).toBe(true);
  });
  it("reads rated watts when the listing says so", () => {
    expect(parseSpecText("750W nominal rear hub motor", "listing").facts.ratedWatts).toBe(750);
  });
  it("reads a throttle bike with a 28 mph top speed and no class", () => {
    const e = parseSpecText("1200W high power motor with a thumb throttle. Speed up to 28 mph on the road.", "listing");
    expect(e.facts.classes).toBeUndefined();
    expect(e.facts.hasThrottle).toBe(true);
    expect(e.facts.topSpeedMph).toBe(28);
    expect(e.facts.wattsUpTo).toBe(1200);
  });
  it("spots private-property speed modes, peak power and weight", () => {
    const e = parseSpecText(
      "Up to 8,000W peak power. With a private-property top speed of up to 60 mph, this 180 lb. machine is built for trails.",
      "listing",
    );
    expect(e.facts.peakWatts).toBe(8000);
    expect(e.facts.switchable).toBe(true);
    expect(e.facts.topSpeedMph).toBe(60);
    expect(e.facts.weightLb).toBe(180);
  });
  it("ignores payload and rider limits when looking for bike weight", () => {
    const e = parseSpecText("Payload: 350 lb. (275 lb. max rider). Class 2. Motor: 750W rear hub.", "listing");
    expect(e.facts.weightLb).toBeUndefined();
    expect(e.facts.classes).toEqual([2]);
    expect(e.facts.wattsUpTo).toBe(750);
  });
  it("marks pedal-less dirt bikes", () => {
    const e = parseSpecText("Electric dirt bike for kids with foot pegs and no pedals. 15 mph top speed.", "listing");
    expect(e.facts.hasPedals).toBe(false);
    expect(e.facts.hasFootPegs).toBe(true);
    expect(e.flags).toContain("sold_as_motorbike");
  });
  it("doesn't read a brake pedal as bicycle pedals", () => {
    expect(parseSpecText("Rear brake pedal and folding foot pegs.", "listing").facts.hasPedals).toBeUndefined();
  });
  it("doesn't read battery watt-hours as motor watts", () => {
    expect(parseSpecText("48V 720Wh battery, 17.5Ah", "listing").facts.wattsUpTo).toBeUndefined();
  });
  it("reads class lists and ranges", () => {
    expect(parseSpecText("Class 1-3 programmable", "listing").facts.classes).toEqual([1, 2, 3]);
    expect(parseSpecText("Ships as Class 2 or 3", "listing").facts.classes).toEqual([2, 3]);
    expect(parseSpecText("Classes 1, 2 & 3", "listing").facts.classes).toEqual([1, 2, 3]);
  });
  it("doesn't treat classic or class-leading as a class", () => {
    expect(parseSpecText("A classic look with class-leading range and world-class comfort.", "listing").facts.classes).toBeUndefined();
  });
  it("converts km/h, rounding up to a tenth", () => {
    expect(parseSpecText("pedal assist up to 25 km/h", "listing").facts.assistMph).toBe(15.6);
  });
  it("reads no-throttle wording", () => {
    const e = parseSpecText("No throttle, pedal assist only up to 28 mph.", "listing");
    expect(e.facts.hasThrottle).toBe(false);
    expect(e.facts.assistMph).toBe(28);
  });
  it("reads wheel sizes", () => {
    expect(parseSpecText("20 x 4.0 fat tires", "listing").facts.wheelFrontIn).toBe(20);
    expect(parseSpecText("rolls on 26-inch wheels", "listing").facts.wheelFrontIn).toBe(26);
    expect(parseSpecText("700c road wheels", "listing").facts.wheelFrontIn).toBe(28);
    expect(parseSpecText('16" tires front, 20" tires rear', "label").facts.wheelRearIn).toBe(16);
  });
  it("asks instead of guessing when a listing names different wheel sizes", () => {
    const e = parseSpecText('16" tires front, 20" tires rear', "listing");
    expect(e.facts.wheelFrontIn).toBeUndefined();
    expect(e.facts.wheelRearIn).toBeUndefined();
    expect(e.flags).toContain("wheel_sizes_differ");
  });
  it("every piece of evidence is a real substring of the input", () => {
    const e = parseSpecText(
      "Class 3, 28 mph pedal assist, 750W motor, 1100W peak, 27.5 x 2.4 tires, weighs 62 lbs, no throttle",
      "listing",
    );
    expect(allEvidenceGrounded(e)).toBe(true);
    expect(e.facts.weightLb).toBe(62);
  });
  it("keeps 'sustained' and 'peak' with their own numbers when they sit side by side", () => {
    const e = parseSpecText("Motor 36V, 500W (sustained), 864W (peak) Motor", "listing");
    expect(e.facts.ratedWatts).toBe(500);
    expect(e.facts.peakWatts).toBe(864);
  });
  it("doesn't read thread sizes or axles as wheel sizes", () => {
    const e = parseSpecText('standard 9/16" x 20 TPI threading, 15x100mm thru-axle, tire 20" x 3.3"', "listing");
    expect(e.facts.wheelFrontIn).toBe(20);
    expect(e.facts.wheelRearIn).toBe(20);
  });
  it("only trusts trike words near the top of a listing, where the product is described", () => {
    const menu = "Shop all bikes. " + "x".repeat(500) + " Cargo Family Tricycle Folding";
    expect(parseSpecText(menu, "listing").facts.wheelCount).toBeUndefined();
    expect(parseSpecText("Liberty Trike, a three-wheel e-bike", "listing").facts.wheelCount).toBe(3);
  });
  it("returns nothing for empty input", () => {
    expect(parseSpecText("   ", "listing").facts).toEqual({});
  });
});

describe("third review fixes (Oct 19, 2026)", () => {
  it("never reads pedals from text that says the bike has none", () => {
    for (const text of [
      "Electric dirt bike. Pedals: none. Class 2. 750W motor.",
      "This model does not have pedals. Class 2, 500W rated, 20 mph throttle.",
      "It doesn't have pedals.",
      "Foot pegs instead of pedals.",
      "Pedals: No",
    ]) {
      expect(parseSpecText(text, "listing").facts.hasPedals, text).toBe(false);
    }
    for (const text of [
      "Throttle only, no pedal assist. Class 2 e-bike, 500W rated motor, 20 mph throttle.",
      "Pedals: N/A",
      "Pedals not included.",
      "Pedals are sold separately.",
      "Pedals: Not included",
      "Pedals - sold separately",
    ]) {
      expect(parseSpecText(text, "listing").facts.hasPedals, text).toBeUndefined();
    }
    expect(parseSpecText("5 levels of pedal assist and a torque sensor", "listing").facts.hasPedals).toBe(true);
  });

  it("leaves the throttle blank when the text says both no throttle and thumb throttle", () => {
    for (const text of [
      "Pedal assist up to 20 mph. Use the thumb throttle, or ride with no throttle for a workout. 500W rated motor.",
      "Throttle: No throttle, Thumb throttle",
    ]) {
      const e = parseSpecText(text, "listing");
      expect(e.facts.hasThrottle, text).toBeUndefined();
      expect(e.flags, text).toContain("throttle_unclear");
      expect(allEvidenceGrounded(e)).toBe(true);
    }
    expect(parseSpecText("Throttle: none. Pedal assist to 20 mph.", "listing").facts.hasThrottle).toBe(false);
    expect(parseSpecText("Twist throttle to 20 mph.", "listing").facts.hasThrottle).toBe(true);
  });

  it("skips other products after a 'You may also like' heading", () => {
    const e = parseSpecText(
      "Class 2. Thumb throttle to 20 mph, pedal assist to 20 mph. Motor: 1500W peak. You may also like City Glide 500W commuter. Kids Mini 20 x 4.0",
      "listing",
    );
    expect(e.facts.peakWatts).toBe(1500);
    expect(e.facts.wattsUpTo).toBeUndefined();
    expect(e.facts.wheelFrontIn).toBeUndefined();
    expect(e.flags).toContain("other_products_skipped");
    expect(allEvidenceGrounded(e)).toBe(true);
    const kids = parseSpecText(
      "Kids e-bike. Class 1. 250W rated. Pedal assist to 20 mph, no throttle. 12 x 2.4 tires. You may also like: Fat tire e-bike 20 x 4.0",
      "listing",
    );
    expect(kids.facts.wheelFrontIn).toBe(12);
    expect(kids.facts.wheelRearIn).toBe(12);
    // Marketing copy that compares the bike with others is still about this bike.
    const compare = parseSpecText("Lighter than similar e-bikes. Class 1, 250W rated, pedal assist to 20 mph, no throttle.", "listing");
    expect(compare.facts.classes).toEqual([1]);
    expect(compare.flags).not.toContain("other_products_skipped");
  });

  it("reads tire widths with three decimals", () => {
    expect(parseSpecText("12 x 2.125 tires", "listing").facts.wheelFrontIn).toBe(12);
    expect(parseSpecText('20" x 2.125" tires', "listing").facts.wheelFrontIn).toBe(20);
  });

  it("rounds converted speeds and weights up, never down onto a limit", () => {
    expect(parseSpecText("Weight: 45.4 kg", "listing").facts.weightLb).toBe(100.1);
    expect(parseSpecText("Pedal assist up to 32.2 km/h", "listing").facts.assistMph).toBe(20.1);
    expect(parseSpecText("Pedal assist up to 45.1 km/h", "listing").facts.assistMph).toBe(28.1);
    expect(parseSpecText("Weight: 20 kg", "listing").facts.weightLb).toBe(44.1);
  });

  it("doesn't read warranty or bikeway wording as the bike's class", () => {
    expect(parseSpecText("World-class 2-year warranty. Pedal assist, 750W rated motor, no throttle.", "listing").facts.classes).toBeUndefined();
    expect(parseSpecText("First-class 1-year support.", "listing").facts.classes).toBeUndefined();
    expect(parseSpecText("Ride on Class 1 bike paths and Class II bike lanes.", "listing").facts.classes).toBeUndefined();
    expect(parseSpecText("Class 1 e-bike. Ride it on Class I bikeways.", "listing").facts.classes).toEqual([1]);
    expect(parseSpecText("Class 3 bikes are fast", "listing").facts.classes).toEqual([3]);
  });
});

describe("fourth review fixes (Oct 19, 2026)", () => {
  it("reads a three-digit speed whole, never from its last two digits", () => {
    expect(parseSpecText("Class 2 e-bike, top speed 120 km/h", "listing").facts.topSpeedMph).toBe(74.6);
    expect(parseSpecText("Class 2 e-bike, top speed 110 km/h", "listing").facts.topSpeedMph).toBe(68.4);
    expect(parseSpecText("Top speed: 105 km/h, Class 3", "listing").facts.topSpeedMph).toBe(65.3);
    expect(parseSpecText("Electric motorcycle, top speed 110 mph", "listing").facts.topSpeedMph).toBe(110);
    expect(parseSpecText("Pedal assist up to 25 km/h", "listing").facts.assistMph).toBe(15.6);
    expect(parseSpecText("Pedal assist to 20.5 mph", "listing").facts.assistMph).toBe(20.5);
  });
});

describe("fourth review fixes: a negated throttle after a speed", () => {
  it("doesn't read '20 mph, no throttle' as a throttle speed", () => {
    for (const text of [
      "Class 1 e-bike. 250W rated. Top speed 20 mph, no throttle. Pedals.",
      "Top speed 20 mph, without a throttle.",
      "Top speed 20 mph - throttle-free.",
      "Top speed 20 mph, throttle: none.",
    ]) {
      const e = parseSpecText(text, "listing");
      expect(e.facts.throttleMph, text).toBeUndefined();
      expect(e.facts.topSpeedMph, text).toBe(20);
      expect(e.facts.hasThrottle, text).toBe(false);
    }
    expect(parseSpecText("Up to 20 mph throttle only.", "listing").facts.throttleMph).toBe(20);
    expect(parseSpecText("No throttle. Pedal assist to 20 mph.", "listing").facts.assistMph).toBe(20);
  });
});

describe("fourth review fixes: pedals that may not be on the bike", () => {
  it("leaves the answer open for pedals sold separately, optional or not included, in any phrasing", () => {
    for (const text of [
      "Pedals (sold separately)",
      "Pedals: Optional",
      "Optional pedals",
      "Pedals - optional",
      "Pedals Included: No",
      "Includes pedals: No",
      "Pedals included? No",
    ]) {
      expect(parseSpecText(text, "listing").facts.hasPedals, text).toBeUndefined();
    }
  });
  it("reads a FAQ answer of no as no pedals", () => {
    for (const text of ["FAQ: Does it have pedals? No.", "Does this bike have pedals? No", "Pedals? No."]) {
      expect(parseSpecText(text, "listing").facts.hasPedals, text).toBe(false);
    }
  });
  it("still reads plain pedal mentions and a yes", () => {
    for (const text of ["Does it have pedals? Yes, with 7 speeds.", "Pedals: Yes", "Folding pedals", "Pedals (aluminum)", "Pedals included"]) {
      expect(parseSpecText(text, "listing").facts.hasPedals, text).toBe(true);
    }
  });
});

describe("fourth review fixes: the bike's own weight", () => {
  it("skips battery, motor, box and load weights", () => {
    const cases: [string, number | undefined][] = [
      ["Class 1 pedal assist, no throttle. Motor: 500W rated. Battery weight: 12 lbs. Tires: 20 x 4.0 front and rear. Bike weight: 108 lbs.", 108],
      ["Battery: 48V 20Ah, battery weight: 12 lbs. Bike weight: 108 lbs. Payload capacity: 400 lbs.", 108],
      ["Motor weight: 11 lbs. Weight: 62 lbs", 62],
      ["The battery weighs 12 lbs. This 62 lb. e-bike rolls.", 62],
      ["Shipping weight: 85 lbs. Net weight: 65 lbs.", 65],
      ["Removable battery pack weight: 14 lbs. Weight 70 lbs", 70],
      ["Max rider weight: 275 lbs", undefined],
      ["Weight: 62 lbs. Max load 300 lbs.", 62],
    ];
    for (const [text, lb] of cases) expect(parseSpecText(text, "listing").facts.weightLb, text).toBe(lb);
  });
  it("never uses a weight without the battery", () => {
    for (const text of ["Weight without battery: 95 lbs", "Weight: 95 lbs (without battery)"]) {
      expect(parseSpecText(text, "listing").facts.weightLb, text).toBeUndefined();
    }
  });
  it("reads one weight given in two units, but asks when the weights disagree", () => {
    expect(parseSpecText("Weight: 27 kg (60 lbs)", "listing").facts.weightLb).toBe(60);
    const two = parseSpecText("Weight: 62 lbs. Weight: 75 lbs.", "listing");
    expect(two.facts.weightLb).toBeUndefined();
    expect(two.flags).toContain("several_weights");
    expect(two.evidence.weightLb?.length).toBe(2);
    expect(allEvidenceGrounded(two)).toBe(true);
  });
});
