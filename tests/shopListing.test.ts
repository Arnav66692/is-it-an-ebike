import { describe, expect, it } from "vitest";
import { parseSpecText } from "@/lib/extract/parse";

// From a real San Diego shop listing (ebikesupershop.com, Freesky Alaska Pro M-520), read Oct 21, 2026.
const SHOP = "Motor 3000W peak brushless motor Torque 160 N·m Range 90–160 miles Top Speed (PAS) 40 MPH Pedal Assist 0–5 levels Throttle Thumb throttle eBike Weight 90 lbs Max Load 400 lbs Recommended Rider Height 5'6\" – 6'8\"";

describe("third-party shop listings", () => {
  it("reads the bike weight when a load limit with its own number follows it", () => {
    expect(parseSpecText("eBike Weight 90 lbs Max Load 400 lbs Recommended Rider Height 5'6\"", "listing").facts.weightLb).toBe(90);
    expect(parseSpecText(SHOP, "listing").facts.weightLb).toBe(90);
  });

  it("still skips a figure that a load word labels", () => {
    expect(parseSpecText("Rated for 300 lbs max load", "listing").facts.weightLb).toBeUndefined();
    expect(parseSpecText("Max Load 400 lbs", "listing").facts.weightLb).toBeUndefined();
    expect(parseSpecText("Weight capacity 330 lbs", "listing").facts.weightLb).toBeUndefined();
  });

  it("reads the speed, motor and throttle from the shop's spec table", () => {
    const f = parseSpecText(SHOP, "listing").facts;
    expect(f.peakWatts).toBe(3000);
    expect(f.assistMph).toBe(40);
    expect(f.hasThrottle).toBe(true);
  });
});
