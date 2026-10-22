// The saved state files the map reads first (public/map/states/), their parser, the choice of
// files for a view, the repair flag, the fall back to the live route, and a sanity check of the
// data itself. scripts/map/build_states.py writes the files.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSpotCache, clearStateData, fetchSpots } from "@/lib/map/fetchSpots";
import { ALL_KINDS, chipCounts, filterSpots, toggleKind } from "@/lib/map/mapState";
import { countSpots, isBusiness, parseOverpass, showsAs, type Spot } from "@/lib/map/osm";
import { chooseAreas, parseStateFile, parseStateIndex, type StateIndex } from "@/lib/map/stateData";

const PUBLIC = join(process.cwd(), "public");
const INDEX_JSON = JSON.parse(readFileSync(join(PUBLIC, "map/states/index.json"), "utf8"));
const INDEX = parseStateIndex(INDEX_JSON) as StateIndex;
const US_CODES =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" ");

const CARMEL_VALLEY = { south: 32.9, west: -117.27, north: 32.98, east: -117.18 };
const DOWNTOWN_SD = { south: 32.7, west: -117.17, north: 32.73, east: -117.14 };
const AUSTIN = { south: 30.26, west: -97.75, north: 30.28, east: -97.73 };

/** Serves files from public/ the way the site would, and refuses anything else. */
const diskFetch = vi.fn(async (url: string | URL | Request) => {
  const path = join(PUBLIC, String(url));
  if (!String(url).startsWith("/map/") || !existsSync(path)) return new Response("", { status: 404 });
  return new Response(readFileSync(path, "utf8"));
}) as unknown as typeof fetch;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const box = (south: number, west: number, north: number, east: number) => ({ south, west, north, east });
const TEST_INDEX: StateIndex = {
  areas: [
    { id: "AA", state: "AA", bounds: box(10, 10, 20, 20), file: "AA.json" },
    { id: "BB", state: "BB", bounds: box(10, 19, 20, 30), file: "BB.json" },
  ],
  missing: [{ id: "CC", bounds: box(30, 10, 40, 20) }],
};

describe("compact state files", () => {
  it("reads racks with capacity, cover and access, and places with their kind, facts and source", () => {
    const spots = parseStateFile(
      {
        r: [
          [32.1, -117.1, 6, 1],
          [32.2, -117.2, 0, 6],
        ],
        p: [
          { k: "s", y: 32.3, x: -117.3, n: "Spoke Shop", a: "1 Main St, Del Mar", p: "(858) 555-0100", w: "https://spoke.example", f: 1, s: "ov" },
          { k: "r", y: 32.4, x: -117.4, n: "Fix It", s: "v" },
          { k: "st", y: 32.5, x: -117.5, s: "o" },
        ],
      },
      "CA",
    );
    expect(spots.map((s) => s.id)).toEqual(["CA/r0", "CA/r1", "CA/p0", "CA/p1", "CA/p2"]);
    expect(spots[0]).toMatchObject({ kind: "rack", capacity: 6, covered: true, restricted: false });
    expect(spots[1]).toMatchObject({ kind: "rack", capacity: null, covered: false, restricted: true });
    expect(spots[2]).toMatchObject({ kind: "shop", name: "Spoke Shop", address: "1 Main St, Del Mar", phone: "(858) 555-0100", website: "https://spoke.example/", repairs: true, source: "both" });
    expect(spots[3]).toMatchObject({ kind: "repair", stand: false, repairs: false, source: "overture" });
    expect(spots[4]).toMatchObject({ kind: "repair", stand: true, name: null, source: "osm" });
    expect(spots.map(isBusiness)).toEqual([false, false, true, true, false]);
  });

  it("skips rows without a point or a kind, and drops a link that isn't plain http", () => {
    const spots = parseStateFile({ r: [[null, 1], "x", [1, 2]], p: [{ k: "zz", y: 1, x: 1 }, { k: "s", y: 1 }, { k: "s", y: 1, x: 2, w: "javascript:alert(1)" }] }, "T");
    expect(spots).toHaveLength(2);
    expect(spots[1].website).toBeNull();
    expect(parseStateFile(null, "T")).toEqual([]);
    expect(parseStateFile({ elements: [] }, "T")).toEqual([]);
  });

  it("reads the index and skips a row with no box or a file name that could leave the folder", () => {
    const index = parseStateIndex({
      areas: [
        { id: "OK", bbox: [1, 2, 3, 4], file: "OK.json" },
        { id: "BAD", bbox: [1, 2, 3, 4], file: "../secret.json" },
        { id: "NOBOX", file: "NOBOX.json" },
      ],
      missing: [{ id: "TX", bbox: [25, -107, 37, -93] }, { id: "X" }],
    });
    expect(index?.areas.map((a) => a.id)).toEqual(["OK"]);
    expect(index?.missing.map((m) => m.id)).toEqual(["TX"]);
    expect(parseStateIndex({ nope: true })).toBeNull();
  });
});

describe("choosing files for a view", () => {
  it("loads every saved area the view touches when its middle is in a saved area", () => {
    expect(chooseAreas(TEST_INDEX, box(14, 14, 16, 16)).areas.map((a) => a.id)).toEqual(["AA"]);
    const border = chooseAreas(TEST_INDEX, box(14, 18.5, 16, 19.8));
    expect(border).toEqual({ areas: TEST_INDEX.areas, live: false });
  });

  it("goes live in a state with no saved file, and out at sea only when nothing is saved there", () => {
    expect(chooseAreas(TEST_INDEX, box(34, 14, 36, 16))).toEqual({ areas: [], live: true });
    expect(chooseAreas(TEST_INDEX, box(50, 50, 51, 51))).toEqual({ areas: [], live: true });
    expect(chooseAreas(TEST_INDEX, box(19, 5, 21, 11)).live).toBe(false);
  });
});

describe("the repair flag", () => {
  const shopThatRepairs: Spot = { id: "a", kind: "shop", lat: 1, lon: 1, name: "A", capacity: null, covered: null, restricted: false, hours: null, phone: null, website: null, repairs: true };
  const plainShop: Spot = { ...shopThatRepairs, id: "b", repairs: false };
  const stand: Spot = { ...plainShop, id: "c", kind: "repair", stand: true };

  it("shows a shop that repairs under Repair as well as Bike shops", () => {
    expect(showsAs(shopThatRepairs, "repair")).toBe(true);
    expect(showsAs(plainShop, "repair")).toBe(false);
    const repairOnly = toggleKind(toggleKind(ALL_KINDS, "rack"), "shop");
    expect(filterSpots([shopThatRepairs, plainShop, stand], repairOnly).map((s) => s.id)).toEqual(["a", "c"]);
    expect(chipCounts([shopThatRepairs, plainShop, stand], ALL_KINDS, true).map((c) => c.count)).toEqual([0, 2, 2]);
  });
});

describe("falling back to the live route", () => {
  beforeEach(() => {
    clearSpotCache();
    clearStateData();
  });

  const index = { areas: [{ id: "AA", state: "AA", bbox: [10, 10, 20, 20], file: "AA.json" }], missing: [{ id: "CC", bbox: [30, 10, 40, 20] }] };
  const file = { r: [[15, 15, 2, 0]], p: [{ k: "s", y: 15.001, x: 15.001, n: "Shop", s: "v" }] };
  const live = { elements: [{ type: "node", id: 1, lat: 35, lon: 15, tags: { shop: "bicycle" } }] };

  function fetcherWith(files: Record<string, unknown>) {
    return vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("/api/map")) return reply(200, live);
      return u in files ? reply(200, files[u]) : reply(404, {});
    });
  }

  it("answers from a saved file once, and never asks the live route there", async () => {
    const fetcher = fetcherWith({ "/map/states/index.json": index, "/map/states/AA.json": file });
    const a = await fetchSpots(box(14, 14, 16, 16), undefined, fetcher as unknown as typeof fetch);
    const b = await fetchSpots(box(14.5, 14.5, 15.5, 15.5), undefined, fetcher as unknown as typeof fetch);
    expect(countSpots(a.spots)).toEqual({ rack: 1, shop: 1, repair: 0 });
    expect(b.spots).toHaveLength(2);
    expect(fetcher.mock.calls.map((c) => String(c[0]))).toEqual(["/map/states/index.json", "/map/states/AA.json"]);
  });

  it("asks the live route in a state with no file, when a file is missing, or when the index is", async () => {
    const missingState = fetcherWith({ "/map/states/index.json": index });
    expect((await fetchSpots(box(34, 14, 36, 16), undefined, missingState as unknown as typeof fetch)).spots[0].source).toBeUndefined();
    expect(missingState.mock.calls.some((c) => String(c[0]).startsWith("/api/map"))).toBe(true);

    clearStateData();
    const missingFile = fetcherWith({ "/map/states/index.json": index });
    await fetchSpots(box(14, 14, 16, 16), undefined, missingFile as unknown as typeof fetch);
    expect(missingFile.mock.calls.map((c) => String(c[0]).split("?")[0])).toEqual(["/map/states/index.json", "/map/states/AA.json", "/api/map"]);

    clearStateData();
    clearSpotCache();
    const noIndex = fetcherWith({});
    expect((await fetchSpots(box(14, 14, 16, 16), undefined, noIndex as unknown as typeof fetch)).spots).toHaveLength(1);
  });
});

describe("the saved data", () => {
  beforeEach(() => {
    clearSpotCache();
    clearStateData();
  });

  it("lists every state, DC and Puerto Rico as a saved area or as missing, and every listed file is there", () => {
    const listed = new Set([...INDEX.areas.map((a) => a.state), ...INDEX.missing.map((m) => m.id)]);
    expect([...listed].sort()).toEqual([...US_CODES].sort());
    expect(INDEX.areas.length).toBeGreaterThan(0);
    for (const area of INDEX_JSON.areas) {
      const text = readFileSync(join(PUBLIC, "map/states", area.file), "utf8");
      expect(text.length, area.file).toBeLessThan(3_000_000);
      const counts = countSpots(parseStateFile(JSON.parse(text), area.id));
      expect(counts, area.id).toEqual({ rack: area.counts.rack, shop: area.counts.shop, repair: area.counts.repair });
    }
    expect(INDEX_JSON.about).toContain("ODbL");
    expect(INDEX_JSON.about).toContain("CDLA Permissive 2.0");
  });

  it("shows bike shops in Carmel Valley and downtown San Diego from the saved files alone", async () => {
    for (const view of [CARMEL_VALLEY, DOWNTOWN_SD]) {
      const answer = await fetchSpots(view, undefined, diskFetch);
      expect(countSpots(answer.spots).shop).toBeGreaterThanOrEqual(3);
      expect(answer.spots.some((s) => s.source !== "osm" && s.kind === "shop" && s.address)).toBe(true);
    }
    expect((diskFetch as unknown as ReturnType<typeof vi.fn>).mock.calls.every((c) => !String(c[0]).startsWith("/api/"))).toBe(true);
  });

  it("has more California shops than OpenStreetMap alone, and keeps every OpenStreetMap rack", () => {
    const osmOnly = countSpots(parseOverpass(JSON.parse(readFileSync(join(PUBLIC, "map/san-diego.json"), "utf8"))));
    const ca = INDEX_JSON.areas.filter((a: { state: string }) => a.state === "CA");
    const sum = (k: string) => ca.reduce((n: number, a: { counts: Record<string, number> }) => n + a.counts[k], 0);
    expect(sum("shop")).toBeGreaterThan(osmOnly.shop * 2);
    expect(sum("rack")).toBeGreaterThanOrEqual(osmOnly.rack);
    expect(sum("both")).toBeGreaterThan(0);
  });

  it("lists a shop seen in both sources once", () => {
    for (const area of INDEX_JSON.areas) {
      const places = parseStateFile(JSON.parse(readFileSync(join(PUBLIC, "map/states", area.file), "utf8")), area.id).filter(isBusiness);
      const key = (s: Spot) => (s.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      for (let i = 0; i < places.length; i += 1) {
        for (let j = i + 1; j < places.length; j += 1) {
          const a = places[i];
          const b = places[j];
          const near = Math.abs(a.lat - b.lat) < 0.0007 && Math.abs(a.lon - b.lon) < 0.0008;
          expect(near && key(a) !== "" && key(a) === key(b), `${a.name} twice in ${area.id}`).toBe(false);
        }
      }
    }
  });

  it("asks the live route for a view in a state with no saved file yet", async () => {
    const austinSaved = INDEX.areas.some((a) => a.state === "TX");
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("/api/map")) return reply(200, { elements: [] });
      return diskFetch(u);
    });
    await fetchSpots(AUSTIN, undefined, fetcher as unknown as typeof fetch);
    expect(fetcher.mock.calls.some((c) => String(c[0]).startsWith("/api/map"))).toBe(!austinSaved);
  });
});
