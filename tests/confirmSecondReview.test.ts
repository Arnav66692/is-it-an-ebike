// Regression tests from the second review of the read-facts change. Each one names the problem it
// guards against. The step where the family ticked each read fact is gone, so these cover what
// stays: the wheel boxes, the photo check's message, and the facts card as a named region.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactsCard } from "@/components/FactsCard";
import { photoCheckMessage } from "@/components/PedalPhotoCheck";
import { answerGate } from "@/lib/photo/pedalRule";
import { ShapeFacts } from "@/components/ShapeFacts";
import { numberInRange, twoWheelBoxes, WHEEL_MAX_IN, WHEEL_MIN_IN, withWheelSize } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";
import { editOn, fromRead, withPedalCall, type CheckedFacts } from "@/lib/provenance";
import { emptyFacts } from "@/lib/rules/types";
import { t } from "@/lib/i18n/ui";

const ROOT = join(__dirname, "..");
const LANGS = ["en", "es"] as const;

/** The label from the review: two different wheel sizes, front 24 and rear 20. */
const TWO_SIZES =
  "Class 2 e-bike. 24 x 2.4 front tire. 20 x 4.0 rear tire. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. Pedals: yes.";
/** A plain Class 2 kids' e-bike listing with one wheel size. */
const CLASS_2 =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";

function extract(text: string, source: "listing" | "label"): Extraction {
  return parseSpecText(text, source);
}

function read(text: string, source: "listing" | "label" = "label"): CheckedFacts {
  return fromRead(factsFromExtraction(extract(text, source), emptyFacts()));
}

/** The keystrokes a number box passes on while the family types `text`, one character at a time. */
function typed(text: string): (number | null)[] {
  return [...text].map((_, i) => numberInRange(text.slice(0, i + 1), WHEEL_MIN_IN, WHEEL_MAX_IN));
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

describe("the Rear wheel box stays on screen while the family types in it", () => {
  it("keeps two boxes once the facts held two sizes, at the first keystroke and when the sizes match", () => {
    const bike = read(TWO_SIZES);
    expect(twoWheelBoxes(false, bike.facts)).toBe(true);
    // The "1" of "18" in the Rear box is below the smallest size, so the rear is unknown for a moment.
    const firstKey = { ...bike.facts, wheelRearIn: typed("18")[0] };
    expect(firstKey.wheelRearIn).toBeNull();
    expect(twoWheelBoxes(true, firstKey)).toBe(true);
    // A front size typed to match the rear keeps both boxes too.
    expect(twoWheelBoxes(true, withWheelSize(bike.facts, 20, false))).toBe(true);
    // One size from the start is one box.
    expect(twoWheelBoxes(false, read(CLASS_2, "listing").facts)).toBe(false);
  });

  it("makes the facts card keep the layout in state, so the Rear input is never unmounted mid-typing", () => {
    const source = readFileSync(join(ROOT, "components", "ShapeFacts.tsx"), "utf8");
    expect(source).toContain("const [split, setSplit] = useState(() => twoWheelBoxes(false, facts));");
    expect(source).toContain("if (twoWheelBoxes(split, facts) !== split) setSplit(true);");
    expect(source).toMatch(/\{split \? \(/);
    expect(source).not.toMatch(/\{sameWheelSize\(facts\) \?/);
  });

  it("shows an empty Rear box, not one field with the front size, when the rear size is unknown", () => {
    // The card is drawn fresh here, so this is the layout a read with only a rear size gets.
    const bike = fromRead({ ...emptyFacts(), wheelFrontIn: null, wheelRearIn: 16 });
    const html = renderToStaticMarkup(
      createElement(ShapeFacts, { lang: "en", facts: bike.facts, checks: bike.checks, evidence: {}, onChange: () => undefined }),
    );
    expect(html).toContain(`>${t("en", "rear")}<`);
    expect(html).toContain(`>${t("en", "front")}<`);
  });
});

describe("the pedal photo message", () => {
  it("is picked once, as the call lands", async () => {
    const message = await photoCheckMessage(async () => ({ call: "no_pedals" }), answerGate().start(), () => true, () => undefined);
    expect(message).toBe("photoCheckNoPedals");
  });

  it("stores the message and clears it when the family picks a pedals answer (source check, the card needs a browser to run)", () => {
    const check = readFileSync(join(ROOT, "components", "PedalPhotoCheck.tsx"), "utf8");
    expect(check).toContain("if (next !== null) setMessage(next);");
    expect(check).toContain("{t(lang, message)}");
    expect(check).toContain("if (picks !== seenPicks) {");
    expect(check).toMatch(/setSeenPicks\(picks\);\s*setMessage\(null\);/);
    const card = readFileSync(join(ROOT, "components", "FactsCard.tsx"), "utf8");
    expect(card).toContain("picks={pedalPicks}");
    expect(card).toMatch(/pedalAnswers\.edited\("picked"\);\s*setPedalPicks\(\(n\) => n \+ 1\);/);
  });

  it("would say the answer is now no after the family picked Yes, which the clear prevents", () => {
    const called = withPedalCall(read(CLASS_2, "listing"), "no_pedals");
    const picked = editOn(called.facts, { ...called.facts, hasPedals: true })(called);
    expect(picked.facts.hasPedals).toBe(true);
    for (const lang of LANGS) expect(t(lang, "photoCheckNoPedals")).toMatch(lang === "en" ? /now no/ : /ahora es no/);
  });
});

describe("every card is a named region", () => {
  it("points aria-labelledby at a heading id that exists and holds no spaces", () => {
    const bike = read(CLASS_2, "listing");
    for (const lang of LANGS) {
      const html = renderCard(bike, extract(CLASS_2, "listing").evidence, lang);
      const labelled = [...html.matchAll(/<section[^>]*aria-labelledby="([^"]*)"/g)].map((m) => m[1]);
      expect(labelled.length, lang).toBe(1);
      for (const id of labelled) {
        expect(id, lang).not.toMatch(/\s/);
        expect(html, lang).toContain(`<h2 id="${id}"`);
      }
      // The heading still holds the title the bottom line points to.
      expect(html, lang).toContain(t(lang, "step3"));
    }
  });
});
