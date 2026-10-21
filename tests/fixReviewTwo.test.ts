// Regression tests for the second design review. Each block names the problem it guards.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/photo/runPedalCheck", () => ({
  hasWebGpu: vi.fn(async () => true),
  runPedalCheck: vi.fn(),
}));

import { whereNoteText } from "@/components/Checker";
import { CLOSED, comboKey, focusAfterRemove, PlaceSearch, resultDetail, tooSoonToRemove } from "@/components/PlaceSearch";
import type { Lang } from "@/lib/i18n/names";
import { pickLabels } from "@/lib/places/linked";
import { parsePlaceIndex } from "@/lib/places/parse";
import { resolvePlace } from "@/lib/places/resolve";
import { countyNameEs, enterChoice, placeLabel, searchPlaces, searchResults } from "@/lib/places/search";
import type { PlaceEntry, PlaceIndexFile } from "@/lib/places/types";
import { elements, mount, one, textOf, type El } from "./hooks";

const ROOT = join(__dirname, "..");
const FILE = JSON.parse(readFileSync(join(ROOT, "public", "places", "us-places.json"), "utf8")) as PlaceIndexFile;
const INDEX = parsePlaceIndex(FILE);
const CSS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");

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

const label = (e: PlaceEntry) => placeLabel(INDEX, e, "en").text;
const key = (k: string) => ({ key: k, preventDefault: () => {} });

function box(state = "CA", lang: Lang = "en") {
  const onPick = vi.fn();
  const m = mount(PlaceSearch, { lang, state, picks: [], onPick, onRemove: () => {}, loadIndex: () => Promise.resolve(INDEX) });
  const input = () => one(m.tree(), (e) => e.type === "input" && e.props.role === "combobox", "combobox");
  const options = () => elements(m.tree()).filter((e) => e.props.role === "option");
  return { m, input, options, onPick };
}

describe("Enter never starts over in another state on its own", () => {
  // Each name's only exact match is outside California, while the family rides in San Diego.
  for (const name of ["Miramar", "Palm City", "Bay Park", "Cardiff"]) {
    it(`highlights, not picks, "${name}" for a ride in California`, () => {
      const found = searchResults(INDEX, name);
      expect(found.filter((r) => r.exact).every((r) => r.entry.state !== "CA")).toBe(true);
      expect(enterChoice(found, "CA")).toBeNull();
    });
  }

  it("still picks the one exact match in the answer's own state", () => {
    expect(enterChoice(searchResults(INDEX, "Miramar"), "FL")).toBe(0);
    expect(enterChoice(searchResults(INDEX, "Encinitas"), "CA")).toBe(0);
  });

  it("on the page, Enter after Miramar picks nothing and shows the place it would pick", async () => {
    const b = box("CA");
    b.m.act(() => call(b.input(), "onFocus"));
    await b.m.settle();
    b.m.act(() => call(b.input(), "onChange", { target: { value: "Miramar" } }));
    b.m.act(() => call(b.input(), "onKeyDown", key("Enter")));
    expect(b.onPick).not.toHaveBeenCalled();
    expect(b.input().props["aria-activedescendant"]).toBe(b.options()[0].props.id);
    expect(textOf(b.options()[0])).toContain("FL");
  });
});

describe("the City's own short names and parts find the City record", () => {
  it("lists San Pasqual Valley first for San Pasqual, and Enter picks nothing unseen", () => {
    const found = searchResults(INDEX, "San Pasqual");
    expect(found[0].entry.id).toBe("n-san-pasqual-valley");
    expect(resolvePlace(found[0].entry).localRecord).toBe("city_of_san_diego");
    expect(found.map((r) => label(r.entry))).toContain("San Pasqual, Los Angeles County, CA");
    expect(enterChoice(found, "CA")).toBeNull();
  });

  it("finds Del Mar Heights in the City of San Diego before the one in Texas", () => {
    const [top] = searchPlaces(INDEX, "Del Mar Heights");
    expect(top.id).toBe("n-del-mar-heights");
    expect(resolvePlace(top).localRecord).toBe("city_of_san_diego");
  });
});

describe("half-typed state names and Saint, Mount or Fort keep the list open", () => {
  const cases: [string, string][] = [
    ["Encinitas, Cali", "p-0622678"],
    ["Encinitas, Californ", "p-0622678"],
    ["Encinitas Cal", "p-0622678"],
    ["Carmel Valley, Cal", "n-carmel-valley"],
    ["Austin, Te", "p-4805000"],
    ["Austin, Tex", "p-4805000"],
    ["Austin Tex", "p-4805000"],
  ];
  for (const [text, id] of cases) {
    it(`finds the place for "${text}"`, () => {
      expect(searchPlaces(INDEX, text)[0]?.id).toBe(id);
    });
  }

  it("finds Saint and Mount places before the word is done", () => {
    expect(searchPlaces(INDEX, "Sain").some((e) => e.name === "St. Louis" && e.state === "MO")).toBe(true);
    expect(searchPlaces(INDEX, "Moun").some((e) => e.name === "Mount Vernon")).toBe(true);
    expect(searchPlaces(INDEX, "Moun").map((e) => e.id)).toContain("n-mount-hope");
  });
});

describe("the list comes back after the box loses focus", () => {
  it("opens again on focus and on a tap, with the text still in the box", async () => {
    const b = box();
    b.m.act(() => call(b.input(), "onFocus"));
    await b.m.settle();
    b.m.act(() => call(b.input(), "onChange", { target: { value: "Carls" } }));
    expect(b.input().props["aria-expanded"]).toBe(true);
    b.m.act(() => call(b.input(), "onBlur"));
    expect(b.input().props["aria-expanded"]).toBe(false);
    b.m.act(() => call(b.input(), "onFocus"));
    expect(b.input().props["aria-expanded"]).toBe(true);
    b.m.act(() => call(b.input(), "onKeyDown", key("Escape")));
    expect(b.input().props["aria-expanded"]).toBe(false);
    b.m.act(() => call(b.input(), "onClick"));
    expect(b.input().props["aria-expanded"]).toBe(true);
  });

  it("opens again on a phone's Search key, without picking anything", () => {
    expect(comboKey(CLOSED, "Enter", 4, true, 0)).toMatchObject({ pick: null, next: { open: true, active: -1 }, handled: true });
  });
});

describe("removing a chip on a phone", () => {
  it("moves focus to the next chip, or with none left, to the label on touch and to the box otherwise", () => {
    expect(focusAfterRemove(0, 2, true)).toEqual({ chip: 0 });
    expect(focusAfterRemove(2, 2, false)).toEqual({ chip: 1 });
    expect(focusAfterRemove(0, 0, true)).toBe("label");
    expect(focusAfterRemove(0, 0, false)).toBe("input");
  });

  it("ignores a remove tap right after a pick, so a quick second tap keeps the new chip", () => {
    expect(tooSoonToRemove(1000, 900)).toBe(true);
    expect(tooSoonToRemove(2000, 900)).toBe(false);
  });

  it("keeps the chips a named list for VoiceOver, and the red hover only for a real pointer", () => {
    const encinitas = entry("p-0622678");
    const labels = pickLabels(INDEX, encinitas);
    const html = renderToStaticMarkup(
      createElement(PlaceSearch, { lang: "en", state: "CA", picks: [{ id: encinitas.id, label: labels.en, detail: resultDetail(encinitas, labels.en, "en") }], onPick: () => {}, onRemove: () => {} }),
    );
    expect(html).toMatch(/<ul[^>]*class="chips"[^>]*role="list"/);
    expect(CSS).not.toMatch(/^\.chip-remove:hover/m);
    expect(CSS).toMatch(/@media \(hover: hover\) \{\s*\.chip-remove:hover/);
  });
});

describe("the search list in dark mode and in Windows contrast themes", () => {
  it("sits on a raised surface, not the card's own color", () => {
    expect(CSS).toMatch(/\.combo-list \{[^}]*background: var\(--raised\)/);
  });

  it("marks the highlighted place with system colors", () => {
    const forced = CSS.slice(CSS.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/\.combo-option\[aria-selected="true"\] \{[^}]*background: Highlight/);
  });
});

describe("Spanish lines name counties in Spanish", () => {
  it("reads county names the way the answers do", () => {
    expect(countyNameEs("San Diego County")).toBe("condado de San Diego");
    expect(countyNameEs("Orleans Parish")).toBe("parroquia de Orleans");
    expect(countyNameEs("Juneau City and Borough")).toBe("ciudad y distrito de Juneau");
    expect(countyNameEs("Baltimore city")).toBe("ciudad de Baltimore");
    expect(countyNameEs("Carson City")).toBe("Carson City");
  });

  it("labels results and chips with no English county words", () => {
    expect(placeLabel(INDEX, entry("p-0622678"), "es").text).toBe("Encinitas, condado de San Diego, CA");
    expect(placeLabel(INDEX, entry("c-06073"), "es").text).toBe("Condado de San Diego, CA");
    expect(placeLabel(INDEX, entry("p-4805000"), "es").where).toBe("condado de Travis y 3 condados más");
    expect(placeLabel(INDEX, entry("p-0622678"), "en").text).toBe("Encinitas, San Diego County, CA");
  });
});

describe("Spanish status lines name Washington, DC with its article", () => {
  const dc = pickLabels(INDEX, entry("p-1150000"));

  it("says en el and del Distrito de Columbia", () => {
    expect(whereNoteText({ key: "whereStartedOver", from: "CA", to: "DC" }, "es")).toBe(
      "Empezamos de nuevo en el Distrito de Columbia. Se quitaron los lugares de California, porque una respuesta cubre un solo estado.",
    );
    expect(whereNoteText({ key: "whereStartedOver", from: "DC", to: "CA" }, "es")).toContain("Se quitaron los lugares del Distrito de Columbia,");
    expect(whereNoteText({ key: "whereAddedNewState", place: dc, to: "DC" }, "es")).toContain("La respuesta ahora usa la ley del Distrito de Columbia.");
    expect(whereNoteText({ key: "whereNewState", to: "DC" }, "es")).toBe("Ahora se usa la ley del Distrito de Columbia.");
    expect(whereNoteText({ key: "whereStateSwitched", from: "CA", to: "DC" }, "en")).toBe(
      "Now using Washington, DC law. The places in California were removed, since one answer covers one state.",
    );
  });
});
