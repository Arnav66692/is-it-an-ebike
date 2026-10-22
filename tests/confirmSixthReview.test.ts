// Regression tests from the sixth review of the read-facts change. Each one names the problem it
// guards against. The step where the family ticked each read fact is gone, so these cover what
// stays: keyboard focus after a read, and a new facts card on each read. The components run
// through tests/hooks.ts, so these tests run the page's own handlers, state and effects, not a
// copy of them or a check of their source text.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/photo/runPedalCheck", () => ({
  hasWebGpu: vi.fn(async () => true),
  runPedalCheck: vi.fn(),
}));

import { BikeInput } from "@/components/BikeInput";
import { Checker } from "@/components/Checker";
import { FactsCard } from "@/components/FactsCard";
import { PedalPhotoCheck } from "@/components/PedalPhotoCheck";
import { focusGate, readMayMoveFocus } from "@/lib/checkerState";
import { parseSpecText, type Extraction } from "@/lib/extract/parse";
import type { Lang } from "@/lib/i18n/names";
import { t, type UiKey } from "@/lib/i18n/ui";
import { answerGate, type AnswerWatch, type PedalCall } from "@/lib/photo/pedalRule";
import { hasWebGpu, runPedalCheck, type PedalResult } from "@/lib/photo/runPedalCheck";
import type { BikeFacts } from "@/lib/rules/types";
import { FakeDom, mount, one, textOf, type El, type Mounted } from "./hooks";

/** The plain Class 2 listing from the earlier reviews. It reads the pedals as yes. */
const CLASS_2 =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";

/** A listing for a machine with no pedals, from the review's repro. */
const DIRT_BIKE = "Electric dirt bike. No pedals. 3000W motor.";

/** A clear no-pedals call from the photo check. */
const NO_PEDALS: PedalResult = { call: "no_pedals", score: -3, ms: 900 };

function extract(text: string): Extraction {
  return parseSpecText(text, "listing");
}

type Handler = (...args: unknown[]) => unknown;

/** Calls an element's handler the way the browser or the child component would. */
function call(element: El, name: string, ...args: unknown[]): unknown {
  const handler = element.props[name];
  if (typeof handler !== "function") throw new Error(`No ${name} handler`);
  return (handler as Handler)(...args);
}

interface CheckProps {
  lang: Lang;
  startCheck: () => AnswerWatch;
  onCall: (call: PedalCall) => void;
  picks: number;
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
    const props = (onCall: (c: PedalCall) => void): CheckProps => ({ lang: "en", startCheck: answerGate().start, onCall, picks: 0 });
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
