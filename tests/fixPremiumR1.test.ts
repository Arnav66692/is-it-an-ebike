// Regression tests for the first review of the premium restyle. There is no browser here, so the
// style checks read the rules in app/globals.css that fix each problem. The screenshots in
// scratchpad/ultra_premium/fix-r1 show the result.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckerSkeleton } from "@/components/Skeletons";
import { FlyerSheet } from "@/components/FlyerSheet";
import { VerdictCard } from "@/components/VerdictCard";
import { ACCURACY_TEXT } from "@/lib/i18n/accuracy";
import { t } from "@/lib/i18n/ui";
import { renderLine } from "@/lib/i18n/verdicts";
import { evaluate } from "@/lib/rules";
import { PLACE_IDS } from "@/lib/rules/local";
import { classBike } from "./helpers";

const ROOT = join(__dirname, "..");
const CSS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
const UI = readFileSync(join(ROOT, "lib", "i18n", "ui.ts"), "utf8");

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string, from = 0): string {
  const at = CSS.indexOf(`${selector} {`, from);
  if (at < 0) throw new Error(`no rule ${selector}`);
  const open = CSS.indexOf("{", at);
  return CSS.slice(open + 1, CSS.indexOf("}", open));
}

/** The text of an @media block, up to its matching brace. */
function media(query: string): string {
  const at = CSS.indexOf(`@media ${query} {`);
  if (at < 0) throw new Error(`no @media ${query}`);
  let depth = 0;
  for (let i = CSS.indexOf("{", at); i < CSS.length; i++) {
    if (CSS[i] === "{") depth += 1;
    if (CSS[i] === "}") depth -= 1;
    if (depth === 0) return CSS.slice(at, i + 1);
  }
  throw new Error("unclosed block");
}

describe("sources and their dates", () => {
  it("lets a long tag push the date to its own line instead of a one-letter column", () => {
    const source = rule(".source");
    expect(source).toMatch(/display:\s*flex/);
    expect(source).toMatch(/flex-wrap:\s*wrap/);
    expect(source).not.toMatch(/grid-template-columns:\s*auto 1fr/);
    // Breaking anywhere let the date shrink to one character. Only the link may break anywhere.
    expect(source).not.toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule(".source-date")).not.toMatch(/anywhere/);
    expect(rule(".source-link")).toMatch(/flex-basis:\s*100%/);
  });
});

describe("the bike step's tabs", () => {
  it("starts every tab's icon on one line, even when one label wraps to fewer lines", () => {
    expect(rule(".tabs button")).toMatch(/align-content:\s*start/);
  });

  it("runs the open panel's wash to the card's bottom edge, so a short panel has no hard line", () => {
    const panel = rule('.tabs + [role="tabpanel"],\n.tabs + .sk-panel');
    expect(panel).toMatch(/margin-bottom:\s*calc\(-1 \* var\(--pad\)\)/);
    expect(panel).toMatch(/padding:\s*1\.25rem var\(--pad\) var\(--pad\)/);
  });
});

describe("buttons", () => {
  it("shows a button that can't be used yet as a pale block, not a faded black slab", () => {
    const disabled = rule(".btn:disabled");
    expect(disabled).not.toMatch(/opacity/);
    expect(disabled).toMatch(/background:\s*var\(--sunk\)/);
    expect(disabled).toMatch(/color:\s*var\(--muted\)/);
  });

  it("splits a row of buttons into equal parts", () => {
    expect(rule(".actions > .btn")).not.toMatch(/flex:\s*1 1 auto/);
    const pedal = readFileSync(join(ROOT, "components", "PedalPhotoCheck.tsx"), "utf8");
    expect(pedal).toContain('<div className="actions">');
  });
});

describe("contrast themes and print", () => {
  it("frames the answer card and the step numerals when fills and shadows are dropped", () => {
    expect(media("(forced-colors: active)")).toMatch(/\.bottom-line,\n\s*\.step \{\s*border: 1px solid CanvasText;/);
  });

  it("prints a ticked box as ticked and the flyer on one sheet", () => {
    const print = media("print");
    expect(print).toMatch(/\.check input \{\s*appearance: auto;/);
    expect(print).toMatch(/\.check input::before \{\s*content: none;/);
    expect(print).toMatch(/\.page \{\s*padding-bottom: 0;/);
  });
});

describe("small layout fixes", () => {
  it("keeps a quote in one rectangle", () => {
    expect(rule(".quote")).toMatch(/display:\s*inline-block/);
    expect(rule(".quote")).not.toMatch(/font-size/);
  });

  it("makes every place chip a full-width row, so the remove cells line up", () => {
    expect(rule(".chip")).toMatch(/width:\s*100%/);
  });

  it("sets the places a bottom-line item is about in sentence case, not as an uppercase label", () => {
    const label = CSS.slice(CSS.indexOf(".eyebrow,\n.section-label,"), CSS.indexOf("text-transform: uppercase"));
    expect(label).not.toContain(".bl-where");
    expect(CSS).toMatch(/\.source-date,\n\.bl-where \{/);
  });

  it("puts the desktop pixel field on the band's own 16 px grid", () => {
    const hero = media("(min-width: 1024px)");
    expect(hero).toMatch(/background-size:\s*16px 16px/);
    expect(hero).not.toMatch(/8px 8px/);
  });

  it("spaces every step 1 label and its help line the same", () => {
    const search = readFileSync(join(ROOT, "components", "PlaceSearch.tsx"), "utf8");
    expect(search).not.toContain('className="space-y-1"');
  });
});

describe("the loading frame", () => {
  it("holds the state, age and date fields and the label panel, so the steps below don't jump", () => {
    const html = renderToStaticMarkup(createElement(CheckerSkeleton));
    for (const k of ["state", "stateHelp", "age", "date", "labelHelp", "choosePhoto", "labelPrivacy"] as const) {
      expect(html, k).toContain(t("en", k).replace(/'/g, "&#x27;"));
    }
    expect(html).toContain("sk-panel");
  });
});

describe("the QR flyer", () => {
  it("lets the QR placeholder shrink on a 320 px phone", () => {
    const html = renderToStaticMarkup(createElement(FlyerSheet, { qr: "", url: "" }));
    expect(html).not.toContain("h-64");
    expect(html).toContain("aspect-square");
    expect(rule(".card.flyer")).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(rule(".qr-frame")).toMatch(/max-width:\s*100%/);
  });

  it("lists the three ways in as three nouns", () => {
    const html = renderToStaticMarkup(createElement(FlyerSheet, { qr: "", url: "" }));
    expect(html).toContain("Label photo, product link or typed-in facts.");
    expect(html).toContain("Foto de la etiqueta, enlace o datos escritos.");
  });
});

describe("copy", () => {
  it("counts every San Diego place the engine covers on /accuracy", () => {
    const accuracy = JSON.parse(readFileSync(join(ROOT, "data", "results", "accuracy.json"), "utf8"));
    expect(accuracy.engine.san_diego_places).toBe(PLACE_IDS.length);
    expect(PLACE_IDS.length).toBe(20);
  });

  it("names the accuracy page the same in the footer and on the page", () => {
    for (const lang of ["en", "es"] as const) expect(t(lang, "accuracy")).toBe(ACCURACY_TEXT[lang].title);
  });

  it("says bicicleta and uses the infinitive on the Spanish photo check", () => {
    const es = UI.slice(UI.indexOf("const es"));
    expect(es).not.toMatch(/\bbici\b/);
    expect(t("es", "photoCheckChoose")).toMatch(/^Tomar o elegir/);
  });

  it("drops the friendly softeners", () => {
    expect(t("en", "questionsTitle")).toBe("Questions about this bike");
    expect(t("en", "photoCheckOpen")).not.toMatch(/Not sure/);
  });

  it("says checked once in a place card's footer", () => {
    expect(t("en", "lastChecked", { date: "Oct 16, 2026" })).not.toMatch(/checked/i);
    expect(t("es", "lastChecked", { date: "16 de octubre de 2026" })).not.toMatch(/revisad/i);
  });

  it("does not repeat that a label can't show the answers on a card waiting on the questions", () => {
    const asked = classBike(1, { wheelFrontIn: null, wheelRearIn: null, wheelCount: null });
    const result = evaluate({ state: "TX", riderAge: 8, rideDate: "2026-10-20", facts: asked, places: [] });
    expect(result.state.status).toBe("need_info");
    for (const lang of ["en", "es"] as const) {
      const html = renderToStaticMarkup(createElement(VerdictCard, { verdict: result.state, lang, stateCode: "TX", rideDate: "2026-10-20" }));
      const repeated = renderLine(result.state.reason, lang, "Texas").replace(/'/g, "&#x27;");
      expect(html, lang).not.toContain(repeated);
      // The answer and its lead are still there.
      expect(html, lang).toContain('data-answer-line=""');
    }
  });
});
