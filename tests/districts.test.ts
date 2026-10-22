// Every US public school district in the place search: the NCES file, what each district maps to,
// how districts rank and read in both languages, and what the answer says about their campus rules.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BikeInput } from "@/components/BikeInput";
import { announcement, BottomLineCard, uncheckedLine } from "@/components/BottomLineCard";
import { Checker } from "@/components/Checker";
import { FactsCard } from "@/components/FactsCard";
import { districtTypeLabel, PlaceSearch, resultDetail } from "@/components/PlaceSearch";
import { placeName } from "@/lib/i18n/names";
import { DISTRICT_INDEX_URL, parseDistricts, SDUHSD_LEAID, withDistricts, type DistrictIndexFile } from "@/lib/places/districts";
import { pickLabels } from "@/lib/places/linked";
import { loadSearchIndex, PLACE_INDEX_URL, resetSearchIndex } from "@/lib/places/load";
import { ZIP_INDEX_URL } from "@/lib/places/zips";
import { parsePlaceIndex } from "@/lib/places/parse";
import { addPick, campusPick, engineWhere, isCampusPick, NO_PICKS, rideWhere, uncheckedPicks } from "@/lib/places/picks";
import { resolvePlace } from "@/lib/places/resolve";
import { placeLabel, searchPlaces, searchResults } from "@/lib/places/search";
import type { PlaceEntry, PlaceIndexFile } from "@/lib/places/types";
import { bottomLine, evaluate, STATE_CODES } from "@/lib/rules";
import { shownAnswer } from "./answerWords";
import { classBike } from "./helpers";
import { elements, mount, one, textOf, type El } from "./hooks";

const ROOT = join(__dirname, "..");
const PLACES_FILE = JSON.parse(readFileSync(join(ROOT, "public", "places", "us-places.json"), "utf8")) as PlaceIndexFile;
const DISTRICTS_PATH = join(ROOT, "public", "places", "us-districts.json");
const DISTRICTS = JSON.parse(readFileSync(DISTRICTS_PATH, "utf8")) as DistrictIndexFile;
const PLACES = parsePlaceIndex(PLACES_FILE);
const INDEX = withDistricts(PLACES, DISTRICTS);
const ALL_DISTRICTS = INDEX.entries.filter((e) => e.kind === "district");

function district(leaid: string): PlaceEntry {
  const found = INDEX.byId.get(`d-${leaid}`);
  if (!found) throw new Error(`no district ${leaid}`);
  return found;
}

const SDUHSD = district(SDUHSD_LEAID);
const POWAY_UNIFIED = district("0631530");

function call(element: El, name: string, ...args: unknown[]): unknown {
  const handler = element.props[name];
  if (typeof handler !== "function") throw new Error(`${name} is not a handler`);
  return (handler as (...a: unknown[]) => unknown)(...args);
}

describe("the district file", () => {
  it("has every operating district NCES lists for the 50 states and DC, 19,430 of them", () => {
    expect(DISTRICTS.rows).toHaveLength(19430);
    expect(DISTRICTS.counts.rows).toBe(19430);
    expect(ALL_DISTRICTS).toHaveLength(19430);
    expect(new Set(DISTRICTS.rows.map((r) => r[0])).size).toBe(19430);
    expect(DISTRICTS.counts.records_in_file - DISTRICTS.counts.not_operating - DISTRICTS.counts.outlying_areas_left_out).toBe(19430);
  });

  it("covers every state and DC in the rules table, and nothing else", () => {
    expect(new Set(DISTRICTS.rows.map((r) => r[2]))).toEqual(new Set(STATE_CODES));
  });

  it("names its NCES sources with a link and a vintage", () => {
    expect(DISTRICTS.schoolYear).toBe("2025-26");
    expect(DISTRICTS.sources).toHaveLength(2);
    for (const s of DISTRICTS.sources) {
      expect(s.url).toMatch(/^https:\/\/nces\.ed\.gov\//);
      expect(s.vintage).not.toBe("");
    }
  });

  it("names only SDUHSD as checked", () => {
    expect(DISTRICTS.checked).toEqual([SDUHSD_LEAID]);
  });

  it("uses county names the place index uses", () => {
    for (const [fips, name] of DISTRICTS.counties) expect(PLACES.countyNames.get(fips)).toBe(name);
  });

  it("is served from the app's own origin and stays small enough to load on first use", () => {
    expect(DISTRICT_INDEX_URL).toBe("/places/us-districts.json");
    expect(statSync(DISTRICTS_PATH).size).toBeLessThan(1_600_000);
  });
});

describe("what a district maps to", () => {
  it("maps San Dieguito Union High, by its NCES ID, to the SDUHSD campus record", () => {
    expect(SDUHSD.name).toBe("San Dieguito Union High");
    expect(SDUHSD.counties).toEqual(["06073"]);
    expect(resolvePlace(SDUHSD)).toEqual({ state: "CA", localRecord: "sduhsd_campuses", checked: true, why: "sduhsd_district" });
    expect(isCampusPick(SDUHSD)).toBe(true);
  });

  it("never maps any other district to a checked record", () => {
    const others = ALL_DISTRICTS.filter((d) => d.geoid !== SDUHSD_LEAID);
    expect(others).toHaveLength(19429);
    for (const d of others) {
      expect(resolvePlace(d), d.name).toEqual({ state: d.state, localRecord: null, checked: false, why: "state_only" });
      expect(isCampusPick(d)).toBe(false);
    }
  });

  it("keeps a district named like a checked city off that city's record", () => {
    expect(POWAY_UNIFIED.name).toBe("Poway Unified");
    expect(resolvePlace(POWAY_UNIFIED).localRecord).toBeNull();
  });

  it("refuses a file that marks another district checked", () => {
    expect(() => parseDistricts({ ...DISTRICTS, checked: [SDUHSD_LEAID, "0631530"] }, STATE_CODES)).toThrow(/other than SDUHSD/);
    expect(() => parseDistricts({ ...DISTRICTS, checked: ["0631530"] }, STATE_CODES)).toThrow(/other than SDUHSD/);
  });

  it("refuses a damaged row", () => {
    expect(() => parseDistricts({ ...DISTRICTS, rows: [...DISTRICTS.rows, ["12", "X", "CA", "", "Y", 1]] }, STATE_CODES)).toThrow(/LEAID/);
    expect(() => parseDistricts({ ...DISTRICTS, rows: [...DISTRICTS.rows, ["9999999", "X", "PR", "", "Y", 1]] }, STATE_CODES)).toThrow(/rules table/);
    expect(() => parseDistricts({ ...DISTRICTS, rows: [...DISTRICTS.rows, ["9999999", "X", "CA", "99999", "Y", 1]] }, STATE_CODES)).toThrow(/county/);
  });
});

describe("searching for a district", () => {
  it("finds SDUHSD first by part of its name, its full name or its short name", () => {
    for (const text of ["San Dieguito", "san diegu", "San Dieguito Union High School District", "SDUHSD", "sduhsd"]) {
      expect(searchPlaces(INDEX, text)[0]?.id, text).toBe(SDUHSD.id);
    }
  });

  it("puts a city before the district named after it", () => {
    const results = searchPlaces(INDEX, "Poway");
    expect(results[0].id).toBe("p-0658520");
    expect(results.map((e) => e.id)).toContain(POWAY_UNIFIED.id);
  });

  it("shows the office city for districts that share a name in one state", () => {
    const results = searchResults(INDEX, "Jefferson Elem, CA", 20).map((r) => r.entry).filter((e) => e.kind === "district");
    const jeffersons = results.filter((e) => e.name === "Jefferson Elementary");
    expect(jeffersons.map((e) => e.city).sort()).toEqual(["Daly City", "Paicines", "Tracy"]);
    const lines = jeffersons.map((e) => resultDetail(e, placeLabel(INDEX, e, "en"), "en"));
    expect(new Set(lines).size).toBe(3);
    expect(lines).toContain("School district, Daly City, San Mateo County, CA");
  });

  it("keeps two districts with one name, city and county both in the list", () => {
    const excel = searchResults(INDEX, "Excel Academy Charter District", 20).filter((r) => r.entry.kind === "district" && r.entry.state === "CA");
    expect(excel.map((r) => r.entry.geoid).sort()).toEqual(["0602487", "0602500"]);
  });

  it("finds a district by a state after a comma", () => {
    const results = searchPlaces(INDEX, "Discovery Charter District, California", 8).filter((e) => e.kind === "district");
    expect(results.map((e) => e.city).sort()).toEqual(["Chula Vista", "San Jose", "Tracy"]);
  });
});

describe("district labels", () => {
  it("reads a regular district in English and Spanish", () => {
    expect(placeLabel(INDEX, SDUHSD, "en").text).toBe("San Dieguito Union High, Encinitas, San Diego County, CA");
    expect(resultDetail(SDUHSD, placeLabel(INDEX, SDUHSD, "en"), "en")).toBe("School district, Encinitas, San Diego County, CA");
    expect(placeLabel(INDEX, SDUHSD, "es").text).toBe("San Dieguito Union High, Encinitas, condado de San Diego, CA");
    expect(resultDetail(SDUHSD, placeLabel(INDEX, SDUHSD, "es"), "es")).toBe("Distrito escolar, Encinitas, condado de San Diego, CA");
  });

  it("names the NCES type of a district that is not a regular one", () => {
    const rop = district("0600086");
    expect(districtTypeLabel(rop, "en")).toBe("specialized district");
    expect(resultDetail(rop, placeLabel(INDEX, rop, "en"), "en")).toBe("School district, specialized district, Fremont, Alameda County, CA");
    expect(resultDetail(rop, placeLabel(INDEX, rop, "es"), "es")).toBe("Distrito escolar, distrito especializado, Fremont, condado de Alameda, CA");
    const agency = district("0601397");
    expect(resultDetail(agency, placeLabel(INDEX, agency, "en"), "en")).toBe("School district, service agency, Fremont, Alameda County, CA");
    expect(districtTypeLabel(SDUHSD, "en")).toBe("");
  });

  it("has a type label in both languages for every type in the file", () => {
    for (const type of Object.keys(DISTRICTS.types).map(Number)) {
      const sample = ALL_DISTRICTS.find((d) => d.districtType === type);
      if (!sample || type <= 2) continue;
      expect(districtTypeLabel(sample, "en"), `type ${type}`).not.toBe("");
      expect(districtTypeLabel(sample, "es"), `type ${type}`).not.toBe("");
    }
  });

  it("leaves out a blank county", () => {
    const noCounty = ALL_DISTRICTS.find((d) => d.counties.length === 0);
    if (!noCounty) throw new Error("expected a district with no county");
    const label = placeLabel(INDEX, noCounty, "en");
    expect(label.where).toBe(noCounty.city);
    expect(label.text).not.toContain("undefined");
  });
});

describe("picking a district", () => {
  it("adds a chip for any district but SDUHSD, and names its campus rules as not checked", () => {
    const { next } = addPick(NO_PICKS, POWAY_UNIFIED);
    expect(next.picks.map((p) => p.id)).toEqual([POWAY_UNIFIED.id]);
    expect(engineWhere(next)).toEqual({ state: "CA", places: [], otherPlaces: true });
    expect(uncheckedPicks(next).map((p) => p.id)).toEqual([POWAY_UNIFIED.id]);
  });

  it("starts over when the district is in another state", () => {
    const tx = district(ALL_DISTRICTS.find((d) => d.state === "TX")?.geoid ?? "");
    const ca = addPick(NO_PICKS, PLACES.byId.get("p-0611194") as PlaceEntry).next;
    const change = addPick(ca, tx);
    expect(change.startedOver).toEqual({ from: "CA", to: "TX" });
    expect(change.next).toEqual({ state: "TX", picks: [tx] });
  });

  it("turns on the campus record for SDUHSD, once, and starts over from another state", () => {
    const encinitas = PLACES.byId.get("p-0622678") as PlaceEntry;
    const ca = addPick(NO_PICKS, encinitas).next;
    expect(campusPick(ca, SDUHSD)).toEqual({ next: ca, startedOver: null });
    expect(rideWhere(ca, "CA", true).places).toEqual(["encinitas", "sduhsd_campuses"]);
    const withChip = { state: "CA", picks: [encinitas, SDUHSD] };
    expect(rideWhere(withChip, "CA", true).places).toEqual(["encinitas", "sduhsd_campuses"]);
    const austin = addPick(NO_PICKS, PLACES.byId.get("p-4805000") as PlaceEntry).next;
    expect(campusPick(austin, SDUHSD)).toEqual({ next: { state: "CA", picks: [] }, startedOver: { from: "TX", to: "CA" } });
    expect(campusPick(NO_PICKS, SDUHSD)).toEqual({ next: { state: "CA", picks: [] }, startedOver: null });
  });

  it("gives the same state-law answer with a district as without, and adds no local card", () => {
    const base = { state: "CA", riderAge: 15, rideDate: "2026-10-21", facts: classBike(1) };
    const plain = evaluate({ ...base, places: [], otherPlaces: false });
    const withDistrict = evaluate({ ...base, places: engineWhere(addPick(NO_PICKS, POWAY_UNIFIED).next)?.places ?? [], otherPlaces: true });
    expect(withDistrict.state.status).toBe(plain.state.status);
    expect(withDistrict.local).toEqual([]);
    expect(withDistrict.localNotice).toBe(true);
  });
});

describe("the answer names a district's campus rules as not checked", () => {
  const yes = bottomLine(evaluate({ state: "CA", riderAge: 15, rideDate: "2026-10-21", facts: classBike(1), places: [], otherPlaces: true }), "2026-10-21");
  const yesCity = bottomLine(evaluate({ state: "CA", riderAge: 15, rideDate: "2026-10-21", facts: classBike(1), places: ["encinitas"], otherPlaces: true }), "2026-10-21");

  it("names the district alone", () => {
    expect(yesCity.kind).toBe("yes");
    expect(uncheckedLine(yesCity, "en", [], ["Poway Unified"])).toBe("Campus rules for Poway Unified were not checked.");
    expect(uncheckedLine(yesCity, "es", [], ["Poway Unified"])).toBe("No se revisaron las reglas de los planteles de Poway Unified.");
  });

  it("names a city and a district each in its own sentence", () => {
    expect(uncheckedLine(yesCity, "en", ["Austin"], ["Poway Unified", "Vista Unified"])).toBe(
      "City and county rules for Austin were not checked. Campus rules for Poway Unified and Vista Unified were not checked.",
    );
  });

  it("still says no city was checked when only a district was picked", () => {
    expect(uncheckedLine(yes, "en", [], ["Poway Unified"])).toBe("City and county rules were not checked. Campus rules for Poway Unified were not checked.");
  });

  it("reads it out with a YES", () => {
    expect(announcement(yesCity, "en", [], ["Poway Unified"])).toBe(
      "Bottom line: YES. Allowed in every place we checked, for this rider and this bike. Campus rules for Poway Unified were not checked.",
    );
  });
});

describe("loading the places and districts together", () => {
  afterEach(() => resetSearchIndex());

  it("fetches each file once and searches both", async () => {
    resetSearchIndex();
    const urls: string[] = [];
    const fetcher = async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => (url === DISTRICT_INDEX_URL ? DISTRICTS : PLACES_FILE) };
    };
    const [a, b] = await Promise.all([loadSearchIndex(fetcher), loadSearchIndex(fetcher)]);
    expect(a).toBe(b);
    // The ZIP file loads with them too. tests/zips.test.ts covers it.
    expect(urls.sort()).toEqual([PLACE_INDEX_URL, DISTRICT_INDEX_URL, ZIP_INDEX_URL].sort());
    expect(a.entries.length).toBe(PLACES.entries.length + 19430);
    expect(searchPlaces(a, "SDUHSD")[0].id).toBe(SDUHSD.id);
  });

  it("keeps cities working when the district file fails, and tries the districts again next time", async () => {
    resetSearchIndex();
    const failing = async (url: string) => (url === DISTRICT_INDEX_URL ? { ok: false, status: 503, json: async () => null } : { ok: true, status: 200, json: async () => PLACES_FILE });
    const placesOnly = await loadSearchIndex(failing);
    expect(placesOnly.entries.length).toBe(PLACES.entries.length);
    expect(searchPlaces(placesOnly, "Encinitas")[0].name).toBe("Encinitas");
    const ok = async (url: string) => ({ ok: true, status: 200, json: async () => (url === DISTRICT_INDEX_URL ? DISTRICTS : PLACES_FILE) });
    const full = await loadSearchIndex(ok);
    expect(full.entries.length).toBe(PLACES.entries.length + 19430);
  });

  it("keeps cities working when the district file is damaged", async () => {
    resetSearchIndex();
    const broken = async (url: string) => ({ ok: true, status: 200, json: async () => (url === DISTRICT_INDEX_URL ? { rows: [["bad"]] } : PLACES_FILE) });
    const placesOnly = await loadSearchIndex(broken);
    expect(searchPlaces(placesOnly, "Encinitas")[0].name).toBe("Encinitas");
  });
});

describe("the page with a district picked", () => {
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
    const campusBox = () => elements(m.tree()).find((e) => e.type === "input" && e.props["aria-label"] === placeName("sduhsd_campuses", "en"));
    const pick = (e: PlaceEntry) => m.act(() => call(find(PlaceSearch, "place search"), "onPick", e, pickLabels(INDEX, e)));
    const chips = () => (find(PlaceSearch, "place search").props.picks as { id: string }[]).map((p) => p.id);
    const check = (age: string) => {
      m.act(() => call(find(BikeInput, "bike input"), "onManual"));
      m.act(() => call(one(m.tree(), (e) => e.type === "input" && e.props.name === "age", "age box"), "onChange", { target: { value: age } }));
      m.act(() => call(find(FactsCard, "facts card"), "onChange", classBike(1)));
      m.act(() => call(find(FactsCard, "facts card"), "onCheck"));
    };
    return { m, find, campusBox, pick, chips, check };
  }

  it("ticks the SDUHSD campus box for SDUHSD, with no chip, and the answer gets the campus card", () => {
    const p = page("?lang=en&state=CA");
    p.pick(SDUHSD);
    expect(p.chips()).toEqual([]);
    expect(p.campusBox()?.props.checked).toBe(true);
    p.check("15");
    const html = renderToStaticMarkup(p.find(BottomLineCard, "bottom line"));
    expect(html).toContain(placeName("sduhsd_campuses", "en"));
  });

  it("moves to California for SDUHSD from Texas", () => {
    const p = page("?lang=en&state=TX");
    p.pick(SDUHSD);
    expect(one(p.m.tree(), (e) => e.type === "select", "state picker").props.value).toBe("CA");
    expect(p.campusBox()?.props.checked).toBe(true);
  });

  it("adds a chip for Poway Unified and says its campus rules were not checked", () => {
    const p = page("?lang=en&state=CA");
    p.pick(PLACES.byId.get("p-0658520") as PlaceEntry);
    p.pick(POWAY_UNIFIED);
    expect(p.chips()).toEqual(["p-0658520", POWAY_UNIFIED.id]);
    p.check("15");
    const card = p.find(BottomLineCard, "bottom line");
    expect(card.props.uncheckedDistricts).toEqual(["Poway Unified"]);
    const html = renderToStaticMarkup(card);
    expect(shownAnswer(html).word).toBe("YES");
    expect(html).toContain("Campus rules for Poway Unified were not checked.");
    const live = elements(p.m.tree()).filter((e) => e.type === "p" && e.props.role === "status").map(textOf);
    expect(live.some((l) => l.includes("Campus rules for Poway Unified were not checked."))).toBe(true);
  });
});
