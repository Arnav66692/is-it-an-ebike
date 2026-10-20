// Every line the engine can produce must have an English and a Spanish sentence.

import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { STATE_CODES } from "@/lib/rules/compile";
import { PLACE_IDS } from "@/lib/rules/local";
import { CHANGE_CODES, hasTemplate, renderLine } from "@/lib/i18n/verdicts";
import { t, UI_KEYS } from "@/lib/i18n/ui";
import { ACCURACY_TEXT, localizeResult, type AccuracyText } from "@/lib/i18n/accuracy";
import { placeNameInList, stateLaw } from "@/lib/i18n/names";
import { OVERLAY } from "@/lib/rules/compile";
import { CAUTION_TOPICS } from "@/lib/rules/state";
import { QUESTION_IDS, type Line } from "@/lib/rules/types";
import { classBike } from "./helpers";

const VARIANTS = [
  {},
  { ratedWatts: 750 },
  { ratedWatts: 1600 },
  { ratedWatts: null, peakWatts: 900 },
  { ratedWatts: null, wattsUpTo: 900 },
  // A 750 W listing figure sits over Nebraska's 1 hp line (fourth review).
  { ratedWatts: null, wattsUpTo: 750 },
  { ratedWatts: null, peakWatts: 748 },
  { ratedWatts: null },
  { hasPedals: false },
  { hasPedals: null },
  { wheelFrontIn: 12, wheelRearIn: 12 },
  { wheelCount: 3 as const },
  { weightLb: 120 },
  { hasFootPegs: true },
  { needsPedalKit: true },
  { motorOver20: true },
  { motorOver20: null, assistOver28: null, switchable: null },
  { motorOver20: null, assistOver28: null, switchable: null, unsure: ["fast_mode" as const] },
  { wheelCount: null, wheelFrontIn: null, wheelRearIn: null, unsure: ["wheels" as const] },
  { weightLb: null, weightOver100: null, unsure: ["weight" as const] },
  { hasFootPegs: null, needsPedalKit: null, unsure: ["pegs_kit" as const] },
  { classes: [], hasThrottle: null, throttleMph: null, assistMph: null },
  { hasThrottle: true },
  { assistMph: 32 },
];

function collect(): Set<string> {
  const codes = new Set<string>();
  const add = (lines: Line[]) => lines.forEach((l) => codes.add(l.code));
  for (const state of STATE_CODES) {
    for (const cls of [1, 2, 3] as const) {
      for (const variant of VARIANTS) {
        for (const age of [6, 11, 12, 14, 15, 16, 18, 30]) {
          // California also runs past the San Diego check horizon and past the Jan 1, 2029 end of
          // the under-12 power, so the local sentences for those dates are produced for real.
          const dates = ["2026-10-17", "2026-08-12", "2027-01-01", "2027-05-05", ...(state === "CA" ? ["2026-12-01", "2029-01-02"] : [])];
          for (const date of dates) {
            const r = evaluate({
              state,
              riderAge: age,
              rideDate: date,
              facts: classBike(cls, variant),
              places: state === "CA" ? PLACE_IDS : [],
            });
            for (const v of [r.state, ...r.local]) {
              add([v.reason, ...v.requirements, ...v.cautions, ...v.notes]);
            }
            for (const places of state === "CA" ? [PLACE_IDS, PLACE_IDS.slice(0, 1)] : [[]]) {
              const single = evaluate({ state, riderAge: age, rideDate: date, facts: classBike(cls, variant), places });
              const bl = bottomLine(single, date);
              add([...bl.blocked.map((b) => b.line), ...bl.missing.map((m) => m.line), ...bl.requirements]);
            }
          }
        }
      }
    }
  }
  return codes;
}

describe("translations", () => {
  const codes = collect();

  it("covers every line code the engine produced", () => {
    const missing = [...codes].filter((c) => c !== "treated_as" && !hasTemplate(c));
    expect(missing).toEqual([]);
    expect(codes.size).toBeGreaterThan(60);
  });

  it("has a sentence for every caution topic, whether the rule applies or can't be settled", () => {
    // These two come only from a caution with no condition, which always applies, so they never
    // need an "unsure" sentence.
    const alwaysApplies = ["class_not_recognized", "class_unclear"];
    for (const topic of CAUTION_TOPICS) {
      expect(hasTemplate(`caution_${topic}`), topic).toBe(true);
      if (!alwaysApplies.includes(topic)) expect(hasTemplate(`unsure_${topic}`), topic).toBe(true);
    }
  });

  it("Nebraska's 1 hp line shows a sentence, never the raw code, in both languages", () => {
    for (const over of [{ wattsUpTo: 750 }, { peakWatts: 750 }]) {
      const r = evaluate({ state: "NE", riderAge: 30, rideDate: "2026-10-20", facts: classBike(1, { ratedWatts: null, ...over }), places: [] });
      expect(r.state.status).toBe("cant_confirm");
      expect(r.state.reason.code).toBe("unsure_watts_hp");
      for (const lang of ["en", "es"] as const) {
        const text = renderLine(r.state.reason, lang, "Nebraska");
        expect(text).not.toContain("_");
        expect(text).toContain("745 W");
      }
      const missing = bottomLine(r, "2026-10-20").missing.map((m) => renderLine(m.line, "es", "Nebraska"));
      expect(missing.join(" ")).not.toMatch(/unsure_|caution_/);
    }
  });

  it("has a summary for every scheduled change in the overlay", () => {
    const scheduled = OVERLAY.scheduled_changes.map((c) => c.code).sort();
    expect([...CHANGE_CODES].sort()).toEqual(scheduled);
  });

  it("renders in both languages without leftover placeholders", () => {
    const line: Line = { code: "local_under_12", params: { place: "city_of_san_diego", since: "2026-08-13", cls: 2 } };
    const en = renderLine(line, "en", "California");
    const es = renderLine(line, "es", "California");
    expect(en).toContain("Aug 13, 2026");
    expect(es).toContain("13 de agosto de 2026");
    expect(en + es).not.toMatch(/undefined|NaN|\{|\}/);
  });

  it("doesn't repeat the place name in the under-12 sentence, since the card title and the bottom-line label already name it", () => {
    const line: Line = { code: "local_under_12", params: { place: "city_of_san_diego", since: "2026-08-13", cls: 2 } };
    expect(renderLine(line, "en", "California")).not.toContain("City of San Diego");
    expect(renderLine(line, "es", "California")).not.toContain("Ciudad de San Diego");
  });

  it("names every follow-up question in both languages, never by its raw id", () => {
    for (const id of QUESTION_IDS) {
      for (const lang of ["en", "es"] as const) {
        const text = renderLine({ code: "bl_unanswered", params: { questions: id } }, lang, "California");
        expect(text, `${lang} ${id}`).not.toContain("_");
        expect(text, `${lang} ${id}`).not.toMatch(/the bike|la bicicleta/);
        if (lang === "es") expect(text, id).not.toContain(id);
      }
    }
  });

  it("writes in Arnav's style: no em dashes or semicolons in user-facing text", () => {
    const samples = [...codes]
      .filter((c) => hasTemplate(c))
      .flatMap((code) => {
        const line: Line = { code, params: { cls: 2, age: 14, minAge: 16, watts: 750, cap: 750, strict: 1, peak: 900, mph: 28, hp: 2, underAge: 18, place: "carlsbad", since: "2026-03-26", from: "2026-10-12", date: "2027-01-01", checked: "2026-10-19", through: "2026-11-18", powerEnds: "2029-01-01", change: "ca_2027_01_01", verdict: "unclear", questions: "fast_mode,wheels" } };
        return [renderLine(line, "en", "California"), renderLine(line, "es", "California")];
      });
    for (const s of samples) {
      expect(s, s).not.toMatch(/[—;]/);
      expect(s, s).not.toMatch(/undefined|NaN|\{|\}/);
    }
  });

  it("covers the bottom-line sentences, and the YES headline reads SÍ in Spanish", () => {
    // Each of these must come out of a real engine run on today's data, not only have a template.
    for (const code of ["bl_unanswered", "bl_unsure_fast_mode", "bl_unverified_primary_partial", "local_under_12_no_end", "local_under_12_after_check", "carlsbad_class3_trails"]) {
      expect(hasTemplate(code), code).toBe(true);
      expect(codes.has(code), code).toBe(true);
    }
    // No record is primary_not_found today, so this one is checked on a real result with its level changed.
    const real = evaluate({ state: "CA", riderAge: 30, rideDate: "2026-10-19", facts: classBike(1), places: ["encinitas"] });
    const notFound = { ...real, local: real.local.map((v) => ({ ...v, level: "primary_not_found" as const })) };
    const gap = bottomLine(notFound, "2026-10-19").missing.map((m) => m.line.code);
    expect(gap).toEqual(["bl_unverified_primary_not_found"]);
    expect(hasTemplate("bl_unverified_primary_not_found")).toBe(true);
    // The only unverified state records today (Alaska, Kentucky) never confirm an e-bike, and their card
    // line already says so. So this one is checked on a real state result with its level changed too.
    const secondary = { ...real, local: [], state: { ...real.state, verified: "secondary_only" } };
    expect(bottomLine(secondary, "2026-10-19").missing.map((m) => m.line.code)).toEqual(["bl_unverified_state"]);
    expect(hasTemplate("bl_unverified_state")).toBe(true);
    expect(t("en", "blYes")).toBe("YES");
    expect(t("es", "blYes")).toBe("SÍ");
    expect(t("en", "blNo")).toBe("NO");
    expect(t("es", "blNo")).toBe("NO");
  });

  it("keeps every interface string in Arnav's style in both languages, and the legal-advice line on verdicts", () => {
    for (const key of UI_KEYS) {
      for (const lang of ["en", "es"] as const) {
        const text = t(lang, key);
        expect(text, `${lang}.${key}`).not.toMatch(/[—;]/);
      }
    }
    expect(t("en", "notLegalAdvice")).toContain("General information, not legal advice.");
  });

  it("never calls Washington, DC a state, and keeps the article in Spanish", () => {
    expect(stateLaw("DC", "en", "title")).toBe("Washington, DC law");
    expect(stateLaw("DC", "es", "title")).toBe("Ley del Distrito de Columbia");
    expect(stateLaw("DC", "es", "inline")).toBe("la ley del Distrito de Columbia");
    expect(t("es", "blCoversStateOnly", { law: stateLaw("DC", "es", "inline") })).toBe("Esto cubre solo la ley del Distrito de Columbia.");
    expect(t("en", "blCoversStateOnly", { law: stateLaw("DC", "en", "inline") })).toBe("This covers Washington, DC law only.");
    expect(stateLaw("CA", "en", "title")).toBe("California state law");
    expect(stateLaw("CA", "es", "inline")).toBe("la ley estatal de California");
    expect(t("es", "howBody")).not.toContain("Washington, DC");
  });

  it("gives common-noun places a lowercase list form, so lists don't read 'and An SDUHSD campus'", () => {
    expect(placeNameInList("sduhsd_campuses", "en")).toBe("an SDUHSD campus");
    expect(placeNameInList("sduhsd_campuses", "es")).toBe("una escuela de SDUHSD");
    expect(placeNameInList("unincorporated_san_diego_county", "en")).toBe("unincorporated San Diego County");
    expect(placeNameInList("city_of_san_diego", "en")).toBe("City of San Diego");
  });
});

describe("accuracy page text", () => {
  const sample = (text: AccuracyText): string[] =>
    Object.values(text).map((v) => (typeof v === "function" ? (v as (...a: unknown[]) => string)("1,234", 7) : v));

  it("has every string in English and Spanish, in Arnav's style", () => {
    for (const lang of ["en", "es"] as const) {
      for (const s of sample(ACCURACY_TEXT[lang])) {
        expect(s, `${lang}: ${s}`).not.toMatch(/[—;]/);
        expect(s, `${lang}: ${s}`).not.toMatch(/undefined|NaN/);
      }
    }
    expect(Object.keys(ACCURACY_TEXT.es).sort()).toEqual(Object.keys(ACCURACY_TEXT.en).sort());
  });

  it("translates the bottom-line rows, not only the English page", () => {
    const keys = ["blTitle", "blFalseYes", "blMissedYes", "blFalseIllegal", "blMissedIllegal", "blMissingCaveat", "blUncheckedYes", "blNoIllegal", "blNoUnconfirmed"] as const;
    for (const key of keys) expect(ACCURACY_TEXT.es[key], key).not.toBe(ACCURACY_TEXT.en[key]);
  });

  it("puts pilot results like '9 of 12' into Spanish", () => {
    expect(localizeResult("9 of 12", "es")).toBe("9 de 12");
    expect(localizeResult("0 of 24 photos", "es")).toBe("0 de 24 fotos");
    expect(localizeResult("9 of 12", "en")).toBe("9 of 12");
  });
});
