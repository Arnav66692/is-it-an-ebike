// The legal route check (lib/route/legal.ts) on routes built by hand, with small rule sets shaped
// like data/rules/route/. The rider and bike go through the real rules engine, so a route's
// answer for the rider always matches the checker. A generated gate at the end compares every
// piece against an independent oracle that shares no code with the check.

import { describe, expect, it } from "vitest";
import { checkPiece, checkRoute, recordFor, stateStatus, type RouteRider } from "@/lib/route/legal";
import { LEGAL_KINDS, localRuleProblems, stateRuleProblems, type LegalKind, type LocalWayRules, type RouteRules, type StateKindRule, type StateWayRules, type WayStatus } from "@/lib/route/rules";
import type { RoutePlan, RouteSegment, WayKind } from "@/lib/route/types";
import { emptyFacts, type BikeFacts, type ClassNum } from "@/lib/rules";

const allowed = (localMayRestrict = false): StateKindRule => ({ "1": "allowed", "2": "allowed", "3": "allowed", localMayRestrict, localMayAllow: false, basis: "basis", field: "where_allowed.roads" });

function stateRules(over: Partial<Record<LegalKind, StateKindRule>> = {}): StateWayRules {
  const kinds = Object.fromEntries(LEGAL_KINDS.map((k) => [k, allowed(k !== "road")])) as Record<LegalKind, StateKindRule>;
  return { citation: "Test Code 1", source_url: "https://example.org/state", kinds: { ...kinds, ...over } };
}

const rule = (status: WayStatus, where: "everywhere" | "business_district" = "everywhere", classes: ClassNum[] = [1, 2, 3]) => ({
  classes,
  status,
  where,
  rule: `test_${status}_${where}`,
  citation: "City Code 2",
  source_url: "https://example.org/city",
  quote: "No person shall ride a bicycle on a sidewalk within a business district.",
  from: "record" as const,
  checked: "2026-10-23",
});

const noRule = { read: "the whole bicycle chapter", source_url: "https://example.org/city", checked: "2026-10-23" };

const SD_CITY: LocalWayRules = {
  kinds: { sidewalk: [rule("banned", "business_district")] },
  noRuleFound: { road: noRule, bike_lane: noRule, separated_bikeway: noRule, bike_path: noRule, footway: noRule },
  notChecked: ["trail"],
  facilities: [
    { id: "ocean_front_walk", names: ["Ocean Front Walk"], classes: [1, 2, 3], status: "banned", extent: "Mission Beach", rule: "boardwalk", citation: "SDMC 84.18", source_url: "https://example.org/sdmc", quote: "It is unlawful", from: "record", checked: "2026-10-23" },
  ],
};

const RULES: RouteRules = {
  states: {
    CA: stateRules(),
    TX: stateRules({ bike_path: { "1": "allowed", "2": "allowed", "3": "banned", localMayRestrict: true, localMayAllow: true, basis: "no Class 3 on paths", field: "where_allowed.class3_restrictions" } }),
  },
  local: { city_of_san_diego: SD_CITY },
};

/** A rider and bike the engine answers YES for in the City of San Diego and Texas. */
const FACTS: BikeFacts = {
  ...emptyFacts(),
  hasPedals: true,
  classes: [1],
  ratedWatts: 500,
  hasThrottle: false,
  assistMph: 20,
  topSpeedMph: 20,
  switchable: false,
  motorOver20: false,
  assistOver28: false,
  wheelCount: 2,
  wheelFrontIn: 26,
  wheelRearIn: 26,
  weightLb: 60,
  weightOver100: false,
  hasFootPegs: false,
  needsPedalKit: false,
};
const ADULT: RouteRider = { riderAge: 30, rideDate: "2026-10-23", facts: FACTS, sduhsdCampus: false };

const SD = { state: "CA", countyGeoid: "06073", placeGeoid: "0666000", placeName: "San Diego" };
const AUSTIN = { state: "TX", countyGeoid: "48453", placeGeoid: "4805000", placeName: "Austin" };

function seg(kind: WayKind, where: Pick<RouteSegment, "state" | "countyGeoid" | "placeGeoid" | "placeName"> = SD, extra: Partial<RouteSegment> = {}): RouteSegment {
  return { from: 0, to: 1, meters: 100, kind, name: null, wayId: null, tags: {}, ...where, ...extra };
}

function plan(segments: RouteSegment[], crossed: RoutePlan["crossed"] = []): RoutePlan {
  const points = segments.flatMap((_, i) => [{ lat: 32.9 + i * 0.001, lon: -117.2 }, { lat: 32.9005 + i * 0.001, lon: -117.2 }]);
  const placed = segments.map((s, i) => ({ ...s, from: i * 2, to: i * 2 + 1 }));
  return { points, meters: placed.length * 100, seconds: 60, climbMeters: null, segments: placed, crossed, atEnd: [], sources: { router: "test", boundaries: "test", tags: "test", read: "2026-10-23" } };
}

describe("one piece of a route", () => {
  it("finds the checked record by Census GEOID: a city, or the county outside every city", () => {
    expect(recordFor(seg("road"))).toBe("city_of_san_diego");
    expect(recordFor(seg("road", { ...SD, placeGeoid: null, placeName: null }))).toBe("unincorporated_san_diego_county");
    expect(recordFor(seg("road", AUSTIN))).toBeNull();
    expect(recordFor(seg("road", { ...SD, countyGeoid: "06059" }))).toBeNull();
  });

  it("reads a state rule for the bike's classes, and an unknown class only when every class agrees", () => {
    const split: StateKindRule = { ...allowed(), "3": "banned" };
    expect(stateStatus(split, [1])).toBe("allowed");
    expect(stateStatus(split, [1, 3])).toBe("banned");
    expect(stateStatus(split, [])).toBe("unclear");
    expect(stateStatus(allowed(), [])).toBe("allowed");
  });

  it("can't confirm a sidewalk where the city bans riding in business districts, and names the code", () => {
    const p = checkPiece(seg("sidewalk"), 0, [1], RULES);
    expect(p.status).toBe("unclear");
    expect(p.reasons[0]).toMatchObject({ code: "local_banned_somewhere", citation: "City Code 2", where: "business_district" });
  });

  it("bans a named boardwalk, a posted no-bikes sign and a posted no-e-bikes sign", () => {
    expect(checkPiece(seg("footway", SD, { name: "Ocean Front Walk" }), 0, [1], RULES)).toMatchObject({ status: "banned", reasons: [{ code: "facility_banned", citation: "SDMC 84.18" }] });
    expect(checkPiece(seg("bike_path", SD, { tags: { bicycle: "no" } }), 0, [1], RULES).status).toBe("banned");
    expect(checkPiece(seg("road", SD, { tags: { electricBicycle: "no" } }), 0, [1], RULES).reasons[0].code).toBe("posted_no_ebikes");
    expect(checkPiece(seg("road", SD, { tags: { bicycle: "dismount" } }), 0, [1], RULES).reasons[0].code).toBe("posted_dismount");
  });

  it("lets state law decide where the city's code was read and holds no rule", () => {
    expect(checkPiece(seg("bike_path"), 0, [3], RULES).status).toBe("allowed");
  });

  it("can't confirm a kind of way whose local rules weren't read where state law lets the city restrict it", () => {
    expect(checkPiece(seg("trail"), 0, [1], RULES)).toMatchObject({ status: "unclear", reasons: [{ code: "local_not_checked" }] });
  });

  it("names an unchecked city instead of calling its sidewalk allowed or banned", () => {
    expect(checkPiece(seg("sidewalk", AUSTIN), 0, [1], RULES)).toMatchObject({ status: "unchecked", reasons: [{ code: "place_not_checked", by: "Austin" }] });
    expect(checkPiece(seg("road", AUSTIN), 0, [1], RULES).status).toBe("allowed");
  });

  it("keeps a state ban an unchecked city could lift, and treats a crossing as street and a ferry as not ridden", () => {
    expect(checkPiece(seg("bike_path", AUSTIN), 0, [3], RULES)).toMatchObject({ status: "banned", reasons: [{ code: "state_banned", quote: "no Class 3 on paths" }] });
    expect(checkPiece(seg("crossing"), 0, [1], RULES).status).toBe("allowed");
    expect(checkPiece(seg("ferry"), 0, [1], RULES).status).toBe("allowed");
    expect(checkPiece(seg("other"), 0, [1], RULES).status).toBe("unclear");
  });

  it("can't confirm a piece in a state the rules don't cover", () => {
    expect(checkPiece(seg("road", { ...SD, state: "PR" }), 0, [1], RULES).reasons[0].code).toBe("state_no_rules");
  });
});

describe("a whole route", () => {
  it("says YES for an adult on a Class 1 bike on San Diego streets and bike lanes", () => {
    const v = checkRoute(plan([seg("road"), seg("bike_lane"), seg("bike_path")]), ADULT, RULES);
    expect(v.kind).toBe("yes");
    expect(v.rider[0]).toMatchObject({ state: "CA", places: ["city_of_san_diego"] });
    expect(v.problems).toEqual([]);
    expect(v.unchecked).toEqual([]);
  });

  it("says NO for an 11-year-old in the City of San Diego even on legal streets, from the engine", () => {
    const v = checkRoute(plan([seg("road")]), { ...ADULT, riderAge: 11 }, RULES);
    expect(v.kind).toBe("no_illegal");
    expect(v.rider[0].line?.kind).toBe("no_illegal");
  });

  it("says NO for a route over the boardwalk, joins the boardwalk pieces, and asks the router to avoid them", () => {
    const boardwalk = (i: number) => seg("footway", SD, { name: i === 0 ? "Ocean Front Walk" : "Ocean Front Walk", meters: 250 });
    const v = checkRoute(plan([seg("road"), boardwalk(0), boardwalk(1), seg("road")]), ADULT, RULES);
    expect(v.kind).toBe("no_illegal");
    expect(v.problems).toHaveLength(1);
    expect(v.problems[0]).toMatchObject({ status: "banned", meters: 500, pieces: [1, 2], name: "Ocean Front Walk" });
    expect(v.avoid).toHaveLength(2);
    expect(v.meters.banned).toBe(500);
  });

  it("can't confirm a route with a sidewalk piece in a business-district city", () => {
    expect(checkRoute(plan([seg("road"), seg("sidewalk")]), ADULT, RULES).kind).toBe("no_unconfirmed");
  });

  it("says YES under state law in an unchecked city and names it, as the checker does", () => {
    const crossed = [{ layer: "place" as const, geoid: "4805000", name: "Austin", state: "TX" }, { layer: "state" as const, geoid: "48", name: "Texas", state: "TX" }];
    const v = checkRoute(plan([seg("road", AUSTIN), seg("sidewalk", AUSTIN)], crossed), ADULT, RULES);
    expect(v.kind).toBe("yes");
    expect(v.unchecked).toEqual(["Austin"]);
    expect(v.rider[0].line?.uncheckedPlaces).toBe(true);
    expect(v.meters.unchecked).toBe(100);
  });

  it("skips the rider check when the Map takes the bike as legal, and still checks every piece", () => {
    const kid = { ...ADULT, riderAge: 11, assumeBikeLegal: true };
    const streets = checkRoute(plan([seg("road"), seg("bike_lane")]), kid, RULES);
    expect(streets.kind).toBe("yes");
    expect(streets.rider).toEqual([]);
    const boardwalk = checkRoute(plan([seg("road"), seg("footway", SD, { name: "Ocean Front Walk" })]), kid, RULES);
    expect(boardwalk.kind).toBe("no_illegal");
    expect(boardwalk.problems[0].reason.code).toBe("facility_banned");
  });

  it("can't confirm an empty route", () => {
    expect(checkRoute(plan([]), ADULT, RULES).kind).toBe("no_unconfirmed");
  });
});

describe("the rule files' shape checks", () => {
  it("accept the test rules and catch a kind accounted for twice or a missing quote", () => {
    expect(stateRuleProblems(RULES.states)).toEqual([]);
    expect(localRuleProblems(RULES.local)).toEqual([]);
    const twice = { ...SD_CITY, notChecked: ["trail", "road"] as LegalKind[] };
    expect(localRuleProblems({ x: twice })).toContain("x: road is accounted for 2 times");
    const noQuote = { ...SD_CITY, kinds: { sidewalk: [{ ...rule("banned"), quote: "" }] } };
    expect(localRuleProblems({ x: noQuote }).some((p) => p.includes("lacks its quote"))).toBe(true);
  });
});

describe("the piece gate", () => {
  // An independent oracle: the strictest reading of the same rules, written out plainly. A piece
  // may only count toward a YES (allowed or unchecked) when the oracle finds nothing blocking it.
  function oracleBlocks(kind: LegalKind, cls: ClassNum, stateS: WayStatus, mayRestrict: boolean, local: "none" | "banned" | "somewhere" | "unclear" | "notChecked" | "noRule", posted: boolean): boolean {
    if (posted) return true;
    if (stateS !== "allowed") return true;
    if (local === "banned" || local === "somewhere" || local === "unclear") return true;
    return local === "notChecked" && mayRestrict;
  }

  it("never lets a blocked piece count toward a YES across every rule combination", () => {
    let cases = 0;
    let falseYes = 0;
    const locals = ["none", "banned", "somewhere", "unclear", "notChecked", "noRule"] as const;
    for (const kind of LEGAL_KINDS) {
      for (const cls of [1, 2, 3] as const) {
        for (const stateS of ["allowed", "banned", "unclear"] as const) {
          for (const mayRestrict of [false, true]) {
            for (const local of locals) {
              for (const posted of [false, true]) {
                const stateRule: StateKindRule = { ...allowed(mayRestrict), [String(cls)]: stateS };
                const city: LocalWayRules = {
                  kinds: local === "banned" ? { [kind]: [rule("banned")] } : local === "somewhere" ? { [kind]: [rule("banned", "business_district")] } : local === "unclear" ? { [kind]: [rule("unclear")] } : {},
                  noRuleFound: local === "noRule" ? { [kind]: noRule } : {},
                  notChecked: local === "notChecked" ? [kind] : [],
                  facilities: [],
                };
                const rules: RouteRules = { states: { CA: stateRules({ [kind]: stateRule }) }, local: local === "none" ? {} : { city_of_san_diego: city } };
                const where = local === "none" ? { ...SD, countyGeoid: "06059", placeGeoid: "0600001", placeName: "Elsewhere" } : SD;
                const piece = checkPiece(seg(kind, where, { tags: posted ? { bicycle: "no" } : {} }), 0, [cls], rules);
                const countsTowardYes = piece.status === "allowed" || piece.status === "unchecked";
                cases += 1;
                if (countsTowardYes && oracleBlocks(kind, cls, stateS, mayRestrict, local, posted)) falseYes += 1;
              }
            }
          }
        }
      }
    }
    expect(cases).toBe(7 * 3 * 3 * 2 * 6 * 2);
    expect(falseYes).toBe(0);
  });
});
