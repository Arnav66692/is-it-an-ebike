// A place search fits the whole place on the map, so a state, county, city, ZIP code or town shows
// the racks and shops in it. Before Oct 23, 2026, every place wider than a few blocks landed at
// zoom 14 on its middle point, so "New Jersey" showed a 6 km patch of farmland and the page said
// nothing was mapped there. The places below are Nominatim's real answers from that day.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { clearSpotCache, clearStateData, fetchSpots, MapFetchError, tooWideForLive } from "@/lib/map/fetchSpots";
import { AREA_START, areaReducer, canSearchArea, grownBounds } from "@/lib/map/mapState";
import {
  boundsAround,
  countSpots,
  fitView,
  inBounds,
  PLACE_MAX_ZOOM,
  PLACE_ZOOM,
  placeTarget,
  SAVED_DATA_ZOOM,
  US_CENTER,
  US_ZOOM,
  type Bounds,
  type FoundPlace,
  type MapSize,
} from "@/lib/map/osm";

const PUBLIC = join(process.cwd(), "public");
type IndexRow = { id: string; state: string; bbox: number[]; file: string; counts: Record<string, number> };
const AREAS = (JSON.parse(readFileSync(join(PUBLIC, "map/states/index.json"), "utf8")) as { areas: IndexRow[] }).areas;

/** Every request that isn't a saved file, such as /api/map. None should happen in a US view. */
const otherCalls: string[] = [];

/** Serves files from public/ the way the site would, and answers anything else as busy. */
const diskFetch = (async (url: string | URL | Request) => {
  const u = String(url);
  if (!u.startsWith("/map/")) {
    otherCalls.push(u);
    return new Response("", { status: 503 });
  }
  const path = join(PUBLIC, u);
  return existsSync(path) ? new Response(readFileSync(path, "utf8")) : new Response("", { status: 404 });
}) as typeof fetch;

/** About the map's size on a laptop and on a phone, in pixels. */
const DESKTOP: MapSize = { x: 800, y: 480 };
const PHONE: MapSize = { x: 343, y: 420 };
const SIZES = [DESKTOP, PHONE];

/** A Nominatim answer: its point, and its box in Nominatim's order (south, north, west, east). */
function nominatim(label: string, lat: number, lon: number, [south, north, west, east]: [number, number, number, number]): FoundPlace {
  return { id: label, label, lat, lon, bounds: { south, west, north, east } };
}

const NEW_JERSEY = nominatim("New Jersey", 40.0757, -74.4042, [38.7911, 41.3573, -75.5634, -73.8936]);
const TEXAS = nominatim("Texas", 31.2639, -98.5456, [25.8371, 36.5005, -106.6458, -93.5078]);
const WYOMING = nominatim("Wyoming", 43.17, -107.5685, [40.9948, 45.0058, -111.0553, -104.0523]);
const CALIFORNIA = nominatim("California", 36.7015, -118.756, [32.5295, 42.0095, -124.482, -114.1308]);
const ALASKA = nominatim("Alaska", 64.446, -149.6809, [51.007, 71.589, -180, 180]);
const PUERTO_RICO = nominatim("Puerto Rico", 18.2248, -66.4858, [17.7307, 18.6664, -68.1109, -65.1101]);
const SAN_JUAN = nominatim("San Juan, Puerto Rico", 18.3842, -66.0534, [18.2965, 18.472, -66.1251, -65.9914]);
const ZIP_08540 = nominatim("08540, Princeton", 40.3573, -74.6603, [40.132, 40.5825, -74.9547, -74.3659]);
const COOK_COUNTY = nominatim("Cook County, Illinois", 41.8197, -87.7565, [41.4697, 42.1543, -88.2636, -87.1105]);
const JACKSON = nominatim("Jackson, Wyoming", 43.48, -110.7618, [43.4582, 43.4905, -110.8134, -110.7376]);

function contains(outer: Bounds, inner: Bounds): boolean {
  return inner.south >= outer.south && inner.north <= outer.north && inner.west >= outer.west && inner.east <= outer.east;
}

/** Counted straight from the raw saved files, sharing no code with the page: racks and places inside a view. */
function savedInside(view: Bounds): { racks: number; places: number } {
  let racks = 0;
  let places = 0;
  for (const area of AREAS) {
    const raw = JSON.parse(readFileSync(join(PUBLIC, "map/states", area.file), "utf8")) as { r: number[][]; p: { y: number; x: number }[] };
    racks += raw.r.filter(([lat, lon]) => lat >= view.south && lat <= view.north && lon >= view.west && lon <= view.east).length;
    places += raw.p.filter((p) => p.y >= view.south && p.y <= view.north && p.x >= view.west && p.x <= view.east).length;
  }
  return { racks, places };
}

/** What the page does for a place pick: fit it, rest there, search that view, and read the answer. */
async function pick(place: FoundPlace, size: MapSize) {
  const to = placeTarget(place);
  const landed = to.bounds ? fitView(to.bounds, size) : { center: to.center, zoom: to.zoom };
  const view = { bounds: boundsAround(landed.center, landed.zoom, size), zoom: landed.zoom };
  const area = areaReducer(areaReducer(AREA_START, { type: "autoNext" }), { type: "view", view });
  expect(area.searched, `${place.label} searches by itself`).toEqual(view.bounds);
  const answer = await fetchSpots(view.bounds, undefined, diskFetch);
  return { view, answer, counts: countSpots(answer.spots) };
}

beforeEach(() => {
  clearSpotCache();
  clearStateData();
  otherCalls.length = 0;
});

describe("where a place search lands", () => {
  it("fits a place's whole box, and centers on its point when the box wraps the date line", () => {
    expect(placeTarget(NEW_JERSEY).bounds).toEqual(NEW_JERSEY.bounds);
    expect(placeTarget(ALASKA)).toEqual({ center: { lat: 64.446, lon: -149.6809 }, zoom: SAVED_DATA_ZOOM, bounds: null });
    expect(placeTarget({ ...NEW_JERSEY, bounds: null })).toEqual({ center: { lat: 40.0757, lon: -74.4042 }, zoom: PLACE_ZOOM, bounds: null });
  });

  it("puts the whole box on screen, from a state down to a town, on a laptop and a phone", () => {
    for (const place of [NEW_JERSEY, TEXAS, WYOMING, CALIFORNIA, PUERTO_RICO, SAN_JUAN, ZIP_08540, COOK_COUNTY, JACKSON]) {
      for (const size of SIZES) {
        const fit = fitView(place.bounds as Bounds, size);
        expect(contains(boundsAround(fit.center, fit.zoom, size), place.bounds as Bounds), `${place.label} at ${size.x}px`).toBe(true);
      }
    }
  });

  it("never goes past street level for a tiny box, or farther out than the saved data zoom for a huge one", () => {
    expect(fitView({ south: 40.35, west: -74.66, north: 40.3501, east: -74.6599 }, DESKTOP).zoom).toBe(PLACE_MAX_ZOOM);
    expect(fitView({ south: -80, west: -179, north: 80, east: 179 }, DESKTOP).zoom).toBe(SAVED_DATA_ZOOM);
  });

  it("grows a box by a share of its size on every side", () => {
    expect(grownBounds({ south: 10, west: 20, north: 12, east: 24 }, 0.5)).toEqual({ south: 9, west: 18, north: 13, east: 26 });
  });
});

describe("a place search shows what is saved there", () => {
  it("shows every rack saved for New Jersey, Texas, Wyoming and California, with no cap and no live call", async () => {
    const cases: [FoundPlace, string[]][] = [
      [NEW_JERSEY, ["NJ"]],
      [TEXAS, ["TX"]],
      [WYOMING, ["WY"]],
      [CALIFORNIA, ["CA", "CA-sd"]],
    ];
    for (const [place, ids] of cases) {
      for (const size of SIZES) {
        const { answer } = await pick(place, size);
        expect(answer.capped, place.label).toBe(false);
        for (const id of ids) {
          const saved = AREAS.find((a) => a.id === id)?.counts.rack ?? -1;
          const shown = answer.spots.filter((s) => s.kind === "rack" && s.id.startsWith(`${id}/`)).length;
          expect(shown, `${id} racks at ${size.x}px`).toBe(saved);
        }
      }
    }
    expect(otherCalls).toEqual([]);
  });

  it("shows exactly the saved racks and places in view for a county, a ZIP code, a city and a small town", async () => {
    for (const place of [COOK_COUNTY, ZIP_08540, SAN_JUAN, PUERTO_RICO, JACKSON]) {
      for (const size of SIZES) {
        const { view, counts } = await pick(place, size);
        const raw = savedInside(view.bounds);
        expect(counts.rack, `${place.label} racks at ${size.x}px`).toBe(raw.racks);
        expect(counts.shop + counts.repair, `${place.label} places at ${size.x}px`).toBe(raw.places);
      }
    }
    for (const place of [COOK_COUNTY, ZIP_08540, SAN_JUAN, PUERTO_RICO]) {
      const { counts } = await pick(place, PHONE);
      expect(counts.rack, place.label).toBeGreaterThan(0);
      expect(counts.shop, place.label).toBeGreaterThan(0);
    }
    expect(otherCalls).toEqual([]);
  });

  it("shows Alaska around its own point, with Anchorage and Fairbanks on screen", async () => {
    const anchorage = { lat: 61.2176, lon: -149.8997 };
    const fairbanks = { lat: 64.8378, lon: -147.7164 };
    for (const size of SIZES) {
      const { view, counts } = await pick(ALASKA, size);
      expect(view.zoom).toBe(SAVED_DATA_ZOOM);
      expect(inBounds(anchorage, view.bounds) && inBounds(fairbanks, view.bounds), `${size.x}px`).toBe(true);
      expect(counts.rack, `${size.x}px`).toBeGreaterThan(0);
      expect(counts.shop, `${size.x}px`).toBeGreaterThan(0);
    }
  });

  it("shows racks and shops for a search of every state, DC and Puerto Rico, on a laptop and a phone", async () => {
    for (const code of [...new Set(AREAS.map((a) => a.state))]) {
      const own = AREAS.filter((a) => a.state === code).map((a) => a.bbox);
      const box = {
        south: Math.min(...own.map((b) => b[0])),
        west: Math.min(...own.map((b) => b[1])),
        north: Math.max(...own.map((b) => b[2])),
        east: Math.max(...own.map((b) => b[3])),
      };
      const place: FoundPlace = { id: code, label: code, lat: (box.south + box.north) / 2, lon: (box.west + box.east) / 2, bounds: box };
      for (const size of SIZES) {
        const { counts } = await pick(place, size);
        expect(counts.rack, `${code} racks at ${size.x}px`).toBeGreaterThan(0);
        expect(counts.shop + counts.repair, `${code} shops at ${size.x}px`).toBeGreaterThan(0);
      }
    }
    expect(otherCalls).toEqual([]);
  }, 60_000);
});

describe("when the map loads data", () => {
  it("loads nothing when the page opens on the whole country", () => {
    const view = { bounds: boundsAround(US_CENTER, US_ZOOM, DESKTOP), zoom: US_ZOOM };
    expect(areaReducer(AREA_START, { type: "view", view })).toBe(AREA_START);
  });

  it("offers Search this area at a state's zoom, but not farther out than the saved data zoom", () => {
    const nj = { bounds: boundsAround({ lat: 40.07, lon: -74.4 }, 7, DESKTOP), zoom: 7 };
    const first = areaReducer(areaReducer(AREA_START, { type: "autoNext" }), { type: "view", view: nj });
    const pennsylvania = { bounds: boundsAround({ lat: 40.9, lon: -77.8 }, 7, DESKTOP), zoom: 7 };
    expect(canSearchArea(first, pennsylvania, false)).toBe(true);
    expect(areaReducer(first, { type: "search", view: pennsylvania }).searched).toEqual(pennsylvania.bounds);
    const wider = { bounds: boundsAround(US_CENTER, SAVED_DATA_ZOOM - 1, DESKTOP), zoom: SAVED_DATA_ZOOM - 1 };
    expect(canSearchArea(first, wider, false)).toBe(false);
    expect(areaReducer(first, { type: "search", view: wider })).toBe(first);
  });

  it("says zoom in for a wide view outside the saved states, instead of asking the live route, which refuses it", async () => {
    const mexico = { south: 20, west: -100, north: 22, east: -98 };
    expect(tooWideForLive(mexico)).toBe(true);
    expect(tooWideForLive({ south: 20, west: -100, north: 20.2, east: -99.8 })).toBe(false);
    const err = await fetchSpots(mexico, undefined, diskFetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MapFetchError);
    expect((err as MapFetchError).failure).toBe("zoom");
    expect(otherCalls).toEqual([]);
  });
});
