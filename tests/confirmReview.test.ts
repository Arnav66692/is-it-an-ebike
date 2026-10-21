// Regression tests for the review of the confirm-before-YES change. Each one names the problem it
// guards against. The pure pieces run directly, and the cards are rendered to markup.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactsCard } from "@/components/FactsCard";
import { photoMessage } from "@/components/PedalPhotoCheck";
import { ShapeFacts } from "@/components/ShapeFacts";
import { withOneWheelSize, withWeight, withWheelSize } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";
import {
  checkCounts,
  confirmOn,
  editOn,
  fromRead,
  unconfirmedFields,
  withConfirmed,
  withEdit,
  wheelsLeftAsRead,
  withPedalCall,
  type CheckedFacts,
  type CheckedUpdate,
} from "@/lib/provenance";
import { bottomLine, evaluate } from "@/lib/rules";
import { emptyFacts, READ_FIELDS, type PlaceId, type ReadField } from "@/lib/rules/types";
import { t } from "@/lib/i18n/ui";
import { brief } from "./helpers";
import { typeErrors } from "./typeCheck";

const DAY = "2026-10-19";
const ROOT = join(__dirname, "..");

/** A plain Class 2 kids' e-bike, the listing from the golden test. */
const CLASS_2 =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";
/** A machine that is no e-bike at all, read from a second link while the first card is still on screen. */
const DIRT_BIKE = "Electric dirt bike. No pedals. Class 3. 3000W rated motor. No throttle. Pedal assist up to 28 mph. 17 x 3.0 tires. Weight 140 lbs.";
/** A Utah Class 1 whose listing already says "Foot pegs: No". */
const UTAH_CLASS_1 =
  "Class 1 electric bike with pedals. 500W rated motor. No throttle. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery. Foot pegs: No.";

function extract(text: string, source: "listing" | "label" = "listing"): Extraction {
  return parseSpecText(text, source);
}

function read(text: string, source: "listing" | "label" = "listing"): CheckedFacts {
  return fromRead(factsFromExtraction(extract(text, source), emptyFacts()));
}

function confirmAll(bike: CheckedFacts, fields: readonly ReadField[] = READ_FIELDS): CheckedFacts {
  return fields.reduce((b, f) => withConfirmed(b, f, true), bike);
}

function answer(state: string, age: number, bike: CheckedFacts, places: PlaceId[]) {
  const result = evaluate({ state, riderAge: age, rideDate: DAY, facts: bike.facts, places });
  return bottomLine(result, DAY, unconfirmedFields(bike.checks));
}

/** Runs queued state updates in order, the way React applies them once it renders. */
function applyAll(start: CheckedFacts, updates: readonly CheckedUpdate[]): CheckedFacts {
  return updates.reduce((cur, update) => update(cur), start);
}

/** The Class 2 bike read, fast modes answered No, and every read fact ticked. YES in Encinitas at 11. */
function checkedClass2(): CheckedFacts {
  const bike = read(CLASS_2);
  return confirmAll(withEdit(bike, { ...bike.facts, motorOver20: false, assistOver28: false }));
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

describe("an edit or tick made as a read lands is never applied to the new bike", () => {
  it("drops a keystroke built before a no-pedals photo call, so the photo's answer stays unchecked", () => {
    const bike = withConfirmed(checkedClass2(), "hasPedals", false);
    const seen = bike.facts;
    // The card was drawn from `seen`. The photo call lands, then a weight keystroke built from `seen`.
    const after = applyAll(bike, [(cur) => withPedalCall(cur, "no_pedals"), editOn(seen, withWeight(seen, 63))]);
    expect(after.facts.hasPedals).toBe(false);
    expect(after.facts.weightLb).toBe(62);
    expect(brief(after.checks.hasPedals)).toEqual({ source: "photo", status: "unchecked" });
    expect(answer("CA", 11, after, ["encinitas"]).kind).not.toBe("yes");
    // Applied straight onto the new facts, the stale keystroke would bring the old pedals answer back.
    expect(withEdit(withPedalCall(bike, "no_pedals"), withWeight(seen, 63)).facts.hasPedals).toBe(true);
  });

  it("drops a keystroke built on the last bike's card after a new link is read", () => {
    const old = checkedClass2();
    const next = read(DIRT_BIKE);
    const after = applyAll(old, [() => next, editOn(old.facts, withWeight(old.facts, 64))]);
    expect(after).toBe(next);
    expect(after.facts.hasPedals).toBe(false);
    expect(after.facts.classes).toEqual([3]);
    expect(unconfirmedFields(after.checks)).toEqual(["hasPedals", "classes", "ratedWatts", "hasThrottle", "assistMph", "wheelSize", "weightLb"]);
    expect(answer("CA", 11, after, ["encinitas"]).kind).not.toBe("yes");
    // Applied straight onto the new bike, it would put the old values back with every box ticked.
    const raw = withEdit(next, withWeight(old.facts, 64));
    expect(raw.facts.classes).toEqual([2]);
    expect(unconfirmedFields(raw.checks)).toEqual([]);
  });

  it("drops a tick made on the last card, so a value the family never saw is never checked", () => {
    const old = read(CLASS_2);
    const next = read(DIRT_BIKE);
    const after = applyAll(old, [() => next, confirmOn(old.facts, "classes", true)]);
    expect(after).toBe(next);
    expect(brief(after.checks.classes)).toEqual({ source: "text", status: "unchecked" });
    const called = applyAll(old, [(cur) => withPedalCall(cur, "no_pedals"), confirmOn(old.facts, "hasPedals", true)]);
    expect(brief(called.checks.hasPedals)).toEqual({ source: "photo", status: "unchecked" });
  });

  it("applies edits and ticks made on the facts on screen, including after a photo call that changed nothing", () => {
    const bike = read(CLASS_2);
    expect(brief(confirmOn(bike.facts, "classes", true)(bike).checks.classes)).toEqual({ source: "text", status: "ticked" });
    const typed = editOn(bike.facts, withWeight(bike.facts, 64))(bike);
    expect(typed.facts.weightLb).toBe(64);
    expect(brief(typed.checks.weightLb)).toEqual({ source: "text", status: "theirs" });
    // A tick keeps the facts as they were, so a second tick from the same card still lands.
    const two = applyAll(bike, [confirmOn(bike.facts, "classes", true), confirmOn(bike.facts, "ratedWatts", true)]);
    expect(checkCounts(two.checks)).toEqual({ read: 8, confirmed: 2 });
    const agreed = withPedalCall(bike, "pedals");
    expect(agreed).toBe(bike);
    expect(confirmOn(bike.facts, "hasPedals", true)(agreed).checks.hasPedals?.status).toBe("ticked");
  });

  it("makes the checker send every edit and tick through editOn and confirmOn", () => {
    const source = readFileSync(join(ROOT, "components", "Checker.tsx"), "utf8");
    expect(source).toContain("setBike(editOn(facts, next, answered));");
    expect(source).toContain("setBike(confirmOn(facts, field, confirmed));");
    expect(source).toContain("onConfirm={confirmFact}");
    expect(source).not.toMatch(/withEdit\(|withConfirmed\(/);
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
    const bike = withPedalCall(withConfirmed(read(CLASS_2), "hasPedals", true), "no_pedals");
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

  it("asks for a tick in the photo check's message while the pedals answer is unchecked", () => {
    expect(photoMessage("photoCheckPedals", true)).toBe("photoCheckPedalsTick");
    expect(photoMessage("photoCheckNoPedals", true)).toBe("photoCheckNoPedalsTick");
    expect(photoMessage("photoCheckPedals", false)).toBe("photoCheckPedals");
    // A close call leaves the answer as it was, so one still unchecked needs the tick too (sixth review).
    expect(photoMessage("photoCheckAsk", true)).toBe("photoCheckAskTick");
    expect(photoMessage("photoCheckAsk", false)).toBe("photoCheckAsk");
    expect(photoMessage("photoCheckKept", true)).toBe("photoCheckKept");
    for (const lang of ["en", "es"] as const) {
      expect(t(lang, "photoCheckPedalsTick")).toContain(`"${t(lang, "readMatches")}"`);
      expect(t(lang, "photoCheckNoPedalsTick")).toContain(`"${t(lang, "readMatches")}"`);
    }
    // The tick is worked out for the call when it lands (tests/confirmSecondReview.test.ts).
    const card = readFileSync(join(ROOT, "components", "FactsCard.tsx"), "utf8");
    expect(card).toContain("tickAfter={(call) => pedalCallNeedsTick({ facts, checks }, call)}");
  });
});

describe("a fact the family changed or answered is theirs", () => {
  it("has no box to untick while it holds their value, and asks for the tick again once the read value is back", () => {
    const bike = read(CLASS_2);
    const cleared = withEdit(bike, withWeight(bike.facts, null));
    expect(brief(cleared.checks.weightLb)).toEqual({ source: "text", status: "theirs" });
    expect(withConfirmed(cleared, "weightLb", false)).toBe(cleared);
    expect(unconfirmedFields(withConfirmed(cleared, "weightLb", false).checks)).not.toContain("weightLb");
    // Putting the read value back makes it read again, still to check (third review: a nudge away and back is no check).
    const back = withEdit(cleared, withWeight(cleared.facts, 62));
    expect(back.checks.weightLb?.status).toBe("unchecked");
    expect(unconfirmedFields(back.checks)).toContain("weightLb");
  });

  it("shows a plain line instead of the box under a fact the family set", () => {
    const text = `${CLASS_2} Unlockable off-road mode.`;
    const bike = read(text);
    expect(bike.facts.switchable).toBe(true);
    const unticked = withEdit(bike, { ...bike.facts, switchable: null });
    for (const lang of ["en", "es"] as const) {
      const html = renderCard(unticked, extract(text).evidence, lang);
      expect(html, lang).toContain(t(lang, "readTheirs"));
      expect(html, lang).toContain('data-read-check="theirs"');
      expect(html, lang).not.toContain("readMatchesFor");
      const boxes = html.match(/aria-label="[^"]*"/g)?.filter((m) => m.includes(t(lang, "readMatches"))) ?? [];
      expect(boxes.length, lang).toBe(unconfirmedFields(unticked.checks).length);
    }
  });

  it("describes the unlock fact as the bike, not the text, in both languages", () => {
    expect(t("en", "unlock")).toBe("It has an unlock or off-road mode");
    expect(t("es", "unlock")).toBe("Tiene un modo desbloqueado o todoterreno");
    for (const lang of ["en", "es"] as const) expect(t(lang, "unlock")).not.toMatch(/text|texto/i);
  });

  it("counts a follow-up answer that matches the read value as the family's own", () => {
    let bike = read(UTAH_CLASS_1);
    expect(brief(bike.checks.hasFootPegs)).toEqual({ source: "text", status: "unchecked" });
    bike = confirmAll(bike, unconfirmedFields(bike.checks).filter((f) => f !== "hasFootPegs"));
    bike = withEdit(bike, { ...bike.facts, motorOver20: false, assistOver28: false });
    // The "Foot pegs or a pedal kit?" follow-up, answered No, as FollowUps sends it.
    const next = { ...bike.facts, hasFootPegs: false, needsPedalKit: false };
    expect(withEdit(bike, next).checks.hasFootPegs?.status).toBe("unchecked");
    const answered = withEdit(bike, next, ["hasFootPegs"]);
    expect(brief(answered.checks.hasFootPegs)).toEqual({ source: "text", status: "theirs", answered: true });
    expect(answer("UT", 30, answered, []).kind).toBe("yes");
    const followUps = readFileSync(join(ROOT, "components", "FollowUps.tsx"), "utf8");
    expect(followUps).toMatch(/unsure: withUnsure\(facts, "pegs_kit", v === "unsure"\) \}, \[\s*"hasFootPegs",\s*\]\);/);
    expect(followUps).toContain('["weightLb"]');
    // The wheel count shows the read value as it is, so picking it is a plain edit (third review).
    expect(followUps).not.toContain('["wheelCount"]');
  });
});

describe("two different wheel sizes share one check", () => {
  const LABEL = "Class 2 e-bike. 24 x 2.4 front tire. 20 x 4.0 rear tire.";

  it("stays unchecked when only one size is changed, since the other is still as read", () => {
    const bike = read(LABEL, "label");
    expect([bike.facts.wheelFrontIn, bike.facts.wheelRearIn]).toEqual([24, 20]);
    const front = withEdit(bike, withWheelSize(bike.facts, 26, false));
    expect(brief(front.checks.wheelSize)).toEqual({ source: "text", status: "unchecked" });
    expect(front.checks.wheelSize && wheelsLeftAsRead(front.checks.wheelSize, front.facts)).toEqual(["rear"]);
    expect(unconfirmedFields(front.checks)).toContain("wheelSize");
    const rear = withEdit(bike, { ...bike.facts, wheelRearIn: 22 });
    expect(rear.checks.wheelSize?.status).toBe("unchecked");
    // Going back to one size gives the rear the front size, which still has to be checked.
    expect(withEdit(bike, withOneWheelSize(bike.facts)).checks.wheelSize?.status).toBe("unchecked");
    // Changing both at once, like "Not sure", makes them theirs.
    expect(withEdit(bike, { ...bike.facts, wheelFrontIn: null, wheelRearIn: null }).checks.wheelSize?.status).toBe("theirs");
    expect(withEdit(bike, withWheelSize(bike.facts, 26, true)).checks.wheelSize?.status).toBe("theirs");
  });

  it("counts one read size the family replaces as theirs, midway through typing too", () => {
    const one = read(CLASS_2);
    expect(withEdit(one, withWheelSize(one.facts, null, true)).checks.wheelSize?.status).toBe("theirs");
    const frontOnly = fromRead({ ...emptyFacts(), wheelFrontIn: 20 });
    expect(withEdit(frontOnly, withWheelSize(frontOnly.facts, 24, true)).checks.wheelSize?.status).toBe("theirs");
    const rearOnly = fromRead({ ...emptyFacts(), wheelRearIn: 16 });
    expect(withEdit(rearOnly, { ...rearOnly.facts, wheelRearIn: 18 }).checks.wheelSize?.status).toBe("theirs");
    expect(withEdit(rearOnly, { ...rearOnly.facts, wheelFrontIn: 18 }).checks.wheelSize?.status).toBe("unchecked");
  });

  it("puts the one box under both sizes and says it covers both", () => {
    const bike = read(LABEL, "label");
    const e = extract(LABEL, "label");
    for (const lang of ["en", "es"] as const) {
      const html = renderToStaticMarkup(
        createElement(ShapeFacts, { lang, facts: bike.facts, checks: bike.checks, evidence: e.evidence, onChange: () => undefined, onConfirm: () => undefined }),
      );
      const rear = html.indexOf(`>${t(lang, "rear")}<`);
      const both = html.indexOf(t(lang, "readMatchesBoth"));
      expect(rear, lang).toBeGreaterThan(0);
      expect(both, lang).toBeGreaterThan(rear);
      expect(html.indexOf("sm:col-span-2"), lang).toBeGreaterThan(rear);
      // The label and the screen reader name both say "Both wheel sizes", and there is no other box.
      expect(html.split(t(lang, "readMatchesBoth")).length - 1, lang).toBe(2);
      expect(html.match(/type="checkbox"/g), lang).toHaveLength(1);
    }
  });
});

describe("getting back to the facts", () => {
  it("moves keyboard focus to the first box still to tick, or the facts heading", () => {
    const source = readFileSync(join(ROOT, "components", "Checker.tsx"), "utf8");
    expect(source).toContain("onClick={goToFacts}");
    expect(source).toContain(`card.querySelector<HTMLInputElement>('input[data-read-check="unchecked"]')`);
    expect(source).toContain("target?.focus({ preventScroll: true });");
    const controls = readFileSync(join(ROOT, "components", "controls.tsx"), "utf8");
    expect(controls).toContain("tabIndex={-1}");
    const html = renderCard(read(CLASS_2), extract(CLASS_2).evidence);
    expect(html.split('data-read-check="unchecked"').length - 1).toBe(8);
  });

  it("starts the bike input over on Start over, so Type it in opens a blank card again", () => {
    const source = readFileSync(join(ROOT, "components", "Checker.tsx"), "utf8");
    expect(source).toContain("<BikeInput key={`input-${starts}`}");
    expect(source).toMatch(/setStage\("input"\);\s*setStarts\(\(n\) => n \+ 1\);\s*setBike\(emptyChecked\(\)\);/);
  });
});

describe("the checks are type-checked", () => {
  it("builds checks without Object.fromEntries, whose result is not type-checked (source check)", () => {
    const source = readFileSync(join(ROOT, "lib", "provenance.ts"), "utf8");
    expect(source).not.toContain("Object.fromEntries");
  });

  it("makes the compiler reject a check with a status, source or field that doesn't exist", () => {
    const head = 'import { emptyFacts } from "@/lib/rules/types";\nimport type { FactCheck, FactChecks } from "@/lib/provenance";\n';
    expect(typeErrors(`${head}const ok: FactCheck = { source: "text", status: "ticked", asRead: emptyFacts() };\nexport { ok };`)).toEqual([]);
    const bad: [string, RegExp][] = [
      ['const a: FactCheck = { source: "text", status: "yes", asRead: emptyFacts() };', /CheckStatus/],
      ['const b: FactCheck = { source: "ocr", status: "unchecked", asRead: emptyFacts() };', /FactSource/],
      ['const c: FactCheck = { source: "text", status: "unchecked" };', /'asRead' is missing/],
      ['const d: FactChecks = { motorOver20: { source: "text", status: "unchecked", asRead: emptyFacts() } };', /'motorOver20' does not exist/],
    ];
    for (const [line, error] of bad) expect(typeErrors(`${head}${line}\nexport {};`).join("\n"), line).toMatch(error);
  }, 60_000);
});
