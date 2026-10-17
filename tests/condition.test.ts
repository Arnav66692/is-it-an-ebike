import { describe, expect, it } from "vitest";
import { compare, evaluateCondition, exactly, parseCondition, unknownFields, ANY, type Env } from "@/lib/rules/condition";
import { STATES } from "@/lib/rules/compile";
import overlay from "@/data/overlay.json";

function env(values: Partial<Record<string, number | boolean | null>>): Env {
  const out: Env = {};
  const numeric = [
    "max_wheel_diameter_in",
    "min_wheel_diameter_in",
    "wheel_count",
    "throttle_max_mph",
    "motor_only_max_mph",
    "bike_weight_lb",
    "label_watts",
  ];
  for (const field of numeric) {
    const v = values[field];
    out[field] = { kind: "num", iv: typeof v === "number" ? exactly(v) : ANY };
  }
  for (const field of ["switchable_out_of_class", "has_foot_pegs", "needs_pedal_kit"]) {
    const v = values[field];
    out[field] = { kind: "bool", v: typeof v === "boolean" ? v : null };
  }
  return out;
}

describe("condition parser", () => {
  it("parses every condition in the verified table and the overlay", () => {
    const all = [
      ...Object.values(STATES).flatMap((s) => s.verdict_cautions.map((c) => c.condition)),
      ...overlay.supplemental_cautions.map((c) => c.condition),
    ].filter((c): c is string => c !== null);
    expect(all.length).toBeGreaterThan(15);
    for (const c of all) expect(() => parseCondition(c)).not.toThrow();
  });

  it("rejects fields the engine does not know", () => {
    expect(() => parseCondition("seat_height_in > 26")).toThrow(/Unknown/);
    expect(() => parseCondition("mystery_flag")).toThrow(/Unknown/);
  });

  it("evaluates and, or and parentheses", () => {
    const node = parseCondition(
      "(wheel_count == 2 and max_wheel_diameter_in < 16) or (wheel_count == 3 and max_wheel_diameter_in < 20)",
    );
    expect(evaluateCondition(node, env({ wheel_count: 2, max_wheel_diameter_in: 14 }))).toBe(true);
    expect(evaluateCondition(node, env({ wheel_count: 2, max_wheel_diameter_in: 16 }))).toBe(false);
    expect(evaluateCondition(node, env({ wheel_count: 3, max_wheel_diameter_in: 18 }))).toBe(true);
    expect(evaluateCondition(node, env({ wheel_count: 3, max_wheel_diameter_in: 20 }))).toBe(false);
  });

  it("returns null when a needed fact is unknown, and names the missing fields", () => {
    const node = parseCondition("throttle_max_mph > 20 or switchable_out_of_class");
    const e = env({});
    expect(evaluateCondition(node, e)).toBeNull();
    expect(unknownFields(node, e).sort()).toEqual(["switchable_out_of_class", "throttle_max_mph"]);
    expect(evaluateCondition(node, env({ switchable_out_of_class: true }))).toBe(true);
  });

  it("settles comparisons from partly known intervals", () => {
    const atLeast20 = { lo: 20, loOpen: false, hi: Infinity, hiOpen: true };
    expect(compare(atLeast20, "<=", 14)).toBe(false);
    expect(compare(atLeast20, ">", 20)).toBeNull();
    const over20 = { lo: 20, loOpen: true, hi: Infinity, hiOpen: true };
    expect(compare(over20, ">", 20)).toBe(true);
    const upTo20 = { lo: 0, loOpen: false, hi: 20, hiOpen: false };
    expect(compare(upTo20, ">", 20)).toBe(false);
    expect(compare(exactly(750), "<", 750)).toBe(false);
    expect(compare(exactly(750), "<=", 750)).toBe(true);
    expect(compare(exactly(750), ">=", 746)).toBe(true);
  });
});
