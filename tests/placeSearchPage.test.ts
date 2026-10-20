// The place search on the page: the combobox keys and what it says, the chips, and what the
// picks do to the answer. Every ride here is the one the task names: an 11-year-old on a Class 2.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/photo/runPedalCheck", () => ({
  hasWebGpu: vi.fn(async () => true),
  runPedalCheck: vi.fn(),
}));

import { BikeInput } from "@/components/BikeInput";
import { BottomLineCard, uncheckedLine } from "@/components/BottomLineCard";
import { Checker } from "@/components/Checker";
import { FactsCard } from "@/components/FactsCard";
import { CLOSED, comboKey, comboStatus, PlaceSearch, resultDetail } from "@/components/PlaceSearch";
import { VerdictCard } from "@/components/VerdictCard";
import { placeName, stateName, type Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { linkedPick, linkedWhere, pickLabels, SD_COUNTY_NAMES } from "@/lib/places/linked";
import { parsePlaceIndex } from "@/lib/places/parse";
import { addPick, NO_PICKS, rideWhere, uncheckedPicks } from "@/lib/places/picks";
import { entryIdForRecord, resolvePlace } from "@/lib/places/resolve";
import { placeLabel, searchPlaces } from "@/lib/places/search";
import type { PlaceEntry, PlaceIndexFile } from "@/lib/places/types";
import { PLACE_IDS } from "@/lib/rules";
import type { BottomLine } from "@/lib/rules/bottomLine";
import type { Verdict } from "@/lib/rules/types";
import { headlineProblems, hedgeProblems, shownAnswer, visibleLines } from "./answerWords";
import { classBike } from "./helpers";
import { elements, mount, one, textOf, type El } from "./hooks";

const FILE = JSON.parse(readFileSync(join(__dirname, "..", "public", "places", "us-places.json"), "utf8")) as PlaceIndexFile;
const INDEX = parsePlaceIndex(FILE);

type Handler = (...args: unknown[]) => unknown;

function call(element: El, name: string, ...args: unknown[]): unknown {
  const handler = element.props[name];
  if (typeof handler !== "function") throw new Error(`No ${name} handler`);
  return (handler as Handler)(...args);
}

function entry(id: string): PlaceEntry {
  const found = INDEX.byId.get(id);
  if (!found) throw new Error(`no entry ${id}`);
  return found;
}

function first(text: string): PlaceEntry {
  const [top] = searchPlaces(INDEX, text);
  if (!top) throw new Error(`no result for "${text}"`);
  return top;
}

const key = (k: string) => ({ key: k, preventDefault: () => {} });

describe("the combobox keys follow the ARIA 1.2 pattern", () => {
  it("opens with Down on the first place and with Up on the last, and wraps at the ends", () => {
    expect(comboKey(CLOSED, "ArrowDown", 3, true).next).toEqual({ open: true, active: 0 });
    expect(comboKey(CLOSED, "ArrowUp", 3, true).next).toEqual({ open: true, active: 2 });
    expect(comboKey({ open: true, active: 2 }, "ArrowDown", 3, true).next).toEqual({ open: true, active: 0 });
    expect(comboKey({ open: true, active: 0 }, "ArrowUp", 3, true).next).toEqual({ open: true, active: 2 });
    expect(comboKey({ open: true, active: 0 }, "ArrowDown", 3, true).handled).toBe(true);
  });

  it("picks the highlighted place on Enter, or the first when none is highlighted", () => {
    expect(comboKey({ open: true, active: 1 }, "Enter", 3, true)).toMatchObject({ pick: 1, next: CLOSED, handled: true });
    expect(comboKey({ open: true, active: -1 }, "Enter", 3, true)).toMatchObject({ pick: 0, handled: true });
    // A closed list or no results leave Enter alone.
    expect(comboKey(CLOSED, "Enter", 3, true)).toMatchObject({ pick: null, handled: false });
    expect(comboKey({ open: true, active: -1 }, "Enter", 0, true)).toMatchObject({ pick: null, handled: false });
  });

  it("closes the list on Escape, then clears the box on a second Escape", () => {
    expect(comboKey({ open: true, active: 1 }, "Escape", 3, true)).toMatchObject({ next: CLOSED, clear: false, handled: true });
    expect(comboKey(CLOSED, "Escape", 3, true)).toMatchObject({ clear: true, handled: true });
    expect(comboKey(CLOSED, "Escape", 0, false)).toMatchObject({ clear: false, handled: false });
    expect(comboKey({ open: true, active: 1 }, "Tab", 3, true)).toMatchObject({ next: CLOSED, handled: false });
  });

  it("says how many places matched, in English and Spanish", () => {
    expect(comboStatus("en", "aus", false, false, 8)).toBe("8 places found. Use the up and down arrows to pick one.");
    expect(comboStatus("es", "aus", false, false, 1)).toBe("Se encontró 1 lugar. Usa las flechas arriba y abajo para elegirlo.");
    expect(comboStatus("en", "zzzq", false, false, 0)).toBe(t("en", "whereNone"));
    expect(comboStatus("en", "aus", true, false, 0)).toBe(t("en", "whereLoading"));
    expect(comboStatus("es", "aus", false, true, 0)).toBe(t("es", "whereFailed"));
    expect(comboStatus("en", "", false, false, 0)).toBe("");
    for (const lang of ["en", "es"] as const) {
      for (const k of ["whereNone", "whereLoading", "whereFailed", "whereCountOne", "whereCountMany", "whereStartedOver", "blLocalUnchecked"] as const) {
        expect(t(lang, k), `${lang} ${k}`).not.toMatch(/[;—]/);
      }
    }
  });
});

describe("the search box on the page", () => {
  function box(lang: Lang = "en") {
    const onPick = vi.fn();
    const onRemove = vi.fn();
    const props = { lang, picks: [] as { id: string; label: ReturnType<typeof placeLabel> }[], onPick, onRemove, loadIndex: () => Promise.resolve(INDEX) };
    const m = mount(PlaceSearch, props);
    const input = () => one(m.tree(), (e) => e.type === "input" && e.props.role === "combobox", "combobox");
    const options = () => elements(m.tree()).filter((e) => e.props.role === "option");
    const status = () => textOf(one(m.tree(), (e) => e.type === "p" && e.props.role === "status", "status line"));
    return { m, props, input, options, status, onPick, onRemove };
  }

  it("loads the index on first use, lists places with county and state, and picks one with the keys", async () => {
    const b = box();
    expect(b.input().props["aria-expanded"]).toBe(false);
    b.m.act(() => call(b.input(), "onFocus"));
    await b.m.settle();
    b.m.act(() => call(b.input(), "onChange", { target: { value: "Austin, TX" } }));
    const list = one(b.m.tree(), (e) => e.props.role === "listbox", "listbox");
    expect(b.input().props["aria-controls"]).toBe(list.props.id);
    expect(b.input().props["aria-expanded"]).toBe(true);
    expect(b.input().props["aria-autocomplete"]).toBe("list");
    expect(b.options().length).toBeGreaterThan(0);
    expect(b.status()).toMatch(/^\d+ places? found\./);
    const top = textOf(b.options()[0]);
    expect(top).toContain("Austin");
    expect(top).toContain("Travis County");
    expect(top).toContain("TX");

    b.m.act(() => call(b.input(), "onKeyDown", key("ArrowDown")));
    expect(b.input().props["aria-activedescendant"]).toBe(b.options()[0].props.id);
    expect(b.options()[0].props["aria-selected"]).toBe(true);
    b.m.act(() => call(b.input(), "onKeyDown", key("Enter")));
    expect(b.onPick).toHaveBeenCalledTimes(1);
    const [picked, labels] = b.onPick.mock.calls[0] as [PlaceEntry, ReturnType<typeof pickLabels>];
    expect(picked.state).toBe("TX");
    expect(picked.name).toBe("Austin");
    expect(labels.en.text).toBe(placeLabel(INDEX, picked, "en").text);
    expect(labels.es.text).toBe(placeLabel(INDEX, picked, "es").text);
    expect(b.input().props.value).toBe("");
    expect(b.input().props["aria-expanded"]).toBe(false);
  });

  it("closes on Escape and clears on a second Escape", async () => {
    const b = box();
    b.m.act(() => call(b.input(), "onFocus"));
    await b.m.settle();
    b.m.act(() => call(b.input(), "onChange", { target: { value: "Carmel Valley" } }));
    expect(b.input().props["aria-expanded"]).toBe(true);
    b.m.act(() => call(b.input(), "onKeyDown", key("Escape")));
    expect(b.input().props["aria-expanded"]).toBe(false);
    expect(b.input().props.value).toBe("Carmel Valley");
    b.m.act(() => call(b.input(), "onKeyDown", key("Escape")));
    expect(b.input().props.value).toBe("");
  });

  it("says the list didn't load, and tries again on the next use", async () => {
    let fail = true;
    const onLoadFailed = vi.fn();
    const m = mount(PlaceSearch, {
      lang: "en" as Lang,
      picks: [],
      onPick: () => {},
      onRemove: () => {},
      onLoadFailed,
      loadIndex: () => (fail ? Promise.reject(new Error("offline")) : Promise.resolve(INDEX)),
    });
    const input = () => one(m.tree(), (e) => e.type === "input" && e.props.role === "combobox", "combobox");
    m.act(() => call(input(), "onFocus"));
    await m.settle();
    expect(onLoadFailed).toHaveBeenCalledTimes(1);
    expect(textOf(one(m.tree(), (e) => e.props.role === "status", "status"))).toBe(t("en", "whereFailed"));
    fail = false;
    m.act(() => call(input(), "onFocus"));
    await m.settle();
    m.act(() => call(input(), "onChange", { target: { value: "Encinitas" } }));
    expect(elements(m.tree()).filter((e) => e.props.role === "option").length).toBeGreaterThan(0);
  });

  it("shows each pick as a chip whose remove button is labeled with the whole place, in both languages", () => {
    for (const lang of ["en", "es"] as const) {
      const carmel = first("Carmel Valley");
      const label = placeLabel(INDEX, carmel, lang);
      const onRemove = vi.fn();
      const html = renderToStaticMarkup(
        createElement(PlaceSearch, { lang, picks: [{ id: carmel.id, label }], onPick: () => {}, onRemove, loadIndex: () => Promise.resolve(INDEX) }),
      );
      expect(html).toContain(`aria-label="${t(lang, "whereRemove", { place: label.text })}"`);
      expect(html).toContain(`aria-label="${t(lang, "wherePicked")}"`);
      expect(html).toContain(placeName("city_of_san_diego", lang));
    }
  });

  it("names the kind of place, its county and its state in each result", () => {
    expect(resultDetail(entry("s-TX"), placeLabel(INDEX, entry("s-TX"), "en"), "en")).toBe("State");
    const encinitas = linkedPick("encinitas");
    if (!encinitas) throw new Error("no Encinitas");
    expect(resultDetail(encinitas, placeLabel(INDEX, encinitas, "en"), "en")).toBe("City, San Diego County, CA");
    expect(resultDetail(encinitas, placeLabel(INDEX, encinitas, "es"), "es")).toBe("Ciudad, San Diego County, CA");
  });
});

describe("old share links keep working", () => {
  it("makes the same entry as the index for every checked record, so it gets the same record", () => {
    for (const record of PLACE_IDS) {
      const pick = linkedPick(record);
      if (record === "sduhsd_campuses") {
        expect(pick).toBeNull();
        continue;
      }
      if (!pick) throw new Error(`no pick for ${record}`);
      expect(pick.id).toBe(entryIdForRecord(record));
      const indexed = entry(pick.id);
      expect({ name: pick.name, geoid: pick.geoid, kind: pick.kind, counties: pick.counties, state: pick.state }).toEqual({
        name: indexed.name,
        geoid: indexed.geoid,
        kind: indexed.kind,
        counties: indexed.counties,
        state: indexed.state,
      });
      expect(resolvePlace(pick).localRecord).toBe(record);
      expect(placeLabel(SD_COUNTY_NAMES, pick, "en")).toEqual(placeLabel(INDEX, indexed, "en"));
    }
  });

  it("reads the QR flyer's link as the City of San Diego plus the SDUHSD campus", () => {
    const linked = linkedWhere("CA", ["city_of_san_diego", "sduhsd_campuses"]);
    expect(linked.where.picks.map((p) => p.id)).toEqual(["p-0666000"]);
    expect(linked.campus).toBe(true);
    expect(rideWhere(linked.where, "CA", linked.campus)).toEqual({ places: ["city_of_san_diego", "sduhsd_campuses"], otherPlaces: false, campusShown: true });
    // San Diego records mean nothing in another state, as before.
    expect(linkedWhere("TX", ["carlsbad"])).toEqual({ where: NO_PICKS, labels: {}, campus: false });
  });
});

describe("the picks and the campus choice", () => {
  const encinitas = entry("p-0622678");
  const austin = first("Austin, TX");

  it("gives the engine the checked records, and the campus only while its choice is shown", () => {
    const sd = addPick(NO_PICKS, encinitas).next;
    expect(rideWhere(sd, "CA", false)).toEqual({ places: ["encinitas"], otherPlaces: false, campusShown: true });
    expect(rideWhere(sd, "CA", true).places).toEqual(["encinitas", "sduhsd_campuses"]);
    const tx = addPick(NO_PICKS, austin).next;
    expect(rideWhere(tx, "TX", true)).toEqual({ places: [], otherPlaces: true, campusShown: false });
    expect(uncheckedPicks(tx).map((p) => p.name)).toEqual(["Austin"]);
    // A state pick is the law the answer uses, so it is never named as not checked.
    expect(uncheckedPicks(addPick(NO_PICKS, entry("s-TX")).next)).toEqual([]);
    // Picks from another state never reach the engine.
    expect(rideWhere(sd, "TX", false)).toEqual({ places: [], otherPlaces: false, campusShown: false });
  });
});

describe("the page, for an 11-year-old on a Class 2", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 21, 12));
    vi.stubGlobal("window", { location: { search: "?lang=en" } });
    vi.stubGlobal("requestAnimationFrame", (run: (time: number) => void) => {
      run(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function page() {
    const m = mount(Checker, {}, { effects: false });
    const find = (type: unknown, what: string) => one(m.tree(), (e) => e.type === type, what);
    const search = () => find(PlaceSearch, "place search");
    const pick = (e: PlaceEntry) => m.act(() => call(search(), "onPick", e, pickLabels(INDEX, e)));
    const bottom = () => find(BottomLineCard, "bottom line");
    const answer = () => shownAnswer(renderToStaticMarkup(bottom())).word;
    const bottomText = () => visibleLines(renderToStaticMarkup(bottom())).join(" ");
    const note = () => textOf(elements(m.tree()).filter((e) => e.type === "p" && e.props.role === "status")[0]);
    const campusBox = () => elements(m.tree()).find((e) => e.type === "input" && e.props["aria-label"] === placeName("sduhsd_campuses", "en"));
    m.act(() => call(find(BikeInput, "bike input"), "onManual"));
    const age = one(m.tree(), (e) => e.type === "input" && e.props.type === "number", "age box");
    m.act(() => call(age, "onChange", { target: { value: "11" } }));
    m.act(() => call(find(FactsCard, "facts card"), "onChange", classBike(2)));
    m.act(() => call(find(FactsCard, "facts card"), "onCheck"));
    return { m, pick, search, bottom, answer, bottomText, note, campusBox, find };
  }

  it("says NO for the City of San Diego plus Encinitas, and YES for Encinitas alone", () => {
    const p = page();
    p.pick(entry("p-0666000"));
    p.pick(entry("p-0622678"));
    expect(p.answer()).toBe("NO");
    expect(elements(p.m.tree()).filter((e) => e.type === VerdictCard).map((e) => (e.props.verdict as Verdict).id)).toEqual(["CA", "city_of_san_diego", "encinitas"]);
    p.m.act(() => call(p.search(), "onRemove", "p-0666000"));
    expect(p.note()).toBe("Removed San Diego, San Diego County, CA.");
    expect(p.answer()).toBe("YES");
  });

  it("says NO for Encinitas plus an SDUHSD campus, and offers the campus only in San Diego County", () => {
    const p = page();
    expect(p.campusBox()).toBeUndefined();
    p.pick(entry("p-0622678"));
    const box = p.campusBox();
    if (!box) throw new Error("no campus box");
    p.m.act(() => call(box, "onChange", { target: { checked: true } }));
    expect(p.answer()).toBe("NO");
    expect(elements(p.m.tree()).filter((e) => e.type === VerdictCard).map((e) => (e.props.verdict as Verdict).id)).toEqual(["CA", "encinitas", "sduhsd_campuses"]);
  });

  it("answers Austin under Texas law, says Austin's own rules were not checked, and starts over from California", () => {
    const p = page();
    p.pick(entry("p-0622678"));
    p.pick(first("Austin, TX"));
    expect(p.note()).toBe("Started over in Texas. The places in California were removed, since one answer covers one state.");
    const line = p.bottom().props.line as BottomLine;
    expect(p.bottom().props.stateCode).toBe("TX");
    expect(line.covered).toEqual([{ scope: "state", id: "TX" }]);
    expect(p.bottomText()).toContain("This covers Texas state law only.");
    expect(p.bottomText()).toContain("City and county rules for Austin were not checked.");
    expect(headlineProblems(renderToStaticMarkup(p.bottom()), "en", line.kind === "yes" ? "yes" : "no")).toEqual([]);
    expect(hedgeProblems(visibleLines(renderToStaticMarkup(p.bottom())))).toEqual([]);
    // In Spanish too.
    p.m.act(() => call(one(p.m.tree(), (e) => e.type === "button" && e.props["aria-label"] === t("en", "switchLangLabel"), "language button"), "onClick"));
    expect(visibleLines(renderToStaticMarkup(p.bottom())).join(" ")).toContain("No se revisaron las reglas de la ciudad y del condado para Austin.");
  });

  it("says NO for South Carolina picked in the search", () => {
    const p = page();
    p.pick(entry("s-SC"));
    expect(p.bottom().props.stateCode).toBe("SC");
    expect(p.answer()).toBe("NO");
  });

  it("starts over when the plain state picker moves to another state, and says so", () => {
    const p = page();
    p.pick(entry("p-0622678"));
    p.m.act(() => call(one(p.m.tree(), (e) => e.type === "select", "state picker"), "onChange", { target: { value: "OR" } }));
    expect(p.note()).toBe(`Now using ${stateName("OR", "en")} law. The places in California were removed, since one answer covers one state.`);
    expect(p.search().props.picks).toEqual([]);
    expect(p.bottom().props.stateCode).toBe("OR");
  });
});

describe("the unchecked line", () => {
  it("names the picked places, and keeps the old lines when none are named", () => {
    const base = { citiesChecked: false, uncheckedPlaces: true } as BottomLine;
    expect(uncheckedLine(base, "en", ["Austin", "Round Rock"])).toBe("City and county rules for Austin and Round Rock were not checked.");
    expect(uncheckedLine(base, "en")).toBe(t("en", "blNoCity"));
    expect(uncheckedLine({ ...base, citiesChecked: true }, "es")).toBe(t("es", "blOtherPlaces"));
    expect(uncheckedLine({ ...base, citiesChecked: true, uncheckedPlaces: false }, "en", ["Austin"])).toBeNull();
  });
});
