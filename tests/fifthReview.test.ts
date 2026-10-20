// Regression tests for the fifth review (Oct 19, 2026). Each block names the problem it closes.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkerToday, DATA_CHECKED_ON, rideDateFor, rideDateIn } from "@/lib/checkerState";
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
