// Regression tests for the sixth review (Oct 19, 2026). Each block names the problem it closes.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BottomLineCard, mergeRendered } from "@/components/BottomLineCard";
import { VerdictCard } from "@/components/VerdictCard";
import { tabTap } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type TextSource } from "@/lib/extract/parse";
import { t } from "@/lib/i18n/ui";
import { renderLine, uniqueRendered } from "@/lib/i18n/verdicts";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, type BikeFacts, type Line, type PlaceId, type Verdict } from "@/lib/rules/types";
import { classBike } from "./helpers";

const DATE = "2026-10-20";

/** Text through the parser and the engine to the bottom line, with No and No to the fast-mode questions. */
function flow(text: string, state: string, age: number, places: PlaceId[] = [], over: Partial<BikeFacts> = {}, source: TextSource = "listing") {
  const extraction = parseSpecText(text, source);
  const facts: BikeFacts = { ...factsFromExtraction(extraction, emptyFacts()), motorOver20: false, assistOver28: false, ...over };
  const result = evaluate({ state, riderAge: age, rideDate: DATE, facts, places });
  return { extraction, facts, result, kind: bottomLine(result, DATE).kind };
}

describe("a number split by a space is never read from its last group", () => {
  it("an OCR '1 500W' motor is not read as 500 W, so a 1,500 W bike can't get a California YES", () => {
    const label = "CLASS 2 ELECTRIC BICYCLE\nMOTOR 1 500W\nTOP ASSISTED SPEED 20 MPH";
    const { extraction, kind } = flow(label, "CA", 14, ["city_of_san_diego"], { hasPedals: true }, "label");
    expect(extraction.facts.ratedWatts).toBeUndefined();
    expect(extraction.flags).toContain("number_split");
    expect(kind).not.toBe("yes");
  });

  it("a thousands space like '1 200 W' or a thin space is not read as 200 W", () => {
    for (const text of ["Class 1 e-bike. Pedal assist only, no throttle. Motor: 1 200 W. Max assist 20 mph. Pedals: aluminum platform.", "Motor 1 200 W", "Motor 1 200 W"]) {
      const e = parseSpecText(text, "listing");
      expect(e.facts.wattsUpTo, text).toBeUndefined();
      expect(e.facts.ratedWatts, text).toBeUndefined();
      expect(e.flags, text).toContain("number_split");
    }
    expect(flow("Class 1 e-bike. Pedal assist only, no throttle. Motor: 1 200 W. Max assist 20 mph. Pedals: aluminum platform.", "CA", 30, ["city_of_san_diego"]).kind).not.toBe("yes");
  });

  it("'2 8 MPH' is not read as 8 mph, so a 28 mph bike is never inferred as Class 1", () => {
    const { extraction, result, kind } = flow("Electric bicycle. No throttle. Pedals: alloy. Motor 500W rated. Max assist speed 2 8 MPH", "CA", 14, [], {}, "label");
    expect(extraction.facts.assistMph).toBeUndefined();
    expect(extraction.flags).toContain("number_split");
    expect(result.state.classes).not.toEqual([1]);
    expect(kind).not.toBe("yes");
  });

  it("'Weight: 1 20 lbs' is not read as 20 lb", () => {
    const e = parseSpecText("Weight: 1 20 lbs", "listing");
    expect(e.facts.weightLb).toBeUndefined();
    expect(e.flags).toContain("number_split");
  });

  it("still reads a figure after a class number, a separator or a word with digits in it", () => {
    expect(parseSpecText("CLASS 2 750W 20 MPH", "label").facts).toMatchObject({ classes: [2], ratedWatts: 750, topSpeedMph: 20 });
    expect(parseSpecText("CLASS 3 28 MPH 750 W", "label").facts).toMatchObject({ classes: [3], ratedWatts: 750, topSpeedMph: 28 });
    expect(parseSpecText("Class 1 & 2 500W", "listing").facts.wattsUpTo).toBe(500);
    expect(parseSpecText("Class I 500W", "label").facts.ratedWatts).toBe(500);
    expect(parseSpecText("CLASS 2 | 750W | 20 MPH", "label").facts.ratedWatts).toBe(750);
    expect(parseSpecText("IP65 500W motor", "listing").facts.wattsUpTo).toBe(500);
    expect(parseSpecText("2026 model, 750W motor", "listing").facts.wattsUpTo).toBe(750);
    for (const text of ["CLASS 2 750W 20 MPH", "IP65 500W motor"]) expect(parseSpecText(text, "listing").flags).not.toContain("number_split");
  });

  it("the flag tells the family in both languages", () => {
    expect(t("en", "flag_number_split")).toContain("1 500 W");
    expect(t("es", "flag_number_split")).toContain("1 500 W");
  });
});

describe("a list of other products in the middle of a page never hides this bike's own spec table", () => {
  const top = "Acme Commuter Class 1 Electric Bike. About this item. 500W motor with pedal assist only, no throttle. Max assist speed 20 mph. Alloy platform pedals.";
  const carousel = "Frequently bought together. This item: Acme Commuter. Acme Bike Lock. Acme Helmet.";
  const specs = "Product information. Wattage: 1000 watts. Thumb throttle: yes. Maximum speed: 28 mph.";

  it("reads the spec table after 'Frequently bought together', so its throttle and 1000 W block a YES", () => {
    const { extraction, kind } = flow(`${top}\n${carousel}\n${specs}`, "CA", 14, ["carlsbad"]);
    expect(extraction.flags).toContain("other_products_skipped");
    expect(extraction.flags).toContain("throttle_unclear");
    expect(extraction.facts.wattsUpTo).toBe(1000);
    expect(extraction.facts.topSpeedMph).toBe(28);
    expect(kind).toBe("no_unconfirmed");
    expect(Object.values(extraction.evidence).every((list) => (list ?? []).every((ev) => extraction.text.includes(ev.text)))).toBe(true);
  });

  it("gives the same facts as the page without the carousel", () => {
    expect(flow(`${top}\n${carousel}\n${specs}`, "CA", 14).facts).toEqual(flow(`${top}\n${specs}`, "CA", 14).facts);
  });

  it("still skips the other products themselves, up to the next heading for this bike", () => {
    const e = parseSpecText(`${top} ${carousel} Zoom Cruiser 1000W thumb throttle 28 mph. Specifications: Wheels 20 x 4.0`, "listing");
    expect(e.facts.wattsUpTo).toBe(500);
    expect(e.facts.hasThrottle).toBe(false);
    expect(e.facts.topSpeedMph).toBeUndefined();
    expect(e.facts.wheelFrontIn).toBe(20);
    const tail = parseSpecText(`${top} Customers who viewed this item also viewed Zoom 1000W thumb throttle`, "listing");
    expect(tail.facts.wattsUpTo).toBe(500);
    expect(tail.facts.hasThrottle).toBe(false);
  });

  it("the flag no longer says everything after the heading was skipped", () => {
    expect(t("en", "flag_other_products_skipped")).toContain("Reading starts again");
    expect(t("es", "flag_other_products_skipped")).toContain("La lectura sigue");
  });
});

describe("pedals that are gone, broken, add-on or not shipped are left to the family", () => {
  const base = "Class 2 e-bike. 750W rated motor. Thumb throttle up to 20 mph. ";

  it("reads 'n't' wordings, with a straight or curly apostrophe, as doubt, never as working pedals", () => {
    for (const tail of ["Doesn't come with pedals.", "Doesn't include pedals.", "Didn't come with pedals.", "Doesn’t come with pedals.", "It isn't sold with pedals.", "Pedals aren't included."]) {
      const { facts, extraction, kind } = flow(base + tail, "CA", 30, ["encinitas"]);
      expect(facts.hasPedals, tail).toBeNull();
      expect(extraction.flags, tail).toContain("pedals_unclear");
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });

  it("reads add-on, sold-separately, missing, removed and broken wordings as doubt", () => {
    const tails = [
      "Pedals can be installed.", "Pedals can be added.", "Can I add pedals? Yes.", "Pedals sold as an accessory.", "Pedals purchased separately.",
      "Pedals sold as an add on.", "Pedals not provided.", "Pedals are not provided.", "Pedals are missing.", "Missing pedals.", "Pedals missing.",
      "Took the pedals off.", "Pedals off.", "Pedals deleted for a cleaner look.", "No longer has pedals.", "Pedals not on this model.", "Pedals broken.",
    ];
    for (const tail of tails) {
      const { facts, kind } = flow(base + tail, "CA", 30, ["encinitas"]);
      expect(facts.hasPedals, tail).toBeNull();
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });

  it("'ships without pedals' is about the box, so it is left to the family, not a definite no", () => {
    for (const tail of ["Comes without pedals.", "Ships without pedals.", "Sold without pedals.", "Arrives without pedals.", "Shipped without pedals, crank arms installed.", "Comes with no pedals."]) {
      const { facts, result, kind } = flow(base + tail, "CA", 30, ["encinitas"]);
      expect(facts.hasPedals, tail).toBeNull();
      expect(result.state.status, tail).toBe("cant_confirm");
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });

  it("still reads clear text the same way", () => {
    expect(flow(`${base}No pedals.`, "CA", 30).facts.hasPedals).toBe(false);
    expect(flow(`${base}Doesn't have pedals.`, "CA", 30).facts.hasPedals).toBe(false);
    expect(flow(`${base}Ride without pedals, it's an e-moto.`, "CA", 30).facts.hasPedals).toBe(false);
    expect(flow(`${base}Alloy platform pedals.`, "CA", 30).kind).toBe("yes");
    expect(flow(`${base}Turn pedal assist off to use the throttle. Alloy pedals.`, "CA", 30).facts.hasPedals).toBe(true);
    expect(flow(`${base}Install the pedals and handlebar, then ride. Alloy pedals.`, "CA", 30).facts.hasPedals).toBe(true);
  });
});

describe("a weight without the battery never stands in for the bike's weight", () => {
  const base = "Cargo e-bike. Class 1 pedal assist, no throttle, 500W rated, 20 mph. Tires: 20 x 3.0. ";

  it("skips 'not including battery' and 'before battery' figures, so Pennsylvania asks the weight", () => {
    for (const tail of ["Weight: 92 lbs not including battery.", "Weight: 92 lbs before battery.", "Weight: 92 lbs plus battery."]) {
      const { facts, result, kind } = flow(base + tail, "PA", 30);
      expect(facts.weightLb, tail).toBeNull();
      expect(result.state.questions, tail).toContain("weight");
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });

  it("reads a with-battery figure in the next clause, so the two weights are asked about", () => {
    for (const tail of ["Weight: 92 lbs; with battery 106 lbs.", "Weight: 92 lbs; 106 lbs with battery."]) {
      const { extraction, facts, kind } = flow(base + tail, "PA", 30);
      expect(facts.weightLb, tail).toBeNull();
      expect(extraction.flags, tail).toContain("several_weights");
      expect(kind, tail).toBe("no_unconfirmed");
    }
    const both = flow(`${base}Weight: 92 lbs not including battery. With battery: 106 lbs.`, "PA", 30);
    expect(both.facts.weightLb).toBe(106);
    expect(both.kind).toBe("no_illegal");
  });

  it("still reads a plain bike weight", () => {
    expect(flow(`${base}Weight: 62 lbs; max load 300 lbs.`, "PA", 30).facts.weightLb).toBe(62);
    expect(flow(`${base}Weight: 62 lbs (with battery).`, "PA", 30).kind).toBe("yes");
  });
});

describe("a negated foot-peg mention is never read as foot pegs", () => {
  const base = "Class 1. 250W rated. Pedal assist to 20 mph, no throttle. 20 x 2.4 tires. Weight 50 lbs. ";
  const utah = (tail: string) => flow(base + tail, "UT", 30, [], { needsPedalKit: false });

  it("'No foot pegs' and 'Foot pegs: No' are a no, so Utah does not call it 'not an e-bike'", () => {
    for (const tail of ["No foot pegs.", "Foot pegs: No.", "Without footrests.", "Doesn't have foot pegs."]) {
      const { facts, result, kind } = utah(tail);
      expect(facts.hasFootPegs, tail).toBe(false);
      expect(result.state.status, tail).toBe("yes");
      expect(kind, tail).toBe("yes");
    }
  });

  it("optional, sold-separately or mixed mentions are left to the family", () => {
    for (const tail of ["Foot pegs sold separately.", "Optional foot pegs.", "Doesn't come with foot pegs.", "No rider foot pegs. Passenger foot pegs included."]) {
      const { facts, extraction, result, kind } = utah(tail);
      expect(facts.hasFootPegs, tail).toBeNull();
      expect(extraction.flags, tail).toContain("mentions_foot_pegs");
      expect(result.state.questions, tail).toContain("pegs_kit");
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });

  it("a plain mention is still foot pegs", () => {
    const { facts, result } = utah("Fold-down foot pegs.");
    expect(facts.hasFootPegs).toBe(true);
    expect(result.state.reason.code).toBe("caution_foot_pegs");
  });
});

describe("tapping the input tab that is already open changes nothing", () => {
  it("a second tap on 'Type it in' never wipes the typed facts, answers and result", () => {
    expect(tabTap("type", "type")).toEqual({ change: false, manual: false });
    expect(tabTap("label", "label")).toEqual({ change: false, manual: false });
    expect(tabTap("label", "type")).toEqual({ change: true, manual: true });
    expect(tabTap("type", "link")).toEqual({ change: true, manual: false });
  });

  it("is what the tabs use", () => {
    const source = readFileSync(join(__dirname, "..", "components", "BikeInput.tsx"), "utf8");
    expect(source).toContain("const tap = tabTap(tab, x.id);");
    expect(source).toContain("if (!tap.change) return;");
    expect(source).not.toMatch(/if \(x\.id === "type"\) onManual\(\)/);
  });
});

describe("the state card says so when the ride is past its re-check horizon", () => {
  it("a California ride on Nov 17, 2026 shows the horizon on the card the bottom line names", () => {
    const date = "2026-11-17";
    const result = evaluate({ state: "CA", riderAge: 30, rideDate: date, facts: classBike(1), places: ["city_of_san_diego"] });
    const line = bottomLine(result, date);
    expect(line.kind).toBe("no_unconfirmed");
    const stale = line.missing.find((m) => m.kind === "stale");
    expect(stale?.where).toEqual([{ scope: "state", id: "CA" }]);
    const caution = result.state.cautions.find((c) => c.code === "caution_state_after_check");
    expect(caution?.params).toEqual(stale?.line.params);
    for (const lang of ["en", "es"] as const) {
      expect(renderLine(caution as Line, lang, "California")).toBe(renderLine(stale?.line as Line, lang, "California"));
    }
    // The local card does not repeat it, since the bottom line names only the state card.
    expect(result.local[0].cautions.map((c) => c.code)).not.toContain("caution_state_after_check");
  });

  it("is not shown inside the horizon, or on a card that already says no", () => {
    const inside = evaluate({ state: "CA", riderAge: 30, rideDate: DATE, facts: classBike(1), places: [] });
    expect(inside.state.cautions.map((c) => c.code)).not.toContain("caution_state_after_check");
    const no = evaluate({ state: "CA", riderAge: 14, rideDate: "2026-11-17", facts: classBike(3), places: [] });
    expect(no.state.status).toBe("no");
    expect(no.state.cautions.map((c) => c.code)).not.toContain("caution_state_after_check");
  });
});

describe("a class-unknown NO says each sentence once and names a shared reason", () => {
  const unknownClass = (over: Partial<BikeFacts> = {}): BikeFacts => ({
    ...emptyFacts(), hasPedals: true, ratedWatts: 500, hasThrottle: false, motorOver20: false, assistOver28: false, ...over,
  });
  const cardText = (verdict: Verdict, lang: "en" | "es", stateCode: string) =>
    renderToStaticMarkup(createElement(VerdictCard, { verdict, lang, stateCode })).replace(/<[^>]+>/g, "\n");
  const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it("Oregon at 13 names its license rule once, as the headline", () => {
    const result = evaluate({ state: "OR", riderAge: 13, rideDate: DATE, facts: unknownClass(), places: [] });
    expect(result.state.status).toBe("no");
    expect(result.state.reason.code).toBe("under_min_age_license");
    const text = cardText(result.state, "en", "OR").replace(/&#x27;/g, "'");
    expect(count(text, "need a driver's license or permit")).toBe(1);
    expect(text).not.toContain("whatever its class");
  });

  it("the City of San Diego card shows the under-12 ban once for an 11-year-old, in both languages", () => {
    const result = evaluate({ state: "CA", riderAge: 11, rideDate: DATE, facts: unknownClass(), places: ["city_of_san_diego", "carlsbad"] });
    for (const card of result.local) {
      expect(count(cardText(card, "en", "CA").replace(/&#x27;/g, "'"), "Riders under 12 can't ride Class 1 or 2")).toBe(1);
      expect(count(cardText(card, "es", "CA"), "los menores de 12 años no pueden usar")).toBe(1);
    }
  });

  it("an SDUHSD campus names the e-moto rule once, not a rider problem, for a 30-year-old on a 1000 W bike", () => {
    const result = evaluate({ state: "CA", riderAge: 30, rideDate: DATE, facts: unknownClass({ ratedWatts: 1000 }), places: ["sduhsd_campuses"] });
    const campus = result.local[0];
    expect(campus.reason.code).toBe("campus_no_emoto");
    expect(count(cardText(campus, "en", "CA").replace(/&#x27;/g, "'"), "E-motos and other non-e-bikes aren't allowed")).toBe(1);
    const why = bottomLine(result, DATE).blocked.find((b) => b.where.some((w) => w.id === "sduhsd_campuses"));
    expect(why?.line.code).toBe("campus_no_emoto");
  });

  it("drops repeats only when the sentence and its Details are the same", () => {
    const a: Line = { code: "local_under_12", params: { since: "2026-08-13", cls: 1 }, detail: null };
    const b: Line = { code: "local_under_12", params: { since: "2026-08-13", cls: 2 }, detail: null };
    const c: Line = { code: "local_under_12", params: { since: "2026-03-26", cls: 1 }, detail: null };
    expect(uniqueRendered([a, b, c], "en", "California")).toEqual([a, c]);
  });
});

describe("What's missing says a shared under-12 recheck once, naming every place", () => {
  const date = "2026-11-25";
  const places: PlaceId[] = ["encinitas", "solana_beach", "del_mar", "unincorporated_san_diego_county"];

  it("four places with the same check date share one item", () => {
    const result = evaluate({ state: "CA", riderAge: 10, rideDate: date, facts: classBike(1), places });
    const line = bottomLine(result, date);
    const recheck = line.missing.filter((m) => m.line.code === "local_under_12_after_check");
    expect(recheck).toHaveLength(1);
    expect(recheck[0].where.map((w) => w.id)).toEqual(places);
    for (const lang of ["en", "es"] as const) {
      const html = renderToStaticMarkup(createElement(BottomLineCard, { line, lang, stateCode: "CA" }));
      const sentence = renderLine(recheck[0].line, lang, "California").replace(/'/g, "&#x27;");
      expect(html.split(sentence).length - 1, lang).toBe(1);
    }
  });

  it("the card also merges items whose sentences match, whatever their numbers", () => {
    const a = { where: [{ scope: "local" as const, id: "encinitas" }], line: { code: "local_under_12_unclear", params: { place: "encinitas", cls: 1 } } };
    const b = { where: [{ scope: "local" as const, id: "del_mar" }], line: { code: "local_under_12_unclear", params: { place: "del_mar", cls: 2 } } };
    const merged = mergeRendered([a, b], "en", "California");
    expect(merged).toHaveLength(1);
    expect(merged[0].where.map((w) => w.id)).toEqual(["encinitas", "del_mar"]);
  });
});
