// Regression tests from the review of the read-facts change. Each one names the problem it guards
// against. The step where the family ticked each read fact is gone, so these cover what stays: an
// edit made on an old card is never applied to a new bike, the words each fact was read from, and
// the checks being type-checked. The pure pieces run directly, and the cards are rendered to markup.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactsCard } from "@/components/FactsCard";
import { ShapeFacts } from "@/components/ShapeFacts";
import { withWeight } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";
import { editOn, fromRead, withPedalCall, type CheckedFacts, type CheckedUpdate } from "@/lib/provenance";
import { bottomLine, evaluate } from "@/lib/rules";
import { emptyFacts, type PlaceId } from "@/lib/rules/types";
import { t } from "@/lib/i18n/ui";
import { typeErrors } from "./typeCheck";

const DAY = "2026-10-19";
const ROOT = join(__dirname, "..");

/** A plain Class 2 kids' e-bike, the listing from the golden test. */
const CLASS_2 =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";
/** A machine that is no e-bike at all, read from a second link while the first card is still on screen. */
const DIRT_BIKE = "Electric dirt bike. No pedals. Class 3. 3000W rated motor. No throttle. Pedal assist up to 28 mph. 17 x 3.0 tires. Weight 140 lbs.";

function extract(text: string, source: "listing" | "label" = "listing"): Extraction {
  return parseSpecText(text, source);
}

function read(text: string, source: "listing" | "label" = "listing"): CheckedFacts {
  return fromRead(factsFromExtraction(extract(text, source), emptyFacts()));
}

function answer(state: string, age: number, bike: CheckedFacts, places: PlaceId[]) {
  return bottomLine(evaluate({ state, riderAge: age, rideDate: DAY, facts: bike.facts, places }), DAY);
}

/** Runs queued state updates in order, the way React applies them once it renders. */
function applyAll(start: CheckedFacts, updates: readonly CheckedUpdate[]): CheckedFacts {
  return updates.reduce((cur, update) => update(cur), start);
}

/** The Class 2 bike read, fast modes answered No. YES in Encinitas at 11. */
function class2(): CheckedFacts {
  const bike = read(CLASS_2);
  return editOn(bike.facts, { ...bike.facts, motorOver20: false, assistOver28: false })(bike);
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

describe("an edit made as a read lands is never applied to the new bike", () => {
  it("drops a keystroke built before a no-pedals photo call, so the photo's answer stays", () => {
    const bike = class2();
    expect(answer("CA", 11, bike, ["encinitas"]).kind).toBe("yes");
    const seen = bike.facts;
    // The card was drawn from `seen`. The photo call lands, then a weight keystroke built from `seen`.
    const after = applyAll(bike, [(cur) => withPedalCall(cur, "no_pedals"), editOn(seen, withWeight(seen, 63))]);
    expect(after.facts.hasPedals).toBe(false);
    expect(after.facts.weightLb).toBe(62);
    expect(after.checks.hasPedals?.source).toBe("photo");
    expect(answer("CA", 11, after, ["encinitas"]).kind).not.toBe("yes");
  });

  it("drops a keystroke built on the last bike's card after a new link is read", () => {
    const old = class2();
    const next = read(DIRT_BIKE);
    const after = applyAll(old, [() => next, editOn(old.facts, withWeight(old.facts, 64))]);
    expect(after).toBe(next);
    expect(after.facts.hasPedals).toBe(false);
    expect(after.facts.classes).toEqual([3]);
    expect(answer("CA", 11, after, ["encinitas"]).kind).not.toBe("yes");
  });

  it("applies edits made on the facts on screen, including after a photo call that changed nothing", () => {
    const bike = read(CLASS_2);
    const typed = editOn(bike.facts, withWeight(bike.facts, 64))(bike);
    expect(typed.facts.weightLb).toBe(64);
    const agreed = withPedalCall(bike, "pedals");
    expect(agreed).toBe(bike);
    expect(editOn(bike.facts, withWeight(bike.facts, 64))(agreed).facts.weightLb).toBe(64);
  });

  it("makes the checker send every edit through editOn", () => {
    const source = readFileSync(join(ROOT, "components", "Checker.tsx"), "utf8");
    expect(source).toContain("setBike(editOn(facts, next));");
    expect(source).not.toMatch(/onConfirm|confirmOn|withConfirmed/);
  });

  it("shows the pedals answer the facts hold, so the radio can't say No while the facts say Yes", () => {
    const card = readFileSync(join(ROOT, "components", "FactsCard.tsx"), "utf8");
    expect(card).toContain('const pedalsUi: Tri3 | null = triValue(facts.hasPedals) ?? (pedalsUnsure ? "unsure" : null);');
    expect(card).toContain('const throttleUi: Tri3 | null = triValue(facts.hasThrottle) ?? (throttleUnsure ? "unsure" : null);');
    expect(card).not.toMatch(/setPedalsUi|setThrottleUi/);
    const bike = read(CLASS_2);
    const html = renderCard(withPedalCall(bike, "no_pedals"), extract(CLASS_2).evidence);
    const pedals = html.slice(0, html.indexOf(t("en", "photoCheckOpen")));
    expect(pedals).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="no"/);
    expect(pedals).not.toMatch(/<input type="radio"[^>]*checked=""[^>]*value="yes"/);
  });
});

describe("the pedals evidence after the photo check changes the answer", () => {
  it("labels the text's words as what it said before the photo check", () => {
    const e = extract(CLASS_2);
    const bike = withPedalCall(read(CLASS_2), "no_pedals");
    for (const lang of ["en", "es"] as const) {
      const html = renderCard(bike, e.evidence, lang);
      const pedals = html.slice(0, html.indexOf(t(lang, "photoCheckOpen")));
      expect(pedals, lang).toContain(`${t(lang, "readFromBefore")}:`);
      expect(pedals, lang).not.toContain(`${t(lang, "readFrom")}:`);
      expect(pedals, lang).toContain(t(lang, "readMarkPhoto"));
      // Other facts still say where they were read, in the mark next to their words.
      expect(html.slice(html.indexOf(t(lang, "photoCheckOpen"))), lang).toContain(`<span>${t(lang, "readMarkText")}</span>`);
    }
  });
});

describe("the unlock fact", () => {
  it("describes the unlock fact as the bike, not the text, in both languages", () => {
    expect(t("en", "unlock")).toBe("It has an unlock or off-road mode");
    expect(t("es", "unlock")).toBe("Tiene un modo desbloqueado o todoterreno");
    for (const lang of ["en", "es"] as const) expect(t(lang, "unlock")).not.toMatch(/text|texto/i);
  });
});

describe("two different wheel sizes", () => {
  const LABEL = "Class 2 e-bike. 24 x 2.4 front tire. 20 x 4.0 rear tire.";

  it("puts the words they were read from once, under both sizes, with no box", () => {
    const bike = read(LABEL, "label");
    expect([bike.facts.wheelFrontIn, bike.facts.wheelRearIn]).toEqual([24, 20]);
    const e = extract(LABEL, "label");
    for (const lang of ["en", "es"] as const) {
      const html = renderToStaticMarkup(createElement(ShapeFacts, { lang, facts: bike.facts, checks: bike.checks, evidence: e.evidence, onChange: () => undefined }));
      const rear = html.indexOf(`>${t(lang, "rear")}<`);
      const span = html.indexOf("sm:col-span-2");
      expect(rear, lang).toBeGreaterThan(0);
      expect(span, lang).toBeGreaterThan(rear);
      expect(html.indexOf(t(lang, "readMarkText"), span), lang).toBeGreaterThan(span);
      expect(html.match(/type="checkbox"/g), lang).toBeNull();
    }
  });
});

describe("getting back to the facts", () => {
  it("moves keyboard focus to the facts heading", () => {
    const source = readFileSync(join(ROOT, "components", "Checker.tsx"), "utf8");
    expect(source).toContain("onClick={goToFacts}");
    expect(source).toContain('card.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });');
    const controls = readFileSync(join(ROOT, "components", "controls.tsx"), "utf8");
    expect(controls).toContain("tabIndex={-1}");
  });

  it("starts the bike input over on Start over, so Type it in opens a blank card again", () => {
    const source = readFileSync(join(ROOT, "components", "Checker.tsx"), "utf8");
    expect(source).toContain("<BikeInput key={`input-${starts}`}");
    expect(source).toMatch(/setStage\("input"\);\s*setStarts\(\(n\) => n \+ 1\);\s*setBike\(emptyChecked\(\)\);/);
  });
});

describe("the notes are type-checked", () => {
  it("builds notes without Object.fromEntries, whose result is not type-checked (source check)", () => {
    const source = readFileSync(join(ROOT, "lib", "provenance.ts"), "utf8");
    expect(source).not.toContain("Object.fromEntries");
  });

  it("makes the compiler reject a note with a source or field that doesn't exist", () => {
    const head = 'import { emptyFacts } from "@/lib/rules/types";\nimport type { FactCheck, FactChecks } from "@/lib/provenance";\n';
    expect(typeErrors(`${head}const ok: FactCheck = { source: "text", asRead: emptyFacts() };\nexport { ok };`)).toEqual([]);
    const bad: [string, RegExp][] = [
      ['const a: FactCheck = { source: "text", status: "ticked", asRead: emptyFacts() };', /'status' does not exist/],
      ['const b: FactCheck = { source: "ocr", asRead: emptyFacts() };', /FactSource/],
      ['const c: FactCheck = { source: "text" };', /'asRead' is missing/],
      ['const d: FactChecks = { motorOver20: { source: "text", asRead: emptyFacts() } };', /'motorOver20' does not exist/],
    ];
    for (const [line, error] of bad) expect(typeErrors(`${head}${line}\nexport {};`).join("\n"), line).toMatch(error);
  }, 60_000);
});
