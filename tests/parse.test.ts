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
  it("converts km/h", () => {
    expect(parseSpecText("pedal assist up to 25 km/h", "listing").facts.assistMph).toBe(15.5);
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
    expect(parseSpecText('16" tires front, 20" tires rear', "listing").facts.wheelRearIn).toBe(16);
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
