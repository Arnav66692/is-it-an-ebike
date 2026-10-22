// Golden bottom-line cases, run through the real engine and data on Oct 19, 2026 (Pacific Time).

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { announcement, BottomLineCard } from "@/components/BottomLineCard";
import { VerdictCard } from "@/components/VerdictCard";
import sdJson from "@/data/rules/san_diego_local.json";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText } from "@/lib/extract/parse";
import { fromRead, type CheckedFacts } from "@/lib/provenance";
import { evaluate } from "@/lib/rules";
import { bottomLine, type BottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, type BikeFacts, type PlaceId } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { renderLine } from "@/lib/i18n/verdicts";
import { shownAnswer } from "./answerWords";
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

  it("the same rider in Encinitas only is YES with a helmet, with the town checked and nothing left unchecked", () => {
    const bl = check("CA", 11, classBike(2), ["encinitas"]);
    expect(bl.kind).toBe("yes");
    expect(bl.requirements.map((l) => l.code)).toContain("req_helmet_under");
    expect(bl.citiesChecked).toBe(true);
    expect(bl.uncheckedPlaces).toBe(false);
  });

  it("the same rider in Encinitas is NO, can't confirm if the Encinitas record were not primary_verified", () => {
    const result = evaluate({ state: "CA", riderAge: 11, rideDate: TODAY_PT, facts: classBike(2), places: ["encinitas"] });
    const partial = { ...result, local: result.local.map((v) => ({ ...v, level: "primary_partial" as const })) };
    const bl = bottomLine(partial, TODAY_PT);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing).toEqual([
      { kind: "unverified", where: [{ scope: "local", id: "encinitas" }], line: { code: "bl_unverified_primary_partial", params: { place: "encinitas" } } },
    ]);
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

  it("South Carolina is NO, can't confirm, and says city rules were not checked", () => {
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
  it("a Class 1 to an SDUHSD campus is NO, can't confirm, because the class, tag and course rules are only on the district page", () => {
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

  it("a fast-mode question left open is NO, can't confirm, and names the question", () => {
    const bl = check("CA", 30, classBike(2, { motorOver20: null, assistOver28: null, switchable: null }), ["encinitas"]);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing[0]).toMatchObject({ kind: "unanswered", line: { code: "bl_unanswered", params: { questions: "fast_mode" } } });
    expect(renderLine(bl.missing[0].line, "en", "California")).toBe("Answer the questions above about fast modes.");
    expect(renderLine(bl.missing[0].line, "es", "California")).toBe("Responde las preguntas de arriba sobre los modos rápidos.");
  });

  it("a Texas fast-mode answer of not sure is NO, can't confirm, though the state card says yes", () => {
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

describe("bottom line, review fixes (Oct 19, 2026)", () => {
  it("pedals left blank with a Class 1 label and an SDUHSD campus is NO, can't confirm, and names the pedals, not the Class 3 ban", () => {
    const facts = { ...emptyFacts(), classes: [1 as const], ratedWatts: 500, hasThrottle: false, assistMph: 20 };
    const result = evaluate({ state: "CA", riderAge: 15, rideDate: TODAY_PT, facts, places: ["sduhsd_campuses"] });
    expect(result.state.reason.code).toBe("pedals_unknown");
    expect(result.local[0].status).toBe("cant_confirm");
    expect(result.local[0].reason.code).toBe("pedals_unknown");
    const bl = bottomLine(result, TODAY_PT);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.blocked).toEqual([]);
    expect(bl.missing[0]).toMatchObject({ kind: "cant_confirm", line: { code: "pedals_unknown" } });
    expect(bl.missing.flatMap((m) => m.line.code)).not.toContain("campus_class3");
  });

  it("pedals answered not sure with the City and the campus is still NO, can't confirm", () => {
    const bl = check("CA", 15, classBike(1, { hasPedals: null }), ["city_of_san_diego", "sduhsd_campuses"]);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing[0].where.map((w) => w.id)).toEqual(["CA", "city_of_san_diego", "sduhsd_campuses"]);
  });

  it("no pedals is NO, not allowed on campus, as an e-moto", () => {
    const result = evaluate({ state: "CA", riderAge: 15, rideDate: TODAY_PT, facts: classBike(1, { hasPedals: false }), places: ["sduhsd_campuses"] });
    expect(result.local[0].reason.code).toBe("campus_no_emoto");
    expect(bottomLine(result, TODAY_PT).kind).toBe("no_illegal");
  });

  it("facts that disagree are NO, can't confirm everywhere, never a campus Class 3 ban", () => {
    const bl = check("CA", 15, classBike(2, { throttleMph: 28 }), ["sduhsd_campuses"]);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing[0].line.code).toBe("facts_conflict");
  });

  it("Carlsbad's under-12 ban has no end date, so an 11-year-old there in 2029 is NO, can't confirm, never YES", () => {
    for (const cls of [1, 2] as const) {
      const result = evaluate({ state: "CA", riderAge: 11, rideDate: "2029-01-02", facts: classBike(cls), places: ["carlsbad"] });
      expect(result.local[0].status).toBe("cant_confirm");
      expect(result.local[0].reason.code).toBe("local_under_12_no_end");
      expect(bottomLine(result, "2029-01-02").kind).toBe("no_unconfirmed");
    }
  });

  it("the City of San Diego ban ends Jan 1, 2029 by its own terms, but that is past what the check vouches for, so the City alone is NO, can't confirm", () => {
    const result = evaluate({ state: "CA", riderAge: 11, rideDate: "2029-01-02", facts: classBike(2), places: ["city_of_san_diego"] });
    expect(result.local[0].status).toBe("cant_confirm");
    expect(result.local[0].reason.code).toBe("local_under_12_after_check");
    expect(bottomLine(result, "2029-01-02").kind).toBe("no_unconfirmed");
  });

  it("Carlsbad is still NO, not allowed for an 11-year-old on the last day of 2028", () => {
    expect(check("CA", 11, classBike(1), ["carlsbad"]).kind).toBe("no_illegal");
    const result = evaluate({ state: "CA", riderAge: 11, rideDate: "2028-12-31", facts: classBike(1), places: ["carlsbad"] });
    expect(bottomLine(result, "2028-12-31").kind).toBe("no_illegal");
  });

  it("with no place picked, a YES says city and county rules were not checked", () => {
    const bl = check("CA", 13, classBike(1), []);
    expect(bl.kind).toBe("yes");
    expect(bl.citiesChecked).toBe(false);
    expect(bl.uncheckedPlaces).toBe(true);
  });

  it("an unknown class with the City and the campus is NO, not allowed for an 11-year-old, because in the City every class is barred", () => {
    const bl = check("CA", 11, classBike(1, { classes: [], hasThrottle: false, assistMph: null }), ["city_of_san_diego", "sduhsd_campuses"]);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.blocked.map((b) => b.line.code)).toEqual(["no_any_class"]);
    // State law and the campus each allow Class 1 or 2 at 11, so only the City card says no.
    expect(bl.blocked[0].where.map((w) => w.id)).toEqual(["city_of_san_diego"]);
  });

  it("an unknown class for a 15-year-old at the campus is NO, can't confirm, not a Class 3 ban", () => {
    const bl = check("CA", 15, classBike(1, { classes: [], hasThrottle: false, assistMph: null }), ["sduhsd_campuses"]);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing[0].line.code).toBe("class_unknown");
  });

  it("a bike that runs as Class 1 or 3 is NO, not allowed on campus and for a 14-year-old, naming both rules", () => {
    const bl = check("CA", 14, classBike(1, { classes: [1, 3], assistMph: 28 }), ["city_of_san_diego", "sduhsd_campuses"]);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.blocked.map((b) => b.line.code).sort()).toEqual(["campus_class3", "under_min_age"]);
  });

  it("a bike that runs as Class 1 or 2 is YES for a 14-year-old in Encinitas, with a helmet", () => {
    const bl = check("CA", 14, classBike(1, { classes: [1, 2], hasThrottle: true, throttleMph: 20 }), ["encinitas"]);
    expect(bl.kind).toBe("yes");
    expect(bl.requirements.map((l) => l.code)).toContain("req_helmet_under");
  });
});

describe("bottom line, third review fixes (Oct 19, 2026)", () => {
  it("state law vouches for a ride only up to 30 days after its check, like a local record", () => {
    const at = (state: string, age: number, cls: 1 | 2 | 3, date: string, places: PlaceId[] = []) =>
      bottomLine(evaluate({ state, riderAge: age, rideDate: date, facts: classBike(cls), places }), date);
    expect(at("CA", 16, 3, "2026-11-15").kind).toBe("yes");
    const late = at("CA", 16, 3, "2026-11-16");
    expect(late.kind).toBe("no_unconfirmed");
    expect(late.missing).toEqual([
      { kind: "stale", where: [{ scope: "state", id: "CA" }], line: { code: "bl_state_after_check", params: { checked: "2026-10-16", through: "2026-11-15" } } },
    ]);
    for (const [state, age, cls, places] of [
      ["CA", 16, 3, []],
      ["TX", 15, 2, []],
      ["CA", 13, 1, ["encinitas"]],
    ] as [string, number, 1 | 2 | 3, PlaceId[]][]) {
      expect(at(state, age, cls, "2029-12-31", places).kind, state).toBe("no_unconfirmed");
    }
  });

  it("an adult in the City of San Diego gets a YES that says to wear a helmet (SDMC 84.21(a) and (c))", () => {
    const result = evaluate({ state: "CA", riderAge: 30, rideDate: TODAY_PT, facts: classBike(1), places: ["city_of_san_diego"] });
    const city = result.local[0];
    expect(city.status).toBe("yes");
    expect(city.requirements.map((l) => l.code)).toEqual(["sd_helmet_all_riders"]);
    expect(city.requirements[0].source?.citation).toContain("SDMC 84.21(a) and (c)");
    const bl = bottomLine(result, TODAY_PT);
    expect(bl.kind).toBe("yes");
    expect(bl.requirements.map((l) => l.code)).toEqual(["sd_helmet_all_riders"]);
    // Other places have no such rule, and a no still carries no requirements.
    expect(check("CA", 30, classBike(1), ["encinitas"]).requirements).toEqual([]);
    expect(check("CA", 11, classBike(2), ["city_of_san_diego"]).requirements).toEqual([]);
  });

  it("a rule that says no still says no after the horizon", () => {
    expect(at14Class3("2029-12-31")).toBe("no_illegal");
  });
});

function at14Class3(date: string): string {
  return bottomLine(evaluate({ state: "CA", riderAge: 14, rideDate: date, facts: classBike(3), places: [] }), date).kind;
}

describe("bottom line for a listing read from text (Oct 19, 2026, the tick step removed Oct 22)", () => {
  /** A listing pasted in, read the way the page reads it. */
  const read = (text: string): CheckedFacts => fromRead(factsFromExtraction(parseSpecText(text, "listing"), emptyFacts()));
  const answer = (facts: BikeFacts, places: PlaceId[] = ["city_of_san_diego"]) =>
    bottomLine(evaluate({ state: "CA", riderAge: 14, rideDate: TODAY_PT, facts, places }), TODAY_PT);

  it("a listing that reads as no pedals is NO, not an e-bike, with no line about checking facts", () => {
    const bike = read("Kids electric balance bike. No pedals.");
    expect(bike.facts.hasPedals).toBe(false);
    const bl = answer(bike.facts);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.notEbikeOnly).toBe(true);
    expect(bl.blocked).toEqual([{ where: [{ scope: "state", id: "CA" }, { scope: "local", id: "city_of_san_diego" }], line: expect.objectContaining({ code: "no_pedals" }) }]);
    expect(bl.missing).toEqual([]);
    for (const lang of ["en", "es"] as const) {
      expect(announcement(bl, lang)).not.toMatch(/link or photo|enlace o una foto/);
    }
  });

  it("if the pedals were misread and the family fixes them, the answer changes", () => {
    const bike = read("Kids electric balance bike. No pedals.");
    expect(answer({ ...bike.facts, hasPedals: true }).kind).not.toBe("no_illegal");
  });
});

describe("what each golden bottom line says first, on the card and to a screen reader (Oct 20, 2026)", () => {
  /** The kind, then the YES or NO, its mark and the line under it, and the sentence screen readers hear. */
  const shown = (bl: BottomLine, state: string, lang: Lang = "en") => {
    const card = shownAnswer(renderToStaticMarkup(createElement(BottomLineCard, { line: bl, lang, stateCode: state })));
    // The sentence is exactly the title, the answer and the line under it.
    expect(announcement(bl, lang)).toBe(`${t(lang, "blTitle")}: ${card.word}. ${card.line}`);
    return { kind: bl.kind, ...card };
  };
  const no = (kind: string, line: string) => ({ kind, word: "NO", mark: "✕", line });

  it("an 11-year-old on a Class 2 is NO in the City of San Diego and YES in Encinitas", () => {
    expect(shown(check("CA", 11, classBike(2), ["city_of_san_diego"]), "CA")).toEqual(no("no_illegal", "Not allowed. At least one rule we checked says no."));
    expect(shown(check("CA", 11, classBike(2), ["encinitas"]), "CA")).toEqual({
      kind: "yes",
      word: "YES",
      mark: "✓",
      line: "Allowed in every place we checked, for this rider and this bike.",
    });
    expect(shown(check("CA", 11, classBike(2), ["encinitas"]), "CA", "es")).toEqual({
      kind: "yes",
      word: "SÍ",
      mark: "✓",
      line: "Permitida en todos los lugares que revisamos, para esta persona y esta bicicleta.",
    });
  });

  it("South Carolina is NO and says we can't confirm it's legal in South Carolina, in both languages", () => {
    const bl = check("SC", 30, classBike(1), []);
    expect(shown(bl, "SC")).toEqual(no("no_unconfirmed", "We can't confirm it's legal in South Carolina."));
    expect(shown(bl, "SC", "es")).toEqual(no("no_unconfirmed", "No podemos confirmar que sea legal en Carolina del Sur."));
  });

  it("a Class 1 to an SDUHSD campus is NO, naming the campus, though the district page allows it", () => {
    const result = evaluate({ state: "CA", riderAge: 15, rideDate: TODAY_PT, facts: classBike(1), places: ["sduhsd_campuses"] });
    expect(shown(bottomLine(result, TODAY_PT), "CA")).toEqual(no("no_unconfirmed", "We can't confirm it's legal on an SDUHSD campus."));
    expect(shown(bottomLine(result, TODAY_PT), "CA", "es")).toEqual(no("no_unconfirmed", "No podemos confirmar que sea legal en una escuela de SDUHSD."));
    // The engine's call is unchanged: the district page allows it. The campus card answers NO too,
    // with the same reason as the bottom line, so the two never disagree on screen. What the
    // district page says stays on the card, under "What the rule says for these facts".
    expect(result.local[0].status).toBe("yes");
    const html = renderToStaticMarkup(createElement(VerdictCard, { verdict: result.local[0], lang: "en", stateCode: "CA", rideDate: TODAY_PT }));
    expect(shownAnswer(html)).toEqual({ word: "NO", mark: "✕", line: "We can't confirm it's legal on an SDUHSD campus." });
    expect(html).toContain("What the rule says for these facts");
  });

  it("no pedals is NO, not an e-bike, on the bottom line and on each place card", () => {
    const result = evaluate({ state: "CA", riderAge: 30, rideDate: TODAY_PT, facts: classBike(2, { hasPedals: false }), places: ["city_of_san_diego", "encinitas"] });
    expect(shown(bottomLine(result, TODAY_PT), "CA")).toEqual(
      no("no_illegal", "Not an e-bike under the law we checked."),
    );
    for (const v of result.local) {
      const card = shownAnswer(renderToStaticMarkup(createElement(VerdictCard, { verdict: v, lang: "en", stateCode: "CA", rideDate: TODAY_PT })));
      expect(card, v.id).toEqual({ word: "NO", mark: "✕", line: "Not an e-bike under California state law." });
    }
  });

  it("a Texas fast-mode answer of not sure is NO, we can't confirm it's legal in Texas", () => {
    const bl = check("TX", 30, classBike(1, { motorOver20: null, assistOver28: null, switchable: null, unsure: ["fast_mode"] }), []);
    expect(shown(bl, "TX")).toEqual(no("no_unconfirmed", "We can't confirm it's legal in Texas."));
  });

  it("a question open on more than one card is NO in every place we checked", () => {
    const bl = check("CA", 30, classBike(2, { motorOver20: null, assistOver28: null, switchable: null }), ["encinitas"]);
    expect(shown(bl, "CA")).toEqual(no("no_unconfirmed", "We can't confirm it's legal in every place we checked."));
    expect(shown(bl, "CA", "es")).toEqual(no("no_unconfirmed", "No podemos confirmar que sea legal en todos los lugares que revisamos."));
  });
});
