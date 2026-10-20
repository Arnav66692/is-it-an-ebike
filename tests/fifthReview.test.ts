// Regression tests for the fifth review (Oct 19, 2026). Each block names the problem it closes.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BottomLineCard } from "@/components/BottomLineCard";
import { FollowUps } from "@/components/FollowUps";
import { ShapeFacts } from "@/components/ShapeFacts";
import overlayJson from "@/data/overlay.json";
import statesJson from "@/data/rules/all_states.normalized.json";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkerToday, DATA_CHECKED_ON, pegsKitShown, rideDateFor, rideDateIn, weightShown, withFootPegs, withWeight } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText } from "@/lib/extract/parse";
import { formatDate } from "@/lib/i18n/names";
import { isUiKey, t } from "@/lib/i18n/ui";
import { renderLine } from "@/lib/i18n/verdicts";
import { isIsoDate } from "@/lib/rules/dates";
import { evaluate, validateInput } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, type BikeFacts, type PlaceId } from "@/lib/rules/types";
import { classBike } from "./helpers";

const DATE = "2026-10-20";

/** Listing text through the parser and the engine to the bottom line, with No and No to the fast-mode questions. */
function flow(text: string, state: string, age: number, places: PlaceId[] = [], over: Partial<BikeFacts> = {}) {
  const extraction = parseSpecText(text, "listing");
  const facts: BikeFacts = { ...factsFromExtraction(extraction, emptyFacts()), motorOver20: false, assistOver28: false, ...over };
  const result = evaluate({ state, riderAge: age, rideDate: DATE, facts, places });
  return { extraction, facts, result, kind: bottomLine(result, DATE).kind };
}

describe("a date that doesn't exist is not a date", () => {
  it("refuses Nov 31 and Feb 30, so the engine and the bottom line can't disagree on the day", () => {
    for (const bad of ["2026-11-31", "2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "2026-04-31"]) {
      expect(isIsoDate(bad), bad).toBe(false);
      expect(rideDateIn(bad, "2026-10-19"), bad).toBeNull();
      expect(validateInput({ state: "CA", riderAge: 30, rideDate: bad, facts: classBike(1), places: [] }), bad).not.toBeNull();
    }
  });

  it("still takes real days, including a leap day", () => {
    for (const good of ["2026-11-30", "2028-02-29", "2026-12-31", "2027-01-01"]) expect(isIsoDate(good), good).toBe(true);
    expect(formatDate("2026-11-30", "en")).toBe("Nov 30, 2026");
  });
});

describe("a device clock that runs behind can't reach a ride date before the rules were checked", () => {
  it("the first ride date is the table's check date, not a device day before it", () => {
    expect(DATA_CHECKED_ON >= "2026-10-19").toBe(true);
    expect(checkerToday("2026-06-30")).toBe(DATA_CHECKED_ON);
    expect(checkerToday("2027-03-01")).toBe("2027-03-01");
    expect(rideDateFor(false, "", "2026-06-30")).toBe(DATA_CHECKED_ON);
    expect(rideDateFor(true, "2026-06-30", "2026-06-30")).toBeNull();
    expect(rideDateIn("2026-07-14", "2026-07-14")).toBeNull();
  });

  it("so a Tennessee 10-year-old on a Class 3 gets the age rule in force now, not a YES from before it", () => {
    const date = rideDateFor(false, "", "2026-06-30") ?? "";
    const facts = classBike(3, { hasThrottle: false, throttleMph: null, assistMph: 28, wheelFrontIn: 26, wheelRearIn: 26 });
    const result = evaluate({ state: "TN", riderAge: 10, rideDate: date, facts, places: [] });
    expect(result.state.status).toBe("no");
    expect(bottomLine(result, date).kind).toBe("no_illegal");
  });

  it("is what the checker reads as today, on load, at midnight and on Check", () => {
    const source = readFileSync(join(__dirname, "..", "components", "Checker.tsx"), "utf8");
    expect(source.match(/checkerToday\(localToday\(\)\)/g)?.length).toBe(3);
    expect(source).not.toMatch(/[^(]localToday\(\)[,;]/);
  });
});

describe("pedals that may be gone or may not ship are never read as working pedals", () => {
  it("a used bike with its pedals removed is asked about, never a California YES", () => {
    const { facts, extraction, result, kind } = flow(
      "Super73 S2 for sale, pedals removed and foot pegs installed. Class 2, 750W rated, throttle 20 mph.",
      "CA",
      14,
      ["encinitas"],
    );
    expect(facts.hasPedals).toBeNull();
    expect(extraction.flags).toContain("pedals_unclear");
    expect(extraction.evidence.hasPedals?.[0].text).toContain("pedals removed");
    expect(result.state.reason.code).toBe("pedals_unknown");
    expect(kind).not.toBe("yes");
  });

  it("leaves every doubtful pedal answer blank, whatever else the text says", () => {
    for (const tail of [
      "Pedals removed.",
      "We removed the pedals.",
      "Pedals: removed",
      "Pedals have been taken off.",
      "Pedals: N.A.",
      "Pedals: —",
      "Pedals: -",
      "Pedals: ✗",
      "Pedals: X",
      "Pedals? Nope",
      "No need for pedals.",
      "You won't need pedals.",
      "Pedals not required.",
      "Pedal assist not available.",
      "Pedals: Yes (sold separately)",
      "Pedals not included. 5 levels of pedal assist.",
    ]) {
      const text = `Model X. Class: 2. Motor: 500W rated. Throttle: thumb throttle, 20 mph. ${tail}`;
      const { facts, kind } = flow(text, "CA", 30, ["encinitas"]);
      expect(facts.hasPedals, tail).toBeNull();
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });

  it("still reads a clear yes after Pedals: and plain pedal mentions", () => {
    for (const text of ["Pedals: Aluminum alloy platform", "Pedals: Yes", "Pedals (aluminum)", 'Pedals: 9/16"', "Folding pedals", "5 levels of pedal assist", "Brake pedals: hydraulic. Pedal assist 5 levels"]) {
      expect(parseSpecText(text, "listing").facts.hasPedals, text).toBe(true);
    }
  });

  it("every flag the parser can raise has a sentence in English and Spanish", () => {
    const source = readFileSync(join(__dirname, "..", "lib", "extract", "parse.ts"), "utf8");
    const flags = [...source.matchAll(/flags\.push\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(flags).toContain("pedals_unclear");
    for (const flag of flags) {
      const key = `flag_${flag}`;
      expect(isUiKey(key), key).toBe(true);
      if (isUiKey(key)) expect(t("es", key), key).not.toBe(t("en", key));
    }
  });
});

describe("a 'Pedals: No' about what ships is left to the family, not read as a machine with no pedals", () => {
  it("gives no NO, not allowed for pedals that may only be missing from the box", () => {
    const base = "Class 2 electric bike. 500W rated motor. Thumb throttle up to 20 mph. 20 x 4.0 tires.";
    for (const tail of ["Comes with pedals: No", "Pedals: none included", "Ships with pedals: No", "Pedals: No (sold separately)", "Includes pedals: No", "Pedals included: No", "No pedals included in the box."]) {
      const { facts, result, kind } = flow(`${base} ${tail}`, "CA", 14, ["encinitas"]);
      expect(facts.hasPedals, tail).toBeNull();
      expect(result.state.status, tail).toBe("cant_confirm");
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });

  it("still reads a plain no as no pedals", () => {
    for (const text of ["Pedals: No", "Pedals? No.", "Does it have pedals? No.", "Electric dirt bike with foot pegs and no pedals."]) {
      expect(parseSpecText(text, "listing").facts.hasPedals, text).toBe(false);
    }
  });
});

describe("an OCR letter in place of a first digit never shrinks a number", () => {
  it("'MOTOR l500W' and 'l200W' are not read as 500 W and 200 W", () => {
    for (const watts of ["l500W", "I500W", "|500W", "l,500W", "Il00W"]) {
      const e = parseSpecText(`CLASS 2\nMOTOR ${watts}\nTOP SPEED 20 MPH`, "label");
      expect(e.facts.ratedWatts, watts).toBeUndefined();
    }
    expect(parseSpecText("CLASS 2\nMOTOR l200W", "label").facts.ratedWatts).toBeUndefined();
  });

  it("'Z8 MPH' is not read as 8 mph, so a 28 mph Class 3 can't pass as Class 1", () => {
    const e = parseSpecText("CLA5S\nTOP ASSISTED SPEED Z8 MPH\nMOTOR 500W", "label");
    expect(e.facts.assistMph).toBeUndefined();
    const facts: BikeFacts = { ...factsFromExtraction(e, emptyFacts()), hasPedals: true, hasThrottle: false, motorOver20: false, assistOver28: false };
    const result = evaluate({ state: "CA", riderAge: 14, rideDate: DATE, facts, places: ["encinitas"] });
    expect(bottomLine(result, DATE).kind).not.toBe("yes");
  });

  it("an OCR letter in front of a weight leaves the weight blank", () => {
    expect(parseSpecText("Weight: l08 lbs", "listing").facts.weightLb).toBeUndefined();
  });

  it("still reads clean figures, figures after a colon or slash, and a list of figures", () => {
    const e = parseSpecText("CLASS 3\nMOTOR:1500W\nTOP ASSISTED SPEED 28 MPH", "label");
    expect(e.facts.ratedWatts).toBe(1500);
    expect(e.facts.assistMph).toBe(28);
    expect(parseSpecText("36V/250W rated motor", "listing").facts.ratedWatts).toBe(250);
    expect(parseSpecText("Motor: 1,500W rated", "listing").facts.ratedWatts).toBe(1500);
    expect(parseSpecText("Motor options: 500W,750W", "listing").facts.wattsUpTo).toBe(750);
    expect(parseSpecText("Pedal assist up to 20mph", "listing").facts.assistMph).toBe(20);
    expect(parseSpecText("Weight:60lbs", "listing").facts.weightLb).toBe(60);
  });
});

describe("a weight that leaves out the battery is never the bike's weight", () => {
  it("'Weight: 96 lbs (battery not included)' asks Pennsylvania's weight question instead of a YES", () => {
    const text =
      "Cargo e-bike. Class 1 pedal assist, no throttle, 500W rated, 20 mph. Tires: 20 x 3.0. Weight: 96 lbs (battery not included). Battery: 52V 20Ah.";
    const { facts, result, kind } = flow(text, "PA", 30);
    expect(facts.weightLb).toBeNull();
    expect(result.state.questions).toContain("weight");
    expect(kind).toBe("no_unconfirmed");
  });

  it("skips the exclusion before or after the word battery, and a page that sells the battery apart", () => {
    for (const text of [
      "Weight: 96 lbs (battery excluded)",
      "Weight: 96 lbs (batt. not incl.)",
      "Weight: 96 lbs excl. battery",
      "Weight: 96 lbs w/o batt",
      "Weight: 96 lbs. Battery sold separately.",
      "Battery is not included. Bike weight: 96 lbs.",
    ]) {
      expect(parseSpecText(text, "listing").facts.weightLb, text).toBeUndefined();
    }
  });

  it("still reads a plain weight and a weight with the battery", () => {
    expect(parseSpecText("Weight: 62 lbs", "listing").facts.weightLb).toBe(62);
    expect(parseSpecText("Weight: 62 lbs with battery", "listing").facts.weightLb).toBe(62);
    expect(parseSpecText("Weight: 62 lbs (battery included)", "listing").facts.weightLb).toBe(62);
  });
});

describe("Utah's supervision rule names a parent or guardian, not any adult", () => {
  const utah = () => {
    const facts = classBike(1, { hasThrottle: false, assistMph: 20, weightLb: null, weightOver100: null });
    const result = evaluate({ state: "UT", riderAge: 10, rideDate: DATE, facts, places: [] });
    return { result, line: bottomLine(result, DATE) };
  };

  it("lists 'a parent or guardian' on a Utah YES for a 10-year-old, in both languages", () => {
    const { line } = utah();
    expect(line.kind).toBe("yes");
    const text = line.requirements.map((l) => renderLine(l, "en", "Utah")).join(" ");
    expect(text).toContain("Under 14, only under the direct supervision of a parent or guardian.");
    expect(text).not.toContain("another adult");
    const es = line.requirements.map((l) => renderLine(l, "es", "Utah")).join(" ");
    expect(es).toContain("su padre, madre o tutor legal");
    expect(es).not.toContain("otro adulto");
  });

  it("keeps 'a parent or another adult' where the law allows any adult, as in Hawaii and Virginia", () => {
    const hi = evaluate({ state: "HI", riderAge: 12, rideDate: DATE, facts: classBike(2), places: [] });
    expect(hi.state.requirements.map((l) => l.code)).toContain("req_supervision");
    const va = evaluate({ state: "VA", riderAge: 12, rideDate: DATE, facts: classBike(3, { hasThrottle: false }), places: [] });
    expect(va.state.requirements.map((l) => l.code)).toContain("req_supervision");
  });
});

/** The bottom-line card's visible text. */
function cardText(result: ReturnType<typeof evaluate>, state: string, lang: "en" | "es" = "en"): string {
  const html = renderToStaticMarkup(createElement(BottomLineCard, { line: bottomLine(result, DATE), lang, stateCode: state }));
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
}

/** A field of a state record, by a dotted path like "where_allowed.quote". */
function field(state: string, path: string): string {
  const record = (statesJson as unknown as Record<string, unknown>)[state];
  return String(path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], record));
}

describe("a New York YES names the 30 mph road limit and doesn't claim every public street", () => {
  const ny = () =>
    evaluate({ state: "NY", riderAge: 30, rideDate: DATE, facts: classBike(1, { hasThrottle: false, assistMph: 20 }), places: [] });

  it("lists the road rule on the card and the bottom line, with VTL 1242(8)", () => {
    const result = ny();
    expect(result.state.status).toBe("yes");
    const req = result.state.requirements.find((l) => l.code === "req_roads_max_speed");
    expect(req?.source?.citation).toBe("N.Y. Veh. & Traf. Law § 1242(8)");
    const line = bottomLine(result, DATE);
    expect(line.kind).toBe("yes");
    expect(line.roadLimit).toBe(true);
    const text = cardText(result, "NY");
    expect(text).toContain("Ride only on roads with a posted speed limit of 30 mph or less, unless a local law allows faster roads.");
    expect(text).toContain("Yes covers riding only on the streets the road rule above allows.");
    expect(text).not.toContain("Yes covers riding on public streets");
    const es = cardText(result, "NY", "es");
    expect(es).toContain("30 mph o menos");
    expect(es).not.toContain("El sí cubre andar por calles públicas");
  });

  it("keeps the plain streets sentence in a state with no e-bike road limit", () => {
    const tx = evaluate({ state: "TX", riderAge: 30, rideDate: DATE, facts: classBike(1, { hasThrottle: false, assistMph: 20 }), places: [] });
    expect(bottomLine(tx, DATE).roadLimit).toBe(false);
    expect(cardText(tx, "TX")).toContain("Yes covers riding on public streets and in bike lanes.");
  });

  it("quotes the road rule word for word from the record field it names", () => {
    const limits = (overlayJson as unknown as { road_limits: { state: string; source_field: string; source_quote: string }[] }).road_limits;
    expect(limits.map((r) => r.state)).toEqual(["NY"]);
    for (const r of limits) expect(field(r.state, r.source_field)).toContain(r.source_quote);
  });
});

describe("Rhode Island's 2 horsepower cap", () => {
  const ri = (over: Partial<BikeFacts>) => evaluate({ state: "RI", riderAge: 30, rideDate: DATE, facts: classBike(1, over), places: [] });

  it("a 5000 W or 1600 W motor is clearly over it, so not an e-bike, never 'too close to that line'", () => {
    for (const watts of [5000, 1600]) {
      const result = ri({ ratedWatts: watts });
      expect(result.state.status, String(watts)).toBe("not_ebike");
      expect(result.state.reason).toMatchObject({ code: "over_hp", params: { watts, hp: 2, cap: 1491 } });
      expect(renderLine(result.state.reason, "en", "Rhode Island")).toBe(`The motor is ${watts} W. Rhode Island allows up to 2 horsepower, about 1491 W.`);
      expect(renderLine(result.state.reason, "es", "Rhode Island")).toContain("2 caballos de fuerza");
      expect(bottomLine(result, DATE).kind).toBe("no_illegal");
    }
  });

  it("a 750 W or 1491 W motor is within it, and a peak-only figure over it still needs the rated figure", () => {
    expect(ri({ ratedWatts: 750 }).state.status).toBe("yes");
    expect(ri({ ratedWatts: 1491 }).state.status).toBe("yes");
    const peak = ri({ ratedWatts: null, peakWatts: 2000 });
    expect(peak.state.status).toBe("cant_confirm");
    expect(peak.state.reason.code).toBe("watts_peak_only");
  });
});

describe("a state that never confirms an e-bike names its gap once", () => {
  it("Alaska and Kentucky list one line under What's missing, not the same point twice", () => {
    for (const state of ["AK", "KY"]) {
      const line = bottomLine(evaluate({ state, riderAge: 30, rideDate: DATE, facts: classBike(1), places: [] }), DATE);
      expect(line.kind, state).toBe("no_unconfirmed");
      expect(line.missing, state).toHaveLength(1);
      expect(line.missing[0].line.code, state).toBe("never_legal");
    }
  });

  it("still lists the unverified gap for a state card that says something else", () => {
    const real = evaluate({ state: "TX", riderAge: 30, rideDate: DATE, facts: classBike(1), places: [] });
    const unverified = { ...real, state: { ...real.state, verified: "unclear" } };
    expect(bottomLine(unverified, DATE).missing.map((g) => g.line.code)).toEqual(["bl_unverified_state"]);
  });
});

describe("a NO that only says 'not an e-bike' doesn't claim a rule bars the ride", () => {
  it("a 1000 W Vermont bike for an adult says not an e-bike, matching its Why line, in both languages", () => {
    const result = evaluate({ state: "VT", riderAge: 30, rideDate: DATE, facts: classBike(1, { ratedWatts: 1000 }), places: [] });
    const line = bottomLine(result, DATE);
    expect(line.kind).toBe("no_illegal");
    expect(line.notEbikeOnly).toBe(true);
    const en = cardText(result, "VT");
    expect(en).toContain("Not an e-bike under the law we checked.");
    expect(en).not.toContain("At least one rule we checked says no.");
    expect(en).toContain("motor-assisted bicycle");
    const es = cardText(result, "VT", "es");
    expect(es).toContain("No es una bicicleta eléctrica según la ley que revisamos.");
    expect(es).not.toContain("Al menos una regla que revisamos dice que no.");
  });

  it("keeps 'Not allowed' when a rule does bar the ride, like an age limit or the campus e-moto rule", () => {
    const young = evaluate({ state: "CA", riderAge: 14, rideDate: DATE, facts: classBike(3, { hasThrottle: false }), places: [] });
    expect(bottomLine(young, DATE).notEbikeOnly).toBe(false);
    expect(cardText(young, "CA")).toContain("Not allowed. At least one rule we checked says no.");
    const emoto = evaluate({ state: "CA", riderAge: 15, rideDate: DATE, facts: classBike(2, { ratedWatts: 2000 }), places: ["sduhsd_campuses"] });
    expect(bottomLine(emoto, DATE).notEbikeOnly).toBe(false);
  });
});

describe("the campus card names every class a multi-class bike can run as", () => {
  it("says Class 1/2 on the SDUHSD card, like the state card, not only Class 2", () => {
    const facts = classBike(1, { classes: [1, 2], hasThrottle: true, throttleMph: 20 });
    const result = evaluate({ state: "CA", riderAge: 14, rideDate: DATE, facts, places: ["sduhsd_campuses"] });
    expect(renderLine(result.state.reason, "en", "California")).toContain("This bike can run as Class 1/2.");
    const campus = result.local[0];
    expect(campus.status).toBe("yes");
    expect(renderLine(campus.reason, "en", "California")).toBe(
      "This bike can run as Class 1/2. Each of those classes is allowed on SDUHSD campuses, after these steps.",
    );
    expect(renderLine(campus.reason, "es", "California")).toContain("Clase 1/2");
    // SDUHSD stays NO, not confirmed: its class, tag and course rules come only from a web page.
    expect(bottomLine(result, DATE).kind).toBe("no_unconfirmed");
  });

  it("keeps the steps for every class on a multi-class local yes", () => {
    const facts = classBike(1, { classes: [1, 3], hasThrottle: false, assistMph: 28 });
    const result = evaluate({ state: "CA", riderAge: 17, rideDate: DATE, facts, places: ["encinitas"] });
    const local = result.local[0];
    expect(result.state.requirements.map((l) => l.code)).toEqual(expect.arrayContaining(["req_helmet_under", "req_helmet_all_ages"]));
    expect(local.status).toBe("yes");
    const stateCodes = result.state.requirements.map((l) => l.code).sort();
    expect(local.requirements.map((l) => l.code).sort()).toEqual(stateCodes);
  });
});

describe("a question is asked only while its answer can still change the result", () => {
  const utah = (over: Partial<BikeFacts>) =>
    evaluate({
      state: "UT",
      riderAge: 30,
      rideDate: DATE,
      places: [],
      facts: {
        ...emptyFacts(),
        hasPedals: true,
        classes: [1],
        ratedWatts: 500,
        hasThrottle: false,
        assistMph: 20,
        motorOver20: false,
        assistOver28: false,
        wheelCount: 2,
        wheelFrontIn: 20,
        wheelRearIn: 20,
        ...over,
      },
    });

  it("Utah with both fast-mode answers No asks only about pegs and the kit", () => {
    const open = utah({ hasFootPegs: null, needsPedalKit: null });
    expect(open.state.status).toBe("need_info");
    expect(open.state.questions).toEqual(["pegs_kit"]);
    const line = bottomLine(open, DATE);
    expect(line.missing.map((g) => renderLine(g.line, "en", "Utah"))).toContain("Answer the questions above about foot pegs or a pedal kit.");
  });

  it("a 'not sure' on pegs reaches the not-sure line instead of asking about fast modes forever", () => {
    const unsure = utah({ hasFootPegs: null, needsPedalKit: null, unsure: ["pegs_kit"] });
    expect(unsure.state.status).toBe("cant_confirm");
    expect(unsure.state.questions).toEqual([]);
    expect(unsure.state.reason.code).toMatch(/^unsure_(foot_pegs|pedal_kit)$/);
  });

  it("still asks about fast modes while they are open, and a Class 3 in Utah behaves the same", () => {
    expect(utah({ motorOver20: null, assistOver28: null, hasFootPegs: false, needsPedalKit: false }).state.questions).toEqual(["fast_mode"]);
    const c3 = utah({ classes: [3], assistMph: 28, hasFootPegs: null, needsPedalKit: null });
    expect(c3.state.questions).toEqual(["pegs_kit"]);
  });
});

describe("a Class 3 YES lists the speedometer wherever the rules table says Class 3 needs one", () => {
  const class3 = (state: string) =>
    evaluate({ state, riderAge: 30, rideDate: DATE, facts: classBike(3, { hasThrottle: false, assistMph: 28 }), places: [] });

  it("Wisconsin and Tennessee list it on a YES, citing the section", () => {
    for (const [state, citation] of [
      ["WI", "Wis. Stat. § 347.489(3m)(d)"],
      ["TN", "Tenn. Code Ann. § 55-8-305(b)"],
    ]) {
      const result = class3(state);
      const line = bottomLine(result, DATE);
      expect(line.kind, state).toBe("yes");
      const req = line.requirements.find((l) => l.code === "req_speedometer_class3");
      expect(req?.source?.citation, state).toBe(citation);
      expect(renderLine(req ?? { code: "" }, "en", state === "WI" ? "Wisconsin" : "Tennessee")).toMatch(/speedometer/);
    }
    expect(class3("WI").state.requirements.map((l) => l.code)).toContain("req_speedometer_class3");
    expect(class3("TN").state.requirements.map((l) => l.code)).toContain("req_speedometer_class3");
  });

  it("covers every state whose record says a Class 3 rider needs one, and only Class 3", () => {
    const overlay = overlayJson as unknown as { class3_equipment: { state: string; source_field: string; source_quote: string; statute_quote: string | null }[] };
    const states = overlay.class3_equipment.map((e) => e.state);
    for (const s of ["AL", "AR", "CA", "CT", "DE", "GA", "HI", "IA", "IL", "LA", "MD", "ME", "MN", "MO", "MS", "ND", "NH", "NM", "NV", "OH", "OK", "OR", "SD", "TN", "UT", "VA", "VT", "WA", "WI", "WV"]) {
      expect(states, s).toContain(s);
    }
    // Texas puts the duty on the seller, not the rider, and Idaho, Indiana, Kansas and Wyoming have no such rule.
    for (const s of ["TX", "ID", "IN", "KS", "WY", "AZ", "FL", "NE"]) expect(states, s).not.toContain(s);
    for (const e of overlay.class3_equipment) expect(field(e.state, e.source_field), e.state).toContain(e.source_quote);
    expect(class3("AL").state.requirements.map((l) => l.code)).toContain("req_speedometer_class3");
    const one = evaluate({ state: "AL", riderAge: 30, rideDate: DATE, facts: classBike(1, { hasThrottle: false }), places: [] });
    expect(one.state.requirements.map((l) => l.code)).not.toContain("req_speedometer_class3");
  });

  it("quotes the statute where it was read, and labels the rest as the rules table", () => {
    const wi = class3("WI").state.requirements.find((l) => l.code === "req_speedometer_class3");
    expect(wi?.source?.kind).toBe("statute");
    expect(wi?.source?.quote).toContain("No person may operate a class 3 electric bicycle unless");
    const al = class3("AL").state.requirements.find((l) => l.code === "req_speedometer_class3");
    expect(al?.source?.kind).toBe("rules_table");
  });
});

describe("the County park note names SDCC 41.127 as unsettled for e-bikes", () => {
  it("shows the license, registration and roads-only rule next to the designated-areas note", () => {
    const result = evaluate({ state: "CA", riderAge: 10, rideDate: DATE, facts: classBike(1, { hasThrottle: false }), places: ["unincorporated_san_diego_county"] });
    const county = result.local[0];
    const notes = county.notes.map((l) => l.code);
    expect(notes).toEqual(expect.arrayContaining(["county_parks", "county_parks_vehicle_rule"]));
    const note = county.notes.find((l) => l.code === "county_parks_vehicle_rule");
    expect(note?.source?.citation).toContain("SDCC 41.127");
    expect(note?.source?.quote).toContain("No person shall operate a vehicle in a County park without a valid driver's license.");
    const en = renderLine(note ?? { code: "" }, "en", "California");
    expect(en).toContain("SDCC 41.127");
    expect(en).toContain("isn't settled");
    expect(renderLine(note ?? { code: "" }, "es", "California")).toContain("No está resuelto");
  });
});

describe("California from Jan 1, 2027 follows the enacted SB 1167 text on pedal assist past 28 mph", () => {
  const ca = (over: Partial<BikeFacts>, date: string) =>
    evaluate({ state: "CA", riderAge: 30, rideDate: date, places: [], facts: classBike(3, { hasThrottle: false, assistMph: 28, ...over }) });

  it("assist past 28 mph is not an e-bike from 2027, quoting 312.5(c)(3), and still can't confirm before then", () => {
    const later = ca({ assistOver28: true }, "2027-01-02");
    expect(later.state.status).toBe("not_ebike");
    expect(later.state.reason.code).toBe("caution_assist_fast_mode");
    expect(later.state.reason.source?.kind).toBe("statute");
    expect(later.state.reason.source?.quote).toContain("(3) A vehicle with a motor capable of providing assistance when the vehicle reaches a speed exceeding 28 miles per hour.");
    expect(renderLine(later.state.reason, "en", "California")).toBe("Pedal assist past 28 mph in any mode puts it outside California's e-bike definition.");
    expect(renderLine(later.state.reason, "es", "California")).toContain("28 mph");
    expect(bottomLine(later, "2027-01-02").kind).toBe("no_illegal");
    const now = ca({ assistOver28: true }, DATE);
    expect(now.state.status).toBe("cant_confirm");
    expect(now.state.reason.code).toBe("fits_no_class_mode");
  });

  it("asks the fast-mode question while either answer is open, and a No to both is still allowed", () => {
    const open = ca({ motorOver20: null, assistOver28: null }, "2027-01-02");
    expect(open.state.questions).toEqual(["fast_mode"]);
    expect(ca({}, "2027-01-02").state.status).toBe("yes");
  });

  it("quotes the table field it names, and the statute words it shows", () => {
    const caution = (overlayJson as unknown as { supplemental_cautions: { state: string; valid_from?: string; source_field: string; source_quote: string; statute_quote?: string }[] }).supplemental_cautions.find(
      (c) => c.state === "CA" && c.valid_from === "2027-01-01",
    );
    expect(caution?.statute_quote).toContain("on motor power alone");
    expect(field("CA", caution?.source_field ?? "")).toContain(caution?.source_quote ?? "?");
    expect(caution?.source_quote).toContain("assist past 28 mph");
  });
});

/** The radio picked in each group of a rendered card, in page order, as "legend: value". */
function picked(html: string): string[] {
  const out: string[] = [];
  for (const group of html.split("<fieldset").slice(1)) {
    const legend = /<legend[^>]*>([^<]*)<\/legend>/.exec(group)?.[1] ?? "";
    const radio = /<input[^>]*type="radio"[^>]*>/g;
    for (const tag of group.match(radio) ?? []) {
      if (tag.includes('checked=""')) out.push(`${legend.replace(/&#x27;/g, "'")}: ${/value="([^"]*)"/.exec(tag)?.[1]}`);
    }
  }
  return out;
}

describe("the follow-ups and the facts card always show the same answer", () => {
  const base: BikeFacts = { ...classBike(1, { hasThrottle: false }), hasFootPegs: false, needsPedalKit: false, weightLb: null, weightOver100: false };
  const followUps = (facts: BikeFacts) =>
    picked(renderToStaticMarkup(createElement(FollowUps, { lang: "en", questions: ["weight", "pegs_kit"], facts, onChange: () => undefined })));

  it("a pegs answer changed on the facts card shows in the follow-up", () => {
    expect(followUps(base)).toContain("Does it have foot pegs, or need a pedal kit to have pedals?: no");
    const yes = withFootPegs(base, "yes");
    expect(pegsKitShown(yes)).toBe("yes");
    expect(followUps(yes)).toContain("Does it have foot pegs, or need a pedal kit to have pedals?: yes");
    const unsure = withFootPegs(base, "unsure");
    expect(unsure.unsure).toContain("pegs_kit");
    expect(unsure.needsPedalKit).toBeNull();
    expect(pegsKitShown(unsure)).toBe("unsure");
    expect(followUps(unsure)).toContain("Does it have foot pegs, or need a pedal kit to have pedals?: unsure");
    // Back to no on the facts card clears the "not sure", and the follow-up shows no only if the kit is also no.
    const backToNo = withFootPegs(unsure, "no");
    expect(backToNo.unsure).not.toContain("pegs_kit");
    expect(pegsKitShown(backToNo)).toBeNull();
    expect(pegsKitShown(withFootPegs(base, "no"))).toBe("no");
  });

  it("a 'not sure' on the facts card pegs reaches the engine's not-sure line in Utah", () => {
    const facts = withFootPegs({ ...base, wheelCount: 2, wheelFrontIn: 20, wheelRearIn: 20, weightOver100: null }, "unsure");
    const result = evaluate({ state: "UT", riderAge: 30, rideDate: DATE, facts, places: [] });
    expect(result.state.status).toBe("cant_confirm");
    expect(result.state.questions).toEqual([]);
  });

  it("a weight typed on the facts card decides the follow-up weight answer", () => {
    expect(weightShown(base)).toBe("no");
    const heavy = withWeight({ ...base, unsure: ["weight"] }, 120);
    expect(heavy.unsure).not.toContain("weight");
    expect(weightShown(heavy)).toBe("yes");
    expect(followUps(heavy)).toContain("Does it weigh more than 100 pounds?: yes");
    expect(weightShown(withWeight(base, 100))).toBe("no");
  });

  it("the facts card shows the follow-up's pegs answer, including not sure", () => {
    const shape = (facts: BikeFacts) =>
      picked(renderToStaticMarkup(createElement(ShapeFacts, { lang: "en", facts, evidence: {}, onChange: () => undefined })));
    expect(shape({ ...base, hasFootPegs: null, needsPedalKit: null, unsure: ["pegs_kit"], wheelFrontIn: 20 })).toContain("Foot pegs for the rider?: unsure");
    expect(shape({ ...base, hasFootPegs: true })).toContain("Foot pegs for the rider?: yes");
  });

  it("keeps no copy of the pegs or weight answer in component state, so a click on the shown answer is never a no-op", () => {
    const followSource = readFileSync(join(__dirname, "..", "components", "FollowUps.tsx"), "utf8");
    expect(followSource).not.toMatch(/useState[^;]*(weight|pegs)/i);
    expect(followSource).toContain("value={weightShown(facts)}");
    expect(followSource).toContain("value={pegsKitShown(facts)}");
    const shapeSource = readFileSync(join(__dirname, "..", "components", "ShapeFacts.tsx"), "utf8");
    expect(shapeSource).not.toContain("useState");
    expect(shapeSource).toContain("withFootPegs(facts, v)");
  });
});
