// Every answer is a plain YES or NO. These tests read what a family sees and hears: the rendered
// place cards, the bottom line, the sentence screen readers hear and the accuracy page labels.
// None may give "Can't confirm", "unsure" or "not sure" as the answer. The "Not sure" input choice
// on a follow-up question stays, since it is a question, not an answer, and it leads to NO.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/photo/runPedalCheck", () => ({
  hasWebGpu: vi.fn(async () => true),
  runPedalCheck: vi.fn(),
}));

import { BikeInput } from "@/components/BikeInput";
import { BottomLineCard } from "@/components/BottomLineCard";
import { Checker } from "@/components/Checker";
import { FactsCard } from "@/components/FactsCard";
import { FollowUps } from "@/components/FollowUps";
import { VerdictCard } from "@/components/VerdictCard";
import { ACCURACY_TEXT } from "@/lib/i18n/accuracy";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import type { BottomLine } from "@/lib/rules/bottomLine";
import type { BikeFacts, Verdict } from "@/lib/rules/types";
import { ANSWER_WORD, announcementProblems, headlineProblems, hedgeProblems, shownAnswer, visibleLines, type Answer } from "./answerWords";
import { classBike } from "./helpers";
import { elements, mount, one, textOf, type El } from "./hooks";

type Handler = (...args: unknown[]) => unknown;

/** Calls an element's handler the way the browser or the child component would. */
function call(element: El, name: string, ...args: unknown[]): unknown {
  const handler = element.props[name];
  if (typeof handler !== "function") throw new Error(`No ${name} handler`);
  return (handler as Handler)(...args);
}

describe("the check for a plain YES or NO catches the old hedges", () => {
  /** A card headline and the line under it, the way VerdictCard and BottomLineCard draw them. */
  const card = (answer: Answer, mark: string, word: string, line: string) =>
    `<article><p class="badge" data-answer="${answer}"><span aria-hidden="true">${mark}</span><span>${word}</span></p><p data-answer-line="">${line}</p></article>`;

  it("passes a YES or NO with a plain reason, in both languages", () => {
    expect(headlineProblems(card("no", "✕", "NO", "We can&#x27;t confirm it&#x27;s legal in South Carolina."), "en", "no")).toEqual([]);
    expect(headlineProblems(card("no", "✕", "NO", "No podemos confirmar que sea legal en Carolina del Sur."), "es", "no")).toEqual([]);
    expect(headlineProblems(card("yes", "✓", "SÍ", "Permitida en todos los lugares que revisamos."), "es", "yes")).toEqual([]);
  });

  it("fails the old place card label, which had no YES or NO at all", () => {
    const old = '<article><p class="badge" data-status="cant_confirm"><span aria-hidden="true">?</span>Can&#x27;t confirm</p></article>';
    expect(headlineProblems(old, "en", "no")).toContain("0 headlines");
  });

  it("fails a hedge in place of the answer word, a ? mark, or a NO where the answer is YES", () => {
    expect(headlineProblems(card("no", "?", "Can&#x27;t confirm", "We can&#x27;t confirm it&#x27;s legal in Texas."), "en", "no")).toEqual([
      'headline "Can\'t confirm", expected "NO"',
      'mark "?"',
    ]);
    expect(headlineProblems(card("no", "✕", "NO", "Allowed."), "en", "yes")).toEqual(["marked no, expected yes", 'headline "NO", expected "YES"', 'mark "✕"']);
    expect(headlineProblems(card("no", "✕", "No se puede confirmar", "x"), "es", "no")).toContain('headline "No se puede confirmar", expected "NO"');
  });

  it("fails a reason line that leads with a hedge, like the old bottom line's \"Not confirmed.\"", () => {
    const old = "Not confirmed. We can&#x27;t confirm it&#x27;s allowed in every place we checked.";
    expect(headlineProblems(card("no", "✕", "NO", old), "en", "no")).toEqual([`hedge label "${old.replace(/&#x27;/g, "'")}"`]);
    for (const line of ["Can't confirm", "Unsure.", "Not sure", "Maybe.", "It depends.", "No confirmada. No podemos confirmar.", "Todavía no confirmada.", "Unas preguntas", "No sé"]) {
      expect(hedgeProblems([line], true), line).not.toEqual([]);
    }
  });

  it("lets a reason explain a NO in a full sentence, and quote the Not sure choice by name", () => {
    expect(hedgeProblems(["We can't confirm it's legal in South Carolina.", "No podemos confirmar que sea legal en el Distrito de Columbia."], true)).toEqual([]);
    expect(hedgeProblems(['You answered "not sure" about fast modes.', "Respondiste “no sé” sobre los modos rápidos."], true)).toEqual([]);
    expect(hedgeProblems(["You answered not sure about fast modes."])).toEqual(['says not sure outside quotes: "You answered not sure about fast modes."']);
    // "unsure" is never shown, quoted or not.
    expect(hedgeProblems(['Marked "unsure".'])).not.toEqual([]);
  });

  it("fails a screen reader sentence that hedges before the YES or NO", () => {
    expect(announcementProblems("Bottom line: NO. We can't confirm it's legal in Texas.", "en", "no", "Bottom line")).toEqual([]);
    expect(announcementProblems("En resumen: SÍ. Permitida.", "es", "yes", "En resumen")).toEqual([]);
    expect(announcementProblems("Bottom line: NO. Not confirmed. We can't confirm it's allowed.", "en", "no", "Bottom line")).toEqual([
      'hedge label "Not confirmed."',
    ]);
    expect(announcementProblems("Bottom line: Can't confirm.", "en", "no", "Bottom line")[0]).toMatch(/^announcement starts/);
  });
});

describe("the page answers YES or NO at every step, and keeps Not sure as an input choice", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 19, 12));
    vi.stubGlobal("window", { location: { search: "?lang=en&state=CA" } });
    vi.stubGlobal("requestAnimationFrame", (run: (time: number) => void) => {
      run(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Fast-mode answers left open, so the page asks the follow-up first. */
  const OPEN: BikeFacts = classBike(2, { motorOver20: null, assistOver28: null, switchable: null });

  function page() {
    const m = mount(Checker, {}, { effects: false });
    const tree = () => m.tree();
    const find = (type: unknown, what: string) => one(tree(), (e) => e.type === type, what);
    const all = (type: unknown) => elements(tree()).filter((e) => e.type === type);
    const lang = () => find(BottomLineCard, "bottom line").props.lang as Lang;
    /** The sentence screen readers hear: the last status line on the page, under the bottom line. */
    const heard = () => textOf(elements(tree()).filter((e) => e.type === "p" && e.props.role === "status").at(-1));

    /** Every problem with the answers on the page right now: each card, the bottom line and the sentence heard. */
    function problems(): string[] {
      const l = lang();
      const cards = all(VerdictCard).flatMap((e) => {
        const v = e.props.verdict as Verdict;
        const html = renderToStaticMarkup(e);
        return [...headlineProblems(html, l, v.status === "yes" ? "yes" : "no"), ...hedgeProblems(visibleLines(html))].map((p) => `${v.id}: ${p}`);
      });
      const bl = find(BottomLineCard, "bottom line");
      const expected: Answer = (bl.props.line as BottomLine).kind === "yes" ? "yes" : "no";
      const html = renderToStaticMarkup(bl);
      return [
        ...cards,
        ...headlineProblems(html, l, expected),
        ...hedgeProblems(visibleLines(html)),
        ...announcementProblems(heard(), l, expected, t(l, "blTitle")),
      ];
    }

    /** The YES or NO each card shows, by card, then the bottom line's. */
    const answers = () => ({
      cards: all(VerdictCard).map((e) => `${(e.props.verdict as Verdict).id} ${shownAnswer(renderToStaticMarkup(e)).word}`),
      bottom: shownAnswer(renderToStaticMarkup(find(BottomLineCard, "bottom line"))),
      heard: heard(),
    });

    const facts = () => find(FactsCard, "facts card").props.facts as BikeFacts;
    m.act(() => call(find(BikeInput, "bike input"), "onManual"));
    const age = one(tree(), (e) => e.type === "input" && e.props.type === "number", "age box");
    m.act(() => call(age, "onChange", { target: { value: "30" } }));
    m.act(() => call(find(FactsCard, "facts card"), "onChange", OPEN));
    m.act(() => call(find(FactsCard, "facts card"), "onCheck"));
    return { m, find, facts, problems, answers };
  }

  it("asks the fast-mode question with a Not sure choice, and the cards and bottom line say NO until it is answered", () => {
    const p = page();
    const followUps = renderToStaticMarkup(p.find(FollowUps, "follow-ups"));
    expect(followUps).toContain(`>${t("en", "notSure")}<`);
    expect(p.problems()).toEqual([]);
    expect(p.answers()).toEqual({
      cards: ["CA NO"],
      bottom: { word: "NO", mark: "✕", line: "We can't confirm it's legal in California." },
      heard: "Bottom line: NO. We can't confirm it's legal in California.",
    });
  });

  it("turns a Not sure answer into NO, in English and Spanish, and No, No into YES", () => {
    const p = page();
    p.m.act(() => call(p.find(FollowUps, "follow-ups"), "onChange", { ...p.facts(), unsure: ["fast_mode"] }));
    expect(p.problems()).toEqual([]);
    expect(p.answers().bottom.word).toBe("NO");
    expect(p.answers().heard).toBe("Bottom line: NO. We can't confirm it's legal in California.");

    p.m.act(() => call(one(p.m.tree(), (e) => e.type === "button" && e.props["aria-label"] === t("en", "switchLangLabel"), "language button"), "onClick"));
    expect(renderToStaticMarkup(p.find(FollowUps, "follow-ups"))).toContain(`>${t("es", "notSure")}<`);
    expect(p.problems()).toEqual([]);
    expect(p.answers().bottom).toEqual({ word: "NO", mark: "✕", line: "No podemos confirmar que sea legal en California." });
    expect(p.answers().heard).toBe("En resumen: NO. No podemos confirmar que sea legal en California.");

    p.m.act(() => call(p.find(FollowUps, "follow-ups"), "onChange", { ...p.facts(), motorOver20: false, assistOver28: false, unsure: [] }));
    expect(p.problems()).toEqual([]);
    expect(p.answers()).toEqual({
      cards: ["CA SÍ"],
      bottom: { word: "SÍ", mark: "✓", line: "Permitida en todos los lugares que revisamos, para esta persona y esta bicicleta." },
      heard: "En resumen: SÍ. Permitida en todos los lugares que revisamos, para esta persona y esta bicicleta.",
    });
  });

  it("says NO for South Carolina, whose law doesn't clearly cover e-bikes, and names the state", () => {
    const p = page();
    p.m.act(() => call(p.find(FollowUps, "follow-ups"), "onChange", { ...p.facts(), motorOver20: false, assistOver28: false }));
    expect(p.answers().bottom.word).toBe("YES");
    p.m.act(() => call(one(p.m.tree(), (e) => e.type === "select", "state picker"), "onChange", { target: { value: "SC" } }));
    expect(p.problems()).toEqual([]);
    expect(p.answers()).toEqual({
      cards: ["SC NO"],
      bottom: { word: "NO", mark: "✕", line: "We can't confirm it's legal in South Carolina." },
      heard: "Bottom line: NO. We can't confirm it's legal in South Carolina.",
    });
  });
});

describe("the accuracy page labels every answer YES or NO", () => {
  for (const lang of ["en", "es"] as const) {
    it(`in ${lang === "en" ? "English" : "Spanish"}`, () => {
      const text = ACCURACY_TEXT[lang];
      const yes = [text.statusYes, text.blYes];
      const no = [text.statusNo, text.statusNotEbike, text.statusCantConfirm, text.statusNeedInfo, text.blNoIllegal, text.blNoUnconfirmed];
      for (const label of yes) expect(label.split(/[ ,]/)[0], label).toBe(ANSWER_WORD[lang].yes);
      for (const label of no) expect(label.split(/[ ,]/)[0], label).toBe(ANSWER_WORD[lang].no);
      expect(hedgeProblems([...yes, ...no], true)).toEqual([]);
    });
  }
});
