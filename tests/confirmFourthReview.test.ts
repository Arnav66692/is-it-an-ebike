// Regression tests for the fourth review of the confirm-before-YES change. Each one names the
// problem it guards against. The pure pieces run directly, and the cards are rendered to markup.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactsCard } from "@/components/FactsCard";
import { PedalPhotoCheck, photoStatus } from "@/components/PedalPhotoCheck";
import { ShapeFacts, wheelMatchesKey } from "@/components/ShapeFacts";
import { withWeight, withWheelSize } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";
import type { Lang } from "@/lib/i18n/names";
import { readAnnouncement, t } from "@/lib/i18n/ui";
import { READ_FIELD_NAMES } from "@/lib/i18n/verdicts";
import { answerGate, callIfCurrent } from "@/lib/photo/pedalRule";
import {
  editOn,
  emptyChecked,
  fromRead,
  pedalCallOn,
  unconfirmedFields,
  wheelPutBack,
  withConfirmed,
  withPedalCall,
  type CheckedFacts,
  type CheckedUpdate,
} from "@/lib/provenance";
import { bottomLine, evaluate } from "@/lib/rules";
import { emptyFacts, READ_FIELDS, type BikeFacts, type PlaceId, type ReadField } from "@/lib/rules/types";
import { brief, classBike } from "./helpers";
import { typeErrors } from "./typeCheck";

const DAY = "2026-10-19";
const ROOT = join(__dirname, "..");
const LANGS = ["en", "es"] as const;

/** A plain Class 2 kids' e-bike, the listing from the golden test. */
const CLASS_2 =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";
/** The review's first bike, a dirt bike with no pedals, whose photo was being checked. */
const DIRT_BIKE = "Electric dirt bike. No pedals. 3000W motor.";
/** The review's second listing, read through a link while the first card's photo check ran. */
const CLASS_1 = "Class 1 e-bike with pedals. 350W rated motor. No throttle. Pedal assist up to 20 mph.";
/** A Utah Class 1 whose listing already says "Foot pegs: No". */
const UTAH_CLASS_1 =
  "Class 1 electric bike with pedals. 500W rated motor. No throttle. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery. Foot pegs: No.";
/** A label with two wheel sizes, front 24 and rear 20. */
const TWO_SIZES =
  "Class 2 e-bike. 24 x 2.4 front tire. 20 x 4.0 rear tire. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. Pedals: yes.";

function extract(text: string, source: "listing" | "label" = "listing"): Extraction {
  return parseSpecText(text, source);
}

function read(text: string, source: "listing" | "label" = "listing"): CheckedFacts {
  return fromRead(factsFromExtraction(extract(text, source), emptyFacts()));
}

/** Applies one edit made on the card the family sees, the way the checker does. */
function edit(bike: CheckedFacts, change: (f: BikeFacts) => BikeFacts, answered?: readonly ReadField[]): CheckedFacts {
  return editOn(bike.facts, change(bike.facts), answered)(bike);
}

/** Runs queued state updates in order, the way React applies them once it renders. */
function applyAll(start: CheckedFacts, updates: readonly CheckedUpdate[]): CheckedFacts {
  return updates.reduce((cur, update) => update(cur), start);
}

function answer(state: string, age: number, bike: CheckedFacts, places: PlaceId[]) {
  const result = evaluate({ state, riderAge: age, rideDate: DAY, facts: bike.facts, places });
  return bottomLine(result, DAY, unconfirmedFields(bike.checks));
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
        onConfirm: () => undefined,
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
    expect(brief(after.checks.hasPedals)).toEqual({ source: "text", status: "unchecked" });
    // Applied with no check, the way the checker did before, the old photo's No replaced the new bike's pedals.
    const raw = applyAll(old, [() => next, (cur) => withPedalCall(cur, "no_pedals")]);
    expect(raw.facts.hasPedals).toBe(false);
    expect(brief(raw.checks.hasPedals)).toEqual({ source: "photo", status: "unchecked" });
  });

  it("still fills in the pedals on the bike on screen, after edits the family made while the check ran", () => {
    const bike = read(CLASS_2);
    // The family typed a new weight while the photo was checked. The card on screen shows that.
    const typed = edit(bike, (f) => withWeight(f, 64));
    const after = pedalCallOn(typed.facts, "no_pedals")(typed);
    expect(after.facts.hasPedals).toBe(false);
    expect(after.facts.weightLb).toBe(64);
    expect(brief(after.checks.hasPedals)).toEqual({ source: "photo", status: "unchecked" });
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

describe("the photo check and the read count speak from status lines already on the page", () => {
  const photoCheck = (lang: Lang) =>
    renderToStaticMarkup(createElement(PedalPhotoCheck, { lang, startCheck: answerGate().start, onCall: () => undefined, tickAfter: () => false, picks: 0, focusTick: () => false }));

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
    for (const message of ["photoCheckNoPedalsTick", "photoCheckPedalsTick", "photoCheckPedals", "photoCheckAsk", "photoCheckKept", "photoCheckKeptTick"] as const) {
      expect(photoStatus("choose", 1, message), message).toBe(message);
    }
    expect(photoStatus("choose", 1, "photoCheckFailed")).toBeNull();
    expect(photoStatus("closed", 0, "photoCheckNoWebGpu")).toBeNull();
  });

  it("keeps the read count's status line on a card with nothing read, so a photo call there is heard", () => {
    for (const lang of LANGS) {
      const typed = renderCard(emptyChecked(), {}, lang);
      // The photo check's line and the read count's line, both empty.
      expect(typed.match(/<p role="status"[^>]*><\/p>/g), lang).toHaveLength(2);
      // After a photo call on a bike typed in, the same line holds the count.
      const called = renderCard(withPedalCall(emptyChecked(), "pedals"), {}, lang);
      expect(called, lang).toContain(`>${t(lang, "readCount", { done: 0, total: 1 })}</p>`);
      expect(called.match(/role="status"/g), lang).toHaveLength(2);
    }
  });

  it("keeps the line where it was on a card with facts read", () => {
    const html = renderCard(read(CLASS_2), extract(CLASS_2).evidence);
    expect(html).toMatch(new RegExp(`<p role="status"[^>]*>${t("en", "readCount", { done: 0, total: 8 })}</p><button`));
  });
});

describe("the read announcement is not read out again once it is old", () => {
  it("is drawn in the page's language, so a switch would change its words and a screen reader would hear it again", () => {
    for (const total of [1, 7]) expect(readAnnouncement("es", total)).not.toBe(readAnnouncement("en", total));
  });

  it("is cleared on a language switch and on the family's first edit or tick (source check, the checker needs a browser)", () => {
    const checker = source("components", "Checker.tsx");
    expect(checker).toMatch(/function switchLang\(\) \{[^}]*setReadNote\(null\);[^}]*\}/);
    expect(checker).toMatch(/function editFacts\([^)]*\) \{[^}]*setReadNote\(null\);[^}]*\}/);
    expect(checker).toMatch(/function confirmFact\([^)]*\) \{[^}]*setReadNote\(null\);[^}]*\}/);
    // A new read still sets it, after clearing it so the same count is read out again.
    expect(checker).toMatch(/setReadNote\(null\);\s*if \(total > 0\) requestAnimationFrame\(\(\) => setReadNote\(total\)\);/);
  });
});

describe("a follow-up answer stays the family's own after later edits", () => {
  it("keeps the foot pegs answer theirs after another fact is changed, so Utah still says YES", () => {
    let bike = read(UTAH_CLASS_1);
    expect(brief(bike.checks.hasFootPegs)).toEqual({ source: "text", status: "unchecked" });
    bike = edit(bike, (f) => ({ ...f, motorOver20: false, assistOver28: false }));
    // The "Foot pegs or a pedal kit?" follow-up, answered No, the same as the listing.
    bike = edit(bike, (f) => ({ ...f, hasFootPegs: false, needsPedalKit: false }), ["hasFootPegs"]);
    bike = unconfirmedFields(bike.checks).reduce((b, f) => withConfirmed(b, f, true), bike);
    expect(brief(bike.checks.hasFootPegs)).toEqual({ source: "text", status: "theirs", answered: true });
    expect(answer("UT", 30, bike, []).kind).toBe("yes");
    const changes: ((f: BikeFacts) => BikeFacts)[] = [(f) => withWeight(f, 64), (f) => ({ ...f, ratedWatts: 350 })];
    for (const change of changes) {
      const after = edit(bike, change);
      expect(brief(after.checks.hasFootPegs)).toEqual({ source: "text", status: "theirs", answered: true });
      expect(unconfirmedFields(after.checks)).toEqual([]);
      expect(answer("UT", 30, after, []).kind).toBe("yes");
    }
  });
});

/**
 * Where each fact's own control starts on the card: a number box's label, a question's legend or
 * the unlock box's name. "front" is the Front box, which has no box of its own to tick.
 */
function controls(lang: Lang, split: boolean): [ReadField | "front", string][] {
  const label = (key: Parameters<typeof t>[1]) => `class="block text-sm font-semibold">${t(lang, key)}</label>`;
  const legend = (key: Parameters<typeof t>[1]) => `<legend class="text-sm font-semibold">${t(lang, key)}</legend>`;
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
    ...(split
      ? ([
          ["front", label("front")],
          ["wheelSize", label("rear")],
        ] as [ReadField | "front", string][])
      : ([["wheelSize", label("wheelSizeIn")]] as [ReadField, string][])),
    ["weightLb", label("weightLb")],
    ["wheelCount", legend("wheelCount")],
    ["hasFootPegs", legend("footPegs")],
    ["switchable", `aria-label="${t(lang, "unlock")}"`],
  ];
}

/** The name of the box that confirms `field`. With two wheel sizes, the box says which sizes it covers. */
function boxName(lang: Lang, field: ReadField, bike: CheckedFacts, split: boolean): string {
  if (field === "wheelSize" && split) return `aria-label="${t(lang, wheelMatchesKey(bike.checks.wheelSize, bike.facts))}"`;
  return `aria-label="${t(lang, "readMatchesFor", { field: READ_FIELD_NAMES[lang][field] })}"`;
}

function onlyAt(html: string, text: string, what: string): number {
  const at = html.indexOf(text);
  expect(at, `${what} is on the card`).toBeGreaterThan(-1);
  expect(html.indexOf(text, at + 1), `${what} is on the card once`).toBe(-1);
  return at;
}

/** Where each control on the card starts. A control the card doesn't show is left out. */
function controlsAt(html: string, lang: Lang, split: boolean): [ReadField | "front", number][] {
  return controls(lang, split)
    .filter(([, mark]) => html.includes(mark))
    .map(([field, mark]) => [field, onlyAt(html, mark, `${field}'s control`)]);
}

interface Placement {
  /** The control whose box this is: the nearest control above the box. */
  owner: ReadField | "front" | undefined;
  /** The card from that control down to the box. */
  between: string;
}

/** Where the box for each read fact sits on the card. */
function placements(html: string, lang: Lang, bike: CheckedFacts, split: boolean): Partial<Record<ReadField, Placement>> {
  const at = controlsAt(html, lang, split);
  const out: Partial<Record<ReadField, Placement>> = {};
  for (const field of READ_FIELDS) {
    if (!bike.checks[field]) continue;
    const box = onlyAt(html, boxName(lang, field, bike, split), `${field}'s box`);
    const above = at.filter(([, i]) => i < box).sort((a, b) => b[1] - a[1])[0];
    out[field] = { owner: above?.[0], between: above ? html.slice(above[1], box) : "" };
  }
  return out;
}

describe("each box to tick sits under the fact it confirms", () => {
  const full: BikeFacts = { ...classBike(2), peakWatts: 900, wattsUpTo: 750, topSpeedMph: 20, switchable: true, hasFootPegs: false };

  it("puts every read fact's box under that fact's own control, with one wheel size or two, in both languages", () => {
    for (const facts of [full, { ...full, wheelFrontIn: 24 }]) {
      const split = facts.wheelFrontIn !== facts.wheelRearIn;
      const bike = fromRead(facts);
      expect(Object.keys(bike.checks).sort()).toEqual([...READ_FIELDS].sort());
      for (const lang of LANGS) {
        const html = renderCard(bike, {}, lang);
        expect(controlsAt(html, lang, split)).toHaveLength(controls(lang, split).length);
        const at = placements(html, lang, bike, split);
        for (const field of READ_FIELDS) expect(at[field]?.owner, `${lang} ${field} split=${split}`).toBe(field);
      }
    }
  });

  it("puts the box under the same fact on the shape card drawn alone", () => {
    const bike = fromRead(full);
    const shape: readonly ReadField[] = ["wheelSize", "weightLb", "wheelCount", "hasFootPegs"];
    for (const lang of LANGS) {
      const html = unescape(
        renderToStaticMarkup(createElement(ShapeFacts, { lang, facts: bike.facts, checks: bike.checks, evidence: {}, onChange: () => undefined, onConfirm: () => undefined })),
      );
      const at = placements(html, lang, { facts: bike.facts, checks: { wheelSize: bike.checks.wheelSize, weightLb: bike.checks.weightLb, wheelCount: bike.checks.wheelCount, hasFootPegs: bike.checks.hasFootPegs } }, false);
      for (const field of shape) expect(at[field]?.owner, `${lang} ${field}`).toBe(field);
    }
  });

  it("quotes the words each fact was read from under that fact, above its box", () => {
    const bike = read(CLASS_2);
    const e = extract(CLASS_2).evidence;
    expect(e.ratedWatts?.[0]?.text).toContain("500W");
    for (const lang of LANGS) {
      const at = placements(renderCard(bike, e, lang), lang, bike, false);
      for (const field of unconfirmedFields(bike.checks)) {
        expect(at[field]?.owner, `${lang} ${field}`).toBe(field);
        const quotes = (e[field] ?? []).slice(0, 2);
        expect(quotes.length, `${lang} ${field}`).toBeGreaterThan(0);
        for (const quote of quotes) expect(at[field]?.between, `${lang} ${field}`).toContain(`>${quote.text}</q>`);
      }
    }
  });
});

describe("the put-back rule runs only code that can run", () => {
  it("compares the wheel size wheel by wheel, so fieldValue takes no wheel size", () => {
    const errors = typeErrors(
      [
        'import { fieldValue } from "@/lib/provenance";',
        'import { emptyFacts } from "@/lib/rules/types";',
        'fieldValue(emptyFacts(), "weightLb");',
        'fieldValue(emptyFacts(), "classes");',
        'fieldValue(emptyFacts(), "wheelSize");',
      ].join("\n"),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"wheelSize"');
    // The compiler builds the whole project's types, which can take more than 5 seconds on a busy machine.
  }, 60_000);

  it("puts a wheel back only when a wheel the family changed is at its read size again", () => {
    const bike = read(TWO_SIZES, "label");
    const check = bike.checks.wheelSize;
    expect(check).toBeDefined();
    if (!check) return;
    expect([bike.facts.wheelFrontIn, bike.facts.wheelRearIn]).toEqual([24, 20]);
    const front26 = withWheelSize(bike.facts, 26, false);
    const rear16 = { ...bike.facts, wheelRearIn: 16 };
    expect(wheelPutBack(check, front26, bike.facts)).toBe(true);
    expect(wheelPutBack(check, rear16, bike.facts)).toBe(true);
    expect(wheelPutBack(check, bike.facts, front26)).toBe(false);
    expect(wheelPutBack(check, bike.facts, withWeight(bike.facts, 64))).toBe(false);
    expect(wheelPutBack(check, front26, { ...front26, wheelRearIn: 16 })).toBe(false);
    expect(wheelPutBack(check, { ...front26, wheelRearIn: 16 }, rear16)).toBe(true);
  });

  it("still takes the tick away from a ticked wheel size when a changed wheel is put back", () => {
    let bike = read(TWO_SIZES, "label");
    bike = edit(bike, (f) => withWheelSize(f, 26, false));
    bike = withConfirmed(bike, "wheelSize", true);
    expect(bike.checks.wheelSize?.status).toBe("ticked");
    expect(edit(bike, (f) => withWheelSize(f, 24, false)).checks.wheelSize?.status).toBe("unchecked");
    // A ticked fact of any other kind holds its read value, so an edit either makes it theirs or leaves it ticked.
    const ticked = withConfirmed(read(CLASS_2), "weightLb", true);
    expect(edit(ticked, (f) => withWeight(f, 63)).checks.weightLb?.status).toBe("theirs");
    expect(edit(ticked, (f) => ({ ...f, ratedWatts: 350 })).checks.weightLb?.status).toBe("ticked");
  });
});
