// The place search on the committed index: what each pick maps to, how results rank and read,
// and how picks become the engine's state, places and "somewhere else" flag.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stateName } from "@/lib/i18n/names";
import { loadPlaceIndex, PLACE_INDEX_URL, resetPlaceIndex } from "@/lib/places/load";
import { parsePlaceIndex } from "@/lib/places/parse";
import { addPick, engineWhere, inSanDiegoCounty, NO_PICKS, pickIds, picksFromIds, removePick } from "@/lib/places/picks";
import { entryIdForRecord, resolvePlace } from "@/lib/places/resolve";
import { CHECKED_CITIES, NOT_COUNTY_LAND, SD_COUNTY_FIPS } from "@/lib/places/sanDiego";
import { placeLabel, searchPlaces } from "@/lib/places/search";
import { SD_NEIGHBORHOODS } from "@/lib/places/sdNeighborhoods";
import type { PlaceEntry, PlaceIndexFile } from "@/lib/places/types";
import { emptyFacts, evaluate, PLACE_IDS, STATE_CODES } from "@/lib/rules";

const FILE_PATH = join(__dirname, "..", "public", "places", "us-places.json");
const FILE = JSON.parse(readFileSync(FILE_PATH, "utf8")) as PlaceIndexFile;
const INDEX = parsePlaceIndex(FILE);

function entry(id: string): PlaceEntry {
  const found = INDEX.byId.get(id);
  if (!found) throw new Error(`no entry ${id}`);
  return found;
}

/** The first search result, which must be the place the test names. */
function first(text: string): PlaceEntry {
  const [top] = searchPlaces(INDEX, text);
  if (!top) throw new Error(`no result for "${text}"`);
  return top;
}

function named(name: string, state: string, kind?: string): PlaceEntry[] {
  return INDEX.entries.filter((e) => e.name === name && e.state === state && (kind === undefined || e.kind === kind));
}

function only(entries: PlaceEntry[]): PlaceEntry {
  expect(entries).toHaveLength(1);
  return entries[0];
}

const label = (e: PlaceEntry) => placeLabel(INDEX, e, "en").text;

describe("the index file", () => {
  it("records each Census file's source and vintage", () => {
    expect(FILE.sources.length).toBeGreaterThanOrEqual(4);
    for (const s of FILE.sources) {
      expect(s.url).toMatch(/^https:\/\/www2\.census\.gov\//);
      expect(s.url.endsWith(s.file)).toBe(true);
      expect(s.vintage).not.toBe("");
    }
    expect(FILE.built).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("counts what it holds", () => {
    expect(FILE.counts.rows).toBe(FILE.rows.length);
    expect(FILE.counts.counties + FILE.counts.places + FILE.counts.towns_and_townships).toBe(FILE.rows.length);
  });

  it("stays small enough to load on demand", () => {
    expect(statSync(FILE_PATH).size).toBeLessThan(1_500_000);
  });

  it("keeps the measured base and reservation communities the code lists", () => {
    expect(FILE.notCountyLand).toEqual([...NOT_COUNTY_LAND].sort((a, b) => a.geoid.localeCompare(b.geoid)));
  });

  it("is served from the app's own origin", () => {
    expect(PLACE_INDEX_URL).toBe("/places/us-places.json");
  });
});

describe("what a pick maps to", () => {
  it("maps Carlsbad, CA to the Carlsbad record", () => {
    const carlsbad = first("Carlsbad, CA");
    expect(carlsbad.id).toBe("p-0611194");
    expect(resolvePlace(carlsbad)).toEqual({ state: "CA", localRecord: "carlsbad", checked: true, why: "checked_city" });
  });

  it("maps each checked city by its Census GEOID to its own record", () => {
    for (const city of CHECKED_CITIES) {
      const e = entry(`p-${city.geoid}`);
      expect(e.name).toBe(city.name);
      expect(resolvePlace(e).localRecord).toBe(city.record);
    }
  });

  it("maps Rancho Santa Fe CDP and San Diego County to unincorporated San Diego County", () => {
    const rsf = only(named("Rancho Santa Fe", "CA", "community"));
    expect(resolvePlace(rsf)).toEqual({ state: "CA", localRecord: "unincorporated_san_diego_county", checked: true, why: "sd_community" });
    const county = first("San Diego County");
    expect(county.id).toBe(`c-${SD_COUNTY_FIPS}`);
    expect(resolvePlace(county)).toEqual({ state: "CA", localRecord: "unincorporated_san_diego_county", checked: true, why: "sd_county" });
  });

  it("maps Carmel Valley to the City of San Diego and Carmel Valley Village to California law only", () => {
    const valley = first("Carmel Valley");
    expect(valley.id).toBe("n-carmel-valley");
    expect(resolvePlace(valley)).toEqual({ state: "CA", localRecord: "city_of_san_diego", checked: true, why: "sd_neighborhood" });

    const village = only(named("Carmel Valley Village", "CA"));
    expect(INDEX.countyNames.get(village.counties[0])).toBe("Monterey County");
    expect(resolvePlace(village)).toEqual({ state: "CA", localRecord: null, checked: false, why: "state_only" });
  });

  it("maps Oceanside, Chula Vista and Escondido to their own records, checked on Oct 20, 2026", () => {
    for (const [name, record] of [["Oceanside", "oceanside"], ["Chula Vista", "chula_vista"], ["Escondido", "escondido"]] as const) {
      const city = only(named(name, "CA", "city"));
      expect(city.counties).toEqual([SD_COUNTY_FIPS]);
      expect(resolvePlace(city)).toEqual({ state: "CA", localRecord: record, checked: true, why: "checked_city" });
    }
  });

  it("maps a Del Mar or Encinitas outside San Diego County to its own state only", () => {
    const elsewhere = INDEX.entries.filter((e) => /^(del mar|encinitas)\b/.test(e.keys[0]) && !e.counties.includes(SD_COUNTY_FIPS));
    expect(elsewhere.map(label)).toContain("Del Mar Heights, Cameron County, TX");
    for (const e of elsewhere) expect(resolvePlace(e)).toEqual({ state: e.state, localRecord: null, checked: false, why: "state_only" });
  });

  it("maps Carlsbad, New Mexico and San Diego, Texas to their own states only", () => {
    expect(resolvePlace(first("Carlsbad, NM"))).toEqual({ state: "NM", localRecord: null, checked: false, why: "state_only" });
    expect(resolvePlace(first("San Diego, TX"))).toEqual({ state: "TX", localRecord: null, checked: false, why: "state_only" });
  });

  it("maps Austin, Texas to Texas only", () => {
    for (const text of ["Austin", "Austin, Texas", "Austin TX", "austin, tx"]) {
      const austin = first(text);
      expect(austin.id).toBe("p-4805000");
      expect(resolvePlace(austin)).toEqual({ state: "TX", localRecord: null, checked: false, why: "state_only" });
    }
  });

  it("keeps communities that are mostly base or reservation land off the county record", () => {
    for (const p of NOT_COUNTY_LAND) {
      expect(resolvePlace(entry(`p-${p.geoid}`))).toEqual({ state: "CA", localRecord: null, checked: false, why: "base_or_reservation" });
    }
  });

  it("maps every other San Diego County community to the county record", () => {
    const communities = INDEX.entries.filter((e) => e.kind === "community" && e.counties.join() === SD_COUNTY_FIPS);
    expect(communities.length).toBeGreaterThan(NOT_COUNTY_LAND.length);
    const offCounty = new Set(NOT_COUNTY_LAND.map((p) => `p-${p.geoid}`));
    for (const c of communities) {
      expect(resolvePlace(c).localRecord).toBe(offCounty.has(c.id) ? null : "unincorporated_san_diego_county");
    }
  });

  it("maps every City of San Diego neighborhood to the City record", () => {
    for (const n of SD_NEIGHBORHOODS) expect(resolvePlace(entry(`n-${n.slug}`)).localRecord).toBe("city_of_san_diego");
  });
});

describe("no place gets a record it doesn't have", () => {
  const mapped = INDEX.entries.map((e) => ({ e, r: resolvePlace(e) }));

  it("gives a local record only to places wholly in San Diego County, California", () => {
    for (const { e, r } of mapped) {
      if (r.localRecord === null) continue;
      expect(e.state).toBe("CA");
      expect(e.counties).toEqual([SD_COUNTY_FIPS]);
      expect(r.checked).toBe(true);
    }
  });

  it("never gives a city's record to a different city", () => {
    for (const city of CHECKED_CITIES) {
      const holders = mapped.filter(({ r }) => r.localRecord === city.record).map(({ e }) => e);
      const places = holders.filter((e) => e.source !== "neighborhood");
      expect(places.map((e) => e.geoid)).toEqual([city.geoid]);
      if (city.record !== "city_of_san_diego") expect(holders).toHaveLength(1);
    }
  });

  it("gives the one incorporated San Diego County city without a record state law only", () => {
    const checked = new Set(CHECKED_CITIES.map((c) => c.geoid));
    const others = INDEX.entries.filter((e) => e.source === "place" && e.kind !== "community" && e.counties.includes(SD_COUNTY_FIPS) && !checked.has(e.geoid ?? ""));
    expect(others.map((e) => e.name)).toEqual(["National City"]);
    for (const e of others) expect(resolvePlace(e).localRecord).toBeNull();
  });

  it("never maps the SDUHSD campus record from a place", () => {
    expect(mapped.some(({ r }) => r.localRecord === "sduhsd_campuses")).toBe(false);
  });

  it("agrees with the engine's place list", () => {
    for (const { r } of mapped) if (r.localRecord) expect(PLACE_IDS).toContain(r.localRecord);
  });
});

describe.each(STATE_CODES)("the state %s", (code) => {
  it("is found first by its postal code and by its English and Spanish names", () => {
    expect(first(code).id).toBe(`s-${code}`);
    expect(first(code.toLowerCase()).id).toBe(`s-${code}`);
    expect(first(stateName(code, "en")).id).toBe(`s-${code}`);
    expect(first(stateName(code, "es")).id).toBe(`s-${code}`);
  });
});

describe("every state and DC", () => {
  it("is all 50 states and DC", () => {
    expect(STATE_CODES).toHaveLength(51);
    expect(INDEX.entries.filter((e) => e.kind === "state").map((e) => e.state).sort()).toEqual([...STATE_CODES].sort());
  });

  it("finds DC by its other names", () => {
    expect(first("District of Columbia").id).toBe("s-DC");
    expect(first("Washington DC").id).toBe("s-DC");
  });

  it("maps a state pick to that state's law, with local rules not checked", () => {
    expect(resolvePlace(entry("s-SC"))).toEqual({ state: "SC", localRecord: null, checked: false, why: "state_only" });
  });
});

describe("search", () => {
  it("returns nothing for a blank query and never more than the limit", () => {
    expect(searchPlaces(INDEX, "")).toEqual([]);
    expect(searchPlaces(INDEX, "  ")).toEqual([]);
    expect(searchPlaces(INDEX, "san", 3)).toHaveLength(3);
    expect(searchPlaces(INDEX, "san", 0)).toEqual([]);
  });

  it("puts checked San Diego places before other places that start the same way", () => {
    expect(first("San Diego").id).toBe("p-0666000");
    expect(first("Del Mar").id).toBe("p-0618506");
    expect(first("Encinitas").id).toBe("p-0622678");
    const carmel = searchPlaces(INDEX, "Carmel").map((e) => e.id);
    expect(carmel.slice(0, 2).sort()).toEqual(["n-carmel-mountain-ranch", "n-carmel-valley"]);
    expect(carmel.indexOf("n-carmel-valley")).toBeLessThan(carmel.indexOf(only(named("Carmel Valley Village", "CA")).id));
  });

  it("puts bigger places first among the rest", () => {
    const springfields = searchPlaces(INDEX, "Springfield").filter((e) => e.kind === "city");
    expect(springfields[0].state).toBe("MO");
    expect(first("Portland").state).toBe("OR");
  });

  it("matches the start of any word, but not one letter in the middle of a name", () => {
    expect(searchPlaces(INDEX, "Jolla").map((e) => e.id)).toContain("n-la-jolla");
    expect(searchPlaces(INDEX, "Paradise Hills").map((e) => e.id)).toContain("n-skyline-paradise-hills");
    expect(searchPlaces(INDEX, "j").every((e) => e.keys.some((k) => k.startsWith("j")) || e.kind === "state")).toBe(true);
  });

  it("ignores accents, punctuation and Saint or St.", () => {
    expect(first("Peñasquitos").id).toBe("n-rancho-penasquitos");
    expect(first("Rancho Peñasquitos").id).toBe("n-rancho-penasquitos");
    expect(first("St. Louis").state).toBe("MO");
    expect(first("Saint Louis").id).toBe(first("St Louis").id);
    expect(first("Fort Worth").id).toBe(first("Ft. Worth").id);
    expect(searchPlaces(INDEX, "Fort", 200).some((e) => e.name.startsWith("Fortuna"))).toBe(true);
  });

  it("narrows by a county after a comma", () => {
    expect(first("Carmel Valley, Monterey").name).toBe("Carmel Valley Village");
    expect(first("Fairbanks Ranch, San Diego").id).toBe(only(named("Fairbanks Ranch", "CA", "community")).id);
  });

  it("never shows two results with the same label", () => {
    for (const text of ["Louisville", "Washington", "Springfield", "Carmel", "Richmond", "San"]) {
      const labels = searchPlaces(INDEX, text, 20).map(label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe("labels", () => {
  it("always show the county and state", () => {
    expect(label(entry("n-carmel-valley"))).toBe("Carmel Valley, City of San Diego, San Diego County, CA");
    expect(label(only(named("Carmel Valley Village", "CA")))).toBe("Carmel Valley Village, Monterey County, CA");
    expect(label(entry("p-0611194"))).toBe("Carlsbad, San Diego County, CA");
    expect(label(entry("p-4805000"))).toBe("Austin, Travis County and 3 other counties, TX");
    expect(label(entry(`c-${SD_COUNTY_FIPS}`))).toBe("San Diego County, CA");
    expect(label(entry("s-CA"))).toBe("California");
  });

  it("read in Spanish", () => {
    expect(placeLabel(INDEX, entry("n-carmel-valley"), "es").text).toBe("Carmel Valley, Ciudad de San Diego, San Diego County, CA");
    expect(placeLabel(INDEX, entry("p-4805000"), "es").where).toBe("Travis County y 3 condados más");
    expect(placeLabel(INDEX, entry("s-NY"), "es").text).toBe("Nueva York");
  });

  it("say one other county in the singular", () => {
    const two = INDEX.entries.find((e) => e.counties.length === 2);
    if (!two) throw new Error("no place in two counties");
    expect(placeLabel(INDEX, two, "en").where).toMatch(/ and 1 other county$/);
    expect(placeLabel(INDEX, two, "es").where).toMatch(/ y 1 condado más$/);
  });
});

describe("picks", () => {
  const carlsbad = entry("p-0611194");
  const carmelValley = entry("n-carmel-valley");
  const oceanside = only(named("Oceanside", "CA", "city"));
  const austin = entry("p-4805000");

  it("adds places in one state as chips, and a repeat changes nothing", () => {
    const one = addPick(NO_PICKS, carlsbad);
    const two = addPick(one.next, carmelValley);
    expect(two.startedOver).toBeNull();
    expect(pickIds(two.next)).toEqual(["p-0611194", "n-carmel-valley"]);
    expect(addPick(two.next, carlsbad).next).toBe(two.next);
  });

  it("starts over in the new state when a place is in another state, and says so", () => {
    const ca = addPick(addPick(NO_PICKS, carlsbad).next, carmelValley).next;
    const tx = addPick(ca, austin);
    expect(tx.startedOver).toEqual({ from: "CA", to: "TX" });
    expect(tx.next).toEqual({ state: "TX", picks: [austin] });
  });

  it("keeps the state when the last chip is removed, so the next pick doesn't start over", () => {
    const none = removePick(addPick(NO_PICKS, carlsbad).next, carlsbad.id);
    expect(none).toEqual({ state: "CA", picks: [] });
    expect(addPick(none, austin).startedOver).toBeNull();
  });

  it("gives the engine the checked records and says when a place was not checked", () => {
    const checked = addPick(addPick(NO_PICKS, carlsbad).next, carmelValley).next;
    expect(engineWhere(checked)).toEqual({ state: "CA", places: ["carlsbad", "city_of_san_diego"], otherPlaces: false });
    // Oceanside has its own record. A town outside San Diego County has none, so it is not checked.
    expect(engineWhere(addPick(checked, oceanside).next)).toEqual({ state: "CA", places: ["carlsbad", "city_of_san_diego", "oceanside"], otherPlaces: false });
    const withUnchecked = addPick(checked, only(named("Carmel Valley Village", "CA"))).next;
    expect(engineWhere(withUnchecked)).toEqual({ state: "CA", places: ["carlsbad", "city_of_san_diego"], otherPlaces: true });
    expect(engineWhere(addPick(NO_PICKS, austin).next)).toEqual({ state: "TX", places: [], otherPlaces: true });
    expect(engineWhere(NO_PICKS)).toBeNull();
  });

  it("lists a record once when two picks share it", () => {
    const two = addPick(addPick(NO_PICKS, carmelValley).next, entry("n-la-jolla")).next;
    expect(engineWhere(two)?.places).toEqual(["city_of_san_diego"]);
  });

  it("offers the SDUHSD campus choice only for a ride in San Diego County", () => {
    expect(inSanDiegoCounty(addPick(NO_PICKS, oceanside).next)).toBe(true);
    expect(inSanDiegoCounty(addPick(NO_PICKS, carmelValley).next)).toBe(true);
    expect(inSanDiegoCounty(addPick(NO_PICKS, only(named("Carmel Valley Village", "CA"))).next)).toBe(false);
    expect(inSanDiegoCounty(addPick(NO_PICKS, entry("s-CA")).next)).toBe(false);
    expect(inSanDiegoCounty(addPick(NO_PICKS, austin).next)).toBe(false);
  });

  it("reads back from a share link, dropping unknown ids and ids in another state", () => {
    const back = picksFromIds(INDEX, ["p-0611194", "nope", "p-4805000", "n-carmel-valley", "p-0611194"]);
    expect(back).toEqual({ state: "CA", picks: [carlsbad, carmelValley] });
    expect(picksFromIds(INDEX, ["nope"])).toEqual(NO_PICKS);
  });

  it("keeps old share links working by mapping each checked record to its place", () => {
    for (const record of PLACE_IDS) {
      const id = entryIdForRecord(record);
      if (record === "sduhsd_campuses") {
        expect(id).toBeNull();
        continue;
      }
      expect(id).not.toBeNull();
      expect(resolvePlace(entry(id ?? "")).localRecord).toBe(record);
    }
  });
});

describe("the engine with search picks", () => {
  const ride = { riderAge: 14, rideDate: "2026-10-21", facts: emptyFacts() };

  it("says local rules were not checked for a place with no record", () => {
    const where = engineWhere(addPick(NO_PICKS, entry("p-4805000")).next);
    if (!where) throw new Error("no state");
    expect(evaluate({ ...where, ...ride }).localNotice).toBe(true);
  });

  it("covers a checked city without the not-checked line", () => {
    const where = engineWhere(addPick(NO_PICKS, entry("p-0611194")).next);
    if (!where) throw new Error("no state");
    const result = evaluate({ ...where, ...ride });
    expect(result.localNotice).toBe(false);
    expect(result.local.map((v) => v.id)).toEqual(["carlsbad"]);
  });
});

describe("loading the index", () => {
  it("fetches and parses the file once", async () => {
    resetPlaceIndex();
    let calls = 0;
    const fetcher = async (url: string) => {
      calls += 1;
      expect(url).toBe(PLACE_INDEX_URL);
      return { ok: true, status: 200, json: async () => FILE };
    };
    const [a, b] = await Promise.all([loadPlaceIndex(fetcher), loadPlaceIndex(fetcher)]);
    expect(a).toBe(b);
    expect(a.entries.length).toBe(INDEX.entries.length);
    expect(calls).toBe(1);
    resetPlaceIndex();
  });

  it("tries again after a failed load", async () => {
    resetPlaceIndex();
    const failing = async () => ({ ok: false, status: 503, json: async () => null });
    await expect(loadPlaceIndex(failing)).rejects.toThrow(/HTTP 503/);
    const ok = async () => ({ ok: true, status: 200, json: async () => FILE });
    await expect(loadPlaceIndex(ok)).resolves.toBeTruthy();
    resetPlaceIndex();
  });
});

describe("parsing a damaged file", () => {
  it("throws on a file in another format", () => {
    expect(() => parsePlaceIndex({ ...FILE, format: 2 } as unknown as PlaceIndexFile)).toThrow(/format 1/);
  });

  it("throws on a row that names a county the file doesn't list", () => {
    expect(() => parsePlaceIndex({ ...FILE, rows: [...FILE.rows, "c|99999|Nowhere|12345"] })).toThrow(/county 99999/);
  });

  it("throws on a row with an unknown kind or a bad code", () => {
    expect(() => parsePlaceIndex({ ...FILE, rows: [...FILE.rows, "x|0|Nowhere|12345"] })).toThrow(/unknown kind/);
    expect(() => parsePlaceIndex({ ...FILE, rows: [...FILE.rows, "c|0|Nowhere|12"] })).toThrow(/bad code/);
  });

  it("throws on two rows with one id", () => {
    expect(() => parsePlaceIndex({ ...FILE, rows: [...FILE.rows, FILE.rows[0]] })).toThrow(/two entries/);
  });

  it("throws when the states don't match the rules table", () => {
    expect(() => parsePlaceIndex({ ...FILE, states: FILE.states.slice(1) })).toThrow(/rules table/);
  });
});
