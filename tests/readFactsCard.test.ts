// The facts card shows each fact read from a link or photo with the words it was read from, and no
// box to tick. Nothing carries a read over to a reload or a shared link.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactsCard } from "@/components/FactsCard";
import { photoCheckMessage } from "@/components/PedalPhotoCheck";
import { answerGate, type PedalCall } from "@/lib/photo/pedalRule";
import { parseShareLink } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText } from "@/lib/extract/parse";
import { editOn, emptyChecked, fromRead, withPedalCall, type CheckedFacts } from "@/lib/provenance";
import { emptyFacts } from "@/lib/rules/types";
import { t, UI_KEYS } from "@/lib/i18n/ui";
import { classBike } from "./helpers";

/** A listing for a plain Class 2 kids' e-bike, the kind a family pastes in. */
const CLASS_2_LISTING =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";

/** How many times `text` is shown as a mark's words. */
function shown(html: string, text: string): number {
  return html.split(`<span>${text}</span>`).length - 1;
}

function read(text: string): CheckedFacts {
  return fromRead(factsFromExtraction(parseSpecText(text, "listing"), emptyFacts()));
}

const EVIDENCE = parseSpecText(CLASS_2_LISTING, "listing").evidence;

function render(b: CheckedFacts, lang: "en" | "es", evidence = EVIDENCE): string {
  return renderToStaticMarkup(
    createElement(FactsCard, {
      lang,
      facts: b.facts,
      checks: b.checks,
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

describe("the facts card", () => {
  it("marks each read fact with where it was read and quotes the words, with no box to tick, in both languages", () => {
    const bike = read(CLASS_2_LISTING);
    for (const lang of ["en", "es"] as const) {
      const html = render(bike, lang);
      expect(shown(html, t(lang, "readMarkText")), lang).toBe(8);
      expect(html.split('data-read-mark="text"').length - 1, lang).toBe(8);
      expect(html.split('class="quote"').length - 1, lang).toBeGreaterThanOrEqual(8);
      expect(html, lang).not.toMatch(/data-read-check|It matches the bike|Coincide con la bicicleta/);
      expect(html, lang).not.toMatch(/check-count|class="segs"/);
      // The Check button is still at the end of the card.
      expect(html).toContain(t(lang, "check"));
    }
  });

  it("keeps the words a fact was read from, as Read from, once the family changes it", () => {
    const bike = read(CLASS_2_LISTING);
    const changed = editOn(bike.facts, { ...bike.facts, weightLb: 64 })(bike);
    const html = render(changed, "en");
    expect(shown(html, t("en", "readMarkText"))).toBe(7);
    expect(html).toContain(t("en", "readFrom"));
    expect(html).toContain("Weight 62 lbs");
  });

  it("marks a pedals answer from the photo check as read by the photo", () => {
    const typed = editOn(emptyChecked().facts, { ...classBike(2), hasPedals: null })(emptyChecked());
    const photo = render(withPedalCall(typed, "pedals"), "en", {});
    expect(shown(photo, t("en", "readMarkPhoto"))).toBe(1);
    expect(photo).not.toContain(t("en", "readMarkText"));
  });

  it("shows no marks for typed facts", () => {
    const typed = render(editOn(emptyChecked().facts, classBike(2))(emptyChecked()), "en", {});
    expect(typed).not.toContain(t("en", "readMarkText"));
    expect(typed).not.toContain(t("en", "readMarkPhoto"));
  });

  it("keeps the read words in Arnav's style, and no text asks for a tick", () => {
    for (const key of ["readAnnounceOne", "readAnnounceMany", "readMarkText", "readMarkPhoto", "readFromBefore", "unlock"] as const) {
      for (const lang of ["en", "es"] as const) expect(t(lang, key), `${lang}.${key}`).not.toMatch(/[—;:]/);
      expect(t("es", key), key).not.toBe(t("en", key));
    }
    for (const key of UI_KEYS) {
      for (const lang of ["en", "es"] as const) expect(t(lang, key), `${lang}.${key}`).not.toMatch(/"It matches the bike"|"Coincide con la bicicleta"|\btick\b/i);
    }
  });
});

describe("the pedal photo check guard", () => {
  it("never replaces a pedals answer picked while the check ran", async () => {
    const run = async (pick: boolean) => {
      const gate = answerGate();
      const calls: PedalCall[] = [];
      let finish: (v: { call: PedalCall }) => void = () => undefined;
      const pending = photoCheckMessage(
        () => new Promise((resolve) => (finish = resolve)),
        gate.start(),
        () => true,
        (call) => calls.push(call),
      );
      if (pick) gate.edited("picked");
      finish({ call: "no_pedals" });
      return { message: await pending, calls };
    };
    expect(await run(true)).toEqual({ message: "photoCheckKept", calls: [] });
    expect(await run(false)).toEqual({ message: "photoCheckNoPedals", calls: ["no_pedals"] });
    // Nothing is shown once the card has left the page.
    expect(await photoCheckMessage(async () => ({ call: "pedals" }), answerGate().start(), () => false, () => undefined)).toBeNull();
  });

  it("only guards a pick made while the check runs, so a pick before it is replaced by the photo's call", async () => {
    const gate = answerGate();
    gate.edited("picked");
    const calls: PedalCall[] = [];
    const message = await photoCheckMessage(async () => ({ call: "pedals" }), gate.start(), () => true, (call) => calls.push(call));
    expect(calls).toEqual(["pedals"]);
    expect(message).toBe("photoCheckPedals");
  });
});

describe("nothing carries a read over", () => {
  it("a shared link holds only the language, state and places, never facts", () => {
    const link = parseShareLink("?lang=es&state=CA&place=encinitas&confirmed=classes,ratedWatts&checks=all&facts=x");
    expect(Object.keys(link).sort()).toEqual(["lang", "places", "state"]);
  });

  it("the checker starts with no facts, keeps the facts and their notes together, and saves neither", () => {
    const source = readFileSync(join(__dirname, "..", "components", "Checker.tsx"), "utf8");
    expect(source).toContain("useState<CheckedFacts>(emptyChecked)");
    expect(source).not.toMatch(/setFacts\(/);
    expect(source).toContain('const next = fromRead(factsFromExtraction(extraction, emptyFacts()), "text");');
    expect(source).toContain("summaryFor(result, date)");
    expect(source).not.toMatch(/(local|session)Storage\.setItem\((?!"lang")/);
    expect(source).not.toMatch(/indexedDB|sessionStorage/);
  });
});
