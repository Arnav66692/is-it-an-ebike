// Regression tests from the fifth review of the read-facts change. Each one names the problem it
// guards against. The step where the family ticked each read fact is gone, so these cover what
// stays: the throttle answers, keyboard focus in the photo check, and the page's own bottom line.
// The components run through tests/hooks.ts, so these tests run the page's own handlers, state and
// effects, not a copy of them or a check of their source text.

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
import { Choice, NumberField } from "@/components/controls";
import { FactsCard } from "@/components/FactsCard";
import { FollowUps } from "@/components/FollowUps";
import { PedalPhotoCheck } from "@/components/PedalPhotoCheck";
import { ReadNote } from "@/components/ReadCheck";
import * as checkerState from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";
import type { Lang } from "@/lib/i18n/names";
import { t, type UiKey } from "@/lib/i18n/ui";
import { answerGate, type PedalCall } from "@/lib/photo/pedalRule";
import { hasWebGpu, runPedalCheck, type PedalResult } from "@/lib/photo/runPedalCheck";
import * as provenance from "@/lib/provenance";
import { editOn, fromRead, type CheckedFacts, type FactCheck } from "@/lib/provenance";
import { bottomLine, evaluate } from "@/lib/rules";
import type { BottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, type BikeFacts } from "@/lib/rules/types";
import { FakeDom, mount, one, textOf, type El, type Mounted } from "./hooks";

const DAY = "2026-10-19";

/** A clear no-pedals call from the photo check. */
const NO_PEDALS: PedalResult = { call: "no_pedals", score: -3, ms: 900 };

/** The plain Class 2 listing from the review's repro. */
const CLASS_2 =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";

function extract(text: string): Extraction {
  return parseSpecText(text, "listing");
}

function read(text: string): CheckedFacts {
  return fromRead(factsFromExtraction(extract(text), emptyFacts()));
}

/** The California answer for an adult, with the fast mode follow-up answered No, No. */
function answerFor(bike: CheckedFacts): BottomLine {
  const facts = { ...bike.facts, motorOver20: false, assistOver28: false };
  const result = evaluate({ state: "CA", riderAge: 30, rideDate: DAY, facts, places: [] });
  return bottomLine(result, DAY);
}

type Handler = (...args: unknown[]) => unknown;

/** Calls an element's handler the way the browser or the child component would. */
function call(element: El, name: string, ...args: unknown[]): unknown {
  const handler = element.props[name];
  if (typeof handler !== "function") throw new Error(`No ${name} handler`);
  return (handler as Handler)(...args);
}

describe("arrowing through the throttle answers never erases the read throttle speed", () => {
  /** The facts card, drawn the way the checker draws it, with each edit applied the way the checker applies it. */
  function factsCard(start: CheckedFacts) {
    let bike = start;
    const evidence = extract(CLASS_2).evidence;
    const props = () => ({
      lang: "en" as Lang,
      facts: bike.facts,
      checks: bike.checks,
      evidence,
      flags: [],
      onChange: (next: BikeFacts) => {
        bike = editOn(shown, next)(bike);
      },
      onPedalCall: () => undefined,
      onCheck: () => undefined,
    });
    let shown = bike.facts;
    const m = mount(FactsCard, props());
    return {
      m,
      bike: () => bike,
      /** Picks a throttle answer, then lets the checker draw the card again. */
      pick(answer: "yes" | "no" | "unsure") {
        const question = one(m.tree(), (e) => e.type === Choice && e.props.legend === t("en", "throttle"), "throttle question");
        m.act(() => call(question, "onChange", answer));
        shown = bike.facts;
        m.rerender(props());
      },
      speedBox: () => one(m.tree(), (e) => e.type === NumberField && e.props.label === t("en", "throttleMph"), "throttle speed box"),
    };
  }

  it("puts the read speed back after the arrow keys pass through No (the review's repro)", () => {
    const start = read(CLASS_2);
    expect(start.facts.throttleMph).toBe(20);
    const card = factsCard(start);
    // In a radio group the arrow keys pick as they move: Yes, then No, Not sure and Yes again.
    for (const answer of ["no", "unsure", "yes"] as const) card.pick(answer);
    const bike = card.bike();
    expect(bike.facts.hasThrottle).toBe(true);
    expect(bike.facts.throttleMph).toBe(20);
    expect(bike.checks).toBe(start.checks);
    expect(card.speedBox().props.value).toBe(20);
    expect(answerFor(bike)).toEqual(answerFor(start));
    expect(answerFor(bike).kind).toBe("yes");
  });

  it("puts it back after No then Not sure too, and when the family stops on Not sure", () => {
    const card = factsCard(read(CLASS_2));
    card.pick("no");
    card.pick("unsure");
    expect(card.bike().facts.hasThrottle).toBeNull();
    expect(card.bike().facts.throttleMph).toBe(20);
    expect(card.bike().checks.throttleMph?.source).toBe("text");
  });

  it("still clears the speed while the answer is No, since a bike with no throttle has none", () => {
    const card = factsCard(read(CLASS_2));
    card.pick("no");
    expect(card.bike().facts.hasThrottle).toBe(false);
    expect(card.bike().facts.throttleMph).toBeNull();
    expect(() => card.speedBox()).toThrow();
  });

  it("puts back a speed the family typed the same way", () => {
    const card = factsCard({ facts: { ...emptyFacts(), hasThrottle: true, throttleMph: 18 }, checks: {} });
    card.pick("no");
    card.pick("yes");
    expect(card.bike().facts.throttleMph).toBe(18);
    expect(card.bike().checks).toEqual({});
  });

  it("is the rule the card runs: No sets the speed aside and any other answer puts it back", () => {
    const facts = read(CLASS_2).facts;
    const no = checkerState.withThrottleAnswer(facts, false, null);
    expect(no).toEqual({ facts: { ...facts, hasThrottle: false, throttleMph: null }, setAside: 20 });
    expect(checkerState.withThrottleAnswer(no.facts, null, no.setAside)).toEqual({ facts: { ...facts, hasThrottle: null }, setAside: null });
    expect(checkerState.withThrottleAnswer(no.facts, true, no.setAside)).toEqual({ facts, setAside: null });
    // A speed already there is kept, and nothing is set aside when there was no speed.
    expect(checkerState.withThrottleAnswer({ ...facts, throttleMph: 15 }, true, 20).facts.throttleMph).toBe(15);
    expect(checkerState.withThrottleAnswer({ ...facts, throttleMph: null }, false, null).setAside).toBeNull();
  });
});

describe("the photo check keeps keyboard focus on the page at every step", () => {
  let dom: FakeDom;
  const runs = vi.mocked(runPedalCheck);

  beforeEach(() => {
    dom = new FakeDom();
    vi.stubGlobal("document", dom.document);
    vi.mocked(hasWebGpu).mockResolvedValue(true);
    runs.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  interface CheckProps {
    lang: Lang;
    startCheck: () => ReturnType<ReturnType<typeof answerGate>["start"]>;
    onCall: (call: PedalCall) => void;
    picks: number;
  }

  function photoCheck(over: Partial<CheckProps> = {}) {
    const props: CheckProps = { lang: "en", startCheck: answerGate().start, onCall: () => undefined, picks: 0, ...over };
    const m = mount(PedalPhotoCheck as (p: CheckProps) => ReturnType<typeof PedalPhotoCheck>, props, { dom });
    return { m, props };
  }

  const button = (m: Mounted<CheckProps>, key: UiKey) => one(m.tree(), (e) => e.type === "button" && textOf(e) === t("en", key), `"${key}" button`);
  const fileInput = (m: Mounted<CheckProps>) => one(m.tree(), (e) => e.type === "input" && e.props.type === "file", "file input");
  const statusText = (m: Mounted<CheckProps>) => textOf(one(m.tree(), (e) => e.type === "p" && e.props.role === "status", "status line"));
  const focused = () => dom.document.activeElement;

  /** A key press or tap on a control: it gets focus, then its click runs. */
  function press(m: Mounted<CheckProps>, element: El) {
    dom.nodeOf(element)?.focus();
    m.act(() => call(element, "onClick", { preventDefault: () => undefined }));
  }

  /** Opens the check and starts it on a photo. Resolves with a function that finishes the run. */
  async function startOnPhoto(m: Mounted<CheckProps>) {
    let finish: (result: PedalResult) => void = () => undefined;
    runs.mockImplementation(() => new Promise<PedalResult>((resolve) => (finish = resolve)));
    press(m, button(m, "photoCheckOpen"));
    press(m, button(m, "photoCheckStart"));
    await m.settle();
    const input = fileInput(m);
    dom.nodeOf(input)?.focus();
    m.act(() => call(input, "onChange", { target: { files: [new File([], "bike.jpg")], value: "bike.jpg" } }));
    await m.settle();
    return (result: PedalResult) => finish(result);
  }

  it("moves focus to the next step's control instead of dropping it to the page (the review's repro)", async () => {
    const { m } = photoCheck();
    press(m, button(m, "photoCheckOpen"));
    expect(focused()).toBe(dom.nodeOf(button(m, "photoCheckStart")));
    press(m, button(m, "photoCheckStart"));
    await m.settle();
    expect(focused()).toBe(dom.nodeOf(fileInput(m)));
  });

  it("keeps the file input, and focus on it, while the photo is checked, and the input does nothing then", async () => {
    const { m } = photoCheck();
    const finish = await startOnPhoto(m);
    expect(statusText(m)).toBe(t("en", "photoCheckLoading"));
    const input = fileInput(m);
    expect(focused()).toBe(dom.nodeOf(input));
    expect(input.props["aria-disabled"]).toBe(true);
    // A tap or Enter on it while the check runs opens no file picker and starts no second check.
    const tap = { preventDefault: vi.fn() };
    call(input, "onClick", tap);
    expect(tap.preventDefault).toHaveBeenCalled();
    m.act(() => call(input, "onChange", { target: { files: [new File([], "other.jpg")], value: "other.jpg" } }));
    await m.settle();
    expect(runs).toHaveBeenCalledTimes(1);
    finish(NO_PEDALS);
    await m.settle();
  });

  it("keeps focus on the file input when the result lands", async () => {
    const { m } = photoCheck();
    const finish = await startOnPhoto(m);
    finish(NO_PEDALS);
    await m.settle();
    expect(statusText(m)).toBe(t("en", "photoCheckNoPedals"));
    expect(focused()).toBe(dom.nodeOf(fileInput(m)));
  });

  it("leaves focus alone when the family moved on to another fact while the photo was checked", async () => {
    const { m } = photoCheck();
    const finish = await startOnPhoto(m);
    const weight = dom.outside("weight box");
    weight.focus();
    finish(NO_PEDALS);
    await m.settle();
    expect(focused()).toBe(weight);
  });

  it("puts focus back on the open button after Cancel, and after a browser with no WebGPU", async () => {
    const { m } = photoCheck();
    press(m, button(m, "photoCheckOpen"));
    press(m, button(m, "photoCheckCancel"));
    expect(focused()).toBe(dom.nodeOf(button(m, "photoCheckOpen")));
    vi.mocked(hasWebGpu).mockResolvedValue(false);
    press(m, button(m, "photoCheckOpen"));
    press(m, button(m, "photoCheckStart"));
    await m.settle();
    expect(focused()).toBe(dom.nodeOf(button(m, "photoCheckOpen")));
    expect(textOf(one(m.tree(), (e) => e.props.role === "alert", "alert"))).toBe(t("en", "photoCheckNoWebGpu"));
  });
});

describe("a language switch doesn't read out the photo check's old message again", () => {
  let dom: FakeDom;

  beforeEach(() => {
    dom = new FakeDom();
    vi.stubGlobal("document", dom.document);
    vi.mocked(hasWebGpu).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function checkedPhoto(run: () => Promise<PedalResult>) {
    vi.mocked(runPedalCheck).mockImplementation(run);
    const props = { lang: "en" as Lang, startCheck: answerGate().start, onCall: () => undefined, picks: 0 };
    const m = mount(PedalPhotoCheck, props, { dom });
    const press = (key: UiKey) => {
      const element = one(m.tree(), (e) => e.type === "button" && textOf(e) === t("en", key), key);
      m.act(() => call(element, "onClick", { preventDefault: () => undefined }));
    };
    press("photoCheckOpen");
    press("photoCheckStart");
    await m.settle();
    const input = one(m.tree(), (e) => e.type === "input" && e.props.type === "file", "file input");
    m.act(() => call(input, "onChange", { target: { files: [new File([], "bike.jpg")], value: "bike.jpg" } }));
    await m.settle();
    return { m, props };
  }

  const lineText = (m: Mounted<unknown>, role: string) => textOf(one(m.tree(), (e) => e.type === "p" && e.props.role === role, `${role} line`));

  it("clears the result on a switch, so an old result isn't heard again (the review's repro)", async () => {
    const { m, props } = await checkedPhoto(async () => NO_PEDALS);
    expect(lineText(m as Mounted<unknown>, "status")).toBe(t("en", "photoCheckNoPedals"));
    // A redraw in the same language keeps it.
    m.rerender({ ...props });
    expect(lineText(m as Mounted<unknown>, "status")).toBe(t("en", "photoCheckNoPedals"));
    m.rerender({ ...props, lang: "es" });
    expect(lineText(m as Mounted<unknown>, "status")).toBe("");
    expect(lineText(m as Mounted<unknown>, "status")).not.toBe(t("es", "photoCheckNoPedals"));
    m.rerender({ ...props, lang: "en" });
    expect(lineText(m as Mounted<unknown>, "status")).toBe("");
  });

  it("clears a problem alert the same way", async () => {
    const { m, props } = await checkedPhoto(async () => {
      throw new Error("no model");
    });
    expect(lineText(m as Mounted<unknown>, "alert")).toBe(t("en", "photoCheckFailed"));
    m.rerender({ ...props, lang: "es" });
    expect(() => lineText(m as Mounted<unknown>, "alert")).toThrow();
  });
});

describe("the page turns a read into the bottom line", () => {
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

  it("says YES after a read once the follow-up is answered, with nothing to tick", () => {
    const m = mount(Checker, {}, { effects: false });
    const find = (type: unknown, what: string) => one(m.tree(), (e) => e.type === type, what);
    const line = () => find(BottomLineCard, "bottom line").props.line as BottomLine;
    m.act(() => call(find(BikeInput, "bike input"), "onRead", extract(CLASS_2)));
    const age = one(m.tree(), (e) => e.type === "input" && e.props.name === "age", "age box");
    m.act(() => call(age, "onChange", { target: { value: "30" } }));
    m.act(() => call(find(FactsCard, "facts card"), "onCheck"));
    expect(Object.keys(find(FactsCard, "facts card").props.checks as provenance.FactChecks)).toHaveLength(8);
    expect(find(FactsCard, "facts card").props.onConfirm).toBeUndefined();
    const facts = find(FactsCard, "facts card").props.facts as BikeFacts;
    m.act(() => call(find(FollowUps, "follow-ups"), "onChange", { ...facts, motorOver20: false, assistOver28: false }));
    expect(line().kind).toBe("yes");
  });

  it("works the bottom line out through one helper the tests can run", () => {
    const bike = read(CLASS_2);
    const result = evaluate({ state: "CA", riderAge: 30, rideDate: DAY, facts: { ...bike.facts, motorOver20: false, assistOver28: false }, places: [] });
    expect(provenance.summaryFor(null, DAY)).toBeNull();
    expect(provenance.summaryFor(result, null)).toBeNull();
    expect(provenance.summaryFor(result, DAY)).toEqual(bottomLine(result, DAY));
  });
});

describe("the read note draws no box", () => {
  it("shows where a fact was read and nothing to tick", () => {
    const check: FactCheck = { source: "text", asRead: { ...emptyFacts(), weightLb: 62 } };
    const html = renderToStaticMarkup(createElement(ReadNote, { lang: "en", field: "weightLb", facts: check.asRead, check, evidence: undefined }));
    expect(html).toContain(t("en", "readMarkText"));
    expect(html).not.toContain('type="checkbox"');
  });
});
