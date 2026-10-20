// End-to-end cases from the fourth review (Oct 19, 2026): listing text, through the parser and
// the engine, to the bottom line. The family's only answer is No and No to the fast-mode questions.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NumberField } from "@/components/controls";
import { FactsCard } from "@/components/FactsCard";
import { numberInRange, requestGate, WHEEL_MAX_IN, WHEEL_MIN_IN, withWheelCount, withWheelSize } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText } from "@/lib/extract/parse";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, type BikeFacts, type PlaceId } from "@/lib/rules/types";
import sanDiego from "@/data/rules/san_diego_local.json";
import { renderLine } from "@/lib/i18n/verdicts";
import { t } from "@/lib/i18n/ui";
import { ACCURACY_TEXT } from "@/lib/i18n/accuracy";
import { classBike } from "./helpers";

const DATE = "2026-10-20";

/** The facts card's visible text, with each number box shown as [value]. */
function factsCardText(text: string, lang: "en" | "es" = "en"): string {
  const e = parseSpecText(text, "listing");
  const html = renderToStaticMarkup(
    createElement(FactsCard, {
      lang,
      facts: factsFromExtraction(e, emptyFacts()),
      evidence: e.evidence,
      flags: e.flags,
      onChange: () => undefined,
      onCheck: () => undefined,
    }),
  );
  return html
    .replace(/<input[^>]*type="number"[^>]*value="([^"]*)"[^>]*>/g, "[$1]")
    .replace(/<input[^>]*type="radio"[^>]*>/g, (tag) => (tag.includes('checked=""') ? `(picked ${/value="([^"]*)"/.exec(tag)?.[1]})` : ""))
    .replace(/<[^>]+>/g, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
}

function flow(text: string, state: string, age: number, over: Partial<BikeFacts> = {}, places: PlaceId[] = []) {
  const extraction = parseSpecText(text, "listing");
  const facts: BikeFacts = { ...factsFromExtraction(extraction, emptyFacts()), motorOver20: false, assistOver28: false, ...over };
  const result = evaluate({ state, riderAge: age, rideDate: DATE, facts, places });
  return { extraction, facts, result, kind: bottomLine(result, DATE).kind };
}

describe("speeds", () => {
  it("a 120 km/h e-moto stays blocked, since its speed is read whole", () => {
    const { facts, result, kind } = flow("Class 2 e-bike with pedals, 500W rated, throttle. Top speed 120 km/h.", "CA", 30);
    expect(facts.topSpeedMph).toBe(74.6);
    expect(result.state.status).toBe("cant_confirm");
    expect(result.state.reason).toMatchObject({ code: "fits_no_class_speed", params: { mph: 74.6 } });
    expect(kind).toBe("no_unconfirmed");
  });
});

describe("a negated throttle after a speed", () => {
  it("'Top speed 20 mph, no throttle' is a plain Class 1 yes, not facts that disagree", () => {
    const { facts, result, kind } = flow("Class 1 e-bike. 250W rated. Top speed 20 mph, no throttle. Pedals.", "CA", 30, {}, ["encinitas"]);
    expect(facts.throttleMph).toBeNull();
    expect(facts.hasThrottle).toBe(false);
    expect(result.state.status).toBe("yes");
    expect(kind).toBe("yes");
  });

  it("a throttle speed in the facts stays on the card even when the throttle answer is no", () => {
    const html = renderToStaticMarkup(
      createElement(FactsCard, {
        lang: "en",
        facts: { ...emptyFacts(), hasPedals: true, classes: [1], hasThrottle: false, throttleMph: 20 },
        evidence: {},
        flags: [],
        onChange: () => undefined,
        onCheck: () => undefined,
      }),
    );
    expect(html).toContain("Throttle top speed (mph)");
    expect(html).toContain('value="20"');
  });
});

describe("pedals in a FAQ or an options list", () => {
  const base = "Class 2 electric bike. 500W rated motor. Thumb throttle up to 20 mph. 20 x 4.0 tires.";
  it("'Does it have pedals? No.' is a no-pedal machine, never a YES", () => {
    const { facts, result, kind } = flow(`${base} FAQ: Does it have pedals? No.`, "CA", 14, {}, ["encinitas"]);
    expect(facts.hasPedals).toBe(false);
    expect(result.state.status).toBe("not_ebike");
    expect(kind).toBe("no_illegal");
  });
  it("'Pedals Included: No' and 'Pedals (sold separately)' leave pedals to the family, so no YES yet", () => {
    for (const tail of ["Pedals Included: No", "Includes pedals: No", "Pedals (sold separately)", "Pedals: Optional"]) {
      const { facts, result, kind } = flow(`${base} ${tail}`, "CA", 14, {}, ["encinitas"]);
      expect(facts.hasPedals, tail).toBeNull();
      expect(result.state.status, tail).toBe("cant_confirm");
      expect(result.state.reason.code, tail).toBe("pedals_unknown");
      expect(kind, tail).toBe("no_unconfirmed");
    }
  });
});

describe("weights", () => {
  it("a 108 lb cargo bike in Pennsylvania is over the 100 lb line, not 12 lb from its battery", () => {
    const { facts, result, kind } = flow(
      "Hauler Cargo E-Bike. Class 1 pedal assist, no throttle. Motor: 500W rated. Battery: 48V 20Ah, battery weight: 12 lbs. Tires: 20 x 4.0 front and rear. Bike weight: 108 lbs. Payload capacity: 400 lbs.",
      "PA",
      30,
    );
    expect(facts.weightLb).toBe(108);
    expect(result.state.status).toBe("not_ebike");
    expect(result.state.reason.code).toBe("caution_weight");
    expect(kind).toBe("no_illegal");
  });
  it("two different weights leave the weight to the family in Pennsylvania", () => {
    const { result, kind } = flow("Class 1 pedal assist, no throttle. 500W rated. Pedals. 20 x 4.0 tires. Weight: 62 lbs. Weight: 108 lbs.", "PA", 30);
    expect(result.state.status).toBe("need_info");
    expect(result.state.questions).toContain("weight");
    expect(kind).not.toBe("yes");
  });
});

describe("wheel sizes and trike words", () => {
  it("Texas, age 8: a 12 in kids bike that fits a 16 in upgrade kit is asked about, never a YES", () => {
    const text =
      "Zoomy 12 Kids E-Bike. Wheel size: 12 in. Class 1 pedal assist, no throttle. 250W rated. Grows with your child: the frame also fits our 16-inch wheels upgrade kit.";
    const { facts, result, kind } = flow(text, "TX", 8, { hasPedals: true });
    expect(facts.wheelFrontIn).toBeNull();
    expect(result.state.status).toBe("need_info");
    expect(result.state.questions).toContain("wheels");
    expect(kind).not.toBe("yes");
    // The true 12 in answer gives the right result.
    expect(flow(text, "TX", 8, { hasPedals: true, wheelFrontIn: 12, wheelRearIn: 12, wheelCount: 2 }).kind).toBe("no_illegal");
  });
  it("Arizona, age 7: 'replaces the trike' leaves the wheel count to the family, and a 12 in two-wheeler is not an e-bike", () => {
    const text =
      "Zoomy 12 Kids E-Bike - the bike that replaces the trike\nClass 1 pedal assist e-bike for ages 5 to 8. No throttle. 250W rated motor. Top assisted speed 10 mph. Tires: 12 x 2.4 knobby.";
    const { facts, result, kind } = flow(text, "AZ", 7);
    expect(facts.wheelCount).toBeNull();
    expect(result.state.status).toBe("need_info");
    expect(result.state.questions).toContain("wheels");
    expect(kind).not.toBe("yes");
    expect(flow(text, "AZ", 7, { wheelCount: 2 }).result.state.status).toBe("not_ebike");
  });
});

describe("number fields take only numbers in range", () => {
  it("a wheel size of 57, read off a millimeter tire size, counts as not known", () => {
    expect(numberInRange("57", WHEEL_MIN_IN, WHEEL_MAX_IN)).toBeNull();
    expect(numberInRange("12", WHEEL_MIN_IN, WHEEL_MAX_IN)).toBe(12);
    expect(numberInRange("27.5", WHEEL_MIN_IN, WHEEL_MAX_IN)).toBe(27.5);
    expect(numberInRange("", WHEEL_MIN_IN, WHEEL_MAX_IN)).toBeNull();
    expect(numberInRange("abc", 0, 99)).toBeNull();
    expect(numberInRange("-5", 0, 99)).toBeNull();
  });

  it("Texas, age 8: typing 57 for the wheels leaves the question open instead of a YES", () => {
    const asked = classBike(1, { wheelFrontIn: null, wheelRearIn: null, wheelCount: null });
    const typed = withWheelCount(withWheelSize(asked, numberInRange("57", WHEEL_MIN_IN, WHEEL_MAX_IN), true), 2);
    const result = evaluate({ state: "TX", riderAge: 8, rideDate: DATE, facts: typed, places: [] });
    expect(result.state.status).toBe("need_info");
    expect(result.state.questions).toContain("wheels");
    expect(bottomLine(result, DATE).kind).not.toBe("yes");
    const real = withWheelCount(withWheelSize(asked, numberInRange("12", WHEEL_MIN_IN, WHEEL_MAX_IN), true), 2);
    expect(bottomLine(evaluate({ state: "TX", riderAge: 8, rideDate: DATE, facts: real, places: [] }), DATE).kind).toBe("no_illegal");
  });

  it("shows the error next to a number out of range, and keeps what was typed", () => {
    const html = renderToStaticMarkup(
      createElement(NumberField, { label: "Wheel size", value: 57, min: 6, max: 30, onChange: () => undefined, rangeError: "Enter a number from 6 to 30." }),
    );
    expect(html).toContain('value="57"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Enter a number from 6 to 30.");
    const ok = renderToStaticMarkup(
      createElement(NumberField, { label: "Wheel size", value: 12, min: 6, max: 30, onChange: () => undefined, rangeError: "Enter a number from 6 to 30." }),
    );
    expect(ok).not.toContain("Enter a number");
  });
});

describe("the facts card shows every wheel, wheel count and weight fact it read", () => {
  const PA = "Hauler Cargo E-Bike. Class 1 pedal assist, no throttle. Motor: 500W rated. Battery: 48V 20Ah, battery weight: 12 lbs. Tires: 20 x 4.0 front and rear. Bike weight: 108 lbs. Payload capacity: 400 lbs.";
  const TX = "Zoomy 12 Kids E-Bike. Wheel size: 12 in. Class 1 pedal assist, no throttle. 250W rated. Grows with your child: the frame also fits our 16-inch wheels upgrade kit.";
  const AZ = "Zoomy 12 Kids E-Bike - the bike that replaces the trike\nClass 1 pedal assist e-bike for ages 5 to 8. No throttle. 250W rated motor. Top assisted speed 10 mph. Tires: 12 x 2.4 knobby.";

  it("shows the weight it read, with the words it came from", () => {
    const card = factsCardText(PA);
    expect(card).toContain("Wheels and weight");
    expect(card).toMatch(/Weight with the battery \(pounds\)\s+\[108\]/);
    expect(card).toContain("Bike weight: 108 lbs.");
    expect(card).toMatch(/Wheel size \(inches\)\s+\[20\]/);
  });

  it("shows the wheel sizes it found but did not use", () => {
    const card = factsCardText(TX);
    expect(card).toMatch(/Wheel size \(inches\)\s+\[\]/);
    expect(card).toContain("Wheel size: 12 in.");
    expect(card).toContain("The text names different wheel sizes");
  });

  it("shows the trike words it found and leaves the number of wheels for the family", () => {
    const card = factsCardText(AZ);
    expect(card).toContain("Number of wheels");
    expect(card).not.toContain("(picked 3)");
    expect(card).not.toContain("(picked 2)");
    expect(card).toContain("replaces the trike");
    expect(card).toContain("The text mentions a trike or three wheels");
    expect(card).toMatch(/Wheel size \(inches\)\s+\[12\]/);
    // A count the family picks shows as picked.
    const picked = renderToStaticMarkup(
      createElement(FactsCard, { lang: "en", facts: { ...emptyFacts(), wheelCount: 3 }, evidence: {}, flags: [], onChange: () => undefined, onCheck: () => undefined }),
    );
    expect(/<input[^>]*checked=""[^>]*value="3"/.test(picked) || /<input[^>]*value="3"[^>]*checked=""/.test(picked)).toBe(true);
  });

  it("is in Spanish too, and stays out of the way when nothing was read", () => {
    expect(factsCardText(PA, "es")).toContain("Peso con la batería (libras)");
    expect(factsCardText("Class 1. 250W rated. Pedal assist to 20 mph, no throttle.")).not.toContain("Wheels and weight");
  });
});

describe("a slow label or link read never replaces the bike the family moved on to", () => {
  it("only the newest read counts, and moving on drops every read still running", () => {
    const gate = requestGate();
    const label = gate.start();
    expect(label()).toBe(true);
    const link = gate.start();
    expect(label()).toBe(false);
    expect(link()).toBe(true);
    gate.cancel();
    expect(link()).toBe(false);
    const next = gate.start();
    expect(next()).toBe(true);
  });

  it("is the guard the label and link readers run, and tabs, typing and starting over cancel it", () => {
    const source = (name: string) => readFileSync(join(__dirname, "..", "components", name), "utf8");
    const input = source("BikeInput.tsx");
    expect(input.match(/const isCurrent = gate\.start\(\);/g)?.length).toBe(2);
    expect(input.match(/if \(!isCurrent\(\)\) return;\n\s+[^\n]*\n(?:[^\n]*\n)*?\s+onRead\(/g)?.length).toBe(2);
    expect(input).toContain("if (x.id !== tab) gate.cancel();");
    expect(input).toMatch(/gate\.start\(\);\n\s+const extraction = parseSpecText\(paste, "listing"\);/);
    const checker = source("Checker.tsx");
    expect(checker).toContain("useState(requestGate)");
    expect(checker).toMatch(/function handleManual\(\) \{\n\s+readGate\.cancel\(\);/);
    expect(checker).toMatch(/onClick=\{\(\) => \{\n\s+readGate\.cancel\(\);\n\s+setStage\("input"\);/);
    expect(checker).toContain("gate={readGate}");
  });
});

describe("California fast modes match what 312.5(d) says", () => {
  const fast = (over: Partial<BikeFacts>, date = DATE) => {
    const facts = classBike(3, { assistMph: 28, motorOver20: false, assistOver28: false, wheelFrontIn: 26, wheelRearIn: 26, ...over });
    const result = evaluate({ state: "CA", riderAge: 30, rideDate: date, facts, places: [] });
    return { result, kind: bottomLine(result, date).kind };
  };

  it("pedal assist past 28 mph is can't confirm, not 'not an e-bike' under a statute that doesn't say so", () => {
    const { result, kind } = fast({ assistOver28: true });
    expect(result.state.status).toBe("cant_confirm");
    expect(result.state.reason.code).toBe("fits_no_class_mode");
    expect(kind).toBe("no_unconfirmed");
    // From Jan 1, 2027 SB 1167's 312.5(c)(3) says so, as the fifth review read in the chaptered text.
    const later = fast({ assistOver28: true }, "2027-01-02").result.state;
    expect(later.status).toBe("not_ebike");
    expect(later.reason.code).toBe("caution_assist_fast_mode");
  });

  it("the motor alone past 20 mph is not an e-bike, citing 312.5(d) now and SB 1167 from 2027", () => {
    const now = fast({ motorOver20: true });
    expect(now.result.state.status).toBe("not_ebike");
    expect(now.result.state.reason.code).toBe("caution_fast_mode");
    expect(now.result.state.reason.source?.citation).toBe("Cal. Veh. Code 312.5(d)");
    expect(now.result.state.reason.detail).toContain("312.5(d)");
    expect(now.kind).toBe("no_illegal");
    const later = fast({ motorOver20: true }, "2027-01-02");
    expect(later.result.state.status).toBe("not_ebike");
    expect(later.result.state.reason.source?.citation).toBe("Cal. Veh. Code 312.5(c)(2), (3) as rewritten by SB 1167 (Stats. 2026, ch. 846)");
    expect(later.result.state.reason.source?.url).toContain("SB1167");
  });

  it("a 'not sure' answer still blocks a yes in California", () => {
    const { result, kind } = fast({ assistOver28: null, unsure: ["fast_mode"] });
    expect(result.state.status).toBe("cant_confirm");
    expect(kind).toBe("no_unconfirmed");
  });
});

describe("the SDUHSD 'What's missing' line names every rule that rests only on the web page", () => {
  // Words each rule goes by in the English and Spanish text. A new web-page-only rule with no
  // entry here fails this test, so the line can't fall behind the data again.
  const WORDS: Record<string, { en: string[]; es: string[] }> = {
    class_1_and_2_only_on_campus: { en: ["class"], es: ["clase"] },
    district_tag_required: { en: ["tag"], es: ["etiqueta"] },
    safety_course_required: { en: ["course"], es: ["curso"] },
    emotos_not_permitted_on_campus: { en: ["e-moto"], es: ["motos eléctricas"] },
    walk_bikes_on_campus_and_factory_passenger_seat: { en: ["walk", "passenger"], es: ["caminar", "pasajero"] },
  };
  const record = (sanDiego as unknown as { jurisdictions: Record<string, unknown>[] }).jurisdictions.find((j) => j.id === "sduhsd_campuses");
  const rules = Object.values(record ?? {})
    .filter(Array.isArray)
    .flat()
    .filter((r): r is { rule: string; source_type: string } => typeof r === "object" && r !== null && "rule" in r && "source_type" in r);

  it("reads the record", () => {
    expect(rules.length).toBeGreaterThanOrEqual(6);
    expect(rules.find((r) => r.rule === "helmet_all_ages_for_campus_riders")?.source_type).toBe("administrative_regulation");
  });

  it("names each web-page-only rule in the missing line, the page footer and the accuracy page, in both languages", () => {
    const webOnly = rules.filter((r) => r.source_type === "official_page").map((r) => r.rule);
    expect(webOnly).toContain("walk_bikes_on_campus_and_factory_passenger_seat");
    expect(webOnly).toContain("emotos_not_permitted_on_campus");
    for (const lang of ["en", "es"] as const) {
      const texts = [
        renderLine({ code: "bl_unverified_primary_partial", params: { place: "sduhsd_campuses" } }, lang, "California"),
        t(lang, "dataNote"),
        String(Object.values(ACCURACY_TEXT[lang]).find((v) => typeof v === "string" && v.includes("SDUHSD"))),
      ];
      for (const rule of webOnly) {
        expect(WORDS[rule], rule).toBeDefined();
        for (const text of texts) for (const word of WORDS[rule][lang]) expect(text.toLowerCase(), `${lang} ${rule}`).toContain(word);
      }
    }
  });

  it("keeps SDUHSD strict: a campus check is still NO, not confirmed", () => {
    const result = evaluate({ state: "CA", riderAge: 15, rideDate: DATE, facts: classBike(1), places: ["sduhsd_campuses"] });
    expect(bottomLine(result, DATE).kind).toBe("no_unconfirmed");
  });
});
