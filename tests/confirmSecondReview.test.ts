// Regression tests for the second review of the confirm-before-YES change. Each one names the
// problem it guards against. The pure pieces run directly, and the cards are rendered to markup.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactsCard } from "@/components/FactsCard";
import { photoCheckMessage, photoMessage } from "@/components/PedalPhotoCheck";
import { answerGate, type PedalCall } from "@/lib/photo/pedalRule";
import { ShapeFacts } from "@/components/ShapeFacts";
import { numberInRange, twoWheelBoxes, WHEEL_MAX_IN, WHEEL_MIN_IN, withOneWheelSize, withWheelSize } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";
import {
  confirmOn,
  editOn,
  emptyChecked,
  fromRead,
  pedalCallNeedsTick,
  unconfirmedFields,
  withConfirmed,
  withEdit,
  withPedalCall,
  type CheckedFacts,
  type CheckedUpdate,
} from "@/lib/provenance";
import { bottomLine, evaluate } from "@/lib/rules";
import { emptyFacts, READ_FIELDS, type BikeFacts, type PlaceId, type ReadField } from "@/lib/rules/types";
import { renderLine } from "@/lib/i18n/verdicts";
import { t } from "@/lib/i18n/ui";
import { brief } from "./helpers";

const DAY = "2026-10-19";
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

function answer(state: string, age: number, bike: CheckedFacts, places: PlaceId[]) {
  const result = evaluate({ state, riderAge: age, rideDate: DAY, facts: bike.facts, places });
  return bottomLine(result, DAY, unconfirmedFields(bike.checks));
}

/** Runs queued state updates in order, the way React applies them once it renders. */
function applyAll(start: CheckedFacts, updates: readonly CheckedUpdate[]): CheckedFacts {
  return updates.reduce((cur, update) => update(cur), start);
}

/** Applies one edit made on the card the family sees, the way the checker does. */
function edit(bike: CheckedFacts, change: (f: BikeFacts) => BikeFacts, answered?: readonly ReadField[]): CheckedFacts {
  return editOn(bike.facts, change(bike.facts), answered)(bike);
}

/** The keystrokes a number box passes on while the family types `text`, one character at a time. */
function typed(text: string): (number | null)[] {
  return [...text].map((_, i) => numberInRange(text.slice(0, i + 1), WHEEL_MIN_IN, WHEEL_MAX_IN));
}

/** The two-size label, fast modes answered No, and every read fact ticked except the wheel size. */
function allButWheels(): CheckedFacts {
  const bike = edit(read(TWO_SIZES), (f) => ({ ...f, motorOver20: false, assistOver28: false }));
  return unconfirmedFields(bike.checks)
    .filter((f) => f !== "wheelSize")
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

describe("typing both wheel sizes, one box at a time, counts as checked", () => {
  it("makes the wheel size theirs once the front box and then the rear box are changed", () => {
    let bike = allButWheels();
    expect([bike.facts.wheelFrontIn, bike.facts.wheelRearIn]).toEqual([24, 20]);
    expect(unconfirmedFields(bike.checks)).toEqual(["wheelSize"]);
    // The Front box, then ArrowUp twice in the Rear box, as the review did it.
    bike = edit(bike, (f) => withWheelSize(f, 26, false));
    expect(bike.checks.wheelSize?.status).toBe("unchecked");
    bike = edit(bike, (f) => ({ ...f, wheelRearIn: 21 }));
    bike = edit(bike, (f) => ({ ...f, wheelRearIn: 22 }));
    expect(brief(bike.checks.wheelSize)).toEqual({ source: "text", status: "theirs" });
    expect(unconfirmedFields(bike.checks)).toEqual([]);
    const line = answer("CA", 30, bike, []);
    expect(line.kind).toBe("yes");
  });

  it("does the same with the rear box first, and while the family types a two-digit size", () => {
    let bike = allButWheels();
    for (const v of typed("18")) bike = edit(bike, (f) => ({ ...f, wheelRearIn: v }));
    expect(bike.facts.wheelRearIn).toBe(18);
    expect(bike.checks.wheelSize?.status).toBe("unchecked");
    for (const v of typed("26")) bike = edit(bike, (f) => withWheelSize(f, v, false));
    expect([bike.facts.wheelFrontIn, bike.facts.wheelRearIn]).toEqual([26, 18]);
    expect(bike.checks.wheelSize?.status).toBe("theirs");
    expect(answer("CA", 30, bike, []).kind).toBe("yes");
  });

  it("covers the per-box edits the follow-up question sends too", () => {
    let bike = allButWheels();
    // FollowUps: the Rear box, then the Front box with the two sizes split.
    bike = edit(bike, (f) => ({ ...f, wheelRearIn: 16, unsure: f.unsure.filter((q) => q !== "wheels") }));
    bike = edit(bike, (f) => withWheelSize(f, 20, false));
    expect(bike.checks.wheelSize?.status).toBe("theirs");
  });

  it("counts a size put back to the read size as read again, so it still needs the tick", () => {
    let bike = allButWheels();
    bike = edit(bike, (f) => withWheelSize(f, 26, false));
    bike = edit(bike, (f) => withWheelSize(f, 24, false));
    expect(bike.checks.wheelSize?.status).toBe("unchecked");
    // The rear changed and the front is back at its read size, so the front is left to check.
    bike = edit(bike, (f) => ({ ...f, wheelRearIn: 16 }));
    expect(bike.checks.wheelSize?.status).toBe("unchecked");
    expect(answer("CA", 30, bike, []).kind).toBe("no_unconfirmed");
    bike = edit(bike, (f) => withWheelSize(f, 26, false));
    expect(bike.checks.wheelSize?.status).toBe("theirs");
  });

  it("still asks for the tick while one read size is left as read", () => {
    let bike = allButWheels();
    bike = edit(bike, (f) => withWheelSize(f, 26, false));
    expect(unconfirmedFields(bike.checks)).toEqual(["wheelSize"]);
    expect(answer("CA", 30, bike, []).kind).toBe("no_unconfirmed");
    // Going back to one size gives the rear the front size. Both sizes are then the family's own.
    expect(edit(bike, withOneWheelSize).checks.wheelSize?.status).toBe("theirs");
    // A tick after one box was changed keeps what is left, so changing the other box still makes it theirs.
    const ticked = withConfirmed(bike, "wheelSize", true);
    expect(ticked.checks.wheelSize?.status).toBe("ticked");
    expect(edit(ticked, (f) => ({ ...f, wheelRearIn: 16 })).checks.wheelSize?.status).toBe("theirs");
    // Unticking, then changing nothing about the wheels, leaves it to tick.
    const unticked = withConfirmed(ticked, "wheelSize", false);
    expect(edit(unticked, (f) => ({ ...f, weightLb: 60 })).checks.wheelSize?.status).toBe("unchecked");
  });

  it("starts every size as read again on a new read, and drops an edit made on the old card", () => {
    const old = edit(allButWheels(), (f) => withWheelSize(f, 26, false));
    const next = read(TWO_SIZES);
    const after = applyAll(old, [() => next, editOn(old.facts, { ...old.facts, wheelRearIn: 22 })]);
    expect(after).toBe(next);
    expect(after.checks.wheelSize?.status).toBe("unchecked");
    // On the new bike, changing only the rear leaves the front still as read.
    expect(edit(after, (f) => ({ ...f, wheelRearIn: 22 })).checks.wheelSize?.status).toBe("unchecked");
  });

  it("still makes one read size theirs at once, and a size the text never gave changes nothing", () => {
    const one = read(CLASS_2, "listing");
    expect(edit(one, (f) => withWheelSize(f, 24, true)).checks.wheelSize?.status).toBe("theirs");
    const rearOnly = fromRead({ ...emptyFacts(), wheelRearIn: 16 });
    expect(edit(rearOnly, (f) => ({ ...f, wheelFrontIn: 18 })).checks.wheelSize?.status).toBe("unchecked");
    expect(edit(rearOnly, (f) => ({ ...f, wheelRearIn: 18 })).checks.wheelSize?.status).toBe("theirs");
  });
});

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
      createElement(ShapeFacts, { lang: "en", facts: bike.facts, checks: bike.checks, evidence: {}, onChange: () => undefined, onConfirm: () => undefined }),
    );
    expect(html).toContain(`>${t("en", "rear")}<`);
    expect(html).toContain(`>${t("en", "front")}<`);
  });
});

describe("the pedal photo message is chosen when the call lands", () => {
  it("asks for a tick only when the pedals answer still needs one after the call", () => {
    const bike = read(CLASS_2, "listing");
    expect(bike.facts.hasPedals).toBe(true);
    // A call that changes the answer always needs a tick.
    expect(pedalCallNeedsTick(bike, "no_pedals")).toBe(true);
    expect(pedalCallNeedsTick(withConfirmed(bike, "hasPedals", true), "no_pedals")).toBe(true);
    // A call that agrees leaves the answer's check as it was.
    expect(pedalCallNeedsTick(bike, "pedals")).toBe(true);
    expect(pedalCallNeedsTick(withConfirmed(bike, "hasPedals", true), "pedals")).toBe(false);
    // Typed in: nothing to tick unless the photo changed the answer.
    const own = withEdit(emptyChecked(), { ...emptyFacts(), hasPedals: true });
    expect(pedalCallNeedsTick(own, "pedals")).toBe(false);
    expect(pedalCallNeedsTick(own, "no_pedals")).toBe(true);
    expect(pedalCallNeedsTick(bike, "ask")).toBe(true);
    expect(pedalCallNeedsTick(own, "ask")).toBe(false);
    // Picked in the message for the call, never re-picked when the box is ticked later.
    expect(photoMessage("photoCheckNoPedals", pedalCallNeedsTick(bike, "no_pedals"))).toBe("photoCheckNoPedalsTick");
  });

  it("picks the message once, as the call lands, so a later tick never changes the words", async () => {
    const bike = read(CLASS_2, "listing");
    const asked: PedalCall[] = [];
    const tickAfter = (call: PedalCall) => {
      asked.push(call);
      return pedalCallNeedsTick(bike, call);
    };
    const message = await photoCheckMessage(async () => ({ call: "no_pedals" }), answerGate().start(), () => true, () => undefined, tickAfter);
    expect(message).toBe("photoCheckNoPedalsTick");
    expect(asked).toEqual(["no_pedals"]);
  });

  it("stores the message and clears it when the family picks a pedals answer (source check, the card needs a browser to run)", () => {
    const check = readFileSync(join(ROOT, "components", "PedalPhotoCheck.tsx"), "utf8");
    expect(check).toContain("if (next !== null) setMessage(next);");
    expect(check).toContain("{t(lang, message)}");
    expect(check).toContain("if (picks !== seenPicks) {");
    expect(check).toMatch(/setSeenPicks\(picks\);\s*setMessage\(null\);/);
    const card = readFileSync(join(ROOT, "components", "FactsCard.tsx"), "utf8");
    expect(card).toContain("tickAfter={(call) => pedalCallNeedsTick({ facts, checks }, call)}");
    expect(card).toContain("picks={pedalPicks}");
    expect(card).toMatch(/pedalAnswers\.edited\("picked"\);\s*setPedalPicks\(\(n\) => n \+ 1\);/);
  });

  it("would say the answer is now no after the family picked Yes, which the clear prevents", () => {
    const called = withPedalCall(read(CLASS_2, "listing"), "no_pedals");
    const picked = edit(called, (f) => ({ ...f, hasPedals: true }));
    expect(picked.facts.hasPedals).toBe(true);
    expect(picked.checks.hasPedals?.status).toBe("theirs");
    for (const lang of LANGS) expect(t(lang, "photoCheckNoPedals")).toMatch(lang === "en" ? /now no/ : /ahora es no/);
  });
});

describe("the bottom line names the box the family will find", () => {
  it("starts every box's name with the words the instructions quote, the two-size box too", () => {
    const bike = read(TWO_SIZES);
    const e = extract(TWO_SIZES, "label");
    for (const lang of LANGS) {
      expect(t(lang, "readMatchesBoth").startsWith(`${t(lang, "readMatches")}, `), lang).toBe(true);
      const html = renderCard(bike, e.evidence, lang);
      const boxes = (html.match(/<input type="checkbox"[^>]*>/g) ?? []).filter((tag) => tag.includes('data-read-check="unchecked"'));
      const names = boxes.map((tag) => /aria-label="([^"]*)"/.exec(tag)?.[1] ?? "");
      expect(names.length, lang).toBe(unconfirmedFields(bike.checks).length);
      for (const name of names) expect(name.startsWith(t(lang, "readMatches")), `${lang} ${name}`).toBe(true);
    }
  });

  it("says under that fact for one unchecked fact, and under each one for more", () => {
    const one = (lang: "en" | "es") => renderLine({ code: "bl_unconfirmed_facts", params: { fields: "wheelSize" } }, lang, "California");
    const two = (lang: "en" | "es") => renderLine({ code: "bl_unconfirmed_facts", params: { fields: "classes,wheelSize" } }, lang, "California");
    expect(one("en")).toBe(
      'You haven\'t checked the wheel size against the bike yet. Facts read from a link or photo can be wrong, so look at the bike and tick "It matches the bike" under that fact in "Check the facts" above, or fix that fact.',
    );
    expect(one("es")).toBe(
      'Todavía no comparaste con la bicicleta el tamaño de las ruedas. Los datos leídos de un enlace o una foto pueden estar mal, así que mira la bicicleta y marca "Coincide con la bicicleta" debajo de ese dato en "Revisa los datos", arriba, o corrige el dato.',
    );
    expect(one("en")).not.toContain("each one");
    expect(one("es")).not.toContain("cada uno");
    expect(two("en")).toContain("under each one");
    expect(two("es")).toContain("debajo de cada uno");
    for (const lang of LANGS) {
      for (const text of [one(lang), two(lang)]) {
        expect(text).toContain(`"${t(lang, "readMatches")}"`);
        expect(text).toContain(`"${t(lang, "step3")}"`);
        expect(text).not.toMatch(/[—;]/);
      }
    }
  });

  it("keeps the new words in Arnav's style", () => {
    for (const lang of LANGS) expect(t(lang, "readMatchesBoth")).not.toMatch(/[—;]/);
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

describe("the gate still holds", () => {
  it("never says YES while the wheel size is left as read, however the other facts are checked", () => {
    let bike = allButWheels();
    bike = edit(bike, (f) => withWheelSize(f, 26, false));
    for (const lang of LANGS) {
      const line = answer("CA", 30, bike, []);
      expect(line.kind, lang).toBe("no_unconfirmed");
    }
    expect(READ_FIELDS).toContain("wheelSize");
    expect(confirmOn(bike.facts, "wheelSize", true)(bike).checks.wheelSize?.status).toBe("ticked");
  });
});
