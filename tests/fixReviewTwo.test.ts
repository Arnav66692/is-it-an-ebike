// Regression tests for the second design review. Each block names the problem it guards.

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
import { announcement, BottomLineCard } from "@/components/BottomLineCard";
import { Checker, whereNoteText } from "@/components/Checker";
import { FactsCard } from "@/components/FactsCard";
import { cardAnswer, VerdictCard } from "@/components/VerdictCard";
import { CLOSED, comboKey, focusAfterRemove, PlaceSearch, resultDetail, tooSoonToRemove } from "@/components/PlaceSearch";
import { placeName, type Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { renderLine } from "@/lib/i18n/verdicts";
import { pickLabels } from "@/lib/places/linked";
import { parsePlaceIndex } from "@/lib/places/parse";
import { resolvePlace } from "@/lib/places/resolve";
import { countyNameEs, enterChoice, placeLabel, searchPlaces, searchResults } from "@/lib/places/search";
import type { PlaceEntry, PlaceIndexFile } from "@/lib/places/types";
import { bottomLine, evaluate } from "@/lib/rules";
import { headlineProblems, shownAnswer } from "./answerWords";
import { classBike } from "./helpers";
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

describe("Pennsylvania names the fact still unknown", () => {
  it("asks about the weight when the weight was answered Not sure and the wheel size is known", () => {
    const facts = { ...classBike(1), weightLb: null, weightOver100: null, unsure: ["weight" as const] };
    const r = evaluate({ state: "PA", riderAge: 16, rideDate: "2026-10-20", facts, places: [] });
    expect(r.state.status).toBe("cant_confirm");
    expect(r.state.reason.code).toBe("unsure_weight");
    expect(renderLine(r.state.reason, "en", "Pennsylvania")).toBe("We need to know whether it weighs over 100 pounds to confirm this in Pennsylvania.");
    expect(renderLine(r.state.reason, "es", "Pensilvania")).toContain("pesa más de 100 libras");
  });

  it("still asks for the wheel size when that is the part unknown", () => {
    const facts = { ...classBike(1), wheelFrontIn: null, wheelRearIn: null, unsure: ["wheels" as const] };
    const r = evaluate({ state: "PA", riderAge: 16, rideDate: "2026-10-20", facts, places: [] });
    expect(r.state.reason.code).toBe("unsure_wheel_size");
  });
});

describe("San Diego place cards say NO on a ride date past the state check", () => {
  const LATE = "2027-01-15";
  const result = evaluate({ state: "CA", riderAge: 14, rideDate: LATE, facts: classBike(1), places: ["city_of_san_diego", "carlsbad"] });

  it("holds back every allowed local card, as the state card and the bottom line are", () => {
    expect(result.local.map((v) => v.status)).toEqual(["yes", "yes"]);
    expect(bottomLine(result, LATE).kind).toBe("no_unconfirmed");
    expect([result.state, ...result.local].map((v) => cardAnswer(v, LATE, "CA"))).toEqual(["no", "no", "no"]);
    // Inside the state check the same ride is YES on each card.
    const inside = evaluate({ state: "CA", riderAge: 14, rideDate: "2026-11-15", facts: classBike(1), places: ["city_of_san_diego", "carlsbad"] });
    expect(inside.local.map((v) => cardAnswer(v, "2026-11-15", "CA"))).toEqual(["yes", "yes"]);
  });

  it("draws NO on each local card, with the reason and the state check line", () => {
    for (const v of result.local) {
      for (const lang of ["en", "es"] as const) {
        const html = renderToStaticMarkup(createElement(VerdictCard, { verdict: v, lang, stateCode: "CA", rideDate: LATE }));
        expect(headlineProblems(html, lang, "no"), `${v.id} ${lang}`).toEqual([]);
        expect(shownAnswer(html).word).toBe("NO");
      }
      const en = renderToStaticMarkup(createElement(VerdictCard, { verdict: v, lang: "en", stateCode: "CA", rideDate: LATE }));
      expect(en).toContain("so we can confirm them only through Nov 15, 2026");
    }
  });
});

describe("a YES heard by a screen reader says which local rules were not checked", () => {
  it("adds the unchecked line the card shows, in both languages", () => {
    const r = evaluate({ state: "TX", riderAge: 15, rideDate: "2026-10-20", facts: classBike(1), places: [], otherPlaces: true });
    const bl = bottomLine(r, "2026-10-20");
    expect(bl.kind).toBe("yes");
    expect(announcement(bl, "en", ["Austin"])).toBe(
      "Bottom line: YES. Allowed in every place we checked, for this rider and this bike. City and county rules for Austin were not checked.",
    );
    expect(announcement(bl, "es", ["Austin"])).toBe(
      "En resumen: SÍ. Permitida en todos los lugares que revisamos, para esta persona y esta bicicleta. No se revisaron las reglas de la ciudad y del condado para Austin.",
    );
  });
});

describe("the page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 21, 12));
    vi.stubGlobal("requestAnimationFrame", (run: (time: number) => void) => {
      run(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function page(search: string) {
    vi.stubGlobal("window", { location: { search } });
    const m = mount(Checker, {}, { effects: false });
    const find = (type: unknown, what: string) => one(m.tree(), (e) => e.type === type, what);
    const live = () => elements(m.tree()).filter((e) => e.type === "p" && e.props.role === "status").map(textOf);
    const campusBox = () => elements(m.tree()).find((e) => e.type === "input" && e.props["aria-label"] === placeName("sduhsd_campuses", "en"));
    const check = (age: string) => {
      m.act(() => call(find(BikeInput, "bike input"), "onManual"));
      m.act(() => call(one(m.tree(), (e) => e.type === "input" && e.props.name === "age", "age box"), "onChange", { target: { value: age } }));
      m.act(() => call(find(FactsCard, "facts card"), "onChange", classBike(1)));
      m.act(() => call(find(FactsCard, "facts card"), "onCheck"));
    };
    return { m, find, live, campusBox, check };
  }

  it("reads out the unchecked line with a YES for Austin", () => {
    const p = page("?lang=en&state=TX");
    const austin = entry("p-4805000");
    p.m.act(() => call(p.find(PlaceSearch, "place search"), "onPick", austin, pickLabels(INDEX, austin)));
    p.check("15");
    expect(shownAnswer(renderToStaticMarkup(p.find(BottomLineCard, "bottom line"))).word).toBe("YES");
    expect(p.live()).toContain(
      "Bottom line: YES. Allowed in every place we checked, for this rider and this bike. City and county rules for Austin were not checked.",
    );
  });

  it("keeps the SDUHSD campus box on the page after it is unticked, with no San Diego County place picked", () => {
    const p = page("?lang=en&state=CA&place=city_of_san_diego,sduhsd_campuses");
    expect(p.campusBox()?.props.checked).toBe(true);
    p.m.act(() => call(p.find(PlaceSearch, "place search"), "onRemove", "p-0666000"));
    expect(p.campusBox()?.props.checked).toBe(true);
    p.m.act(() => call(p.campusBox() as El, "onChange", { target: { checked: false } }));
    expect(p.campusBox()?.props.checked).toBe(false);
    p.m.act(() => call(p.campusBox() as El, "onChange", { target: { checked: true } }));
    expect(p.campusBox()?.props.checked).toBe(true);
  });

  it("drops a kept campus box once the ride moves to another state", () => {
    const p = page("?lang=en&state=CA&place=sduhsd_campuses");
    p.m.act(() => call(p.campusBox() as El, "onChange", { target: { checked: false } }));
    expect(p.campusBox()).toBeDefined();
    p.m.act(() => call(one(p.m.tree(), (e) => e.type === "select", "state picker"), "onChange", { target: { value: "OR" } }));
    expect(p.campusBox()).toBeUndefined();
  });
});

describe("the accuracy page counts only cards that say YES as YES", () => {
  it("never puts the allowed count under YES when some allowed cards say NO", async () => {
    const { AccuracyView } = await import("@/components/AccuracyView");
    const accuracy = JSON.parse(readFileSync(join(ROOT, "data", "results", "accuracy.json"), "utf8")) as {
      engine: { by_status: { yes: number }; shown_as?: { yes: { yes: number; no: number } } };
    };
    const page = renderToStaticMarkup(createElement(AccuracyView, { lang: "en" }));
    // The engine's own table only. The bottom line table has a YES row of its own, for whole rides.
    const html = page.slice(page.indexOf("Rules engine"), page.indexOf("Bottom line YES or NO"));
    const rows = [...html.matchAll(/<th[^>]*>([^<]*)<\/th><td[^>]*>([^<]*)<\/td>/g)].map((m) => [m[1], m[2]] as const);
    const yes = rows.filter(([name]) => name === "YES");
    const shown = accuracy.engine.shown_as;
    if (!shown) {
      expect(yes).toEqual([]);
      return;
    }
    expect(yes[0][1]).toMatch(new RegExp(`^${shown.yes.yes.toLocaleString("en-US")} `));
    expect(shown.yes.yes + shown.yes.no).toBe(accuracy.engine.by_status.yes);
  });
});

describe("the first paint has the page's frame, in the page's language", () => {
  it("picks the language the page itself will use", async () => {
    const { pageLang } = await import("@/lib/pageLang");
    expect(pageLang("/accuracy/es", "", null, "en-US")).toBe("es");
    expect(pageLang("/accuracy", "", "es", "es-US")).toBe("en");
    expect(pageLang("/", "?lang=es", "en", "en-US")).toBe("es");
    expect(pageLang("/", "", "es", "en-US")).toBe("es");
    expect(pageLang("/", "", null, "es-MX")).toBe("es");
    expect(pageLang("/", "", null, "en-US")).toBe("en");
    // The flyer follows ?lang= only, like flyerLang.
    expect(pageLang("/qr", "", "es", "es-US")).toBe("en");
    expect(pageLang("/qr", "?lang=es", null, "en-US")).toBe("es");
  });

  it("sets <html lang> from an inline script, even with storage blocked", async () => {
    const { PAGE_LANG_SCRIPT } = await import("@/lib/pageLang");
    const run = (path: string, search: string, storage: () => string | null, browser: string) => {
      const documentElement = { lang: "en" };
      const window = { localStorage: { getItem: storage } };
      new Function("window", "document", "location", "navigator", PAGE_LANG_SCRIPT)(window, { documentElement }, { pathname: path, search }, { language: browser });
      return documentElement.lang;
    };
    expect(run("/accuracy/es", "", () => null, "en-US")).toBe("es");
    expect(run("/", "", () => "es", "en-US")).toBe("es");
    expect(
      run(
        "/",
        "",
        () => {
          throw new Error("blocked");
        },
        "es-US",
      ),
    ).toBe("es");
    const layout = readFileSync(join(ROOT, "app", "layout.tsx"), "utf8");
    expect(layout).toContain("PAGE_LANG_SCRIPT");
    expect(layout).toContain("suppressHydrationWarning");
  });

  it("draws the bar, the title, the tagline and the steps while the checker loads, in both languages", async () => {
    const { CheckerSkeleton, FlyerSkeleton } = await import("@/components/Skeletons");
    const html = renderToStaticMarkup(createElement(CheckerSkeleton));
    for (const cls of ["app-bar", "brand-mark", "lang-btn", "app-title", "tagline", "card-title"]) expect(html, cls).toContain(`class="${cls}`);
    for (const lang of ["en", "es"] as const) {
      expect(html).toContain(`<span class="sk-${lang}" lang="${lang}">${t(lang, "appName")}</span>`);
      expect(html).toContain(t(lang, "step1"));
      expect(html).toContain(t(lang, "whereLabel"));
    }
    expect(CSS).toMatch(/html\[lang="es"\] \.sk-en,\s*html:not\(\[lang="es"\]\) \.sk-es \{\s*display: none;/);
    const flyer = renderToStaticMarkup(createElement(FlyerSkeleton));
    expect(flyer).toContain("Scan to check one bike for one rider");
    expect(readFileSync(join(ROOT, "components", "ClientOnly.tsx"), "utf8")).not.toContain('<p className="page app-title">');
  });
});
