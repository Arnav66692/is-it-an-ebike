// Regression tests for the third review of the confirm-before-YES change. Each one names the
// problem it guards against. The pure pieces run directly, and the cards are rendered to markup.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NumberField } from "@/components/controls";
import { FactsCard } from "@/components/FactsCard";
import { FollowUps } from "@/components/FollowUps";
import { keptMessage } from "@/components/PedalPhotoCheck";
import { ReadCheck } from "@/components/ReadCheck";
import { ShapeFacts, wheelMatchesKey } from "@/components/ShapeFacts";
import { numberInRange, withWeight, withWheelCount, withWheelSize } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";
import { readAnnouncement, t } from "@/lib/i18n/ui";
import { renderLine } from "@/lib/i18n/verdicts";
import {
  editOn,
  fromRead,
  unconfirmedFields,
  withConfirmed,
  withEdit,
  type CheckedFacts,
  type FactCheck,
} from "@/lib/provenance";
import { bottomLine, evaluate } from "@/lib/rules";
import { emptyFacts, READ_FIELDS, type BikeFacts, type ReadField } from "@/lib/rules/types";
import { brief, classBike } from "./helpers";
import { nudged, readableFields } from "./matrix";

const DAY = "2026-10-19";
const ROOT = join(__dirname, "..");
const LANGS = ["en", "es"] as const;

/** The listing from the review's browser test. */
const CLASS_2 =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";
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

/** Encinitas, age 11: the review's bottom line. */
function encinitas(bike: CheckedFacts) {
  const result = evaluate({ state: "CA", riderAge: 11, rideDate: DAY, facts: bike.facts, places: ["encinitas"] });
  return bottomLine(result, DAY, unconfirmedFields(bike.checks));
}

/** The review's setup: read, fast modes answered No, every read fact ticked except `left`. */
function tickedAllBut(left: ReadField | null): CheckedFacts {
  const bike = edit(read(CLASS_2), (f) => ({ ...f, motorOver20: false, assistOver28: false }));
  return unconfirmedFields(bike.checks)
    .filter((f) => f !== left)
    .reduce((b, f) => withConfirmed(b, f, true), bike);
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
      onConfirm: () => undefined,
      onPedalCall: () => undefined,
      onCheck: () => undefined,
    }),
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
}

describe("a value nudged away and back is not a check", () => {
  it("keeps the weight unchecked after the mouse wheel or arrow keys move it and back, so the answer stays NO", () => {
    const start = tickedAllBut("weightLb");
    expect(unconfirmedFields(start.checks)).toEqual(["weightLb"]);
    expect(encinitas(start).kind).toBe("no_unconfirmed");
    // The review's arrow keys: 62 up to 63, then down to 62.
    let bike = edit(start, (f) => withWeight(f, 63));
    expect(bike.checks.weightLb?.status).toBe("theirs");
    bike = edit(bike, (f) => withWeight(f, 62));
    expect(brief(bike.checks.weightLb)).toEqual({ source: "text", status: "unchecked" });
    const line = encinitas(bike);
    expect(line.kind).toBe("no_unconfirmed");
    expect(line.missing.map((m) => m.line.params?.fields)).toEqual(["weightLb"]);
    // The review's mouse wheel: 62 down to 61 and back.
    const wheel = edit(edit(start, (f) => withWeight(f, 61)), (f) => withWeight(f, 62));
    expect(encinitas(wheel).kind).toBe("no_unconfirmed");
    // Only the tick gives the YES.
    expect(encinitas(withConfirmed(bike, "weightLb", true)).kind).toBe("yes");
  });

  it("keeps the pedals unchecked after a keyboard moves the radio from Yes to No and back", () => {
    const start = tickedAllBut("hasPedals");
    const bike = edit(edit(start, (f) => ({ ...f, hasPedals: false })), (f) => ({ ...f, hasPedals: true }));
    expect(brief(bike.checks.hasPedals)).toEqual({ source: "text", status: "unchecked" });
    expect(encinitas(bike).kind).toBe("no_unconfirmed");
    // The card shows the mark and the box again, not "You set this yourself".
    const html = renderCard(bike, extract(CLASS_2).evidence);
    const pedals = html.slice(0, html.indexOf(t("en", "photoCheckOpen")));
    expect(pedals).toContain('data-read-check="unchecked"');
    expect(pedals).not.toContain(t("en", "readTheirs"));
  });

  it("takes a tick away when a ticked fact is changed and put back, since nobody looked at the bike since", () => {
    const all = tickedAllBut(null);
    expect(encinitas(all).kind).toBe("yes");
    const back = edit(edit(all, (f) => withWeight(f, 61)), (f) => withWeight(f, 62));
    expect(back.checks.weightLb?.status).toBe("unchecked");
    expect(encinitas(back).kind).toBe("no_unconfirmed");
  });

  it("does the same for every fact a reader can fill, ticked or not", () => {
    const full: BikeFacts = { ...classBike(2), peakWatts: 900, wattsUpTo: 750, topSpeedMph: 20, switchable: false, hasFootPegs: false };
    const bike = fromRead(full);
    expect(readableFields(full)).toEqual([...READ_FIELDS]);
    for (const field of READ_FIELDS) {
      for (const start of [bike, withConfirmed(bike, field, true)]) {
        const away = withEdit(start, nudged(full, field));
        expect(away.checks[field]?.status, field).toBe("theirs");
        const back = withEdit(away, full);
        expect(back.checks[field]?.status, field).toBe("unchecked");
        expect(unconfirmedFields(back.checks), field).toContain(field);
      }
    }
  });

  it("keeps a fact the family changed to a new value as theirs, the way the first review asked", () => {
    const bike = edit(tickedAllBut("weightLb"), (f) => withWeight(f, 64));
    expect(bike.checks.weightLb?.status).toBe("theirs");
    expect(encinitas(bike).kind).toBe("yes");
  });

  it("puts a wheel the family changed back as read, even after a tick on the other wheel", () => {
    let bike = read(TWO_SIZES, "label");
    bike = edit(bike, (f) => withWheelSize(f, 26, false));
    bike = withConfirmed(bike, "wheelSize", true);
    expect(bike.checks.wheelSize?.status).toBe("ticked");
    // The tick covered the rear only. The front back at 24 has not been looked at since.
    bike = edit(bike, (f) => withWheelSize(f, 24, false));
    expect(bike.checks.wheelSize?.status).toBe("unchecked");
  });

  it("treats the wheel count follow-up like the facts card, so 2 to 3 and back leaves it to tick", () => {
    const bike = fromRead({ ...emptyFacts(), wheelCount: 2 });
    const back = edit(edit(bike, (f) => withWheelCount(f, 3)), (f) => withWheelCount(f, 2));
    expect(back.checks.wheelCount?.status).toBe("unchecked");
    // A foot pegs answer still counts as the family's own when it matches what was read.
    const pegs = fromRead({ ...emptyFacts(), hasFootPegs: false });
    const answered = edit(pegs, (f) => ({ ...f, hasFootPegs: false, needsPedalKit: false }), ["hasFootPegs"]);
    expect(brief(answered.checks.hasFootPegs)).toEqual({ source: "text", status: "theirs", answered: true });
    expect(edit(answered, (f) => ({ ...f, hasFootPegs: true })).checks.hasFootPegs?.status).toBe("theirs");
  });

  it("draws every number box as a text box with a number keypad, which the wheel and arrow keys can't change", () => {
    const box = renderToStaticMarkup(createElement(NumberField, { label: "Weight", value: 62, onChange: () => undefined, min: 10, max: 999 }));
    expect(box).toMatch(/<input[^>]*type="text"[^>]*inputMode="decimal"[^>]*value="62"/);
    const shape = read(CLASS_2);
    const pages = [
      renderCard(shape, extract(CLASS_2).evidence),
      renderToStaticMarkup(createElement(ShapeFacts, { lang: "en", facts: shape.facts, checks: shape.checks, evidence: {}, onChange: () => undefined, onConfirm: () => undefined })),
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

describe("a screen reader hears that read facts need checking", () => {
  it("says how many facts were read and what to do, in both languages", () => {
    for (const lang of LANGS) {
      const many = readAnnouncement(lang, 8);
      expect(many, lang).toContain("8");
      expect(many, lang).toContain(`"${t(lang, "step3")}"`);
      expect(many, lang).toContain(`"${t(lang, "readMatches")}"`);
      expect(many, lang).toContain(lang === "en" ? "YES" : "SÍ");
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

describe("ticking a box never moves it", () => {
  const check = (status: FactCheck["status"]): FactCheck => ({ source: "text", status, asRead: emptyFacts() });
  const render = (status: FactCheck["status"], lang: "en" | "es" = "en") =>
    renderToStaticMarkup(createElement(ReadCheck, { lang, field: "weightLb", check: check(status), onConfirm: () => undefined }));

  it("keeps the mark above the box once ticked, holding both lines so its height doesn't change", () => {
    for (const lang of LANGS) {
      const open = render("unchecked", lang);
      const done = render("ticked", lang);
      for (const html of [open, done]) {
        // The mark comes before the box, and holds both lines in one cell.
        expect(html.indexOf("read-mark"), lang).toBeLessThan(html.indexOf('type="checkbox"'));
        expect(html, lang).toContain(t(lang, "readMarkText"));
        expect(html, lang).toContain(t(lang, "readMarkChecked"));
        expect(html, lang).toContain('class="read-mark-words"');
      }
      // Only the line for the box's state is visible.
      expect(open, lang).toContain(`<span>${t(lang, "readMarkText")}</span>`);
      expect(open, lang).toContain(`<span class="invisible">${t(lang, "readMarkChecked")}</span>`);
      expect(done, lang).toContain(`<span class="invisible">${t(lang, "readMarkText")}</span>`);
      expect(done, lang).toContain(`<span>${t(lang, "readMarkChecked")}</span>`);
      expect(done, lang).toContain('data-read-mark="ticked"');
      // The box points at the mark only while it asks for a check.
      expect(open, lang).toMatch(/aria-describedby="[^"]+"/);
      expect(done, lang).not.toContain("aria-describedby");
    }
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    expect(css).toMatch(/\.read-mark-words > \* \{\s*grid-area: 1 \/ 1;/);
  });
});

describe("the new words", () => {
  it("says check only once in the photo mark", () => {
    expect(t("en", "readMarkPhoto").match(/check/gi)).toHaveLength(1);
    expect(t("es", "readMarkPhoto").match(/revis/gi)).toHaveLength(1);
    expect(t("en", "readMarkPhoto")).toBe("Read by the photo check. Compare it with the bike.");
  });

  it("says the family used the pedals box, not picked an answer, when a tick dropped the photo call", () => {
    expect(keptMessage("ticked")).toBe("photoCheckKeptTick");
    expect(keptMessage("picked")).toBe("photoCheckKept");
    expect(t("en", "photoCheckKeptTick")).toContain("pedals box");
    expect(t("es", "photoCheckKeptTick")).toContain("casilla de los pedales");
    for (const lang of LANGS) expect(t(lang, "photoCheckKeptTick")).not.toContain(t(lang, "photoCheckKept"));
  });

  it("names the one wheel size the box still covers once the other is changed", () => {
    const bike = read(TWO_SIZES, "label");
    expect(wheelMatchesKey(bike.checks.wheelSize, bike.facts)).toBe("readMatchesBoth");
    const front = edit(bike, (f) => withWheelSize(f, 26, false));
    expect(wheelMatchesKey(front.checks.wheelSize, front.facts)).toBe("readMatchesRear");
    const rear = edit(bike, (f) => ({ ...f, wheelRearIn: 16 }));
    expect(wheelMatchesKey(rear.checks.wheelSize, rear.facts)).toBe("readMatchesFront");
    for (const lang of LANGS) {
      const html = renderToStaticMarkup(
        createElement(ShapeFacts, { lang, facts: front.facts, checks: front.checks, evidence: extract(TWO_SIZES, "label").evidence, onChange: () => undefined, onConfirm: () => undefined }),
      );
      expect(html, lang).toContain(t(lang, "readMatchesRear"));
      expect(html, lang).not.toContain(t(lang, "readMatchesBoth"));
      // The box's name still starts with the words the bottom line quotes.
      expect(t(lang, "readMatchesFront").startsWith(`${t(lang, "readMatches")}, `), lang).toBe(true);
      expect(t(lang, "readMatchesRear").startsWith(`${t(lang, "readMatches")}, `), lang).toBe(true);
    }
  });

  it("asks to fix any that are wrong when several facts are listed, and to fix that fact for one", () => {
    const line = (fields: string, lang: "en" | "es") => renderLine({ code: "bl_unconfirmed_facts", params: { fields } }, lang, "California");
    expect(line("classes,weightLb", "en")).toMatch(/under each one in "Check the facts" above, or fix any that are wrong\.$/);
    expect(line("classes,weightLb", "es")).toMatch(/debajo de cada uno en "Revisa los datos", arriba, o corrige los que estén mal\.$/);
    expect(line("weightLb", "en")).toMatch(/under that fact in "Check the facts" above, or fix that fact\.$/);
    expect(line("weightLb", "es")).toMatch(/debajo de ese dato en "Revisa los datos", arriba, o corrige el dato\.$/);
    expect(t("en", "readIntro")).toContain("or fix any that are wrong.");
    expect(t("es", "readIntro")).toContain("o corrige los que estén mal.");
    for (const lang of LANGS) {
      for (const key of ["readIntro", "readMarkPhoto", "readMarkChecked", "readMatchesFront", "readMatchesRear", "photoCheckKeptTick", "readAnnounceOne", "readAnnounceMany"] as const) {
        expect(t(lang, key), `${lang}.${key}`).not.toMatch(/[—;]/);
      }
    }
  });
});

describe("the README says what the pedal guard does", () => {
  it("drops only a call that lands after a pick or tick made while the check ran", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    expect(readme).not.toContain("A call that lands after the family picked or ticked a pedals answer is dropped.");
    expect(readme).toContain("or ticked or unticked the pedals box, while the check ran is dropped");
    expect(readme).toContain("A pedals answer picked before the check started is replaced by the photo's call");
  });
});
