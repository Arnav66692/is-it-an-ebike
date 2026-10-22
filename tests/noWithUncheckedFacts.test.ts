// Facts read from a link or photo no longer need a tick before a YES, so the bottom line never names
// them. A NO, not allowed stays the NO its rule gives, with no "Still to check" section, and the
// sentence screen readers hear says the answer and its reason only, in both languages.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { announcement, BottomLineCard } from "@/components/BottomLineCard";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText } from "@/lib/extract/parse";
import { evaluate } from "@/lib/rules";
import { bottomLine, type BottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, type BikeFacts, type PlaceId } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { classBike } from "./helpers";

const DAY = "2026-10-19";

function line(age: number, facts: BikeFacts, places: PlaceId[]): BottomLine {
  return bottomLine(evaluate({ state: "CA", riderAge: age, rideDate: DAY, facts, places }), DAY);
}

/** The card's visible text, one piece per line, with quotes put back. */
function render(bl: BottomLine, lang: Lang): string[] {
  return renderToStaticMarkup(createElement(BottomLineCard, { line: bl, lang, stateCode: "CA" }))
    .replace(/<[^>]+>/g, "\n")
    .replace(/‑/g, "-")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A Class 2 read from a pasted listing, with the fast-mode follow-up answered. */
const READ = {
  ...factsFromExtraction(
    parseSpecText("Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.", "listing"),
    emptyFacts(),
  ),
  motorOver20: false,
  assistOver28: false,
};

describe("a bike read from a link or photo", () => {
  it("gets YES in Encinitas for an 11-year-old, the same as typed in", () => {
    expect(line(11, READ, ["encinitas"]).kind).toBe("yes");
  });

  it("gets the same NO, not allowed in the City of San Diego, with its rule as the reason", () => {
    const bl = line(11, READ, ["city_of_san_diego"]);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.blocked[0].line.code).toBe("local_under_12");
    expect(bl).toEqual(line(11, { ...READ }, ["city_of_san_diego"]));
  });
});

describe("the bottom-line card", () => {
  const no = line(11, classBike(2), ["city_of_san_diego"]);

  it("shows the reasons and no Still to check section, in both languages", () => {
    for (const lang of ["en", "es"] as const) {
      const text = render(no, lang);
      expect(text).toContain(t(lang, "blWhy"));
      expect(text.join(" ")).not.toMatch(/It matches the bike|Coincide con la bicicleta|Still to check|Falta revisar/);
      expect(text).toContain(t(lang, "notLegalAdvice"));
    }
  });

  it("tells screen readers the answer and its reason only", () => {
    expect(announcement(no, "en")).toBe("Bottom line: NO. Not allowed. At least one rule we checked says no.");
    expect(announcement(no, "es")).toBe("En resumen: NO. No permitida. Al menos una regla que revisamos dice que no.");
  });
});
