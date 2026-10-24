// The maker-page model list the Map's search adds (data/bikes/models.json). Each model needs its
// class and battery from the maker's own page, with a quote, and none repeats the checked catalog.

import { describe, expect, it } from "vitest";
import { BIKE_MODELS, modelFacts } from "@/lib/bikes/models";
import { CATALOG } from "@/lib/bikes/catalog";

describe("the maker-page model list", () => {
  it("has sound models: class, battery, a quote and an https maker page, with sane numbers", () => {
    expect(BIKE_MODELS.length).toBeGreaterThanOrEqual(100);
    const bad = BIKE_MODELS.filter(
      (m) =>
        m.classes.length === 0 ||
        !m.classes.every((c) => c === 1 || c === 2 || c === 3) ||
        !(m.battery_wh >= 150 && m.battery_wh <= 3000) ||
        (m.motor_rated_w !== null && !(m.motor_rated_w >= 100 && m.motor_rated_w <= 2000)) ||
        (m.weight_lb !== null && !(m.weight_lb >= 20 && m.weight_lb <= 150)) ||
        !/^https:\/\//.test(m.source_url) ||
        m.quote.trim().length < 10,
    );
    expect(bad.map((m) => m.id)).toEqual([]);
  });

  it("repeats no id or name, and no catalog bike", () => {
    const ids = BIKE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const catalogIds = new Set(CATALOG.map((b) => b.id));
    expect(ids.filter((id) => catalogIds.has(id))).toEqual([]);
  });

  it("turns a model into the facts its page states, and leaves the rest unknown", () => {
    const m = BIKE_MODELS[0];
    const f = modelFacts(m);
    expect(f.classes).toEqual(m.classes);
    expect(f.ratedWatts).toBe(m.motor_rated_w);
    expect(f.weightLb).toBe(m.weight_lb);
    expect(f.peakWatts).toBeNull();
  });
});
