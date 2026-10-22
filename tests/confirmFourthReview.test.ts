// Regression tests from the fourth review of the read-facts change. Each one names the problem it
// guards against. The step where the family ticked each read fact is gone, so these cover what
// stays: a photo call for the last bike, the status lines a screen reader hears, and the words each
// fact was read from, under that fact's own control. The pure pieces run directly, and the cards
// are rendered to markup.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactsCard } from "@/components/FactsCard";
import { PedalPhotoCheck, photoStatus } from "@/components/PedalPhotoCheck";
import { withWeight } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, quoteText, type Extraction } from "@/lib/extract/parse";
import type { Lang } from "@/lib/i18n/names";
import { readAnnouncement, t } from "@/lib/i18n/ui";
import { answerGate, callIfCurrent } from "@/lib/photo/pedalRule";
import { editOn, fromRead, pedalCallOn, withPedalCall, type CheckedFacts, type CheckedUpdate } from "@/lib/provenance";
import { emptyFacts, READ_FIELDS, type BikeFacts, type ReadField } from "@/lib/rules/types";

const ROOT = join(__dirname, "..");
const LANGS = ["en", "es"] as const;

/** A plain Class 2 kids' e-bike, the listing from the golden test. */
const CLASS_2 =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";
/** The review's first bike, a dirt bike with no pedals, whose photo was being checked. */
const DIRT_BIKE = "Electric dirt bike. No pedals. 3000W motor.";
/** The review's second listing, read through a link while the first card's photo check ran. */
const CLASS_1 = "Class 1 e-bike with pedals. 350W rated motor. No throttle. Pedal assist up to 20 mph.";

function extract(text: string, source: "listing" | "label" = "listing"): Extraction {
  return parseSpecText(text, source);
}

function read(text: string, source: "listing" | "label" = "listing"): CheckedFacts {
  return fromRead(factsFromExtraction(extract(text, source), emptyFacts()));
}

/** Applies one edit made on the card the family sees, the way the checker does. */
function edit(bike: CheckedFacts, change: (f: BikeFacts) => BikeFacts): CheckedFacts {
  return editOn(bike.facts, change(bike.facts))(bike);
}

/** Runs queued state updates in order, the way React applies them once it renders. */
function applyAll(start: CheckedFacts, updates: readonly CheckedUpdate[]): CheckedFacts {
  return updates.reduce((cur, update) => update(cur), start);
}

function renderCard(bike: CheckedFacts, evidence: Extraction["evidence"], lang: Lang = "en"): string {
  return unescape(
    renderToStaticMarkup(
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
    ),
  );
}

function unescape(html: string): string {
  return html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

function source(...path: string[]): string {
  return readFileSync(join(ROOT, ...path), "utf8");
}

describe("a photo call for the last bike never fills in the new bike's pedals", () => {
  it("drops a call that lands after a new read is queued, before the old card has left the page", async () => {
    const old = read(DIRT_BIKE);
    const next = read(CLASS_1);
    expect(old.facts.hasPedals).toBe(false);
    expect(next.facts.hasPedals).toBe(true);
    // React's queue for the checker's bike. Nothing in it is applied until React renders.
    const queue: CheckedUpdate[] = [];
    // The old card's photo check started on the old bike, and the old card is still on the page.
    const watch = answerGate().start();
    let finish: (value: { call: "no_pedals" }) => void = () => undefined;
    const pending = callIfCurrent(
      () => new Promise<{ call: "no_pedals" }>((resolve) => (finish = resolve)),
      () => watch.untouched(),
      // The old card passes the call on with the facts it shows as the call lands.
      (call) => queue.push(pedalCallOn(old.facts, call)),
    );
    // A link read lands, so handleRead queues the new bike.
    queue.push(() => next);
    // The photo check finishes before React draws the new card and runs the old card's cleanup.
    finish({ call: "no_pedals" });
    expect(await pending).toBe("no_pedals");
    const after = applyAll(old, queue);
    expect(after).toBe(next);
    expect(after.facts.hasPedals).toBe(true);
    expect(after.checks.hasPedals?.source).toBe("text");
    // Applied with no check, the way the checker did before, the old photo's No replaced the new bike's pedals.
    const raw = applyAll(old, [() => next, (cur) => withPedalCall(cur, "no_pedals")]);
    expect(raw.facts.hasPedals).toBe(false);
    expect(raw.checks.hasPedals?.source).toBe("photo");
  });

  it("still fills in the pedals on the bike on screen, after edits the family made while the check ran", () => {
    const bike = read(CLASS_2);
    // The family typed a new weight while the photo was checked. The card on screen shows that.
    const typed = edit(bike, (f) => withWeight(f, 64));
    const after = pedalCallOn(typed.facts, "no_pedals")(typed);
    expect(after.facts.hasPedals).toBe(false);
    expect(after.facts.weightLb).toBe(64);
    expect(after.checks.hasPedals?.source).toBe("photo");
    // Checked against the facts as the check started, the call would be lost after any edit.
    expect(pedalCallOn(bike.facts, "no_pedals")(typed)).toBe(typed);
  });

  it("is wired so each call is checked against the facts on screen as it lands (source check, the card needs a browser)", () => {
    const checker = source("components", "Checker.tsx");
    expect(checker).toContain("onPedalCall={(call) => setBike(pedalCallOn(facts, call))}");
    expect(checker).not.toMatch(/setBike\(\(cur\) => withPedalCall\(/);
    const check = source("components", "PedalPhotoCheck.tsx");
    expect(check).toMatch(/useLayoutEffect\(\(\) => \{\s*latestCall\.current = onCall;\s*\}\);/);
    expect(check).toContain("(call) => latestCall.current(call),");
  });
});

describe("the photo check speaks from a status line already on the page", () => {
  const photoCheck = (lang: Lang) => renderToStaticMarkup(createElement(PedalPhotoCheck, { lang, startCheck: answerGate().start, onCall: () => undefined, picks: 0 }));

  it("draws the photo check's one status line, empty, before anything happens", () => {
    for (const lang of LANGS) {
      const html = photoCheck(lang);
      expect(html.match(/role="status"/g), lang).toHaveLength(1);
      expect(html, lang).toMatch(/<p role="status"[^>]*><\/p>/);
      expect(html, lang).not.toContain('role="alert"');
    }
  });

  it("puts the working words and then the result into that one line, and a problem into an alert", () => {
    expect(photoStatus("closed", 0, null)).toBeNull();
    expect(photoStatus("choose", 0, null)).toBeNull();
    expect(photoStatus("working", 0, null)).toBe("photoCheckLoading");
    expect(photoStatus("working", 0.5, null)).toBe("photoCheckLoading");
    expect(photoStatus("working", 1, null)).toBe("photoCheckRunning");
    for (const message of ["photoCheckPedals", "photoCheckNoPedals", "photoCheckAsk", "photoCheckKept"] as const) {
      expect(photoStatus("choose", 1, message), message).toBe(message);
    }
    expect(photoStatus("choose", 1, "photoCheckFailed")).toBeNull();
    expect(photoStatus("closed", 0, "photoCheckNoWebGpu")).toBeNull();
  });

  it("has no count of checked facts on the facts card", () => {
    for (const lang of LANGS) {
      const html = renderCard(read(CLASS_2), extract(CLASS_2).evidence, lang);
      expect(html.match(/role="status"/g), lang).toHaveLength(1);
      expect(html, lang).not.toMatch(/check-count|class="segs"|class="bar"/);
    }
  });
});

describe("the read announcement is not read out again once it is old", () => {
  it("is drawn in the page's language, so a switch would change its words and a screen reader would hear it again", () => {
    for (const total of [1, 7]) expect(readAnnouncement("es", total)).not.toBe(readAnnouncement("en", total));
  });

  it("is cleared on a language switch and on the family's first edit (source check, the checker needs a browser)", () => {
    const checker = source("components", "Checker.tsx");
    expect(checker).toMatch(/function switchLang\(\) \{[^}]*setReadNote\(null\);[^}]*\}/);
    expect(checker).toMatch(/function editFacts\([^)]*\) \{[^}]*setReadNote\(null\);[^}]*\}/);
    // A new read still sets it, after clearing it so the same count is read out again.
    expect(checker).toMatch(/setReadNote\(null\);\s*if \(total > 0\) requestAnimationFrame\(\(\) => setReadNote\(total\)\);/);
  });
});

/** Where each fact's own control starts on the card: a number box's label, a question's legend or the unlock box's name. */
function controls(lang: Lang): [ReadField, string][] {
  const label = (key: Parameters<typeof t>[1]) => `class="field-label">${t(lang, key)}</label>`;
  const legend = (key: Parameters<typeof t>[1]) => `<legend class="field-label">${t(lang, key)}</legend>`;
  return [
    ["hasPedals", legend("pedals")],
    ["classes", legend("classLabel")],
    ["ratedWatts", label("ratedWatts")],
    ["peakWatts", label("peakWatts")],
    ["wattsUpTo", label("upToWatts")],
    ["hasThrottle", legend("throttle")],
    ["throttleMph", label("throttleMph")],
    ["assistMph", label("assistMph")],
    ["topSpeedMph", label("topMph")],
    ["wheelSize", label("wheelSizeIn")],
    ["weightLb", label("weightLb")],
    ["wheelCount", legend("wheelCount")],
    ["hasFootPegs", legend("footPegs")],
    ["switchable", `aria-label="${t(lang, "unlock")}"`],
  ];
}

describe("the words each fact was read from sit under that fact", () => {
  it("quotes the words each fact was read from under that fact's own control, in both languages", () => {
    const bike = read(CLASS_2);
    const e = extract(CLASS_2).evidence;
    expect(e.ratedWatts?.[0]?.text).toContain("500W");
    for (const lang of LANGS) {
      const html = renderCard(bike, e, lang);
      const at = controls(lang)
        .filter(([, mark]) => html.includes(mark))
        .map(([field, mark]) => [field, html.indexOf(mark)] as const);
      const ownerOf = (i: number) => at.filter(([, c]) => c < i).sort((a, b) => b[1] - a[1])[0]?.[0];
      for (const field of READ_FIELDS.filter((f) => bike.checks[f])) {
        const quotes = (e[field] ?? []).slice(0, 2);
        expect(quotes.length, `${lang} ${field}`).toBeGreaterThan(0);
        for (const quote of quotes) {
          const shown = `>${quoteText(quote)}</q>`;
          const spots: number[] = [];
          for (let i = html.indexOf(shown); i >= 0; i = html.indexOf(shown, i + 1)) spots.push(i);
          expect(spots.map(ownerOf), `${lang} ${field}`).toContain(field);
        }
      }
    }
  });
});
