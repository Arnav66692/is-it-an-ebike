// The facts card marks each fact read from a link or photo with a box to tick, the bottom-line
// card names what is left to check, and nothing carries a check over to a reload or shared link.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { announcement, BottomLineCard, subtitleKey, whereLabel } from "@/components/BottomLineCard";
import { FactsCard } from "@/components/FactsCard";
import { parseShareLink } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText } from "@/lib/extract/parse";
import { emptyChecked, fromRead, unconfirmedFields, withConfirmed, withEdit, withPedalCall, type CheckedFacts } from "@/lib/provenance";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts } from "@/lib/rules/types";
import { t } from "@/lib/i18n/ui";
import { READ_FIELD_NAMES, renderLine } from "@/lib/i18n/verdicts";
import { classBike } from "./helpers";

const DAY = "2026-10-19";

/** A listing for a plain Class 2 kids' e-bike, the kind a family pastes in. */
const CLASS_2_LISTING =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";

function read(text: string): CheckedFacts {
  return fromRead(factsFromExtraction(parseSpecText(text, "listing"), emptyFacts()));
}

describe("the words a family reads", () => {
  it("quotes the card's own words, so the family can find the box and the card", () => {
    for (const lang of ["en", "es"] as const) {
      const text = renderLine({ code: "bl_unconfirmed_facts", params: { fields: "classes" } }, lang, "California");
      expect(text).toContain(`"${t(lang, "readMatches")}"`);
      expect(text).toContain(`"${t(lang, "step3")}"`);
    }
  });

  it("labels the facts item and says the next step is on the facts card, in both languages", () => {
    const result = evaluate({ state: "CA", riderAge: 11, rideDate: DAY, facts: classBike(2), places: ["encinitas"] });
    const bl = bottomLine(result, DAY, ["classes", "ratedWatts"]);
    expect(subtitleKey(bl)).toBe("blFactsSub");
    expect(whereLabel([], "en", "CA")).toBe("The facts I read");
    expect(whereLabel([], "es", "CA")).toBe("Los datos que leí");
    for (const lang of ["en", "es"] as const) {
      const html = renderToStaticMarkup(createElement(BottomLineCard, { line: bl, lang, stateCode: "CA" }));
      expect(html).toContain(t(lang, "blFactsWhere"));
      expect(html).toContain(t(lang, "blFactsSub"));
      expect(html).toContain(READ_FIELD_NAMES[lang].ratedWatts);
      expect(html).not.toContain(">" + t(lang, "blYes") + "<");
      expect(announcement(bl, lang)).toContain(t(lang, "blNo"));
    }
    // With another gap too, the usual line stays.
    const campus = evaluate({ state: "CA", riderAge: 15, rideDate: DAY, facts: classBike(1), places: ["sduhsd_campuses"] });
    expect(subtitleKey(bottomLine(campus, DAY, ["classes"]))).toBe("blUnconfirmedSub");
  });

  it("marks each read fact on the facts card with a box to tick, in both languages", () => {
    const bike = read(CLASS_2_LISTING);
    const e = parseSpecText(CLASS_2_LISTING, "listing");
    const render = (b: CheckedFacts, lang: "en" | "es") =>
      renderToStaticMarkup(
        createElement(FactsCard, {
          lang,
          facts: b.facts,
          checks: b.checks,
          evidence: e.evidence,
          flags: [],
          onChange: () => undefined,
          onConfirm: () => undefined,
          onPedalCall: () => undefined,
          onCheck: () => undefined,
        }),
      ).replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
    for (const lang of ["en", "es"] as const) {
      const html = render(bike, lang);
      expect(html.split(t(lang, "readMarkText")).length - 1, lang).toBe(8);
      expect(html.match(/type="checkbox"[^>]*aria-label="[^"]*"/g)?.filter((m) => m.includes(t(lang, "readMatches"))).length, lang).toBe(8);
      for (const f of unconfirmedFields(bike.checks)) {
        expect(html, `${lang} ${f}`).toContain(`aria-label="${t(lang, "readMatchesFor", { field: READ_FIELD_NAMES[lang][f] })}"`);
      }
      expect(html).toContain(t(lang, "readIntro"));
      expect(html).toContain(t(lang, "readCount", { done: 0, total: 8 }));
    }
    const checked = render(withConfirmed(bike, "classes", true), "en");
    expect(checked.split(t("en", "readMarkText")).length - 1).toBe(7);
    expect(checked).toContain(t("en", "readCount", { done: 1, total: 8 }));
    const photo = render(withPedalCall(withEdit(emptyChecked(), { ...classBike(2), hasPedals: null }), "pedals"), "en");
    expect(photo).toContain(t("en", "readMarkPhoto"));
    expect(photo).not.toContain(t("en", "readMarkText"));
    // Typed facts show no marks at all.
    const typed = render(withEdit(emptyChecked(), classBike(2)), "en");
    expect(typed).not.toContain(t("en", "readMarkText"));
    expect(typed).not.toContain(t("en", "readMatches"));
    expect(typed).not.toContain(t("en", "readIntro"));
  });

  it("keeps the new interface text in Arnav's style", () => {
    const keys = [
      "readIntro",
      "readMarkText",
      "readMarkPhoto",
      "readMatches",
      "readMatchesFor",
      "readMatchesBoth",
      "readTheirs",
      "readFromBefore",
      "readCount",
      "blFactsSub",
      "blFactsWhere",
      "photoCheckPedalsTick",
      "photoCheckNoPedalsTick",
      "unlock",
    ] as const;
    for (const key of keys) {
      for (const lang of ["en", "es"] as const) expect(t(lang, key), `${lang}.${key}`).not.toMatch(/[—;:]/);
      expect(t("es", key), key).not.toBe(t("en", key));
    }
  });

  it("never replaces a pedals answer picked while the check ran, and a pedals tick counts as that answer", () => {
    const card = readFileSync(join(__dirname, "..", "components", "FactsCard.tsx"), "utf8");
    expect(card).toContain('pedalAnswers.edited();\n            setPedalPicks((n) => n + 1);\n            setPedalsUnsure(v === "unsure");');
    expect(card).toContain('if (field === "hasPedals") pedalAnswers.edited();');
    expect(card).toContain("onPedalCall(call);");
    expect(card).not.toContain("applyPedalCall");
  });
});

describe("nothing carries a check over", () => {
  it("a shared link holds only the language, state and places, never facts or checks", () => {
    const link = parseShareLink("?lang=es&state=CA&place=encinitas&confirmed=classes,ratedWatts&checks=all&facts=x");
    expect(Object.keys(link).sort()).toEqual(["lang", "places", "state"]);
  });

  it("the checker starts with nothing checked, keeps the facts and checks together, and saves neither", () => {
    const source = readFileSync(join(__dirname, "..", "components", "Checker.tsx"), "utf8");
    expect(source).toContain("useState<CheckedFacts>(emptyChecked)");
    expect(source).not.toMatch(/setFacts\(/);
    expect(source).toContain('setBike(fromRead(factsFromExtraction(extraction, emptyFacts()), "text"));');
    expect(source.match(/setBike\(emptyChecked\(\)\);/g)?.length).toBe(2);
    expect(source).toContain("bottomLine(result, date, unconfirmed)");
    expect(source).toContain("unconfirmedFields(bike.checks)");
    expect(source).not.toMatch(/(local|session)Storage\.setItem\((?!"lang")/);
    expect(source).not.toMatch(/indexedDB|sessionStorage/);
  });
});
