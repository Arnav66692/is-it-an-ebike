// Regression tests for the review of the school districts, the mods check and the bike finder.

import { describe, expect, it } from "vitest";
import { catalogBike } from "@/lib/bikes/catalog";
import type { CatalogBike } from "@/lib/bikes/facts";
import { finderLine } from "@/lib/bikes/finder";
import { bottomLine, evaluate } from "@/lib/rules";
import { emptyFacts } from "@/lib/rules/types";

const TODAY = "2026-10-21";

function bike(id: string): CatalogBike {
  const found = catalogBike(id);
  if (!found) throw new Error(`no bike ${id}`);
  return found;
}

describe("a Class 3 mode next to a throttle", () => {
  it("is never YES in the finder when the page doesn't say the throttle turns off in Class 3", () => {
    for (const id of ["ride1up-portola-02", "rad-radster-trail"]) {
      for (const age of [16, 17, 18, 30]) {
        const line = finderLine(bike(id), { age, state: "CA", places: [], otherPlaces: false, rideDate: TODAY });
        expect(line.kind, `${id} ${age}`).not.toBe("yes");
      }
    }
  });

  it("is not confirmed by the engine for a Class 2 and 3 label with a 20 mph throttle", () => {
    const facts = { ...emptyFacts(), hasPedals: true, classes: [1, 2, 3] as (1 | 2 | 3)[], ratedWatts: 750, hasThrottle: true, throttleMph: 20, assistMph: 28, motorOver20: false, assistOver28: false };
    const result = evaluate({ state: "CA", riderAge: 30, rideDate: TODAY, facts, places: [], otherPlaces: false });
    expect(result.state.status).toBe("cant_confirm");
    expect(result.state.reason.code).toBe("class3_throttle_unclear");
    expect(bottomLine(result, TODAY).kind).not.toBe("yes");
  });
});
