// The /api/map route: it checks the bounds, asks the Overpass servers in order until one gives a
// clean answer, and says busy when none does. Every test passes its own fetch, so nothing here
// touches the network.

import { describe, expect, it, vi } from "vitest";
import { roundBounds } from "@/lib/map/osm";
import { GET } from "@/app/api/map/route";
import { CACHE_HIT_HEADERS, fetchOverpass, MAP_USER_AGENT, mapResponse, OVERPASS_ENDPOINTS, parseBoundsParams } from "@/lib/map/overpassServer";

const GOOD = "south=32.94&west=-117.30&north=33.06&east=-117.20";
const ELEMENTS = [{ type: "node", id: 1, lat: 33.0, lon: -117.25, tags: { amenity: "bicycle_parking" } }];
const BOUNDS = { south: 32.94, west: -117.3, north: 33.06, east: -117.2 };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const url = (query: string) => new URL(`http://localhost/api/map?${query}`);
const asFetch = (f: unknown) => f as typeof fetch;

describe("map route bounds", () => {
  it("reads a small US box and rounds it to the grid", () => {
    expect(parseBoundsParams(url(GOOD).searchParams)).toEqual(BOUNDS);
  });

  it("answers 400 for a missing, non-number, flipped or non-US box, without asking Overpass", async () => {
    const bad = [
      "",
      "south=32.94&west=-117.30&north=33.06",
      "south=abc&west=-117.30&north=33.06&east=-117.20",
      "south=32.94&west=-117.30&north=33.06&east=Infinity",
      "south=33.06&west=-117.30&north=32.94&east=-117.20",
      "south=51.50&west=-0.20&north=51.55&east=-0.10",
    ];
    for (const query of bad) {
      const res = await GET(new Request(url(query)));
      expect(res.status, query).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("answers 400 for a box bigger than one zoomed-in view", async () => {
    const res = await GET(new Request(url("south=32.00&west=-118.00&north=33.50&east=-117.00")));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid" });
  });
});

describe("map route fallback", () => {
  it("moves on from a failing first server and answers from the second, with a CDN cache header", async () => {
    const fetcher = vi.fn(async (endpoint: string) => (endpoint === OVERPASS_ENDPOINTS[0] ? json(502, {}) : json(200, { elements: ELEMENTS })));
    const res = await mapResponse(url(GOOD), asFetch(fetcher));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ elements: ELEMENTS });
    expect(res.headers.get("cache-control")).toBe(CACHE_HIT_HEADERS);
    expect(res.headers.get("x-map-source")).toBe("overpass.private.coffee");
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(OVERPASS_ENDPOINTS.slice(0, 2));
  });

  it("sends a form body with a descriptive User-Agent and asks for JSON", async () => {
    const fetcher = vi.fn(async () => json(200, { elements: [] }));
    await fetchOverpass(BOUNDS, asFetch(fetcher));
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe("POST");
    expect(headers["User-Agent"]).toBe(MAP_USER_AGENT);
    expect(headers.Accept).toBe("application/json");
    expect(String(init.body)).toMatch(/^data=/);
  });

  it("treats a network error, a 406, a remark error and a non-Overpass answer as failures, in order", async () => {
    const answers = [
      () => Promise.reject(new TypeError("fetch failed")),
      async () => json(406, {}),
      async () => json(200, { elements: [], remark: "runtime error: Query timed out in \"query\"" }),
      async () => new Response("<html>busy</html>", { status: 200 }),
    ];
    let i = 0;
    const fetcher = vi.fn(() => answers[i++]());
    expect(await fetchOverpass(BOUNDS, asFetch(fetcher))).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(OVERPASS_ENDPOINTS.length);
  });

  it("gives up on a slow server after the per-try wait and tries the next", async () => {
    const fetcher = vi.fn((endpoint: string, init: RequestInit) =>
      endpoint === OVERPASS_ENDPOINTS[0]
        ? new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
        : Promise.resolve(json(200, { elements: ELEMENTS })),
    );
    const hit = await fetchOverpass(BOUNDS, asFetch(fetcher), OVERPASS_ENDPOINTS, 10);
    expect(hit?.endpoint).toBe(OVERPASS_ENDPOINTS[1]);
  });

  it("answers 503 busy with no-store when every server fails", async () => {
    const fetcher = vi.fn(async () => json(504, {}));
    const res = await mapResponse(url(GOOD), asFetch(fetcher));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "busy" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("tries the four servers in the agreed order", () => {
    expect(OVERPASS_ENDPOINTS).toEqual([
      "https://overpass-api.de/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ]);
  });
});

describe("rounding", () => {
  it("leaves a box that is already on the grid alone, so the server keeps the page's box", () => {
    expect(roundBounds(BOUNDS)).toEqual(BOUNDS);
    expect(roundBounds(roundBounds({ south: 32.9412, west: -117.2999, north: 33.0501, east: -117.2001 }))).toEqual(BOUNDS);
  });
});
