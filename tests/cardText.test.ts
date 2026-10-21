// Third review (Oct 19, 2026): what a family reads on the state, local and bottom-line cards,
// rendered from the real components in English and Spanish.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BottomLineCard } from "@/components/BottomLineCard";
import { VerdictCard } from "@/components/VerdictCard";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import type { BikeFacts, PlaceId, Verdict } from "@/lib/rules/types";
import { citationText, stateName, type Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { hasTemplate, renderLine } from "@/lib/i18n/verdicts";
import { classBike } from "./helpers";

const DAY = "2026-10-19";

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, "\n")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

const result = (state: string, age: number, facts: BikeFacts, places: PlaceId[] = []) =>
  evaluate({ state, riderAge: age, rideDate: DAY, facts, places });
const card = (v: Verdict, lang: Lang, stateCode: string) => text(renderToStaticMarkup(createElement(VerdictCard, { verdict: v, lang, stateCode, rideDate: DAY })));
const bottom = (state: string, age: number, facts: BikeFacts, lang: Lang, places: PlaceId[] = []) =>
  text(renderToStaticMarkup(createElement(BottomLineCard, { line: bottomLine(result(state, age, facts, places), DAY), lang, stateCode: state })));

describe("state card footer and sources", () => {
  it("says Alaska and Kentucky statutes were read but don't clearly cover e-bikes, not that a local rule is unclear", () => {
    for (const state of ["AK", "KY"]) {
      for (const lang of ["en", "es"] as const) {
        const shown = card(result(state, 30, classBike(1)).state, lang, state);
        expect(shown, `${state} ${lang}`).toContain(t(lang, "state_verified_unclear"));
        expect(shown, `${state} ${lang}`).not.toContain(t(lang, "verified_unclear"));
        const bl = bottom(state, 30, classBike(1), lang);
        expect(bl, `${state} ${lang}`).not.toContain(lang === "en" ? "not confirmed against statute text" : "no se confirmaron contra el texto");
      }
    }
    expect(card(result("CA", 30, classBike(1)).state, "en", "CA")).toContain(t("en", "state_verified_statute_verified"));
  });

  it("shows citation lists with commas, never semicolons", () => {
    expect(card(result("AK", 30, classBike(1)).state, "en", "AK")).toContain("13 AAC 40.010(a)(5)");
    expect(card(result("AK", 30, classBike(1)).state, "en", "AK")).not.toMatch(/;/);
    let checked = 0;
    for (const state of ["AK", "KY", "CA", "TX", "NY", "UT"]) {
      const v = result(state, 30, classBike(1)).state;
      const html = card(v, "en", state);
      for (const c of v.sources.map((s) => s.citation ?? "").filter((c) => c.includes(";"))) {
        expect(html).not.toContain(c);
        expect(html).toContain(citationText(c));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("fast-mode 'not sure' names the question still open", () => {
  const assistOpen = classBike(1, { motorOver20: false, assistOver28: null, switchable: null, unsure: ["fast_mode"] });
  const motorOpen = classBike(1, { motorOver20: null, assistOver28: false, switchable: null, unsure: ["fast_mode"] });

  it("talks about pedal assist past 28 mph when only that answer is not sure", () => {
    for (const lang of ["en", "es"] as const) {
      const shown = card(result("TX", 30, assistOpen).state, lang, "TX") + bottom("TX", 30, assistOpen, lang);
      expect(shown).toContain("28 mph");
      expect(shown).not.toContain(lang === "en" ? "20 mph on the motor alone" : "20 mph solo con el motor");
    }
  });

  it("talks about the motor alone when only that answer is not sure", () => {
    const shown = card(result("TX", 30, motorOpen).state, "en", "TX") + bottom("TX", 30, motorOpen, "en");
    expect(shown).toContain("20 mph on the motor alone");
    expect(shown).not.toContain("28 mph");
  });
});

describe("headlines in English and Spanish", () => {
  it("names a local place the way it reads mid-sentence", () => {
    const r = result("CA", 15, classBike(1), ["city_of_san_diego", "unincorporated_san_diego_county"]);
    const [city, county] = r.local;
    expect(renderLine(city.reason, "en", "California")).toBe("Allowed in the City of San Diego for a 15-year-old.");
    expect(renderLine(city.reason, "es", "California")).toBe("Permitida en la Ciudad de San Diego para alguien de 15 años.");
    expect(renderLine(county.reason, "en", "California")).toBe("Allowed in unincorporated San Diego County for a 15-year-old.");
    expect(renderLine(county.reason, "es", "California")).toBe("Permitida en la zona no incorporada del condado de San Diego para alguien de 15 años.");
  });

  it("keeps the article for the Distrito de Columbia in every Spanish sentence", () => {
    const dc = stateName("DC", "es");
    expect(renderLine(result("DC", 30, classBike(1)).state.reason, "es", dc)).toBe("Bicicleta eléctrica Clase 1. Permitida para alguien de 30 años en el Distrito de Columbia.");
    expect(renderLine(result("DC", 30, classBike(3)).state.reason, "es", dc)).toBe(
      "El Distrito de Columbia no reconoce las bicicletas eléctricas Clase 3, así que la ley la trata como un vehículo motorizado.",
    );
    const codes = ["allowed", "under_min_age", "no_pedals", "no_pedals_unclear", "over_watts", "watts_750_strict", "caution_trike", "caution_class_unclear", "unsure_weight", "caution_helmet_unknown", "bl_unverified_state"];
    for (const code of codes) {
      expect(hasTemplate(code), code).toBe(true);
      const es = renderLine({ code, params: { cls: 2, age: 30, minAge: 16, watts: 800, cap: 750, strict: 0 } }, "es", dc);
      expect(es, code).toMatch(/el Distrito de Columbia|El Distrito de Columbia|del Distrito de Columbia/);
      expect(es, code).not.toMatch(/(en|de) Distrito de Columbia|^Distrito de Columbia/);
    }
    expect(renderLine({ code: "caution_trike" }, "es", "California")).toBe("La definición de California podría no cubrir un triciclo.");
  });

  it("lists open questions with one 'and', in the order they appear on the page", () => {
    const line = { code: "bl_unanswered", params: { questions: "weight,wheels,fast_mode" } };
    expect(renderLine(line, "en", "Pennsylvania")).toBe("Answer the questions above about the wheels, fast modes and weight.");
    expect(renderLine(line, "es", "Pensilvania")).toBe("Responde las preguntas de arriba sobre las ruedas, los modos rápidos y el peso.");
  });
});
