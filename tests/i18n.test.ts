// Every line the engine can produce must have an English and a Spanish sentence.

import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { STATE_CODES } from "@/lib/rules/compile";
import { PLACE_IDS } from "@/lib/rules/local";
import { CHANGE_CODES, hasTemplate, renderLine } from "@/lib/i18n/verdicts";
import { t, UI_KEYS } from "@/lib/i18n/ui";
import { OVERLAY } from "@/lib/rules/compile";
import type { Line } from "@/lib/rules/types";
import { classBike } from "./helpers";

const VARIANTS = [
  {},
  { ratedWatts: 750 },
  { ratedWatts: 1600 },
  { ratedWatts: null, peakWatts: 900 },
  { ratedWatts: null, wattsUpTo: 900 },
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
          for (const date of ["2026-10-17", "2026-08-12", "2027-01-01", "2027-05-05"]) {
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

  it("has a summary for every scheduled change in the overlay", () => {
    const scheduled = OVERLAY.scheduled_changes.map((c) => c.code).sort();
    expect([...CHANGE_CODES].sort()).toEqual(scheduled);
  });

  it("renders in both languages without leftover placeholders", () => {
    const line: Line = { code: "local_under_12", params: { place: "city_of_san_diego", since: "2026-08-13", cls: 2 } };
    const en = renderLine(line, "en", "California");
    const es = renderLine(line, "es", "California");
    expect(en).toContain("City of San Diego");
    expect(en).toContain("Aug 13, 2026");
    expect(es).toContain("Ciudad de San Diego");
    expect(es).toContain("13 de agosto de 2026");
    expect(en + es).not.toMatch(/undefined|NaN|\{|\}/);
  });

  it("writes in Arnav's style: no em dashes or semicolons in user-facing text", () => {
    const samples = [...codes]
      .filter((c) => hasTemplate(c))
      .flatMap((code) => {
        const line: Line = { code, params: { cls: 2, age: 14, minAge: 16, watts: 750, cap: 750, strict: 1, peak: 900, mph: 28, hp: 2, underAge: 18, place: "carlsbad", since: "2026-03-26", from: "2026-10-12", date: "2027-01-01", change: "ca_2027_01_01", verdict: "unclear", questions: "fast_mode,wheels" } };
        return [renderLine(line, "en", "California"), renderLine(line, "es", "California")];
      });
    for (const s of samples) {
      expect(s, s).not.toMatch(/[—;]/);
      expect(s, s).not.toMatch(/undefined|NaN|\{|\}/);
    }
  });

  it("covers the bottom-line sentences, and the YES headline reads SÍ in Spanish", () => {
    for (const code of ["bl_unanswered", "bl_unsure_fast_mode", "bl_unverified_state", "bl_unverified_primary_partial", "bl_unverified_primary_not_found"]) {
      expect(hasTemplate(code), code).toBe(true);
      expect(codes.has(code) || code === "bl_unverified_state" || code === "bl_unverified_primary_not_found", code).toBe(true);
    }
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
});
