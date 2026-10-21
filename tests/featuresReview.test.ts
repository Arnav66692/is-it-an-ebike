// Regression tests for the review of the school districts, the mods check and the bike finder.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BikeFinder, checkHref, FinderResultCard } from "@/components/BikeFinder";
import { BikeInput } from "@/components/BikeInput";
import { BottomLineCard } from "@/components/BottomLineCard";
import { Checker } from "@/components/Checker";
import { FactsCard } from "@/components/FactsCard";
import { PlaceSearch } from "@/components/PlaceSearch";
import { pickLabels } from "@/lib/places/linked";
import { placeLabel, searchResults } from "@/lib/places/search";
import { elements, mount, one, textOf, type El } from "./hooks";
import { ModAnswerCard, modsAge, overallReason } from "@/components/ModsCheck";
import { answerMod, modApplies, outcomesFor, type ModChoice } from "@/lib/mods/answer";
import { MODS_DATA, type ModView } from "@/lib/mods/data";
import { uncheckedLine } from "@/components/BottomLineCard";
import { parseShareLink } from "@/lib/checkerState";
import { catalogBike } from "@/lib/bikes/catalog";
import type { CatalogBike } from "@/lib/bikes/facts";
import { colorsIn, findBikes, finderLine, type FinderQuiz } from "@/lib/bikes/finder";
import { CATALOG, CATALOG_META } from "@/lib/bikes/catalog";
import { finderText } from "@/lib/i18n/finder";
import { withDistricts, type DistrictIndexFile } from "@/lib/places/districts";
import { linkedPickIds, linkedWhere, withLinkedPicks } from "@/lib/places/linked";

import { parsePlaceIndex } from "@/lib/places/parse";
import { addPick, NO_PICKS, rideWhere, uncheckedPicks, type PlacePicks } from "@/lib/places/picks";
import type { PlaceEntry, PlaceIndexFile } from "@/lib/places/types";
import { bottomLine, evaluate } from "@/lib/rules";
import { emptyFacts } from "@/lib/rules/types";
import { classBike } from "./helpers";

const TODAY = "2026-10-21";
const ROOT = join(__dirname, "..");
const INDEX = withDistricts(
  parsePlaceIndex(JSON.parse(readFileSync(join(ROOT, "public", "places", "us-places.json"), "utf8")) as PlaceIndexFile),
  JSON.parse(readFileSync(join(ROOT, "public", "places", "us-districts.json"), "utf8")) as DistrictIndexFile,
);

function entry(id: string): PlaceEntry {
  const found = INDEX.byId.get(id);
  if (!found) throw new Error(`no entry ${id}`);
  return found;
}

function picksOf(...ids: string[]): PlacePicks {
  return ids.reduce((cur, id) => addPick(cur, entry(id)).next, NO_PICKS);
}

/** What the checker rebuilds from a "Check this bike" link, once the search index has loaded. */
function checkerWhere(href: string): PlacePicks {
  const search = href.slice(href.indexOf("?"));
  const link = parseShareLink(search);
  const entries = linkedPickIds(search).map((id) => entry(id));
  return withLinkedPicks(linkedWhere(link.state, link.places).where, link.state, entries);
}

/** The checker's not-checked line for a YES bike in these picks. */
function checkerUnchecked(where: PlacePicks): string | null {
  const ride = rideWhere(where, "CA", false);
  const line = bottomLine(evaluate({ state: "CA", riderAge: 16, rideDate: TODAY, facts: classBike(1), places: ride.places, otherPlaces: ride.otherPlaces }), TODAY);
  expect(line.kind).toBe("yes");
  const notChecked = uncheckedPicks(where);
  return uncheckedLine(line, "en", notChecked.filter((p) => p.kind !== "district").map((p) => p.name), notChecked.filter((p) => p.kind === "district").map((p) => p.name));
}

function bike(id: string): CatalogBike {
  const found = catalogBike(id);
  if (!found) throw new Error(`no bike ${id}`);
  return found;
}

describe("a Class 3 mode next to a throttle", () => {
  it("is never YES in the finder when the page doesn't say the throttle turns off in Class 3", () => {
    for (const id of ["ride1up-portola-02", "rad-radster-trail"]) {
      for (const age of [16, 17, 18, 30]) {
        const line = finderLine(bike(id), { age, state: "CA", places: [], otherPlaces: false, rideDate: TODAY });
        expect(line.kind, `${id} ${age}`).not.toBe("yes");
      }
    }
  });

  it("is not confirmed by the engine for a Class 2 and 3 label with a 20 mph throttle", () => {
    const facts = { ...emptyFacts(), hasPedals: true, classes: [1, 2, 3] as (1 | 2 | 3)[], ratedWatts: 750, hasThrottle: true, throttleMph: 20, assistMph: 28, motorOver20: false, assistOver28: false };
    const result = evaluate({ state: "CA", riderAge: 30, rideDate: TODAY, facts, places: [], otherPlaces: false });
    expect(result.state.status).toBe("cant_confirm");
    expect(result.state.reason.code).toBe("class3_throttle_unclear");
    expect(bottomLine(result, TODAY).kind).not.toBe("yes");
  });
});

describe("Check this bike keeps every place the family picked", () => {
  const ENCINITAS = "p-0622678";
  const POWAY_UNIFIED = "d-0631530";
  const soltera = bike("aventon-soltera-2-5");

  function hrefFor(where: PlacePicks): string {
    const ride = rideWhere(where, "CA", false);
    return checkHref(soltera, "en", "CA", ride.places, 16, uncheckedPicks(where).map((p) => p.id));
  }

  it("carries an unchecked district, so the checker names its campus rules as not checked", () => {
    const where = picksOf(ENCINITAS, POWAY_UNIFIED);
    const href = hrefFor(where);
    expect(href).toContain("pick=d-0631530");
    const rebuilt = checkerWhere(href);
    expect(rebuilt.picks.map((p) => p.id).sort()).toEqual([ENCINITAS, POWAY_UNIFIED].sort());
    expect(checkerUnchecked(rebuilt)).toBe(checkerUnchecked(where));
    expect(checkerUnchecked(rebuilt)).toContain("Poway Unified");
  });

  it("carries a district that is the only pick", () => {
    const where = picksOf(POWAY_UNIFIED);
    const rebuilt = checkerWhere(hrefFor(where));
    expect(checkerUnchecked(rebuilt)).toContain("Poway Unified");
  });

  it("carries an unchecked city and keeps SDUHSD as the campus record", () => {
    const where = picksOf("p-0658520", "d-0634380");
    const href = hrefFor(where);
    expect(href).toContain("sduhsd_campuses");
    expect(href).not.toContain("d-0634380");
    const rebuilt = checkerWhere(href);
    expect(uncheckedPicks(rebuilt).map((p) => p.id)).toEqual(uncheckedPicks(where).map((p) => p.id));
  });

  it("reads only well-formed pick ids", () => {
    expect(linkedPickIds("?pick=d-0631530,<script>,p-0622678,d-0631530")).toEqual(["d-0631530", "p-0622678"]);
  });
});

function modOf(id: string): ModView {
  const found = MODS_DATA.mods.find((m) => m.id === id);
  if (!found) throw new Error(`no mod ${id}`);
  return found;
}

describe("mods end dates", () => {
  const seat = modOf("passenger_seat_or_pegs");
  const throttle = modOf("add_throttle_class1_or_class3");

  it("reads a Jan 1, 2029 repeal as a rule last in effect Dec 31, 2028", () => {
    expect(answerMod(MODS_DATA, seat, 2, 0, "2028-12-31", true).kind).toBe("sd_breaks");
    const after = answerMod(MODS_DATA, seat, 2, 0, "2029-01-01", true);
    expect(after.kind).toBe("same_class");
    expect(after.yes).toBe(true);
    expect(answerMod(MODS_DATA, throttle, 1, 0, "2029-01-01", false).rules.map((r) => r.section)).not.toContain("VC 21214.5(b)");
    expect(throttle.rules.find((r) => r.section === "VC 21214.5(b)")?.ends).toBe("2028-12-31");
    const ends312 = MODS_DATA.mods.flatMap((m) => m.rules).filter((r) => r.section === "VC 312.5(c)" && r.ends !== null).map((r) => r.ends);
    expect(ends312).toEqual(["2026-12-31"]);
  });

  it("ends a rule that says Until Dec 31, 2026 on that day", () => {
    const a = answerMod(MODS_DATA, modOf("throttle_past_20_mph"), 2, null, "2027-06-01", false);
    expect(a.notEbike.some((r) => r.says.startsWith("Until Dec 31, 2026"))).toBe(false);
    const before = answerMod(MODS_DATA, modOf("throttle_past_20_mph"), 2, null, "2026-10-21", false);
    expect(before.notEbike.some((r) => r.says.startsWith("Until Dec 31, 2026"))).toBe(true);
  });
});

describe("mods answers", () => {
  const throttle = modOf("add_throttle_class1_or_class3");
  const kit = modOf("speed_unlock_kit");
  const seat = modOf("passenger_seat_or_pegs");

  it("says the label must be replaced on a class change, with no not-an-e-bike penalty", () => {
    const a = answerMod(MODS_DATA, throttle, 1, 0, TODAY, false);
    expect(a.kind).toBe("becomes_class_2");
    expect(a.effects).toContain("different_class");
    expect(a.penalties.some((p) => p.section.startsWith("see if_no_longer_an_ebike"))).toBe(false);
    const html = renderToStaticMarkup(createElement(ModAnswerCard, { mod: throttle, answer: a, lang: "en" }));
    expect(html).toContain("The class label must be replaced");
  });

  it("never shows a research note to the family", () => {
    for (const m of MODS_DATA.mods) {
      for (const cls of [1, 2, 3] as const) {
        if (!modApplies(m, cls)) continue;
        const choices: ModChoice[] = [null, "other", ...outcomesFor(m, cls).map((o) => o.index)];
        for (const choice of choices) {
          const answer = answerMod(MODS_DATA, m, cls, choice, TODAY, false);
          for (const lang of ["en", "es"] as const) {
            const html = renderToStaticMarkup(createElement(ModAnswerCard, { mod: m, answer, lang }));
            expect(html, m.id).not.toMatch(/The app should|See outcomes/);
          }
        }
      }
    }
  });

  it("separates mods that break the law from ones that can't be confirmed or need an answer", () => {
    const unsure = answerMod(MODS_DATA, throttle, 3, 1, TODAY, false);
    expect(overallReason([unsure], "en")).toBe("1 of 1 mods can't be confirmed as legal.");
    const ask = answerMod(MODS_DATA, kit, 2, null, TODAY, false);
    const breaks = answerMod(MODS_DATA, modOf("throttle_past_20_mph"), 2, null, TODAY, false);
    expect(overallReason([ask, breaks, unsure], "en")).toBe(
      "1 of 3 mods stops it being legal to ride as an e-bike. 1 of 3 mods can't be confirmed as legal. 1 of 3 mods needs an answer in step 2.",
    );
    expect(ask.penalties).toEqual([]);
  });

  it("shows the City of San Diego fine only for a ride in the City while its rule is in effect", () => {
    const sdmc = (date: string, city: boolean) => answerMod(MODS_DATA, seat, 2, 0, date, city).penalties.some((p) => p.section.startsWith("SDMC"));
    expect(sdmc(TODAY, false)).toBe(false);
    expect(sdmc(TODAY, true)).toBe(true);
    expect(sdmc("2029-06-01", true)).toBe(false);
  });

  it("is NO for a mod that makes the bike Class 3 when the rider is under 16", () => {
    const young = answerMod(MODS_DATA, kit, 1, 3, TODAY, false, 14);
    expect(young.yes).toBe(false);
    expect(young.kind).toBe("under_16_class_3");
    expect(answerMod(MODS_DATA, kit, 1, 3, TODAY, false, 16).yes).toBe(true);
    const blank = answerMod(MODS_DATA, kit, 1, 3, TODAY, false, null);
    expect(blank.yes).toBe(true);
    expect(overallReason([blank], "en")).toContain("only for riders 16 and older");
    expect(modsAge("14")).toBe(14);
    expect(modsAge("")).toBeNull();
    expect(modsAge("x")).toBe("bad");
  });

  it("shows the Spanish page's own words in Spanish", () => {
    const a = answerMod(MODS_DATA, modOf("throttle_past_20_mph"), 2, null, TODAY, false);
    const html = renderToStaticMarkup(createElement(ModAnswerCard, { mod: modOf("throttle_past_20_mph"), answer: a, lang: "es" }));
    expect(html).toContain("Es un vehículo motorizado");
    expect(html).not.toMatch(/Aplica a (rider|owner|seller)/);
  });

  it("draws a single choice as a round mark and keeps link buttons readable on hover", () => {
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    expect(css).toMatch(/\.check input\[type="radio"\] \{\s*border-radius: 50%;/);
    expect(css).toMatch(/a\.btn:hover \{\s*color: var\(--primary-ink\);/);
    expect(css).toMatch(/a\.btn-quiet:hover \{\s*color: var\(--ink\);/);
  });
});

describe("the bike finder", () => {
  const quiz: FinderQuiz = { age: 30, height: null, uses: [], budget: "any", colors: [], state: "CA", places: [], otherPlaces: false, rideDate: TODAY };

  it("ranks the same whatever the makers are called", () => {
    const order = (makers: (b: CatalogBike) => string) => findBikes(CATALOG.map((b) => ({ ...b, maker: makers(b) })), quiz).map((r) => r.bike.id);
    const real = order((b) => b.maker);
    expect(order(() => "Zzz")).toEqual(real);
    expect(order((b) => (b.maker.startsWith("Rad") ? "Aaa" : b.maker))).toEqual(real);
    expect(order((b) => `${b.maker.split("").reverse().join("")}`)).toEqual(real);
  });

  it("never shows the catalog's computed speed as the maker's top speed", () => {
    const globe = bike("specialized-globe-haul-st");
    const [r] = findBikes([globe], quiz);
    const html = renderToStaticMarkup(createElement(FinderResultCard, { result: r, lang: "en", age: 30, state: "CA", where: "California", places: [], unchecked: null, readDate: CATALOG_META.readDate }));
    expect(html).toMatch(/<dt>Top speed<\/dt><dd>Not stated<\/dd>/);
    expect(html).toMatch(/<dt>Pedal assist to<\/dt><dd>28 mph<\/dd>/);
  });

  it("matches colors by whole word", () => {
    const tang = { ...bike("lectric-xp4"), colors: ["Blu Tang"] };
    expect(colorsIn(tang, "other")).toEqual([]);
    expect(colorsIn(tang, "blue")).toEqual(["Blu Tang"]);
    expect(colorsIn({ ...tang, colors: ["Sandstone"] }, "other")).toEqual(["Sandstone"]);
  });

  it("keeps the price note in the specs fold and marks only the maker's words as English", () => {
    const b = CATALOG.find((x) => x.price_note !== null);
    if (!b) throw new Error("no price note");
    const [r] = findBikes([b], quiz);
    const html = renderToStaticMarkup(createElement(FinderResultCard, { result: r, lang: "es", age: 30, state: "CA", where: "California", places: [], unchecked: null, readDate: CATALOG_META.readDate }));
    const fold = html.slice(html.indexOf("<details"));
    expect(html.indexOf(">" + (b.price_note ?? "").replace(/&/g, "&amp;"))).toBeGreaterThan(html.indexOf("<details"));
    expect(fold).toContain(finderText("es", "priceNote"));
    expect(html).not.toContain('<dl class="specs" lang="en"');
  });

  it("writes the age as a compound word and quotes the maker's age rule", () => {
    expect(finderText("en", "yesLine", { age: 15, where: "Encinitas" })).toBe("YES on the maker's specs, for a 15-year-old in Encinitas.");
    expect(finderText("en", "fit_maker_age", { text: "Must be 16" })).toBe("Maker's age rule, \u201cMust be 16\u201d");
  });
});

function call(element: El, name: string, ...args: unknown[]): unknown {
  const handler = element.props[name];
  if (typeof handler !== "function") throw new Error(`${name} is not a handler`);
  return (handler as (...a: unknown[]) => unknown)(...args);
}

describe("pages with places picked", () => {
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

  it("says so in the finder when a place in another state starts over", () => {
    vi.stubGlobal("window", { location: { search: "?lang=en" } });
    const m = mount(BikeFinder, { catalog: CATALOG, meta: CATALOG_META }, { effects: false });
    const search = () => one(m.tree(), (e) => e.type === PlaceSearch, "place search");
    const status = () => elements(m.tree()).filter((e) => e.type === "p" && e.props.role === "status").map(textOf).join(" ");
    const encinitas = entry("p-0622678");
    m.act(() => call(search(), "onPick", encinitas, pickLabels(INDEX, encinitas)));
    m.act(() => call(search(), "onPick", encinitas, pickLabels(INDEX, encinitas)));
    expect(status()).toMatch(/already/i);
    const texas = INDEX.entries.find((e) => e.kind === "district" && e.state === "TX");
    if (!texas) throw new Error("no Texas district");
    m.act(() => call(search(), "onPick", texas, pickLabels(INDEX, texas)));
    expect(status()).toMatch(/California/);
  });

  it("keeps the checker's not-checked line while a linked district is still loading", () => {
    vi.stubGlobal("window", { location: { search: "?lang=en&state=CA&place=encinitas&pick=d-0631530&age=16" } });
    const m = mount(Checker, {}, { effects: false });
    m.act(() => call(one(m.tree(), (e) => e.type === BikeInput, "bike input"), "onManual"));
    m.act(() => call(one(m.tree(), (e) => e.type === FactsCard, "facts card"), "onChange", classBike(1)));
    m.act(() => call(one(m.tree(), (e) => e.type === FactsCard, "facts card"), "onCheck"));
    const card = one(m.tree(), (e) => e.type === BottomLineCard, "bottom line");
    const html = renderToStaticMarkup(card);
    expect(html).toMatch(/were not checked/);
  });
});

describe("district search and labels", () => {
  it("finds a district by the office city its label shows after a comma", () => {
    expect(searchResults(INDEX, "san dieguito union high, encinitas").map((r) => r.entry.id)).toContain("d-0634380");
    expect(searchResults(INDEX, "poway unified, san diego").map((r) => r.entry.id)).toContain("d-0631530");
    expect(searchResults(INDEX, "san dieguito union high, san diego county").map((r) => r.entry.id)).toContain("d-0634380");
  });

  it("tells two districts with the same name, city, county and type apart, and names them once", () => {
    const a = placeLabel(INDEX, entry("d-0602487"), "en").text;
    const b = placeLabel(INDEX, entry("d-0602500"), "en").text;
    expect(a).not.toBe(b);
    expect(a).toContain("NCES ID 0602487");
    expect(placeLabel(INDEX, entry("d-0631530"), "en").text).not.toContain("NCES ID");
    const line = bottomLine(evaluate({ state: "CA", riderAge: 16, rideDate: TODAY, facts: classBike(1), places: [], otherPlaces: true }), TODAY);
    const said = uncheckedLine(line, "en", [], ["Excel Academy Charter District", "Excel Academy Charter District"]) ?? "";
    expect(said.match(/Excel Academy/g)).toHaveLength(1);
  });
});
