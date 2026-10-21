// Regression tests for the first review of the place search and the redesign. Each one names the
// problem it guards against. The components run through tests/hooks.ts, so these tests run the
// page's own handlers, state and effects.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/photo/runPedalCheck", () => ({
  hasWebGpu: vi.fn(async () => true),
  runPedalCheck: vi.fn(),
}));

import { AccuracyView } from "@/components/AccuracyView";
import { BikeInput, tabKey } from "@/components/BikeInput";
import { BottomLineCard } from "@/components/BottomLineCard";
import { Checker, whereNoteShown, whereNoteText } from "@/components/Checker";
import { FactsCard } from "@/components/FactsCard";
import { flyerLang } from "@/components/Flyer";
import { FollowUps } from "@/components/FollowUps";
import { PlaceSearch, statusVisible } from "@/components/PlaceSearch";
import { focusGate } from "@/lib/checkerState";
import { parseSpecText, quoteText } from "@/lib/extract/parse";
import { ACCURACY_TEXT } from "@/lib/i18n/accuracy";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { pickLabels } from "@/lib/places/linked";
import { parsePlaceIndex } from "@/lib/places/parse";
import { searchPlaces } from "@/lib/places/search";
import type { PlaceEntry, PlaceIndexFile } from "@/lib/places/types";
import type { BikeFacts } from "@/lib/rules/types";
import { classBike } from "./helpers";
import { elements, FakeDom, mount, one, textOf, type El } from "./hooks";

const INDEX = parsePlaceIndex(JSON.parse(readFileSync(join(__dirname, "..", "public", "places", "us-places.json"), "utf8")) as PlaceIndexFile);
const entry = (id: string): PlaceEntry => {
  const found = INDEX.byId.get(id);
  if (!found) throw new Error(`no entry ${id}`);
  return found;
};

type Handler = (...args: unknown[]) => unknown;
function call(element: El, name: string, ...args: unknown[]): unknown {
  const handler = element.props[name];
  if (typeof handler !== "function") throw new Error(`No ${name} handler`);
  return (handler as Handler)(...args);
}

describe("the place search shows why no list opened", () => {
  it("shows a failed load, and a miss or a load in progress once something is typed", () => {
    expect(statusVisible("", false, false, 0)).toBe(false);
    expect(statusVisible("zzqx", false, false, 0)).toBe(true);
    expect(statusVisible("Enc", true, false, 0)).toBe(true);
    expect(statusVisible("Enc", false, false, 3)).toBe(false);
    expect(statusVisible("", false, true, 0)).toBe(true);
  });

  it("says no places match on the page for a typo, in both languages", async () => {
    for (const lang of ["en", "es"] as const) {
      const m = mount(PlaceSearch, { lang: lang as Lang, picks: [], onPick: () => {}, onRemove: () => {}, loadIndex: () => Promise.resolve(INDEX) });
      const input = () => one(m.tree(), (e) => e.type === "input" && e.props.role === "combobox", "combobox");
      m.act(() => call(input(), "onFocus"));
      await m.settle();
      m.act(() => call(input(), "onChange", { target: { value: "zzqx" } }));
      const status = one(m.tree(), (e) => e.type === "p" && e.props.role === "status", "status");
      expect(status.props["data-shown"]).toBe("true");
      expect(status.props.className).not.toBe("sr-only");
      expect(textOf(status)).toBe(t(lang, "whereNone"));
    }
  });

  it("finds San Diego County by the name the answer gives it, Unincorporated San Diego County", () => {
    expect(searchPlaces(INDEX, "Unincorporated")[0].id).toBe("c-06073");
    expect(searchPlaces(INDEX, "Unincorporated San Diego County")[0].id).toBe("c-06073");
    expect(searchPlaces(INDEX, "Zona no incorporada")[0].id).toBe("c-06073");
  });
});

describe("the bike input tabs follow the ARIA tabs pattern", () => {
  it("moves with Left, Right, Home and End, wrapping at the ends", () => {
    expect(tabKey(0, "ArrowRight", 3)).toBe(1);
    expect(tabKey(2, "ArrowRight", 3)).toBe(0);
    expect(tabKey(0, "ArrowLeft", 3)).toBe(2);
    expect(tabKey(1, "Home", 3)).toBe(0);
    expect(tabKey(0, "End", 3)).toBe(2);
    expect(tabKey(0, "Enter", 3)).toBeNull();
  });

  it("names the panel by its tab, makes only the open tab a Tab stop, and keeps the label status on the page", () => {
    const html = renderToStaticMarkup(createElement(BikeInput, { lang: "en", onRead: () => {}, onManual: () => {}, gate: focusGate(() => null) }));
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => /tabindex="(-?\d)"/.exec(tab)?.[1])).toEqual(["0", "-1", "-1"]);
    const panel = /<div[^>]*role="tabpanel"[^>]*>/.exec(html)?.[0] ?? "";
    const panelId = /id="([^"]+)"/.exec(panel)?.[1];
    const firstTab = /id="([^"]+)"/.exec(tabs[0])?.[1];
    expect(panel).toContain(`aria-labelledby="${firstTab}"`);
    for (const tab of tabs) expect(tab).toContain(`aria-controls="${panelId}"`);
    // "Reading the label" is announced into a status line already on the page, empty until then.
    expect(html).toMatch(/<p role="status" class="sr-only"><\/p>/);
  });

  it("gives Type it in its own line, not the step 3 sentence right above step 3", () => {
    expect(t("en", "typeHelp")).not.toBe(t("en", "step3Help"));
    expect(t("es", "typeHelp")).not.toBe(t("es", "step3Help"));
  });
});

describe("the wheel size question", () => {
  it("labels the checkbox with what ticking it means", () => {
    const facts: BikeFacts = { ...classBike(2), wheelFrontIn: null, wheelRearIn: null, wheelCount: null };
    const html = renderToStaticMarkup(createElement(FollowUps, { lang: "en", questions: ["wheels"], facts, onChange: () => {} }));
    expect(html).toContain('aria-label="Front and rear wheels are different sizes"');
    expect(html).not.toContain('aria-label="Front (inches) / Rear (inches)"');
    // The questions card sits inside step 4, so its heading is an h3, under "The answer".
    expect(html).toMatch(/<h3[^>]*>A few quick questions<\/h3>/);
  });
});

describe("the place notes", () => {
  const sd = pickLabels(INDEX, entry("p-0622678"));

  it("shows a move to another state on the page, with the campus it removed", () => {
    expect(whereNoteShown({ key: "whereAdded", place: sd })).toBe(false);
    expect(whereNoteShown({ key: "whereAlready", place: sd })).toBe(false);
    const moved = { key: "whereAddedNewState" as const, place: sd, to: "TX", campusRemoved: true };
    expect(whereNoteShown(moved)).toBe(true);
    expect(whereNoteText(moved, "en")).toBe(`Added ${sd.en.text}. The answer now uses Texas law. The SDUHSD campus was removed, since it is in California.`);
    expect(whereNoteText(moved, "es")).toBe(`Se agregó ${sd.es.text}. La respuesta ahora usa la ley de Texas. Se quitó la escuela de SDUHSD, porque está en California.`);
  });
});

describe("the page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 21, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** The checker on a fake page, with its effects running, so keyboard focus can be followed. */
  function page(search = "?lang=en&state=CA") {
    const dom = new FakeDom();
    vi.stubGlobal("document", dom.document);
    vi.stubGlobal("window", {
      location: { search },
      setTimeout: () => 0,
      clearTimeout: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      scrollTo: () => undefined,
    });
    vi.stubGlobal("requestAnimationFrame", () => 0);
    const m = mount(Checker, {}, { dom });
    const all = () => elements(m.tree());
    const find = (type: unknown, what: string) => one(m.tree(), (e) => e.type === type, what);
    const button = (label: string) => one(m.tree(), (e) => e.type === "button" && textOf(e) === label, label);
    const note = () => one(m.tree(), (e) => e.type === "p" && e.props.role === "status" && typeof e.props.className === "string" && /note|sr-only/.test(e.props.className as string) && all().indexOf(e) < all().findIndex((x) => x.type === BikeInput), "place note");
    const pick = (e: PlaceEntry) => m.act(() => call(find(PlaceSearch, "place search"), "onPick", e, pickLabels(INDEX, e)));
    const check = (facts: BikeFacts, age = "30") => {
      m.act(() => call(find(BikeInput, "bike input"), "onManual"));
      m.act(() => call(one(m.tree(), (e) => e.type === "input" && e.props.name === "age", "age box"), "onChange", { target: { value: age } }));
      m.act(() => call(find(FactsCard, "facts card"), "onChange", facts));
      m.act(() => call(find(FactsCard, "facts card"), "onCheck"));
    };
    return { m, dom, all, find, button, note, pick, check };
  }

  it("takes the rider's age as typed text, so a mouse wheel or arrow key can't change it", () => {
    const p = page();
    const age = one(p.m.tree(), (e) => e.type === "input" && e.props.name === "age", "age box");
    expect(age.props.type).toBe("text");
    expect(age.props.inputMode).toBe("numeric");
    expect(age.props.min).toBeUndefined();
  });

  it("moves focus to the date box when Check a future date replaces its button", () => {
    const p = page();
    const before = p.button(t("en", "dateOther"));
    p.dom.nodeOf(before)?.focus();
    p.m.act(() => call(before, "onClick"));
    const box = one(p.m.tree(), (e) => e.type === "input" && e.props.type === "date", "date box");
    expect(p.dom.document.activeElement).toBe(p.dom.nodeOf(box));
  });

  it("moves focus to the bike step on Start over, not to the page", () => {
    const p = page();
    p.check(classBike(1));
    const heading = p.dom.outside("bike heading");
    const step = p.dom.nodeOf(one(p.m.tree(), (e) => e.type === "div" && e.props.className === "bike-step scroll-mt-4", "bike step"));
    if (!step) throw new Error("no bike step");
    Object.assign(step, { querySelector: (selector: string) => (selector === "h2" ? heading : null), scrollIntoView: () => undefined });
    const startOver = p.button(t("en", "startOver"));
    p.dom.nodeOf(startOver)?.focus();
    p.m.act(() => call(startOver, "onClick"));
    expect(p.all().some((e) => e.type === "button" && textOf(e) === t("en", "startOver"))).toBe(false);
    expect(p.dom.document.activeElement).toBe(heading);
  });

  it("names the edit button for facts typed in, not read", () => {
    const p = page();
    p.check(classBike(1));
    expect(p.all().some((e) => e.type === "button" && textOf(e) === t("en", "editFactsTyped"))).toBe(true);
    expect(p.all().some((e) => e.type === "button" && textOf(e) === t("en", "editFacts"))).toBe(false);
  });

  it("says a place picked again is already in the list, not that it was added", () => {
    const p = page();
    const valley = entry("n-carmel-valley");
    p.pick(valley);
    p.pick(entry("p-0618506"));
    p.pick(valley);
    expect(textOf(p.note())).toBe(`${pickLabels(INDEX, valley).en.text} is already in the list.`);
  });

  it("shows on the page that a pick in another state removed the SDUHSD campus", () => {
    const p = page("?lang=en&state=CA&place=sduhsd_campuses");
    const campus = () => p.all().find((e) => e.type === "input" && e.props.type === "checkbox" && typeof e.props["aria-label"] === "string" && (e.props["aria-label"] as string).includes("SDUHSD"));
    expect(campus()?.props.checked).toBe(true);
    p.pick(entry("p-4805000"));
    expect(campus()).toBeUndefined();
    expect(p.note().props.className).toBe("note");
    expect(textOf(p.note())).toContain("The SDUHSD campus was removed, since it is in California.");
    expect(textOf(p.note())).toContain("The answer now uses Texas law.");
  });

  it("says so too when the state picker moves the ride with only the campus ticked", () => {
    const p = page("?lang=en&state=CA&place=sduhsd_campuses");
    p.m.act(() => call(one(p.m.tree(), (e) => e.type === "select", "state picker"), "onChange", { target: { value: "OR" } }));
    expect(p.note().props.className).toBe("note");
    expect(textOf(p.note())).toBe("Now using Oregon law. The SDUHSD campus was removed, since it is in California.");
  });

  it("asks open questions before the answer, then leads with the answer once they are answered", () => {
    const p = page();
    p.check(classBike(2, { motorOver20: null, assistOver28: null, switchable: null }));
    const order = () => p.all().filter((e) => e.type === FollowUps || e.type === BottomLineCard).map((e) => (e.type === FollowUps ? "questions" : "bottom line"));
    expect(order()).toEqual(["questions", "bottom line"]);
    const facts = p.find(FactsCard, "facts card").props.facts as BikeFacts;
    p.m.act(() => call(p.find(FollowUps, "follow-ups"), "onChange", { ...facts, motorOver20: false, assistOver28: false }));
    expect(order()).toEqual(["bottom line", "questions"]);
    // Place by place is a heading under The answer, so heading navigation finds it.
    expect(p.all().some((e) => e.type === "h3" && textOf(e) === t("en", "byPlace"))).toBe(true);
  });
});

describe("the quotes under each read fact", () => {
  it("keep to the fact's whole sentence, so a quote never starts with the 1 of Class 1 or ends with No", () => {
    const text = "Class 1 e-bike with pedals. 350W rated motor. No throttle. Pedal assist up to 20 mph.";
    const e = parseSpecText(text, "listing").evidence;
    expect(e.ratedWatts?.map(quoteText)).toEqual(["350W rated motor."]);
    expect(e.hasPedals?.map(quoteText)).toEqual(["Class 1 e-bike with pedals."]);
    expect(e.hasThrottle?.map(quoteText)).toEqual(["No throttle."]);
  });

  it("show where a long sentence was cut, and stay a true substring of the text", () => {
    const text =
      "Specifications for this model include an aluminum frame and hydraulic disc brakes and a rear hub motor rated at 500W with a peak of 900W and a removable battery and integrated lights and fenders and a rear rack";
    const [ev] = parseSpecText(text, "listing").evidence.ratedWatts ?? [];
    if (!ev) throw new Error("no rated watts read");
    expect(text).toContain(ev.text);
    expect(quoteText(ev).startsWith("…")).toBe(true);
    expect(quoteText(ev).endsWith("…")).toBe(true);
  });
});

describe("the accuracy page and the flyer", () => {
  it("spell out the results date like every other date in the app", () => {
    for (const lang of ["en", "es"] as const) {
      const html = renderToStaticMarkup(createElement(AccuracyView, { lang }));
      expect(html, lang).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
      expect(html, lang).toMatch(lang === "en" ? /updated [A-Z][a-z]{2} \d{1,2}, \d{4}\./ : /actualizado el \d{1,2} de [a-z]+ de \d{4}\./);
    }
  });

  it("describe the test rides without the old Somewhere else choice", () => {
    for (const lang of ["en", "es"] as const) {
      const text = ACCURACY_TEXT[lang].blCases("1", "4");
      expect(text).not.toMatch(/Somewhere else|Otro lugar/);
    }
  });

  it("give the flyer's Back and Print in the language its link asks for", () => {
    expect(flyerLang("?lang=es")).toBe("es");
    expect(flyerLang("?lang=en")).toBe("en");
    expect(flyerLang("")).toBe("en");
    expect([t("es", "flyerBack"), t("es", "flyerPrint")]).toEqual(["Volver", "Imprimir"]);
  });
});
