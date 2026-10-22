// ZIP codes in the place search, on the committed files: a ZIP maps to one place only when that
// place holds at least 99 percent of its land, a split ZIP in San Diego County asks which place,
// and no ZIP ever reaches a checked record any other way.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceSearch, pickFor } from "@/components/PlaceSearch";
import { t } from "@/lib/i18n/ui";
import { withDistricts, type DistrictIndexFile } from "@/lib/places/districts";
import { loadSearchIndex, resetSearchIndex } from "@/lib/places/load";
import { parsePlaceIndex } from "@/lib/places/parse";
import { addPick, engineWhere, NO_PICKS } from "@/lib/places/picks";
import { resolvePlace } from "@/lib/places/resolve";
import { SD_COUNTY_FIPS } from "@/lib/places/sanDiego";
import { placeLabel, searchResults, uncheckedName } from "@/lib/places/search";
import type { PlaceEntry, PlaceIndexFile } from "@/lib/places/types";
import { elements, mount, one, textOf, type El } from "./hooks";
import { CHECKED_COUNTIES, placeHolding, withZips, ZIP_INDEX_URL, zipQuery, zipTarget, type ZipIndexFile } from "@/lib/places/zips";

const DIR = join(__dirname, "..", "public", "places");
const ZIPS_PATH = join(DIR, "us-zips.json");
const read = <T,>(name: string) => JSON.parse(readFileSync(join(DIR, name), "utf8")) as T;
const PLACES_FILE = read<PlaceIndexFile>("us-places.json");
const DISTRICTS_FILE = read<DistrictIndexFile>("us-districts.json");
const ZIPS_FILE = read<ZipIndexFile>("us-zips.json");
const INDEX = withZips(withDistricts(parsePlaceIndex(PLACES_FILE), DISTRICTS_FILE), ZIPS_FILE);
const ZIPS = INDEX.zips ?? [];

function zip(code: string): PlaceEntry {
  const found = INDEX.byId.get(`z-${code}`);
  if (!found) throw new Error(`no ZIP ${code}`);
  return found;
}

describe("the ZIP file", () => {
  it("has every ZIP in the 50 states and DC, and stays a reasonable size", () => {
    expect(ZIPS.length).toBe(33642);
    expect(ZIPS_FILE.counts.zips).toBe(ZIPS.length);
    expect(statSync(ZIPS_PATH).size).toBeLessThan(700_000);
    expect(ZIP_INDEX_URL).toBe("/places/us-zips.json");
    expect(new Set(ZIPS.map((z) => z.state)).size).toBe(51);
  });

  it("keeps ZIPs out of the name search, so a city search never scans them", () => {
    expect(INDEX.entries.some((e) => e.kind === "zip")).toBe(false);
    expect(searchResults(INDEX, "Encinitas")[0].entry.name).toBe("Encinitas");
  });

  it("lists only San Diego County as a county with checked records", () => {
    expect([...CHECKED_COUNTIES]).toEqual([SD_COUNTY_FIPS]);
    expect(ZIPS_FILE.checkedCounties).toEqual([SD_COUNTY_FIPS]);
  });
});

describe("the 99 percent rule", () => {
  it("maps a ZIP to a place only when that place holds at least 99 percent of its land", () => {
    expect(placeHolding(1000, [{ id: "a", land: 990 }, { id: "b", land: 10 }])).toBe("a");
    expect(placeHolding(1000, [{ id: "a", land: 989 }, { id: "b", land: 11 }])).toBeNull();
    expect(placeHolding(1000, [{ id: "a", land: 500 }])).toBeNull();
    expect(placeHolding(1000, [])).toBeNull();
    expect(placeHolding(0, [{ id: "a", land: 0 }])).toBeNull();
  });

  it("never makes a ZIP a checked record on its own", () => {
    for (const z of ZIPS) expect(resolvePlace(z).checked, z.name).toBe(false);
  });

  it("reaches a checked record only through a place the build found with the 99 percent rule", () => {
    let checked = 0;
    for (const z of ZIPS) {
      const target = zipTarget(INDEX, z);
      if (target.kind !== "place") continue;
      // The build sets the place only through placeHolding, the rule above.
      expect(z.zip?.place, z.name).toBe(target.entry.id);
      if (resolvePlace(target.entry).checked) checked += 1;
    }
    expect(checked).toBe(52);
  });

  it("never adds a chip for a split ZIP in San Diego County, and asks which place instead", () => {
    const sd = ZIPS.filter((z) => z.counties.includes(SD_COUNTY_FIPS));
    expect(sd.length).toBe(116);
    for (const z of sd) {
      const next = pickFor(INDEX, z);
      if (z.zip?.place) expect("add" in next && next.add.id === z.zip.place, z.name).toBe(true);
      else expect("choose" in next, z.name).toBe(true);
    }
  });
});

describe("what a ZIP maps to", () => {
  it("maps 92130 to the City of San Diego, so its checked record applies", () => {
    const next = pickFor(INDEX, zip("92130"));
    expect("add" in next && next.add.id).toBe("p-0666000");
    if (!("add" in next)) throw new Error("92130 should add a place");
    expect(resolvePlace(next.add)).toMatchObject({ localRecord: "city_of_san_diego", checked: true });
  });

  it("asks which place for 92067, split across Rancho Santa Fe, Fairbanks Ranch, the City of San Diego and unincorporated land", () => {
    const next = pickFor(INDEX, zip("92067"));
    if (!("choose" in next)) throw new Error("92067 should ask which place");
    expect(next.choose.map((o) => [o.entry.id, o.unincorporated])).toEqual([
      ["p-0659584", false],
      ["p-0623150", false],
      ["p-0666000", false],
      [`c-${SD_COUNTY_FIPS}`, true],
    ]);
    const labels = next.choose.map((o) => placeLabel(INDEX, o.entry, "en").text);
    expect(labels).toEqual(["Rancho Santa Fe, San Diego County, CA", "Fairbanks Ranch, San Diego County, CA", "San Diego, San Diego County, CA", "San Diego County, CA"]);
  });

  it("asks which place for a ZIP split between checked cities, like 92014 in Del Mar, San Diego and Solana Beach", () => {
    const next = pickFor(INDEX, zip("92014"));
    if (!("choose" in next)) throw new Error("92014 should ask which place");
    expect(next.choose.map((o) => resolvePlace(o.entry).localRecord)).toEqual(["city_of_san_diego", "del_mar", "solana_beach", "unincorporated_san_diego_county"]);
  });

  it("maps a ZIP in another state to that state, with its city when one place holds it", () => {
    const nyc = pickFor(INDEX, zip("10001"));
    if (!("add" in nyc)) throw new Error("10001 should add a place");
    expect(nyc.add.name).toBe("New York");
    expect(resolvePlace(nyc.add)).toMatchObject({ state: "NY", localRecord: null, checked: false });
  });

  it("keeps a split ZIP outside San Diego County as a ZIP that uses its state's law", () => {
    const split = ZIPS.find((z) => z.state === "MT" && !z.zip?.place && !z.zip?.manyStates);
    if (!split) throw new Error("no split Montana ZIP");
    const next = pickFor(INDEX, split);
    expect("add" in next && next.add.id).toBe(split.id);
    expect(resolvePlace(split)).toEqual({ state: "MT", localRecord: null, checked: false, why: "state_only" });
    const where = engineWhere(addPick(NO_PICKS, split).next);
    expect(where).toEqual({ state: "MT", places: [], otherPlaces: true });
    expect(uncheckedName(split, placeLabel(INDEX, split, "en"), "en")).toBe(`ZIP code ${split.name}`);
  });

  it("asks which county for a ZIP split between states", () => {
    const many = ZIPS.find((z) => z.zip?.manyStates);
    if (!many) throw new Error("no ZIP in two states");
    const next = pickFor(INDEX, many);
    if (!("choose" in next)) throw new Error("a ZIP in two states should ask");
    expect(new Set(next.choose.map((o) => o.entry.state)).size).toBeGreaterThan(1);
    expect(next.choose.every((o) => o.entry.kind === "county")).toBe(true);
  });

  it("names Connecticut ZIPs by their state, since the 2020 counties are planning regions now", () => {
    const hartford = zip("06103");
    expect(hartford.state).toBe("CT");
    expect(hartford.counties).toEqual([]);
    expect(placeLabel(INDEX, hartford, "en").text).toBe("06103, ZIP code, CT");
  });
});

describe("searching for a ZIP", () => {
  it("finds a ZIP from its first digits, and the exact ZIP first", () => {
    expect(zipQuery("9213")).toBe("9213");
    expect(zipQuery(" 92130-1234 ")).toBe("92130");
    expect(zipQuery("92a")).toBeNull();
    const some = searchResults(INDEX, "9213");
    expect(some.map((r) => r.entry.name)).toContain("92130");
    expect(some.every((r) => r.entry.name.startsWith("9213"))).toBe(true);
    const exact = searchResults(INDEX, "92130");
    expect(exact).toHaveLength(1);
    expect(exact[0]).toMatchObject({ exact: true });
  });

  it("labels a ZIP as a ZIP code with its county and state, in English and Spanish", () => {
    expect(placeLabel(INDEX, zip("92130"), "en").text).toBe("92130, ZIP code, San Diego County, CA");
    expect(placeLabel(INDEX, zip("92130"), "es").text).toBe("92130, código postal, condado de San Diego, CA");
  });
});

describe("loading the ZIP file", () => {
  afterEach(() => resetSearchIndex());

  const files: Record<string, unknown> = { "/places/us-places.json": PLACES_FILE, "/places/us-districts.json": DISTRICTS_FILE, [ZIP_INDEX_URL]: ZIPS_FILE };

  it("loads ZIPs with the places and districts", async () => {
    resetSearchIndex();
    const index = await loadSearchIndex(async (url) => ({ ok: true, status: 200, json: async () => files[url] }));
    expect(index.zips?.length).toBe(33642);
    expect(index.byId.get("z-92130")?.zip?.place).toBe("p-0666000");
  });

  it("keeps the name search working when the ZIP file fails, and tries it again next time", async () => {
    resetSearchIndex();
    const failing = await loadSearchIndex(async (url) => (url === ZIP_INDEX_URL ? { ok: false, status: 503, json: async () => null } : { ok: true, status: 200, json: async () => files[url] }));
    expect(failing.zips).toBeUndefined();
    expect(searchResults(failing, "Encinitas")[0].entry.name).toBe("Encinitas");
    const again = await loadSearchIndex(async (url) => ({ ok: true, status: 200, json: async () => files[url] }));
    expect(again.zips?.length).toBe(33642);
  });
});

describe("the search box with a ZIP code", () => {
  function call(element: El, name: string, ...args: unknown[]): unknown {
    const handler = element.props[name];
    if (typeof handler !== "function") throw new Error(`No ${name} handler`);
    return (handler as (...a: unknown[]) => unknown)(...args);
  }

  async function typed(text: string) {
    const onPick = vi.fn();
    const m = mount(PlaceSearch, { lang: "en", state: "CA", picks: [], onPick, onRemove: vi.fn(), loadIndex: () => Promise.resolve(INDEX) });
    const input = () => one(m.tree(), (e) => e.type === "input" && e.props.role === "combobox", "combobox");
    m.act(() => call(input(), "onFocus"));
    await m.settle();
    m.act(() => call(input(), "onChange", { target: { value: text } }));
    const options = () => elements(m.tree()).filter((e) => e.props.role === "option");
    return { m, input, options, onPick };
  }

  it("adds the City of San Diego for 92130, after showing it as a ZIP code", async () => {
    const b = await typed("92130");
    expect(textOf(b.options()[0])).toContain("92130");
    expect(textOf(b.options()[0])).toContain("ZIP code, San Diego County, CA");
    b.m.act(() => call(b.options()[0], "onClick"));
    expect(b.onPick).toHaveBeenCalledTimes(1);
    expect((b.onPick.mock.calls[0][0] as PlaceEntry).id).toBe("p-0666000");
  });

  it("adds nothing for 92067, and lists its places and unincorporated parts to pick from", async () => {
    const b = await typed("92067");
    b.m.act(() => call(b.options()[0], "onClick"));
    expect(b.onPick).not.toHaveBeenCalled();
    const group = one(b.m.tree(), (e) => e.props.className === "zip-choice", "ZIP choice");
    expect(textOf(group)).toContain(t("en", "whereZipChoose", { zip: "92067" }));
    const choices = elements(group).filter((e) => e.type === "button" && String(e.props.className).includes("zip-option"));
    expect(choices).toHaveLength(4);
    expect(textOf(choices[3])).toContain("The unincorporated parts");
    expect(textOf(choices[3])).toContain("San Diego County, CA");
    b.m.act(() => call(choices[1], "onClick"));
    expect(b.onPick).toHaveBeenCalledTimes(1);
    expect((b.onPick.mock.calls[0][0] as PlaceEntry).name).toBe("Fairbanks Ranch");
    expect(elements(b.m.tree()).some((e) => e.props.className === "zip-choice")).toBe(false);
  });
});
