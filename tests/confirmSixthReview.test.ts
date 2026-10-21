// Regression tests for the sixth review of the confirm-before-YES change. Each one names the
// problem it guards against. The components run through tests/hooks.ts, so these tests run the
// page's own handlers, state and effects, not a copy of them or a check of their source text.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/photo/runPedalCheck", () => ({
  hasWebGpu: vi.fn(async () => true),
  runPedalCheck: vi.fn(),
}));

import { BikeInput } from "@/components/BikeInput";
import { Checker } from "@/components/Checker";
import { Choice } from "@/components/controls";
import { FactsCard } from "@/components/FactsCard";
import { focusAfter, PedalPhotoCheck, photoCheckMessage, photoMessage } from "@/components/PedalPhotoCheck";
import { ReadNote } from "@/components/ReadCheck";
import { ShapeFacts } from "@/components/ShapeFacts";
import { focusGate, readMayMoveFocus } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";
import type { Lang } from "@/lib/i18n/names";
import { t, type UiKey } from "@/lib/i18n/ui";
import { READ_FIELD_NAMES, renderLine } from "@/lib/i18n/verdicts";
import { answerGate, type AnswerWatch, type PedalCall } from "@/lib/photo/pedalRule";
import { hasWebGpu, runPedalCheck, type PedalResult } from "@/lib/photo/runPedalCheck";
import { emptyChecked, fromRead, pedalCallNeedsTick, unconfirmedFields, withEdit, withPedalCall, type CheckedFacts } from "@/lib/provenance";
import { emptyFacts, READ_FIELDS, type BikeFacts, type ReadField } from "@/lib/rules/types";
import { FakeDom, mount, one, textOf, type El, type Mounted } from "./hooks";
import { matrixBikeFacts, readableFields } from "./matrix";

const LANGS: readonly Lang[] = ["en", "es"];

/** The plain Class 2 listing from the earlier reviews. It reads the pedals as yes. */
const CLASS_2 =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";

/** A listing for a machine with no pedals, from the review's repro. */
const DIRT_BIKE = "Electric dirt bike. No pedals. 3000W motor.";

/** A close call from the photo check. */
const CLOSE_CALL: PedalResult = { call: "ask", score: 0.2, ms: 900 };

/** A clear no-pedals call from the photo check. */
const NO_PEDALS: PedalResult = { call: "no_pedals", score: -3, ms: 900 };

function extract(text: string): Extraction {
  return parseSpecText(text, "listing");
}

function read(text: string): CheckedFacts {
  return fromRead(factsFromExtraction(extract(text), emptyFacts()));
}

type Handler = (...args: unknown[]) => unknown;

/** Calls an element's handler the way the browser or the child component would. */
function call(element: El, name: string, ...args: unknown[]): unknown {
  const handler = element.props[name];
  if (typeof handler !== "function") throw new Error(`No ${name} handler`);
  return (handler as Handler)(...args);
}

interface CardProps {
  lang: Lang;
  facts: BikeFacts;
  checks: CheckedFacts["checks"];
  evidence: ReturnType<typeof extract>["evidence"];
  flags: string[];
  onChange: (next: BikeFacts) => void;
  onConfirm: (field: ReadField, confirmed: boolean) => void;
  onPedalCall: (call: PedalCall) => void;
  onCheck: () => void;
}

function cardProps(bike: CheckedFacts, over: Partial<CardProps> = {}): CardProps {
  return {
    lang: "en",
    facts: bike.facts,
    checks: bike.checks,
    evidence: {},
    flags: [],
    onChange: () => undefined,
    onConfirm: () => undefined,
    onPedalCall: () => undefined,
    onCheck: () => undefined,
    ...over,
  };
}

const photoCheckOf = (m: Mounted<CardProps>) => one(m.tree(), (e) => e.type === PedalPhotoCheck, "photo check");

interface CheckProps {
  lang: Lang;
  startCheck: () => AnswerWatch;
  onCall: (call: PedalCall) => void;
  tickAfter: (call: PedalCall) => boolean;
  picks: number;
  focusTick: () => boolean;
}

/** Opens the photo check and starts it on a photo. Returns a function that finishes the run. */
async function startOnPhoto(m: Mounted<CheckProps>, dom: FakeDom): Promise<(result: PedalResult) => void> {
  let finish: (result: PedalResult) => void = () => undefined;
  vi.mocked(runPedalCheck).mockImplementation(() => new Promise<PedalResult>((resolve) => (finish = resolve)));
  const press = (key: UiKey) => {
    const button = one(m.tree(), (e) => e.type === "button" && textOf(e) === t("en", key), `"${key}" button`);
    dom.nodeOf(button)?.focus();
    m.act(() => call(button, "onClick", { preventDefault: () => undefined }));
  };
  press("photoCheckOpen");
  press("photoCheckStart");
  await m.settle();
  const input = one(m.tree(), (e) => e.type === "input" && e.props.type === "file", "file input");
  dom.nodeOf(input)?.focus();
  m.act(() => call(input, "onChange", { target: { files: [new File([], "bike.jpg")], value: "bike.jpg" } }));
  await m.settle();
  return (result) => finish(result);
}

const statusText = (m: Mounted<CheckProps>) => textOf(one(m.tree(), (e) => e.type === "p" && e.props.role === "status", "status line"));

describe("a close call from the photo asks for the tick when the pedals answer read from text is unchecked", () => {
  let dom: FakeDom;

  beforeEach(() => {
    dom = new FakeDom();
    vi.stubGlobal("document", dom.document);
    vi.mocked(hasWebGpu).mockResolvedValue(true);
    vi.mocked(runPedalCheck).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("picks the tick message for a close call when the answer still needs a tick, and moves focus to the box (the review's repro)", async () => {
    const bike = read(CLASS_2);
    expect(bike.facts.hasPedals).toBe(true);
    expect(pedalCallNeedsTick(bike, "ask")).toBe(true);
    const message = await photoCheckMessage(async () => ({ call: "ask" }), answerGate().start(), () => true, () => undefined, (c) => pedalCallNeedsTick(bike, c));
    expect(message).toBe("photoCheckAskTick");
    expect(photoMessage("photoCheckAsk", true)).toBe("photoCheckAskTick");
    expect(focusAfter("choose", "photoCheckAskTick")).toBe("tick");
    // The close call leaves the answer as it was, still to check, so the tick is what the family needs to do.
    expect(unconfirmedFields(withPedalCall(bike, "ask").checks)).toContain("hasPedals");
  });

  it("keeps asking for an answer when there is none to tick yet", () => {
    for (const bike of [emptyChecked(), withEdit(emptyChecked(), { ...emptyFacts(), hasPedals: true })]) {
      expect(pedalCallNeedsTick(bike, "ask")).toBe(false);
    }
    expect(photoMessage("photoCheckAsk", false)).toBe("photoCheckAsk");
    expect(focusAfter("choose", "photoCheckAsk")).toBe("choose");
  });

  it("says to tick the box by its own words, keeps the answer, and uses no dash, semicolon or colon", () => {
    for (const lang of LANGS) {
      const words = t(lang, "photoCheckAskTick");
      expect(words, lang).toContain(`"${t(lang, "readMatches")}"`);
      expect(words, lang).not.toBe(t(lang, "photoCheckAsk"));
      expect(words, lang).not.toMatch(/[—;:]/);
    }
    expect(t("en", "photoCheckAskTick")).not.toContain("Pick an answer above");
    expect(t("es", "photoCheckAskTick")).not.toContain("Elige una respuesta");
  });

  it("is what the facts card's photo check shows, with focus on the pedals box, for a bike read from text", async () => {
    const bike = read(CLASS_2);
    const card = mount(FactsCard, cardProps(bike));
    const tickAfter = photoCheckOf(card).props.tickAfter as (c: PedalCall) => boolean;
    expect(tickAfter("ask")).toBe(true);
    // A bike typed in has nothing to tick.
    const typed = mount(FactsCard, cardProps(withEdit(emptyChecked(), { ...emptyFacts(), hasPedals: true })));
    expect((photoCheckOf(typed).props.tickAfter as (c: PedalCall) => boolean)("ask")).toBe(false);

    const box = dom.outside("pedals box");
    const focusTick = vi.fn(() => {
      box.focus();
      return true;
    });
    const props: CheckProps = { lang: "en", startCheck: answerGate().start, onCall: () => undefined, tickAfter, picks: 0, focusTick };
    const m = mount(PedalPhotoCheck as (p: CheckProps) => ReturnType<typeof PedalPhotoCheck>, props, { dom });
    const finish = await startOnPhoto(m, dom);
    finish(CLOSE_CALL);
    await m.settle();
    expect(statusText(m)).toBe(t("en", "photoCheckAskTick"));
    expect(focusTick).toHaveBeenCalledTimes(1);
    expect(dom.document.activeElement).toBe(box);
  });
});

describe("with one unchecked fact, the English line never says it after a plural fact name", () => {
  const lines = ["bl_unconfirmed_facts", "bl_no_unchecked_facts"] as const;

  it("says under that fact and fix that fact, for every fact, the pedals and the foot pegs too (the review's repro)", () => {
    for (const code of lines) {
      for (const field of READ_FIELDS) {
        const text = renderLine({ code, params: { fields: field } }, "en", "California");
        expect(text, `${code} ${field}`).toContain(READ_FIELD_NAMES.en[field]);
        expect(text, `${code} ${field}`).not.toMatch(/under it\b|fix it\b/);
        expect(text, `${code} ${field}`).toMatch(/tick "It matches the bike" under that fact in "Check the facts" above, or fix that fact\.$/);
      }
    }
  });

  it("matches the Spanish, which already says that fact, and keeps the plural wording for several facts", () => {
    for (const code of lines) {
      expect(renderLine({ code, params: { fields: "hasPedals" } }, "es", "California"), code).toMatch(/debajo de ese dato en "Revisa los datos", arriba, o corrige el dato\.$/);
      expect(renderLine({ code, params: { fields: "hasPedals,peakWatts" } }, "en", "California"), code).toMatch(/under each one in "Check the facts" above, or fix any that are wrong\.$/);
    }
  });
});

/** The checker on a fake page, with its own effects running. */
function checkerPage() {
  const dom = new FakeDom();
  vi.stubGlobal("document", dom.document);
  vi.stubGlobal("window", {
    location: { search: "?lang=en&state=CA" },
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  // Scrolling and the delayed read count wait for a frame that never comes here. Focus doesn't wait for one.
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const m = mount(Checker, {}, { dom });
  const find = (type: unknown, what: string) => one(m.tree(), (e) => e.type === type, what);
  // The facts card isn't drawn here, so its heading is a stand-in node the box around the card hands back.
  const heading = dom.outside("facts heading");
  const box = dom.nodeOf(one(m.tree(), (e) => e.type === "div" && e.props.className === "scroll-mt-4", "facts box"));
  if (!box) throw new Error("No facts box on the page");
  Object.assign(box, { querySelector: (selector: string) => (selector === "h2" ? heading : null) });
  const ageBox = () => {
    const node = dom.nodeOf(one(m.tree(), (e) => e.type === "input" && e.props.name === "age", "age box"));
    if (!node) throw new Error("No age box on the page");
    return node;
  };
  return {
    m,
    dom,
    heading,
    ageBox,
    find,
    /** A read started from a control in step 2, the way a reader calls the gate as the family presses it. */
    startRead(from: string) {
      dom.outside(from).focus();
      const gate = find(BikeInput, "bike input").props.gate as { start: () => () => boolean };
      return gate.start();
    },
    land(text: string) {
      m.act(() => call(find(BikeInput, "bike input"), "onRead", extract(text), "listing"));
    },
  };
}

describe("a read that lands late leaves keyboard focus where the family moved it", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps focus on the age box the family moved to while the label was read (the review's repro)", () => {
    const page = checkerPage();
    page.startRead("label photo input");
    const age = page.ageBox();
    age.focus();
    page.land(CLASS_2);
    expect(page.dom.document.activeElement).toBe(age);
    // The facts card is still drawn with the facts read.
    expect((page.find(FactsCard, "facts card").props.facts as BikeFacts).hasPedals).toBe(true);
  });

  it("keeps focus on the paste box the family moved to while a link loaded", () => {
    const page = checkerPage();
    page.startRead("read the listing button");
    const paste = page.dom.outside("paste box");
    paste.focus();
    page.land(CLASS_2);
    expect(page.dom.document.activeElement).toBe(paste);
  });

  it("still moves focus to the facts card when it stayed on the control that started the read, or dropped to the page", () => {
    const stayed = checkerPage();
    stayed.startRead("read the listing button");
    stayed.land(CLASS_2);
    expect(stayed.dom.document.activeElement).toBe(stayed.heading);

    const dropped = checkerPage();
    dropped.startRead("read the listing button");
    dropped.dom.active = null;
    dropped.land(CLASS_2);
    expect(dropped.dom.document.activeElement).toBe(dropped.heading);
  });

  it("decides from the focus as the read lands and the control the newest read started from", () => {
    const body = { name: "body" };
    const button = { name: "button" };
    const age = { name: "age" };
    expect(readMayMoveFocus(body, body, button)).toBe(true);
    expect(readMayMoveFocus(null, body, button)).toBe(true);
    expect(readMayMoveFocus(button, body, button)).toBe(true);
    expect(readMayMoveFocus(age, body, button)).toBe(false);
    let active: unknown = button;
    const gate = focusGate(() => active);
    expect(gate.startedFrom()).toBeNull();
    const first = gate.start();
    expect(gate.startedFrom()).toBe(button);
    active = age;
    const second = gate.start();
    expect(gate.startedFrom()).toBe(age);
    // It is still a request gate: only the newest read counts, and a cancel drops it.
    expect([first(), second()]).toEqual([false, true]);
    gate.cancel();
    expect(second()).toBe(false);
  });
});

describe("a new read draws a new facts card, so a photo call for the last bike can't reach the new one", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 12));
    vi.mocked(hasWebGpu).mockResolvedValue(true);
    vi.mocked(runPedalCheck).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives the facts card a new key on each read and on Type it in, so React mounts it fresh", () => {
    const page = checkerPage();
    page.land(DIRT_BIKE);
    const first = page.find(FactsCard, "facts card").key;
    page.land(CLASS_2);
    const second = page.find(FactsCard, "facts card").key;
    expect(first).not.toBeNull();
    expect(second).not.toBe(first);
    page.m.act(() => call(page.find(BikeInput, "bike input"), "onManual"));
    expect(page.find(FactsCard, "facts card").key).not.toBe(second);
  });

  it("drops the call of a check whose card left the page, though the same check drawn again would pass it on (the review's repro)", async () => {
    const dom = new FakeDom();
    vi.stubGlobal("document", dom.document);
    const oldBike: PedalCall[] = [];
    const newBike: PedalCall[] = [];
    const props = (onCall: (c: PedalCall) => void): CheckProps => ({ lang: "en", startCheck: answerGate().start, onCall, tickAfter: () => true, picks: 0, focusTick: () => false });
    const Check = PedalPhotoCheck as (p: CheckProps) => ReturnType<typeof PedalPhotoCheck>;

    // The card for the dirt bike leaves the page when the Class 2 listing is read, as its new key makes React do.
    const left = mount(Check, props((c) => oldBike.push(c)), { dom });
    const finishLeft = await startOnPhoto(left, dom);
    left.unmount();
    finishLeft(NO_PEDALS);
    await left.settle();
    expect(oldBike).toEqual([]);

    // Drawn again with the new bike's handler instead, the old photo's call would fill in the new bike's pedals.
    const kept = mount(Check, props((c) => oldBike.push(c)), { dom });
    const finishKept = await startOnPhoto(kept, dom);
    kept.rerender(props((c) => newBike.push(c)));
    finishKept(NO_PEDALS);
    await kept.settle();
    expect(newBike).toEqual(["no_pedals"]);
  });
});

describe("the facts card sends a pedals tick through the photo check's gate", () => {
  /** The facts card for a bike read from text, and the gate's watch for a photo check started on it. */
  function cardWithCheck() {
    const onConfirm = vi.fn();
    const m = mount(FactsCard, cardProps(read(CLASS_2), { onConfirm }));
    const watch = call(photoCheckOf(m), "startCheck") as AnswerWatch;
    const note = (field: ReadField) => one(m.tree(), (e) => e.type === ReadNote && e.props.field === field, `${field} note`);
    return { m, onConfirm, watch, note };
  }

  it("drops a photo call once the family ticks the pedals box while the check runs (the review's repro)", async () => {
    const { onConfirm, watch, note } = cardWithCheck();
    expect(watch.untouched()).toBe(true);
    call(note("hasPedals"), "onConfirm", "hasPedals", true);
    expect(onConfirm).toHaveBeenCalledWith("hasPedals", true);
    expect(watch.untouched()).toBe(false);
    expect(watch.change()).toBe("ticked");
    const calls: PedalCall[] = [];
    const message = await photoCheckMessage(async () => ({ call: "no_pedals" }), watch, () => true, (c) => calls.push(c), () => true);
    expect(message).toBe("photoCheckKeptTick");
    expect(calls).toEqual([]);
  });

  it("counts an untick the same way, and a pedals pick as a pick", () => {
    const unticked = cardWithCheck();
    call(unticked.note("hasPedals"), "onConfirm", "hasPedals", false);
    expect(unticked.watch.change()).toBe("ticked");

    const picked = cardWithCheck();
    const pedals = one(picked.m.tree(), (e) => e.type === Choice && e.props.legend === t("en", "pedals"), "pedals question");
    picked.m.act(() => call(pedals, "onChange", "no"));
    expect(picked.watch.change()).toBe("picked");
  });

  it("leaves the check alone for a tick on another fact, from the card or the wheel and weight facts", () => {
    const { m, onConfirm, watch, note } = cardWithCheck();
    call(note("classes"), "onConfirm", "classes", true);
    call(one(m.tree(), (e) => e.type === ShapeFacts, "shape facts"), "onConfirm", "weightLb", true);
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(watch.untouched()).toBe(true);
  });
});

describe("the bottom-line matrix runs every fact a link or photo can give", () => {
  it("has a bike with each read fact, the peak watts and the watts listed too (the review's repro)", () => {
    const covered = new Set(matrixBikeFacts().flatMap(readableFields));
    expect(READ_FIELDS.filter((f) => !covered.has(f))).toEqual([]);
  });

  it("gives those figures only next to rated watts, so they change no card and the independent checker needs no rule for them", () => {
    for (const facts of matrixBikeFacts()) {
      if (facts.peakWatts !== null || facts.wattsUpTo !== null) expect(facts.ratedWatts).not.toBeNull();
    }
  });
});
