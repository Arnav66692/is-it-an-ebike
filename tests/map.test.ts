// The map page's data code: the Overpass query, the parser, the distance sort, the fetch errors
// and the header link to the map.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteNav } from "@/components/SiteHeader";
import { clearSpotCache, fetchSpots, MapFetchError, searchPlaces } from "@/lib/map/fetchSpots";
import {
  boundsKey,
  countSpots,
  distanceMeters,
  formatDistance,
  MAX_RACKS,
  MAX_SHOPS,
  nearestSpots,
  nominatimUrl,
  osmLink,
  overpassBody,
  overpassQuery,
  parseNominatim,
  parseOverpass,
  roundBounds,
  safeWebsite,
  type Spot,
} from "@/lib/map/osm";
import { MAP_TEXT, mapCountLine, mapText } from "@/lib/i18n/map";
import { t } from "@/lib/i18n/ui";

const VIEW = { south: 32.7051, west: -117.1699, north: 32.7249, east: -117.1452 };

describe("Overpass query", () => {
  it("asks for node and way racks with way centers, shops and repair stations in the rounded view", () => {
    const q = overpassQuery(VIEW);
    expect(q).toContain("[out:json]");
    expect(q).toContain("[bbox:32.7,-117.17,32.73,-117.14]");
    expect(q).toContain('node["amenity"="bicycle_parking"]');
    expect(q).toContain('way["amenity"="bicycle_parking"]');
    expect(q).toContain(`.racks out center ${MAX_RACKS};`);
    expect(q).toContain('node["shop"="bicycle"]');
    expect(q).toContain('way["shop"="bicycle"]');
    expect(q).toContain(`.shops out center ${MAX_SHOPS};`);
    expect(q).toContain('node["amenity"="bicycle_repair_station"]');
    expect(q).toMatch(/\[timeout:\d+\]/);
  });

  it("rounds the view out so it is fully covered, and nearby views share one cache key", () => {
    const r = roundBounds(VIEW);
    expect(r.south).toBeLessThanOrEqual(VIEW.south);
    expect(r.west).toBeLessThanOrEqual(VIEW.west);
    expect(r.north).toBeGreaterThanOrEqual(VIEW.north);
    expect(r.east).toBeGreaterThanOrEqual(VIEW.east);
    expect(boundsKey(VIEW)).toBe(boundsKey({ ...VIEW, south: 32.7052, east: -117.1451 }));
    expect(boundsKey(VIEW)).not.toBe(boundsKey({ ...VIEW, north: 32.7349 }));
  });

  it("sends the query as a form body", () => {
    const body = overpassBody(VIEW);
    expect(body.startsWith("data=")).toBe(true);
    expect(decodeURIComponent(body.slice(5))).toBe(overpassQuery(VIEW));
  });
});

const ANSWER = {
  elements: [
    { type: "node", id: 1, lat: 32.715, lon: -117.16, tags: { amenity: "bicycle_parking", capacity: "8", covered: "yes", name: "Library racks" } },
    { type: "way", id: 2, center: { lat: 32.716, lon: -117.161 }, tags: { amenity: "bicycle_parking", capacity: "lots", covered: "no", access: "private" } },
    { type: "node", id: 3, lat: 32.72, lon: -117.15, tags: { shop: "bicycle", name: "Pedal Shop", opening_hours: "Mo-Fr 10:00-18:00", phone: "+1 619 555 0100", website: "pedalshop.example.com" } },
    { type: "way", id: 4, center: { lat: 32.721, lon: -117.151 }, tags: { shop: "bicycle", "contact:website": "javascript:alert(1)", "contact:phone": "619 555 0199" } },
    { type: "node", id: 5, lat: 32.71, lon: -117.155, tags: { amenity: "bicycle_repair_station" } },
    { type: "node", id: 6, lat: 32.711, lon: -117.156 },
    { type: "way", id: 7, tags: { amenity: "bicycle_parking" } },
    { type: "node", id: 8, lat: 32.712, lon: -117.157, tags: { amenity: "bench" } },
    { type: "node", id: 1, lat: 32.715, lon: -117.16, tags: { amenity: "bicycle_parking" } },
  ],
};

describe("Overpass answer", () => {
  const spots = parseOverpass(ANSWER);
  const byId = (id: string) => spots.find((s) => s.id === id) as Spot;

  it("reads node racks and way racks by their center, and skips anything without a kind or a point", () => {
    expect(spots.map((s) => s.id)).toEqual(["node/1", "way/2", "node/3", "way/4", "node/5"]);
    expect(byId("way/2")).toMatchObject({ kind: "rack", lat: 32.716, lon: -117.161 });
    expect(countSpots(spots)).toEqual({ rack: 2, shop: 2, repair: 1 });
  });

  it("reads capacity, covered and access, and leaves a tag that isn't a number blank", () => {
    expect(byId("node/1")).toMatchObject({ name: "Library racks", capacity: 8, covered: true, restricted: false });
    expect(byId("way/2")).toMatchObject({ name: null, capacity: null, covered: false, restricted: true });
  });

  it("reads a shop's hours, phone and website, and drops a website that isn't http", () => {
    expect(byId("node/3")).toMatchObject({ name: "Pedal Shop", hours: "Mo-Fr 10:00-18:00", phone: "+1 619 555 0100", website: "https://pedalshop.example.com/" });
    expect(byId("way/4")).toMatchObject({ name: null, hours: null, phone: "619 555 0199", website: null });
  });

  it("gives a repair station with no tags a blank name and no rack facts", () => {
    expect(byId("node/5")).toMatchObject({ kind: "repair", name: null, capacity: null, covered: null, hours: null });
  });

  it("returns nothing for an answer that isn't an Overpass answer", () => {
    expect(parseOverpass(null)).toEqual([]);
    expect(parseOverpass({})).toEqual([]);
    expect(parseOverpass({ elements: "no" })).toEqual([]);
  });

  it("keeps only plain web links", () => {
    expect(safeWebsite("http://shop.example.com")).toBe("http://shop.example.com/");
    expect(safeWebsite("data:text/html,hi")).toBeNull();
    expect(safeWebsite("localhost")).toBeNull();
    expect(safeWebsite("two words.com")).toBeNull();
    expect(safeWebsite(undefined)).toBeNull();
  });
});

describe("nearest first", () => {
  const center = { lat: 32.715, lon: -117.16 };
  const spots = parseOverpass(ANSWER);

  it("sorts by distance from the map's middle and keeps the limit", () => {
    const near = nearestSpots(spots, center, 3);
    expect(near.map((n) => n.spot.id)).toEqual(["node/1", "way/2", "node/5"]);
    expect(near[0].meters).toBe(0);
    for (let i = 1; i < near.length; i++) expect(near[i].meters).toBeGreaterThanOrEqual(near[i - 1].meters);
    expect(nearestSpots(spots, center, 0)).toEqual([]);
  });

  it("breaks a tie by id, so the list never shuffles", () => {
    const a = { ...spots[0], id: "node/9" };
    const b = { ...spots[0], id: "node/10" };
    expect(nearestSpots([a, b], center, 2).map((n) => n.spot.id)).toEqual(["node/10", "node/9"]);
  });

  it("measures real distances and prints them in feet or miles", () => {
    // One degree of latitude is about 69 miles.
    expect(distanceMeters({ lat: 32, lon: -117 }, { lat: 33, lon: -117 }) / 1609.344).toBeCloseTo(69.1, 0);
    expect(formatDistance(0)).toBe("10 ft");
    expect(formatDistance(100)).toBe("330 ft");
    expect(formatDistance(1609.344 * 0.34)).toBe("0.3 mi");
    expect(formatDistance(1609.344 * 12.4)).toBe("12 mi");
  });
});

describe("links", () => {
  it("opens a spot on openstreetmap.org", () => {
    expect(osmLink({ lat: 32.7, lon: -117.16 })).toBe("https://www.openstreetmap.org/?mlat=32.700000&mlon=-117.160000#map=19/32.700000/-117.160000");
  });

  it("searches Nominatim for US places only, five at most", () => {
    const url = new URL(nominatimUrl("  Encinitas, CA ", "es"));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("countrycodes")).toBe("us");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("q")).toBe("Encinitas, CA");
  });

  it("reads Nominatim places and their boxes", () => {
    const places = parseNominatim([
      { place_id: 7, lat: "33.04", lon: "-117.29", display_name: "Encinitas, San Diego County, California, United States", boundingbox: ["33.00", "33.09", "-117.31", "-117.21"] },
      { lat: "x", lon: "1", display_name: "Bad" },
    ]);
    expect(places).toEqual([{ id: "7", label: "Encinitas, San Diego County, California, United States", lat: 33.04, lon: -117.29, bounds: { south: 33, north: 33.09, west: -117.31, east: -117.21 } }]);
    expect(parseNominatim({})).toEqual([]);
  });
});

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fetching", () => {
  beforeEach(() => clearSpotCache());

  it("posts once per view and answers the same view from memory", async () => {
    const fetcher = vi.fn(async () => reply(200, ANSWER));
    const first = await fetchSpots(VIEW, undefined, fetcher as unknown as typeof fetch);
    const again = await fetchSpots({ ...VIEW, south: 32.7052 }, undefined, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(again).toBe(first);
    expect(first.capped).toBe(false);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect(init.method).toBe("POST");
  });

  it("says the service is busy on a 429 or a full queue, and failed on anything else", async () => {
    for (const status of [429, 504]) {
      clearSpotCache();
      await expect(fetchSpots(VIEW, undefined, (async () => reply(status, {})) as unknown as typeof fetch)).rejects.toMatchObject({ failure: "rate" });
    }
    clearSpotCache();
    await expect(fetchSpots(VIEW, undefined, (async () => reply(400, {})) as unknown as typeof fetch)).rejects.toMatchObject({ failure: "failed" });
    await expect(fetchSpots(VIEW, undefined, (async () => reply(200, { elements: [], remark: "runtime error: Query timed out" })) as unknown as typeof fetch)).rejects.toBeInstanceOf(MapFetchError);
    await expect(fetchSpots(VIEW, undefined, (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).rejects.toMatchObject({ failure: "failed" });
  });

  it("marks a full set of racks as capped", async () => {
    const many = { elements: Array.from({ length: MAX_RACKS }, (_, i) => ({ type: "node", id: i + 1, lat: 32.71, lon: -117.16, tags: { amenity: "bicycle_parking" } })) };
    const answer = await fetchSpots(VIEW, undefined, (async () => reply(200, many)) as unknown as typeof fetch);
    expect(answer.capped).toBe(true);
  });

  it("finds places by name", async () => {
    const fetcher = vi.fn(async () => reply(200, [{ place_id: 1, lat: "30.27", lon: "-97.74", display_name: "Austin, Texas, United States" }]));
    const places = await searchPlaces("Austin", "en", undefined, fetcher as unknown as typeof fetch);
    expect(places.map((p) => p.label)).toEqual(["Austin, Texas, United States"]);
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain("q=Austin");
  });
});

describe("map words", () => {
  it("links the map from the header in English and Spanish", () => {
    const en = renderToStaticMarkup(createElement(SiteNav, { lang: "en", current: "map" }));
    expect(en).toContain('href="/map"');
    expect(en).toContain(`>${t("en", "navMap")}</a>`);
    expect(en).toContain(`<a aria-current="page" href="/map">`);
    const es = renderToStaticMarkup(createElement(SiteNav, { lang: "es", current: "find" }));
    expect(es).toContain('href="/map?lang=es"');
    expect(es).toContain(`>${t("es", "navMap")}</a>`);
    expect(t("en", "navMap")).toBe("Map");
    expect(t("es", "navMap")).toBe("Mapa");
  });

  it("counts what is in view, with the repair stations only when there are some", () => {
    expect(mapCountLine("en", { rack: 38, shop: 4, repair: 0 })).toBe("38 racks, 4 shops in view.");
    expect(mapCountLine("en", { rack: 1, shop: 1, repair: 2 })).toBe("1 rack, 1 shop, 2 repair stations in view.");
    expect(mapCountLine("es", { rack: 1, shop: 3, repair: 1 })).not.toMatch(/\{/);
  });

  it("has every line in both languages, in Arnav's style, with the honest data note and the legal line", () => {
    expect(Object.keys(MAP_TEXT.es).sort()).toEqual(Object.keys(MAP_TEXT.en).sort());
    for (const lang of ["en", "es"] as const) {
      for (const [key, text] of Object.entries(MAP_TEXT[lang])) {
        expect(text, `${lang}.${key}`).not.toBe("");
        expect(text, `${lang}.${key}`).not.toMatch(/[—–;]/);
      }
    }
    expect(mapText("en", "dataNote")).toMatch(/OpenStreetMap volunteers/);
    expect(mapText("en", "dataNote")).toMatch(/private/);
    expect(mapText("en", "privacy")).toMatch(/nothing is stored/);
    expect(t("en", "privacyBody")).toMatch(/map/i);
    expect(t("en", "notLegalAdvice")).toContain("General information, not legal advice.");
  });
});
