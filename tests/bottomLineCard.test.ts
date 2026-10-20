// Renders the real bottom-line card and checks what a family would read on it.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { announcement, BottomLineCard, whereLabel } from "@/components/BottomLineCard";
import { evaluate } from "@/lib/rules";
import { bottomLine, type BottomLine } from "@/lib/rules/bottomLine";
import { PLACE_IDS } from "@/lib/rules/local";
import type { BikeFacts, PlaceId } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { classBike } from "./helpers";

const DAY = "2026-10-19";

function line(state: string, age: number, facts: BikeFacts, places: PlaceId[], otherPlaces = false): BottomLine {
  return bottomLine(evaluate({ state, riderAge: age, rideDate: DAY, facts, places, otherPlaces }), DAY);
}

/** The card's visible text, with tags turned into line breaks. */
function render(bl: BottomLine, lang: Lang, stateCode = "CA"): string {
  return renderToStaticMarkup(createElement(BottomLineCard, { line: bl, lang, stateCode }))
    .replace(/<[^>]+>/g, "\n")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

describe("bottom-line card", () => {
  it("with no place picked, a YES says city and county rules were not checked", () => {
    const text = render(line("CA", 13, classBike(1), []), "en");
    expect(text).toContain("YES");
    expect(text).toContain("This covers California state law only.");
    expect(text).toContain("City and county rules were not checked.");
  });

  it("a YES with Somewhere else ticked says other places were not checked", () => {
    const text = render(line("CA", 30, classBike(1), ["encinitas"], true), "en");
    expect(text).toContain("Rules for other places you ride were not checked.");
  });

  it("names the City once in the Why item for an 11-year-old on a Class 2", () => {
    const text = render(line("CA", 11, classBike(2), ["city_of_san_diego"]), "en");
    const why = text.slice(text.indexOf("Why"));
    expect(why.match(/City of San Diego/g)).toHaveLength(1);
    expect(why).toContain("Riders under 12 can't ride Class 1 or 2 e-bikes here (since Aug 13, 2026).");
  });

  it("keeps place labels lowercase in the middle of a list, in both languages", () => {
    const bl = line("CA", 14, classBike(2, { motorOver20: null, assistOver28: null, switchable: null }), [...PLACE_IDS]);
    const label = whereLabel(bl.missing[0].where, "en", "CA");
    expect(label).toMatch(/^California state law, City of San Diego, /);
    expect(label).toMatch(/unincorporated San Diego County and an SDUHSD campus$/);
    expect(whereLabel(bl.missing[0].where, "es", "CA")).toMatch(/zona no incorporada del condado de San Diego y una escuela de SDUHSD$/);
    expect(render(bl, "en")).not.toContain("and An SDUHSD");
    expect(render(bl, "es")).not.toContain("y Una escuela");
  });

  it("starts a list label with a capital even when the first place is a common noun", () => {
    expect(whereLabel([{ scope: "local", id: "sduhsd_campuses" }], "en", "CA")).toBe("An SDUHSD campus");
    expect(whereLabel([{ scope: "local", id: "sduhsd_campuses" }], "es", "CA")).toBe("Una escuela de SDUHSD");
  });

  it("never calls Washington, DC a state on the card", () => {
    const bl = line("DC", 16, classBike(1), []);
    expect(render(bl, "en", "DC")).toContain("This covers Washington, DC law only.");
    expect(render(bl, "en", "DC")).not.toContain("DC state law");
    expect(render(bl, "es", "DC")).toContain("Esto cubre solo la ley del Distrito de Columbia.");
    expect(render(bl, "es", "DC")).not.toContain("estatal de Distrito");
  });

  it("keeps the not-legal-advice line on every kind of answer", () => {
    for (const bl of [line("CA", 13, classBike(1), []), line("CA", 11, classBike(2), ["city_of_san_diego"]), line("CA", 15, classBike(1), ["sduhsd_campuses"])]) {
      expect(render(bl, "en")).toContain("General information, not legal advice.");
    }
  });

  it("is not itself a live region, so screen readers don't reread the whole card on every edit", () => {
    const html = renderToStaticMarkup(createElement(BottomLineCard, { line: line("CA", 14, classBike(2), [...PLACE_IDS], true), lang: "es", stateCode: "CA" }));
    expect(html).not.toMatch(/aria-live|role="status"|aria-atomic/);
  });

  it("never says a place you picked says no when only state law says no", () => {
    const bl = bottomLine(evaluate({ state: "TX", riderAge: 30, rideDate: DAY, facts: classBike(1, { hasPedals: false }), places: [] }), DAY);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.blocked.flatMap((b) => b.where)).toEqual([{ scope: "state", id: "TX" }]);
    // A machine with no pedals is not an e-bike, so the line says that rather than citing a rule that bars the ride.
    expect(announcement(bl, "en")).toBe(
      "Bottom line: NO. Not an e-bike under the law we checked. E-bike rules don't cover it, and the rules for other vehicles are not checked here.",
    );
    for (const lang of ["en", "es"] as const) {
      const text = render(bl, lang, "TX");
      expect(text).not.toMatch(/place you picked|lugar que marcaste/);
    }
  });

  it("never says nothing we checked is illegal next to a local code that bars the rider", () => {
    const result = evaluate({ state: "CA", riderAge: 7, rideDate: "2029-01-01", facts: classBike(1), places: ["carlsbad"] });
    const bl = bottomLine(result, "2029-01-01");
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing.map((m) => m.line.code)).toContain("local_under_12_no_end");
    const en = render(bl, "en");
    expect(en).toContain("The local code bars riders under 12");
    expect(en).not.toMatch(/Nothing we checked says/);
    // A NO, then a plain reason. Carlsbad and the state's 30-day check are both open, so it names every place.
    expect(en).toContain("NO\nWe can't confirm it's legal in every place we checked.");
    expect(en).not.toMatch(/Not confirmed/);
    const es = render(bl, "es");
    expect(es).not.toMatch(/Nada de lo que revisamos/);
    expect(es).toContain("NO\nNo podemos confirmar que sea legal en todos los lugares que revisamos.");
    expect(es).not.toMatch(/No confirmada/);
  });

  it("announces one short sentence instead, the headline and its subtitle", () => {
    const no = announcement(line("CA", 11, classBike(2), ["city_of_san_diego"]), "en");
    expect(no).toBe("Bottom line: NO. Not allowed. At least one rule we checked says no.");
    const yes = announcement(line("CA", 13, classBike(1), []), "es");
    expect(yes.startsWith("En resumen: SÍ.")).toBe(true);
    for (const lang of ["en", "es"] as const) {
      const longest = announcement(line("CA", 14, classBike(2, { motorOver20: null, assistOver28: null, switchable: null }), [...PLACE_IDS], true), lang);
      expect(longest.length, longest).toBeLessThan(180);
    }
  });
});
