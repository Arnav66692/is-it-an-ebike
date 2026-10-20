// Unit tests for the bottom line. Every branch of lib/rules/bottomLine.ts, on hand-built cards,
// so the rule is tested apart from the engine and the UI.

import { describe, expect, it } from "vitest";
import { bottomLine, isTopVerified, type BottomLine } from "@/lib/rules/bottomLine";
import type { EngineResult, Line, Verdict } from "@/lib/rules/types";

const DATE = "2026-10-19";

type CardOver = Partial<Verdict> & Pick<Verdict, "scope" | "id">;

function card(over: CardOver): Verdict {
  return {
    status: "yes",
    reason: { code: over.scope === "state" ? "allowed" : "local_allowed", params: { cls: 1, age: 14 } },
    requirements: [],
    cautions: [],
    notes: [],
    questions: [],
    classes: [1],
    sources: [],
    lastChecked: DATE,
    verified: "statute_verified",
    level: over.scope === "local" ? "primary_verified" : undefined,
    ...over,
  };
}

const stateCard = (over: Partial<Verdict> = {}) => card({ scope: "state", id: "CA", ...over });
const placeCard = (id: string, over: Partial<Verdict> = {}) => card({ scope: "local", id, ...over });

function run(state: Verdict, local: Verdict[] = [], localNotice = false): BottomLine {
  const result: EngineResult = { state, local, localNotice };
  return bottomLine(result, DATE);
}

const HELMET: Line = { code: "req_helmet_under", params: { underAge: 18 } };
const COURSE: Line = { code: "req_campus_course" };

describe("isTopVerified", () => {
  it("needs statute-verified rules on the state card", () => {
    expect(isTopVerified(stateCard())).toBe(true);
    expect(isTopVerified(stateCard({ verified: "unclear" }))).toBe(false);
  });
  it("needs a primary_verified record on a local card", () => {
    expect(isTopVerified(placeCard("encinitas"))).toBe(true);
    expect(isTopVerified(placeCard("sduhsd_campuses", { level: "primary_partial" }))).toBe(false);
    expect(isTopVerified(placeCard("encinitas", { level: "primary_not_found" }))).toBe(false);
    expect(isTopVerified(placeCard("encinitas", { level: undefined }))).toBe(false);
  });
  it("ignores the verified label on a local card, only the level counts", () => {
    expect(isTopVerified(placeCard("sduhsd_campuses", { verified: "statute_verified", level: "primary_partial" }))).toBe(false);
  });
});

describe("YES", () => {
  it("says yes when every card is allowed and verified", () => {
    const bl = run(stateCard(), [placeCard("encinitas")]);
    expect(bl.kind).toBe("yes");
    expect(bl.blocked).toEqual([]);
    expect(bl.missing).toEqual([]);
    expect(bl.rideDate).toBe(DATE);
  });
  it("merges requirements across cards and drops duplicates", () => {
    const bl = run(stateCard({ requirements: [HELMET] }), [
      placeCard("encinitas", { requirements: [HELMET] }),
      placeCard("del_mar", { requirements: [HELMET, COURSE] }),
    ]);
    expect(bl.requirements).toEqual([HELMET, COURSE]);
  });
  it("keeps requirements that differ only in their numbers", () => {
    const sixteen: Line = { code: "req_helmet_under", params: { underAge: 16 } };
    expect(run(stateCard({ requirements: [HELMET, sixteen] })).requirements).toEqual([HELMET, sixteen]);
  });
  it("lists every covered card in page order", () => {
    const bl = run(stateCard(), [placeCard("encinitas"), placeCard("del_mar")]);
    expect(bl.covered).toEqual([
      { scope: "state", id: "CA" },
      { scope: "local", id: "encinitas" },
      { scope: "local", id: "del_mar" },
    ]);
  });
  it("marks a state-law-only answer, so the page can say city rules were not checked", () => {
    const bl = run(stateCard(), [], true);
    expect(bl.kind).toBe("yes");
    expect(bl.citiesChecked).toBe(false);
    expect(bl.uncheckedPlaces).toBe(true);
  });
  it("does not count the campus as a city", () => {
    const bl = run(stateCard(), [placeCard("sduhsd_campuses")], true);
    expect(bl.citiesChecked).toBe(false);
  });
  it("marks Somewhere else even when a town was checked", () => {
    const bl = run(stateCard(), [placeCard("encinitas")], true);
    expect(bl.citiesChecked).toBe(true);
    expect(bl.uncheckedPlaces).toBe(true);
  });
  it("has no caveat when every place ridden was checked", () => {
    const bl = run(stateCard(), [placeCard("encinitas")], false);
    expect(bl.uncheckedPlaces).toBe(false);
  });
});

describe("NO, illegal", () => {
  it("names the place that says no and its reason", () => {
    const reason: Line = { code: "local_under_12", params: { place: "city_of_san_diego", since: "2026-08-13", cls: 2 } };
    const bl = run(stateCard(), [placeCard("city_of_san_diego", { status: "no", reason }), placeCard("encinitas")]);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.blocked).toEqual([{ where: [{ scope: "local", id: "city_of_san_diego" }], line: reason }]);
    expect(bl.missing).toEqual([]);
    expect(bl.requirements).toEqual([]);
  });
  it("treats not an e-bike as illegal", () => {
    const reason: Line = { code: "no_pedals", params: { treatedAs: "motor vehicle" } };
    expect(run(stateCard({ status: "not_ebike", reason })).kind).toBe("no_illegal");
  });
  it("groups cards with the same reason into one item that names each place", () => {
    const reason: Line = { code: "no_pedals", params: { treatedAs: "" } };
    const bl = run(stateCard({ status: "not_ebike", reason }), [
      placeCard("carlsbad", { status: "not_ebike", reason }),
      placeCard("del_mar", { status: "not_ebike", reason }),
    ]);
    expect(bl.blocked).toHaveLength(1);
    expect(bl.blocked[0].where.map((w) => w.id)).toEqual(["CA", "carlsbad", "del_mar"]);
  });
  it("keeps different reasons apart", () => {
    const bl = run(stateCard({ status: "no", reason: { code: "under_min_age", params: { minAge: 16, cls: 3 } } }), [
      placeCard("sduhsd_campuses", { status: "no", reason: { code: "campus_class3", params: { cls: 3 } } }),
    ]);
    expect(bl.blocked.map((b) => b.line.code)).toEqual(["under_min_age", "campus_class3"]);
  });
  it("wins over anything unconfirmed or unverified", () => {
    const bl = run(stateCard({ status: "cant_confirm", reason: { code: "watts_unknown" } }), [
      placeCard("city_of_san_diego", { status: "no", reason: { code: "local_under_12" } }),
      placeCard("sduhsd_campuses", { level: "primary_partial" }),
    ]);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.missing).toEqual([]);
  });
});

describe("NO, not confirmed", () => {
  it("names a can't-confirm card and its reason", () => {
    const reason: Line = { code: "never_legal" };
    const bl = run(stateCard({ id: "SC", status: "cant_confirm", reason }), [], true);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing).toEqual([{ kind: "cant_confirm", where: [{ scope: "state", id: "SC" }], line: reason }]);
    expect(bl.uncheckedPlaces).toBe(true);
  });
  it("lists the unanswered follow-up questions", () => {
    const bl = run(stateCard({ status: "need_info", reason: { code: "need_info" }, questions: ["fast_mode", "wheels"] }));
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing[0].kind).toBe("unanswered");
    expect(bl.missing[0].line).toEqual({ code: "bl_unanswered", params: { questions: "fast_mode,wheels" } });
  });
  it("merges the same unanswered questions across cards into one item", () => {
    const ask = { status: "need_info" as const, reason: { code: "need_info" }, questions: ["fast_mode" as const] };
    const bl = run(stateCard(ask), [placeCard("encinitas", ask)]);
    expect(bl.missing).toHaveLength(1);
    expect(bl.missing[0].where.map((w) => w.id)).toEqual(["CA", "encinitas"]);
  });
  it("blocks a yes card whose fast-mode answer was not sure", () => {
    const bl = run(stateCard({ id: "TX", cautions: [{ code: "caution_fast_mode_unverified" }] }));
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing).toEqual([{ kind: "unsure", where: [{ scope: "state", id: "TX" }], line: { code: "bl_unsure_fast_mode" } }]);
  });
  it("does not treat other cautions as gaps", () => {
    expect(run(stateCard({ cautions: [{ code: "caution_stop_pedaling_class2" }] })).kind).toBe("yes");
  });
  it("blocks a state card that is not statute-verified", () => {
    const bl = run(stateCard({ id: "AK", verified: "unclear" }));
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing[0]).toEqual({ kind: "unverified", where: [{ scope: "state", id: "AK" }], line: { code: "bl_unverified_state" } });
  });
  it("blocks a local card whose record is only partly verified, and says which place", () => {
    const bl = run(stateCard(), [placeCard("sduhsd_campuses", { level: "primary_partial" })]);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing[0].line).toEqual({ code: "bl_unverified_primary_partial", params: { place: "sduhsd_campuses" } });
  });
  it("blocks a local card whose enacted text was not found, or that has no level", () => {
    expect(run(stateCard(), [placeCard("del_mar", { level: "primary_not_found" })]).missing[0].line.code).toBe(
      "bl_unverified_primary_not_found",
    );
    expect(run(stateCard(), [placeCard("del_mar", { level: undefined })]).missing[0].line.code).toBe("bl_unverified_primary_not_found");
  });
  it("lists every gap, can't confirm first and unverified last", () => {
    const bl = run(stateCard({ cautions: [{ code: "caution_fast_mode_unverified" }] }), [
      placeCard("sduhsd_campuses", { level: "primary_partial" }),
      placeCard("encinitas", { status: "cant_confirm", reason: { code: "class_unknown" } }),
      placeCard("del_mar", { status: "need_info", reason: { code: "need_info" }, questions: ["weight"] }),
    ]);
    expect(bl.missing.map((m) => m.kind)).toEqual(["cant_confirm", "unanswered", "unsure", "unverified"]);
  });
  it("names both the open question and the unverified record on the same card", () => {
    const bl = run(stateCard(), [placeCard("sduhsd_campuses", { status: "cant_confirm", reason: { code: "class_unknown" }, level: "primary_partial" })]);
    expect(bl.missing.map((m) => m.kind)).toEqual(["cant_confirm", "unverified"]);
  });
});

describe("never turns uncertainty into YES", () => {
  const gaps: [string, Verdict][] = [
    ["can't confirm", placeCard("encinitas", { status: "cant_confirm", reason: { code: "class_unknown" } })],
    ["unanswered", placeCard("encinitas", { status: "need_info", reason: { code: "need_info" }, questions: ["wheels"] })],
    ["not sure", placeCard("encinitas", { cautions: [{ code: "caution_fast_mode_unverified" }] })],
    ["partly verified", placeCard("sduhsd_campuses", { level: "primary_partial" })],
    ["enacted text not found", placeCard("encinitas", { level: "primary_not_found" })],
  ];
  for (const [name, gap] of gaps) {
    it(`one ${name} card among verified yes cards gives NO, not confirmed`, () => {
      expect(run(stateCard(), [placeCard("del_mar"), gap, placeCard("carlsbad")]).kind).toBe("no_unconfirmed");
    });
  }
});
