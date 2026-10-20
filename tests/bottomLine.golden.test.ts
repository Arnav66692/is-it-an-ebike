// Golden bottom-line cases, run through the real engine and data on Oct 19, 2026 (Pacific Time).

import { describe, expect, it } from "vitest";
import sdJson from "@/data/rules/san_diego_local.json";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import type { BikeFacts, PlaceId } from "@/lib/rules/types";
import { renderLine } from "@/lib/i18n/verdicts";
import { classBike } from "./helpers";

const TODAY_PT = "2026-10-19";

function check(state: string, age: number, facts: BikeFacts, places: PlaceId[], otherPlaces = false) {
  const result = evaluate({ state, riderAge: age, rideDate: TODAY_PT, facts, places, otherPlaces });
  return bottomLine(result, TODAY_PT);
}

const levelOf = (id: string) =>
  (sdJson as unknown as { jurisdictions: { id: string; verification_level: string }[] }).jurisdictions.find((j) => j.id === id)
    ?.verification_level;

describe("bottom line golden cases (California unless named, Oct 19, 2026)", () => {
  it("an 11-year-old on a Class 2 in the City of San Diego only is NO, illegal", () => {
    const bl = check("CA", 11, classBike(2), ["city_of_san_diego"]);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.blocked).toHaveLength(1);
    expect(bl.blocked[0].where).toEqual([{ scope: "local", id: "city_of_san_diego" }]);
    expect(bl.blocked[0].line.code).toBe("local_under_12");
  });

  it("the same rider in Encinitas only is YES only if Encinitas is primary_verified, otherwise NO, not confirmed", () => {
    const bl = check("CA", 11, classBike(2), ["encinitas"]);
    const verified = levelOf("encinitas") === "primary_verified";
    expect(bl.kind).toBe(verified ? "yes" : "no_unconfirmed");
    if (verified) {
      expect(bl.requirements.map((l) => l.code)).toContain("req_helmet_under");
      expect(bl.citiesChecked).toBe(true);
      expect(bl.uncheckedPlaces).toBe(false);
    } else {
      expect(bl.missing.some((m) => m.kind === "unverified")).toBe(true);
    }
  });

  it("today's data has Encinitas primary_verified, so that rider gets YES with a helmet", () => {
    expect(levelOf("encinitas")).toBe("primary_verified");
    expect(check("CA", 11, classBike(2), ["encinitas"]).kind).toBe("yes");
  });

  it("a machine with no pedals is NO, illegal, for the state and every place", () => {
    const bl = check("CA", 30, classBike(2, { hasPedals: false }), ["city_of_san_diego", "encinitas"]);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.blocked[0].line.code).toBe("no_pedals");
    expect(bl.blocked[0].where.map((w) => w.id)).toEqual(["CA", "city_of_san_diego", "encinitas"]);
  });

  it("South Carolina is NO, not confirmed, and says city rules were not checked", () => {
    const bl = check("SC", 30, classBike(1), []);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing[0]).toMatchObject({ kind: "cant_confirm", line: { code: "never_legal" } });
    expect(bl.uncheckedPlaces).toBe(true);
    expect(bl.citiesChecked).toBe(false);
  });

  it("a Class 3 to an SDUHSD campus is NO, illegal, even at 17", () => {
    const bl = check("CA", 17, classBike(3), ["sduhsd_campuses"]);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.blocked).toEqual([{ where: [{ scope: "local", id: "sduhsd_campuses" }], line: expect.objectContaining({ code: "campus_class3" }) }]);
  });
});

describe("bottom line, more real cases", () => {
  it("a Class 1 to an SDUHSD campus is NO, not confirmed, because the class, tag and course rules are only on the district page", () => {
    const bl = check("CA", 15, classBike(1), ["sduhsd_campuses"]);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing).toEqual([
      { kind: "unverified", where: [{ scope: "local", id: "sduhsd_campuses" }], line: { code: "bl_unverified_primary_partial", params: { place: "sduhsd_campuses" } } },
    ]);
  });

  it("a plain adult Class 1 in Texas is YES for state law only, with city rules not checked", () => {
    const bl = check("TX", 30, classBike(1), []);
    expect(bl.kind).toBe("yes");
    expect(bl.citiesChecked).toBe(false);
    expect(bl.uncheckedPlaces).toBe(true);
  });

  it("Somewhere else keeps the unchecked-places line on a YES", () => {
    const bl = check("CA", 30, classBike(1), ["encinitas"], true);
    expect(bl.kind).toBe("yes");
    expect(bl.citiesChecked).toBe(true);
    expect(bl.uncheckedPlaces).toBe(true);
  });

  it("a fast-mode question left open is NO, not confirmed, and names the question", () => {
    const bl = check("CA", 30, classBike(2, { motorOver20: null, assistOver28: null, switchable: null }), ["encinitas"]);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing[0]).toMatchObject({ kind: "unanswered", line: { code: "bl_unanswered", params: { questions: "fast_mode" } } });
    expect(renderLine(bl.missing[0].line, "en", "California")).toBe("Answer the questions above about fast modes.");
    expect(renderLine(bl.missing[0].line, "es", "California")).toBe("Responde las preguntas de arriba sobre los modos rápidos.");
  });

  it("a Texas fast-mode answer of not sure is NO, not confirmed, though the state card says yes", () => {
    const result = evaluate({
      state: "TX",
      riderAge: 30,
      rideDate: TODAY_PT,
      facts: classBike(1, { motorOver20: null, assistOver28: null, switchable: null, unsure: ["fast_mode"] }),
      places: [],
    });
    expect(result.state.status).toBe("yes");
    const bl = bottomLine(result, TODAY_PT);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing.map((m) => m.kind)).toEqual(["unsure"]);
  });

  it("an 11-year-old on a Class 2 in unincorporated county is YES with a helmet, since the County adopted no ban", () => {
    const bl = check("CA", 11, classBike(2), ["unincorporated_san_diego_county"]);
    expect(bl.kind).toBe("yes");
    expect(bl.requirements.map((l) => l.code)).toEqual(["req_helmet_under"]);
  });

  it("every San Diego place at once is NO, illegal, for an 11-year-old on a Class 2, naming both cities with the ban", () => {
    const all: PlaceId[] = ["city_of_san_diego", "carlsbad", "encinitas", "solana_beach", "del_mar", "unincorporated_san_diego_county", "sduhsd_campuses"];
    const bl = check("CA", 11, classBike(2), all);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.blocked.flatMap((b) => b.where.map((w) => w.id))).toEqual(["city_of_san_diego", "carlsbad"]);
  });
});
