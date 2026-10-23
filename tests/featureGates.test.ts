// Every gate for the school districts, the mods check and the bike finder is 0, the same counts
// RESULTS.md shows.

import { describe, expect, it } from "vitest";
import { districtGates, finderGates, modGates, modRideGates, routeGates } from "./featureGates";

describe("feature gates", () => {
  it("maps only SDUHSD among 19,430 districts to a checked record", () => {
    expect(districtGates()).toEqual({ districts: 19430, sduhsd_mapped: true, other_checked: 0 });
  });

  it("never says YES for a mod beyond what the source says, and shows only the data's words", () => {
    const g = modGates();
    expect(g.yes).toBeGreaterThan(0);
    expect(g.claims).toBeGreaterThan(1000);
    expect([g.yes_beyond_source, g.yes_unanswered, g.claims_not_in_data]).toEqual([0, 0, 0]);
  }, 60_000);

  it("never says YES for a mod in any state unless the engine says YES for the bike after it, and keeps California's answers", () => {
    const g = modRideGates();
    expect(g.states).toBe(51);
    expect(g.rides).toBeGreaterThan(50_000);
    expect(g.yes).toBeGreaterThan(0);
    expect([g.yes_engine_not_yes, g.yes_unsettled, g.ca_changed, g.ca_digest_changed]).toEqual([0, 0, 0, 0]);
  }, 240_000);

  it("never says YES for a catalog bike where the engine would refuse, or without stated pedals", () => {
    const g = finderGates();
    expect(g.rides).toBeGreaterThan(50_000);
    expect(g.yes).toBeGreaterThan(0);
    expect([g.yes_engine_refuses, g.yes_without_pedals]).toEqual([0, 0]);
  }, 240_000);

  it("never counts a route piece toward a YES that the rule files block, or says YES where the engine doesn't", () => {
    const g = routeGates();
    expect(g.pieces).toBeGreaterThan(2_000);
    expect(g.pieces_yes).toBeGreaterThan(0);
    expect(g.routes_yes).toBeGreaterThan(0);
    expect([g.piece_yes_rules_block, g.route_yes_engine_not_yes]).toEqual([0, 0]);
  }, 240_000);
});
