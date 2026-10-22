// Regression tests from the third review of the read-facts change. Each one names the problem it
// guards against. The step where the family ticked each read fact is gone, so these cover what
// stays: number boxes no wheel or arrow key can change, and what a screen reader hears after a read.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NumberField } from "@/components/controls";
import { FactsCard } from "@/components/FactsCard";
import { FollowUps } from "@/components/FollowUps";
import { ShapeFacts } from "@/components/ShapeFacts";
import { numberInRange } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";
import { readAnnouncement, t } from "@/lib/i18n/ui";
import { fromRead, type CheckedFacts } from "@/lib/provenance";
import { emptyFacts } from "@/lib/rules/types";

const ROOT = join(__dirname, "..");
const LANGS = ["en", "es"] as const;

/** The listing from the review's browser test. */
const CLASS_2 =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";

function extract(text: string, source: "listing" | "label" = "listing"): Extraction {
  return parseSpecText(text, source);
}

function read(text: string, source: "listing" | "label" = "listing"): CheckedFacts {
  return fromRead(factsFromExtraction(extract(text, source), emptyFacts()));
}

function renderCard(bike: CheckedFacts, evidence: Extraction["evidence"], lang: "en" | "es" = "en"): string {
  return renderToStaticMarkup(
    createElement(FactsCard, {
      lang,
      facts: bike.facts,
      checks: bike.checks,
      evidence,
      flags: [],
      onChange: () => undefined,
      onPedalCall: () => undefined,
      onCheck: () => undefined,
    }),
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
}

describe("number boxes no wheel or arrow key can change", () => {
  it("draws every number box as a text box with a number keypad, which the wheel and arrow keys can't change", () => {
    const box = renderToStaticMarkup(createElement(NumberField, { label: "Weight", value: 62, onChange: () => undefined, min: 10, max: 999 }));
    expect(box).toMatch(/<input[^>]*type="text"[^>]*inputMode="decimal"[^>]*value="62"/);
    const shape = read(CLASS_2);
    const pages = [
      renderCard(shape, extract(CLASS_2).evidence),
      renderToStaticMarkup(createElement(ShapeFacts, { lang: "en", facts: shape.facts, checks: shape.checks, evidence: {}, onChange: () => undefined })),
      renderToStaticMarkup(createElement(FollowUps, { lang: "en", questions: ["wheels"], facts: shape.facts, onChange: () => undefined })),
    ];
    for (const html of pages) {
      expect(html).not.toContain('type="number"');
      expect(html).toContain('inputMode="decimal"');
    }
  });

  it("reads only plain numbers from a text box, so 1e2 or 0x10 is not a number", () => {
    expect(numberInRange("62", 10, 999)).toBe(62);
    expect(numberInRange(" 27.5 ", 6, 30)).toBe(27.5);
    expect(numberInRange(".5", 0, 1)).toBe(0.5);
    for (const raw of ["1e2", "0x10", "6 2", "62lb", "+62", "Infinity", "6.2.1"]) expect(numberInRange(raw, 0, 999), raw).toBeNull();
  });
});

describe("a screen reader hears that facts were read", () => {
  it("says how many facts were read and where they are, in both languages", () => {
    for (const lang of LANGS) {
      const many = readAnnouncement(lang, 8);
      expect(many, lang).toContain("8");
      expect(many, lang).toContain(`"${t(lang, "step3")}"`);
      expect(many, lang).not.toMatch(/"It matches the bike"|"Coincide con la bicicleta"/);
      expect(readAnnouncement(lang, 1), lang).toBe(t(lang, "readAnnounceOne"));
      expect(readAnnouncement(lang, 0), lang).toBe("");
      for (const text of [many, readAnnouncement(lang, 1)]) expect(text, lang).not.toMatch(/[—;]/);
    }
    expect(readAnnouncement("en", 8)).toBe(t("en", "readAnnounceMany", { total: 8 }));
  });

  it("keeps the status line in the checker, outside the card that is redrawn on each read (source check, the checker needs a browser)", () => {
    const source = readFileSync(join(ROOT, "components", "Checker.tsx"), "utf8");
    const region = source.indexOf("{readNote !== null ? readAnnouncement(lang, readNote) : \"\"}");
    expect(region).toBeGreaterThan(0);
    expect(source.lastIndexOf('<p role="status" className="sr-only">', region)).toBeGreaterThan(0);
    expect(region).toBeLessThan(source.indexOf("<FactsCard"));
    expect(source).toContain('factsRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });');
  });
});

describe("the README says what the pedal guard does", () => {
  it("drops only a call that lands after a pick made while the check ran", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    expect(readme).toContain("A call that lands after the family picked a pedals answer while the check ran is dropped");
    expect(readme).toContain("A pedals answer picked before the check started is replaced by the photo's call");
    expect(readme).not.toMatch(/It matches the bike/);
  });
});
