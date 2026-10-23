// The server side of the legal route check (app/api/route and lib/route): reading the router's
// line, the edge classifier, the tag and Census parsers, the one-at-a-time line to Valhalla, and
// the whole pipeline on answers recorded from the real servers on 2026-10-23 (tests/fixtures/route).
// Every test passes its own fetch, so nothing here touches the network. To keep the files small,
// the Valhalla route fixtures leave out the turn-by-turn text, and the TIGERweb outlines are
// thinned away from the route (every vertex within about 3 km of it is kept as sent). Everything
// else is the answer as the server sent it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as routeModule from "@/app/api/route/route";
import { boxContains, boxNear, decodePolyline, distanceToRingsMeters, haversineMeters, inUnitedStates, midpointAlong, pointInRings, ringsBox, simplifyPolyline, type Ring } from "@/lib/route/geo";
import { MAX_TAG_WAYS, parseTagsTsv, tagsBody, tagsQuery } from "@/lib/route/osmTags";
import {
  buildRoutePlan,
  buildSegments,
  classifyEdge as classifyFromPlan,
  clearPlanCache,
  createGate,
  GATE_FULL,
  MAX_AVOID_POINTS,
  MAX_ROUTE_METERS,
  parseRouteRequest,
  ROUTE_USER_AGENT,
  routeResponse,
  type Clock,
  type PlanResult,
} from "@/lib/route/plan";
import {
  BOUNDARY_SLACK_M,
  esriGeometry,
  LAYER_ORDER,
  makeLocator,
  NOWHERE,
  parseTigerLayer,
  stateFromFips,
  TIGER_LAYERS,
  TIGER_MAX_POINTS,
  tigerBody,
  toJurisdiction,
  uniqueAreas,
  type Area,
  type TigerLayer,
  type Where,
} from "@/lib/route/tiger";
import type { PostedTags, RoutePlan, RoutePoint, RouteRequest, WayKind } from "@/lib/route/types";
import {
  classifyEdge,
  heightBody,
  isNoRoute,
  MIN_RISE_M,
  parseEdges,
  parseHeights,
  parseRoute,
  routeBody,
  totalClimbMeters,
  traceBody,
  VALHALLA_PATHS,
  VALHALLA_URL,
  type ValhallaEdge,
} from "@/lib/route/valhalla";

const FIXTURES = fileURLToPath(new URL("./fixtures/route/", import.meta.url));
const text = (file: string): string => readFileSync(FIXTURES + file, "utf8");
const fixture = (file: string): unknown => JSON.parse(text(file));
const asFetch = (f: unknown) => f as typeof fetch;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Sample = "mission" | "delmar";

// Del Mar Heights Rd at El Camino Real to Canyon Crest Academy, and Belmont Park to Crystal Pier
// by way of the Ocean Front Walk boardwalk.
const ASKED: Record<Sample, RouteRequest> = {
  delmar: { from: { lat: 32.9474, lon: -117.2385 }, to: { lat: 32.9572, lon: -117.1893 } },
  mission: { from: { lat: 32.7712, lon: -117.2517 }, to: { lat: 32.7967, lon: -117.2557 } },
};

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** The number as the encoded-line format writes it. Written here on its own so the decoder is checked against a second implementation. */
function encodeNumber(n: number): string {
  let rest = n < 0 ? ~(n << 1) : n << 1;
  let out = "";
  while (rest >= 0x20) {
    out += String.fromCharCode((0x20 | (rest & 0x1f)) + 63);
    rest >>= 5;
  }
  return out + String.fromCharCode(rest + 63);
}

function encodePolyline(points: readonly RoutePoint[], precision = 6): string {
  const factor = 10 ** precision;
  let lat = 0;
  let lon = 0;
  let out = "";
  for (const p of points) {
    const nextLat = Math.round(p.lat * factor);
    const nextLon = Math.round(p.lon * factor);
    out += encodeNumber(nextLat - lat) + encodeNumber(nextLon - lon);
    lat = nextLat;
    lon = nextLon;
  }
  return out;
}

interface Call {
  url: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal | null;
}

type Override = (call: Call) => Response | Promise<Response> | undefined;

const TIGER_PREFIX = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/";
const url = {
  route: VALHALLA_URL + VALHALLA_PATHS.route,
  trace: VALHALLA_URL + VALHALLA_PATHS.trace,
  height: VALHALLA_URL + VALHALLA_PATHS.height,
  qlever: "https://qlever.dev/api/osm-planet",
};

const reply = (body: string, status = 200): Response => new Response(body, { status });

/** A server that never answers but gives up when asked to, like a real fetch with a timeout. */
const hang: Override = (call) =>
  new Promise<Response>((_, reject) => call.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

/** Answers every server from the recorded files. An override may answer a call itself, and returns undefined to let the file answer. */
function fixtureFetcher(sample: Sample, override?: Override) {
  const tiger = fixture(`tiger-${sample}.json`) as { line: Record<string, unknown>; end: Record<string, unknown> };
  const calls: Call[] = [];
  const fetcher = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const call: Call = { url: String(input), headers: (init.headers ?? {}) as Record<string, string>, body: String(init.body ?? ""), signal: init.signal ?? null };
    calls.push(call);
    const custom = override?.(call);
    if (custom) return custom;
    if (call.url === url.route) return reply(text(`route-${sample}.json`));
    if (call.url === url.trace) return reply(text(`trace-${sample}.json`));
    if (call.url === url.height) return reply(text(`height-${sample}.json`));
    if (call.url === url.qlever) return reply(text(`qlever-${sample}.tsv`));
    if (call.url.startsWith(TIGER_PREFIX)) {
      const layer = call.url.slice(TIGER_PREFIX.length).replace(/\/query$/, "");
      const which = new URLSearchParams(call.body).get("geometryType") === "esriGeometryPoint" ? "end" : "line";
      return reply(JSON.stringify(tiger[which][layer]));
    }
    return reply("not found", 404);
  };
  return { fetcher: asFetch(fetcher), calls };
}

/** Options that let a test run the pipeline with no wait between calls to Valhalla. */
const quick = { gate: createGate({ gapMs: 0 }) };

async function planFor(sample: Sample, override?: Override, limits?: Partial<Record<"routeMs" | "traceMs" | "heightMs" | "tagsMs" | "boundariesMs", number>>) {
  const { fetcher, calls } = fixtureFetcher(sample, override);
  const result = await buildRoutePlan(ASKED[sample], fetcher, { gate: createGate({ gapMs: 0 }), limits });
  return { result, calls };
}

function planOf(result: PlanResult): RoutePlan {
  if (!result.ok) throw new Error(`expected a plan, got ${result.error}`);
  return result.plan;
}

function edge(over: Partial<ValhallaEdge> = {}): ValhallaEdge {
  return { use: "road", cycleLane: "none", roadClass: "primary", surface: "paved_smooth", names: [], meters: 10, wayId: 1, from: 0, to: 1, ...over };
}

/** n points a thousandth of a degree of longitude apart, so edges between them are about 94 m. */
function line(n: number): RoutePoint[] {
  return Array.from({ length: n }, (_, i) => ({ lat: 32.7, lon: -117.3 + i * 0.001 }));
}

function rectangle(west: number, south: number, east: number, north: number): Ring {
  return [
    [west, south],
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

function area(layer: Area["layer"], geoid: string, name: string, state: string | null, ...rings: Ring[]): Area {
  return { layer, geoid, name, state, rings, box: ringsBox(rings) };
}

beforeEach(() => clearPlanCache());
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------------------------
// geo.ts
// ---------------------------------------------------------------------------------------------

describe("decoding the router's line", () => {
  it("reads the example in Google's polyline documentation, which has 5 decimals", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5)).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
  });

  it("reads the Mission Beach route Valhalla sent, which has 6 decimals, from Belmont Park north", () => {
    const route = fixture("route-mission.json") as { trip: { legs: { shape: string }[] } };
    const points = decodePolyline(route.trip.legs[0].shape);
    expect(points).toHaveLength(128);
    expect(points?.[0]).toEqual({ lat: 32.771206, lon: -117.251486 });
    expect(points?.[127]).toEqual({ lat: 32.796732, lon: -117.255544 });
  });

  it("round-trips points west of Greenwich and south of the equator", () => {
    const points = [
      { lat: 32.771206, lon: -117.251486 },
      { lat: -33.8688, lon: 151.2093 },
      { lat: 0, lon: 0 },
      { lat: 61.2181, lon: -149.9003 },
    ];
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });

  it("reads nothing as no points", () => {
    expect(decodePolyline("")).toEqual([]);
  });

  it("returns null when the text is cut short, so a half-sent answer is not drawn", () => {
    const whole = encodePolyline([{ lat: 32.7, lon: -117.2 }, { lat: 32.8, lon: -117.3 }]);
    expect(decodePolyline(whole.slice(0, -1))).toBeNull();
    expect(decodePolyline(whole.slice(0, 3))).toBeNull();
  });

  it("returns null for a character the format doesn't use, and for a number that never ends", () => {
    const whole = encodePolyline([{ lat: 32.7, lon: -117.2 }]);
    expect(decodePolyline(` ${whole.slice(1)}`)).toBeNull();
    expect(decodePolyline(`${whole.slice(0, 2)}\u007f${whole.slice(3)}`)).toBeNull();
    expect(decodePolyline("~~~~~~~~~~~~~~")).toBeNull();
  });

  it("returns null for a point that is off the map, and accepts the poles and the date line", () => {
    expect(decodePolyline(encodePolyline([{ lat: 91, lon: 0 }]))).toBeNull();
    expect(decodePolyline(encodePolyline([{ lat: 0, lon: 181 }]))).toBeNull();
    expect(decodePolyline(encodePolyline([{ lat: 90, lon: -180 }]))).toEqual([{ lat: 90, lon: -180 }]);
  });
});

describe("distance and the middle of a line", () => {
  it("measures a degree of latitude as 111.2 km and the same point as 0", () => {
    expect(haversineMeters({ lat: 10, lon: 20 }, { lat: 10, lon: 20 })).toBe(0);
    expect(haversineMeters({ lat: 32, lon: -117 }, { lat: 33, lon: -117 })).toBeCloseTo(111195.08, 0);
  });

  it("is the same both ways, and shrinks a degree of longitude by the cosine of the latitude", () => {
    const a = { lat: 60, lon: 10 };
    const b = { lat: 60, lon: 11 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
    expect(haversineMeters(a, b)).toBeCloseTo(111195.08 * Math.cos((60 * Math.PI) / 180), -1);
  });

  it("finds the point half way along a bent line by length, not by how many points it has", () => {
    // 0.001 degrees, then 0.010 degrees, so half the length is 0.0055 degrees along, in the long leg.
    const points = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.011 }];
    const mid = midpointAlong(points, 0, 2);
    expect(mid?.lat).toBeCloseTo(0, 9);
    expect(mid?.lon).toBeCloseTo(0.0055, 6);
  });

  it("gives the one point back for an edge of one point, and the first point for a line with no length", () => {
    const points = line(4);
    expect(midpointAlong(points, 2, 2)).toEqual(points[2]);
    const still = [{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }, { lat: 1, lon: 1 }];
    expect(midpointAlong(still, 0, 2)).toEqual({ lat: 1, lon: 1 });
  });

  it("gives null for a range outside the line, backwards, or not whole numbers", () => {
    const points = line(4);
    expect(midpointAlong(points, -1, 2)).toBeNull();
    expect(midpointAlong(points, 1, 4)).toBeNull();
    expect(midpointAlong(points, 3, 1)).toBeNull();
    expect(midpointAlong(points, 0.5, 2)).toBeNull();
    expect(midpointAlong([], 0, 0)).toBeNull();
  });
});

describe("thinning a line for the Census query", () => {
  it("leaves a line alone when it is already short enough, and returns a copy", () => {
    const points = line(10);
    const thin = simplifyPolyline(points, 10);
    expect(thin).toEqual(points);
    expect(thin).not.toBe(points);
  });

  it("keeps both ends and never more points than asked for, in the original order", () => {
    const wave = Array.from({ length: 2000 }, (_, i) => ({ lat: 32.7 + 0.002 * Math.sin(i / 20), lon: -117.3 + i * 0.00001 }));
    const thin = simplifyPolyline(wave, TIGER_MAX_POINTS);
    expect(thin.length).toBeLessThanOrEqual(TIGER_MAX_POINTS);
    expect(thin[0]).toBe(wave[0]);
    expect(thin[thin.length - 1]).toBe(wave[1999]);
    const at = thin.map((p) => wave.indexOf(p));
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("keeps the corner of an L when only three points are allowed", () => {
    const along = Array.from({ length: 101 }, (_, i) => ({ lat: 32 + i * 0.001, lon: -117 }));
    const across = Array.from({ length: 100 }, (_, i) => ({ lat: 32.1, lon: -117 + (i + 1) * 0.001 }));
    const l = [...along, ...across];
    expect(simplifyPolyline(l, 3)).toEqual([l[0], l[100], l[l.length - 1]]);
  });

  it("keeps a spike before it keeps a gentle bend", () => {
    const flat = line(1001).map((p, i) => ({ ...p, lat: i === 500 ? p.lat + 0.01 : p.lat }));
    expect(simplifyPolyline(flat, 3)).toEqual([flat[0], flat[500], flat[1000]]);
  });

  it("drops every point of a straight line but the ends", () => {
    expect(simplifyPolyline(line(1000), 50)).toEqual([line(1000)[0], line(1000)[999]]);
  });

  it("stays within a few meters of a smooth line at the Census limit", () => {
    const wave = Array.from({ length: 2000 }, (_, i) => ({ lat: 32.7 + 0.002 * Math.sin(i / 20), lon: -117.3 + i * 0.00001 }));
    const thin = simplifyPolyline(wave, TIGER_MAX_POINTS);
    const meters = 111195;
    const kx = Math.cos((32.7 * Math.PI) / 180);
    const farthest = Math.max(
      ...wave.map((p) => {
        let best = Infinity;
        for (let i = 0; i + 1 < thin.length; i += 1) {
          const ax = thin[i].lon * kx * meters, ay = thin[i].lat * meters, bx = thin[i + 1].lon * kx * meters, by = thin[i + 1].lat * meters;
          const px = p.lon * kx * meters, py = p.lat * meters;
          const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
          const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
          best = Math.min(best, Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))));
        }
        return best;
      }),
    );
    expect(farthest).toBeLessThan(5);
  });

  it("never goes below the two ends", () => {
    expect(simplifyPolyline(line(20), 0)).toHaveLength(2);
    expect(simplifyPolyline(line(20), 1)).toHaveLength(2);
  });
});

describe("which boundary holds a point", () => {
  const at = (lon: number, lat: number): RoutePoint => ({ lat, lon });
  const square = rectangle(0, 0, 10, 10);

  it("says inside for a point in a ring and outside for points on each side of it", () => {
    expect(pointInRings(at(5, 5), [square])).toBe(true);
    for (const [lon, lat] of [[15, 5], [-1, 5], [5, 11], [5, -1]]) expect(pointInRings(at(lon, lat), [square])).toBe(false);
  });

  it("says outside for a point in a hole, and inside again for an island in the hole", () => {
    const hole = rectangle(2, 2, 8, 8);
    const island = rectangle(4, 4, 6, 6);
    expect(pointInRings(at(1, 1), [square, hole])).toBe(true);
    expect(pointInRings(at(3, 3), [square, hole])).toBe(false);
    expect(pointInRings(at(5, 5), [square, hole])).toBe(false);
    expect(pointInRings(at(5, 5), [square, hole, island])).toBe(true);
    expect(pointInRings(at(3, 3), [square, hole, island])).toBe(false);
  });

  it("handles a polygon in two parts, whichever way the rings are written", () => {
    const west = rectangle(1, 1, 2, 2);
    const east = [...rectangle(8, 8, 9, 9)].reverse();
    expect(pointInRings(at(1.5, 1.5), [west, east])).toBe(true);
    expect(pointInRings(at(8.5, 8.5), [west, east])).toBe(true);
    expect(pointInRings(at(5, 5), [west, east])).toBe(false);
  });

  it("treats a ring that was not closed the same as one that was", () => {
    expect(pointInRings(at(5, 5), [square.slice(0, -1)])).toBe(true);
    expect(pointInRings(at(15, 5), [square.slice(0, -1)])).toBe(false);
  });

  it("says outside for a point in the notch of a U-shaped ring, and for no rings at all", () => {
    const u: Ring = [[0, 0], [0, 10], [3, 10], [3, 3], [7, 3], [7, 10], [10, 10], [10, 0], [0, 0]];
    expect(pointInRings(at(1, 5), [u])).toBe(true);
    expect(pointInRings(at(5, 8), [u])).toBe(false);
    expect(pointInRings(at(5, 1), [u])).toBe(true);
    expect(pointInRings(at(5, 5), [])).toBe(false);
  });

  it("boxes rings and ignores positions that are not numbers", () => {
    expect(ringsBox([square, rectangle(20, -5, 30, 5)])).toEqual({ west: 0, south: -5, east: 30, north: 10 });
    expect(ringsBox([[[Number.NaN, 1], [2, 3]]])).toEqual({ west: 2, south: 3, east: 2, north: 3 });
    expect(ringsBox([])).toBeNull();
    const box = ringsBox([square]);
    expect(box && boxContains(box, at(5, 5))).toBe(true);
    expect(box && boxContains(box, at(11, 5))).toBe(false);
  });
});

describe("distance to an outline", () => {
  const square = rectangle(-117.3, 32.6, -117, 32.9);
  const metersPerLonDegree = (lat: number) => Math.cos((lat * Math.PI) / 180) * 111195.08;

  it("measures to the nearest edge from outside, and from inside, in meters", () => {
    const outside = distanceToRingsMeters({ lat: 32.75, lon: -116.999 }, [square]);
    expect(outside).toBeCloseTo(0.001 * metersPerLonDegree(32.75), 0);
    const inside = distanceToRingsMeters({ lat: 32.75, lon: -117.001 }, [square]);
    expect(inside).toBeCloseTo(0.001 * metersPerLonDegree(32.75), 0);
  });

  it("measures to the corner from a point out past it", () => {
    const d = distanceToRingsMeters({ lat: 32.901, lon: -116.999 }, [square]);
    expect(d).toBeCloseTo(Math.hypot(0.001 * metersPerLonDegree(32.9), 0.001 * 111195.08), 0);
  });

  it("is 0 on an edge, takes the closest of several rings, and counts the edge that closes an open ring", () => {
    expect(distanceToRingsMeters({ lat: 32.75, lon: -117 }, [square])).toBeCloseTo(0, 6);
    const far = rectangle(-100, 10, -99, 11);
    expect(distanceToRingsMeters({ lat: 32.75, lon: -116.999 }, [far, square])).toBeCloseTo(0.001 * metersPerLonDegree(32.75), 0);
    const open: Ring = [[0, 0], [0, 10], [10, 10]];
    expect(distanceToRingsMeters({ lat: 5.0001, lon: 5 }, [open])).toBeLessThan(15);
  });

  it("is infinite when there are no edges", () => {
    expect(distanceToRingsMeters({ lat: 1, lon: 1 }, [])).toBe(Infinity);
  });

  it("tells quickly whether a point is within some meters of a box", () => {
    const box = { west: 0, south: 0, east: 10, north: 10 };
    expect(boxNear(box, { lat: 5, lon: 5 }, 15)).toBe(true);
    expect(boxNear(box, { lat: 5, lon: 10.0001 }, 15)).toBe(true);
    expect(boxNear(box, { lat: 10.0001, lon: 5 }, 15)).toBe(true);
    expect(boxNear(box, { lat: 5, lon: 10.001 }, 15)).toBe(false);
    expect(boxNear(box, { lat: -0.001, lon: 5 }, 15)).toBe(false);
  });
});

describe("what counts as the United States", () => {
  it("accepts places in the lower 48, Alaska, Hawaii, Puerto Rico and the Virgin Islands", () => {
    const places: Record<string, RoutePoint> = {
      "San Diego": { lat: 32.7157, lon: -117.1611 },
      "Key West": { lat: 24.5551, lon: -81.78 },
      Maine: { lat: 44.8, lon: -68.8 },
      Anchorage: { lat: 61.2181, lon: -149.9003 },
      Honolulu: { lat: 21.3069, lon: -157.8583 },
      "San Juan": { lat: 18.4655, lon: -66.1057 },
      "St. Thomas": { lat: 18.3419, lon: -64.9307 },
    };
    for (const [name, point] of Object.entries(places)) expect(inUnitedStates(point), name).toBe(true);
  });

  it("turns away points that are plainly elsewhere", () => {
    const places: Record<string, RoutePoint> = {
      London: { lat: 51.5, lon: -0.12 },
      Tokyo: { lat: 35.68, lon: 139.69 },
      "Mexico City": { lat: 19.43, lon: -99.13 },
      Guam: { lat: 13.44, lon: 144.79 },
      "Null Island": { lat: 0, lon: 0 },
      "north pole": { lat: 90, lon: 0 },
    };
    for (const [name, point] of Object.entries(places)) expect(inUnitedStates(point), name).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// valhalla.ts
// ---------------------------------------------------------------------------------------------

describe("the requests sent to Valhalla", () => {
  const { from, to } = ASKED.mission;

  it("asks for a Hybrid bicycle route from the start to the end in kilometers, off roads in the balanced mode", () => {
    expect(routeBody({ from, to })).toEqual({
      locations: [from, to],
      costing: "bicycle",
      costing_options: { bicycle: { bicycle_type: "Hybrid", use_roads: 0.25, use_hills: 0.5 } },
      directions_options: { units: "kilometers" },
    });
  });

  it("uses roads freely in the roads mode, and the balanced mode when prefer is given as balanced", () => {
    expect(routeBody({ from, to, prefer: "roads" }).costing_options.bicycle.use_roads).toBe(1);
    expect(routeBody({ from, to, prefer: "balanced" }).costing_options.bicycle.use_roads).toBe(0.25);
  });

  it("passes the avoid points as exclude_locations, in order, and not under the old name", () => {
    const avoid = [{ lat: 32.78, lon: -117.25 }, { lat: 32.79, lon: -117.26 }];
    const body = routeBody({ from, to, avoid });
    expect("exclude_locations" in body && body.exclude_locations).toEqual(avoid);
    expect(body).not.toHaveProperty("avoid_locations");
    expect(routeBody({ from, to, avoid: [] })).not.toHaveProperty("exclude_locations");
  });

  it("asks trace_attributes to walk the route's own edges and send back only the twelve things we read", () => {
    const body = traceBody("abc");
    expect(body.encoded_polyline).toBe("abc");
    expect(body.costing).toBe("bicycle");
    expect(body.shape_match).toBe("edge_walk");
    expect(body.filters.action).toBe("include");
    expect(body.filters.attributes).toEqual([
      "edge.use", "edge.cycle_lane", "edge.road_class", "edge.names", "edge.length", "edge.way_id",
      "edge.begin_shape_index", "edge.end_shape_index", "edge.surface", "edge.sidewalk_left", "edge.sidewalk_right", "edge.bicycle_network",
    ]);
  });

  it("asks for heights with a range, one per point of the line", () => {
    expect(heightBody("abc")).toEqual({ encoded_polyline: "abc", range: true });
  });

  it("goes to the FOSSGIS server unless the environment sets another", () => {
    expect(VALHALLA_URL).toBe("https://valhalla1.openstreetmap.de");
  });
});

describe("the route answer", () => {
  it("reads the length in meters, the time in seconds and the line from the recorded Mission Beach route", () => {
    const route = parseRoute(fixture("route-mission.json"));
    expect(route?.meters).toBe(3541);
    expect(route?.seconds).toBe(746);
    expect(route?.points).toHaveLength(128);
    expect(route?.shape).toBe((fixture("route-mission.json") as { trip: { legs: { shape: string }[] } }).trip.legs[0].shape);
  });

  it("reads the Del Mar route too", () => {
    const route = parseRoute(fixture("route-delmar.json"));
    expect(route?.meters).toBe(6136);
    expect(route?.seconds).toBe(1286);
    expect(route?.points).toHaveLength(186);
  });

  it("returns null for anything that isn't one clean route", () => {
    const good = fixture("route-mission.json") as { trip: { legs: { shape: string }[]; summary: Record<string, unknown> } };
    const withShape = (shape: unknown) => ({ trip: { ...good.trip, legs: [{ shape }] } });
    const withSummary = (summary: unknown) => ({ trip: { ...good.trip, summary } });
    const bad: unknown[] = [
      null,
      "route",
      [],
      {},
      { trip: null },
      { trip: { legs: [], summary: good.trip.summary } },
      { trip: { legs: [null], summary: good.trip.summary } },
      { trip: { legs: good.trip.legs } },
      withShape(42),
      withShape(""),
      withShape("_p~iF~ps|U"),
      withShape(encodePolyline([{ lat: 1, lon: 1 }])),
      withSummary({ length: -1, time: 5 }),
      withSummary({ length: 3.5, time: -5 }),
      withSummary({ length: "3.5", time: 5 }),
      withSummary({ length: Number.NaN, time: 5 }),
      withSummary({ time: 5 }),
    ];
    for (const body of bad) expect(parseRoute(body), JSON.stringify(body)?.slice(0, 60)).toBeNull();
  });

  it("calls only Valhalla's no-path, no-street and unconnected answers 'no route', and only on HTTP 400", () => {
    const none = fixture("route-error-no-path.json");
    expect(isNoRoute(400, none)).toBe(true);
    expect(isNoRoute(400, { error_code: 171 })).toBe(true);
    expect(isNoRoute(400, { error_code: 170 })).toBe(true);
    expect(isNoRoute(400, { error_code: 154 })).toBe(false);
    expect(isNoRoute(400, { error_code: 130 })).toBe(false);
    expect(isNoRoute(400, {})).toBe(false);
    expect(isNoRoute(400, null)).toBe(false);
    expect(isNoRoute(500, none)).toBe(false);
    expect(isNoRoute(200, none)).toBe(false);
    expect(isNoRoute(400, { error_code: "442" })).toBe(false);
  });
});

describe("the edges answer", () => {
  it("reads every edge of the recorded Mission Beach route, in order, on the route's own points", () => {
    const edges = parseEdges(fixture("trace-mission.json"), 128);
    expect(edges).toHaveLength(93);
    expect(edges?.[0]).toEqual({
      use: "parking_aisle",
      cycleLane: "none",
      roadClass: "service_other",
      surface: "paved_smooth",
      names: [],
      meters: 77,
      wayId: 754505503,
      from: 0,
      to: 3,
    });
    expect(edges?.[3]).toMatchObject({ use: "road", roadClass: "secondary", names: ["Mission Boulevard"], wayId: 436400938, from: 5, to: 6 });
    expect(edges?.[edges.length - 1].to).toBe(127);
    expect(edges?.every((e, i) => i === 0 || e.from === edges[i - 1].to)).toBe(true);
  });

  it("adds the lengths up to the route's length, within a meter or two of rounding", () => {
    const edges = parseEdges(fixture("trace-delmar.json"), 186) ?? [];
    expect(Math.abs(edges.reduce((sum, e) => sum + e.meters, 0) - 6136)).toBeLessThan(3);
  });

  it("reads an edge's missing fields as empty, and a way id of 0 or a fraction as none", () => {
    const edges = parseEdges({ edges: [{ begin_shape_index: 0, end_shape_index: 2, length: 0.0105, way_id: 0 }, { begin_shape_index: 2, end_shape_index: 3, length: 0.01, way_id: 1.5, names: ["A", 7, ""] }] }, 4);
    expect(edges).toEqual([
      { use: "", cycleLane: "none", roadClass: "", surface: "", names: [], meters: 11, wayId: null, from: 0, to: 2 },
      { use: "", cycleLane: "none", roadClass: "", surface: "", names: ["A"], meters: 10, wayId: null, from: 2, to: 3 },
    ]);
  });

  it("returns null when an edge cannot be placed on the route's line, since every place after it would be wrong", () => {
    const one = (over: Record<string, unknown>) => ({ edges: [{ begin_shape_index: 0, end_shape_index: 1, length: 0.01, ...over }] });
    expect(parseEdges(one({}), 2)).toHaveLength(1);
    expect(parseEdges(one({ end_shape_index: 2 }), 2)).toBeNull();
    expect(parseEdges(one({ begin_shape_index: -1 }), 2)).toBeNull();
    expect(parseEdges(one({ begin_shape_index: 1, end_shape_index: 0 }), 2)).toBeNull();
    expect(parseEdges(one({ begin_shape_index: 0.5 }), 2)).toBeNull();
    expect(parseEdges(one({ begin_shape_index: "0" }), 2)).toBeNull();
    expect(parseEdges(one({ length: -1 }), 2)).toBeNull();
    expect(parseEdges(one({ length: null }), 2)).toBeNull();
    expect(parseEdges({ edges: [null] }, 2)).toBeNull();
    expect(parseEdges({ edges: "none" }, 2)).toBeNull();
    expect(parseEdges({}, 2)).toBeNull();
    expect(parseEdges(null, 2)).toBeNull();
    expect(parseEdges({ edges: [] }, 2)).toEqual([]);
  });
});

describe("the height answer and the climb", () => {
  it("reads one height per point of the recorded route", () => {
    const heights = parseHeights(fixture("height-mission.json"));
    expect(heights).toHaveLength(128);
    expect(Math.min(...(heights ?? []))).toBe(2);
    expect(Math.max(...(heights ?? []))).toBe(7);
  });

  it("leaves out places with no reading, and returns null for an answer that isn't heights", () => {
    expect(parseHeights({ range_height: [[0, 10], [5, null], [9, -32768], [12], [15, 14]] })).toEqual([10, 14]);
    expect(parseHeights({ range_height: [[0, 10], "x"] })).toBeNull();
    expect(parseHeights({ range_height: "none" })).toBeNull();
    expect(parseHeights({})).toBeNull();
    expect(parseHeights(null)).toBeNull();
  });

  it("counts a steady slope in full, and counts the rise again after a dip", () => {
    expect(totalClimbMeters([0, 1, 2, 3, 4, 5, 6])).toBe(6);
    expect(totalClimbMeters([0, 5, 10, 4, 6, 12])).toBe(10 + 8);
  });

  it("adds nothing for the wobble of a flat road, up or down", () => {
    expect(totalClimbMeters([10, 11, 10, 11, 10, 11, 10, 11])).toBe(0);
    expect(totalClimbMeters([10, 9, 10, 9, 10, 9, 10])).toBe(0);
    expect(MIN_RISE_M).toBe(2);
  });

  it("adds nothing for a descent, a single reading or no readings", () => {
    expect(totalClimbMeters([50, 40, 30, 20])).toBe(0);
    expect(totalClimbMeters([5])).toBe(0);
    expect(totalClimbMeters([])).toBe(0);
  });

  it("gives 105 m for the Del Mar Heights Road climb and 6 m for the flat Mission Beach ride", () => {
    expect(totalClimbMeters(parseHeights(fixture("height-delmar.json")) ?? [])).toBe(105);
    expect(totalClimbMeters(parseHeights(fixture("height-mission.json")) ?? [])).toBe(6);
  });
});

describe("what kind of way an edge runs on", () => {
  const kind = (over: Partial<ValhallaEdge>, tags: PostedTags = {}): WayKind => classifyEdge(edge(over), tags);

  it("is the same function whether it is imported from valhalla or from plan", () => {
    expect(classifyFromPlan).toBe(classifyEdge);
  });

  it("calls a crosswalk a crossing, by Valhalla's use or by footway=crossing, ahead of anything else", () => {
    expect(kind({ use: "pedestrian_crossing" })).toBe("crossing");
    expect(kind({ use: "footway" }, { footway: "crossing" })).toBe("crossing");
    expect(kind({ use: "cycleway" }, { footway: "crossing" })).toBe("crossing");
    expect(kind({ use: "road" }, { footway: "crossing" })).toBe("crossing");
  });

  it("calls both kinds of ferry a ferry", () => {
    expect(kind({ use: "ferry" })).toBe("ferry");
    expect(kind({ use: "rail-ferry" })).toBe("ferry");
  });

  it("calls a footway, pedestrian way, steps or elevator a footway, whatever its surface", () => {
    for (const use of ["footway", "pedestrian", "steps", "elevator"]) {
      expect(kind({ use }), use).toBe("footway");
      expect(kind({ use, surface: "gravel" }), `${use} gravel`).toBe("footway");
    }
  });

  it("calls it a sidewalk when Valhalla says sidewalk, OpenStreetMap says footway=sidewalk, or the way runs beside a street", () => {
    expect(kind({ use: "sidewalk" })).toBe("sidewalk");
    expect(kind({ use: "footway" }, { footway: "sidewalk" })).toBe("sidewalk");
    expect(kind({ use: "footway" }, { sidepath: true })).toBe("sidewalk");
    expect(kind({ use: "steps" }, { sidepath: true })).toBe("sidewalk");
    expect(kind({ use: "footway" }, { sidepath: false })).toBe("footway");
  });

  it("calls a cycleway a bike path when paved, with or without a surface", () => {
    for (const surface of ["paved_smooth", "paved", "paved_rough", ""]) expect(kind({ use: "cycleway", surface }), surface).toBe("bike_path");
  });

  it("calls a cycleway a trail on each of the five unpaved surfaces", () => {
    for (const surface of ["compacted", "gravel", "dirt", "path", "impassable"]) expect(kind({ use: "cycleway", surface }), surface).toBe("trail");
  });

  it("calls a cycleway beside a street a separated bikeway, unless it is unpaved", () => {
    expect(kind({ use: "cycleway" }, { sidepath: true })).toBe("separated_bikeway");
    expect(kind({ use: "cycleway", surface: "dirt" }, { sidepath: true })).toBe("trail");
    expect(kind({ use: "cycleway", cycleLane: "separated" }, {})).toBe("bike_path");
  });

  it("calls an unpaved path, mountain bike trail or track a trail, even where bikes are designated", () => {
    for (const use of ["path", "mountain_bike", "track"]) {
      expect(kind({ use, surface: "gravel" }), use).toBe("trail");
      expect(kind({ use, surface: "dirt" }, { bicycle: "designated" }), `${use} designated`).toBe("trail");
    }
  });

  it("calls a paved path a bike path where bikes are designated or yes, and a footway otherwise", () => {
    for (const use of ["path", "mountain_bike", "track"]) {
      expect(kind({ use }, { bicycle: "designated" }), `${use} designated`).toBe("bike_path");
      expect(kind({ use }, { bicycle: "yes" }), `${use} yes`).toBe("bike_path");
      expect(kind({ use }, {}), `${use} untagged`).toBe("footway");
      expect(kind({ use }, { bicycle: "no" }), `${use} no`).toBe("footway");
      expect(kind({ use }, { bicycle: "dismount" }), `${use} dismount`).toBe("footway");
    }
    expect(kind({ use: "path", surface: "" }, { bicycle: "yes" })).toBe("bike_path");
  });

  it("calls every kind of street a road when it has no bike lane", () => {
    const uses = ["road", "residential", "living_street", "service_road", "parking_aisle", "driveway", "alley", "turn_channel", "ramp", "culdesac", "emergency_access", "drive_through"];
    for (const use of uses) expect(kind({ use, cycleLane: "none" }), use).toBe("road");
  });

  it("calls a street a bike lane when Valhalla says the lane is dedicated, a separated bikeway when separated, and a road when shared", () => {
    expect(kind({ use: "road", cycleLane: "dedicated" })).toBe("bike_lane");
    expect(kind({ use: "service_road", cycleLane: "dedicated" })).toBe("bike_lane");
    expect(kind({ use: "road", cycleLane: "separated" })).toBe("separated_bikeway");
    expect(kind({ use: "road", cycleLane: "shared" })).toBe("road");
    expect(kind({ use: "road", cycleLane: "none" })).toBe("road");
  });

  it("uses the road class when Valhalla gave no use, for each class from motorway to service_other", () => {
    for (const roadClass of ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "service_other"]) {
      expect(kind({ use: "", roadClass }), roadClass).toBe("road");
    }
    expect(kind({ use: "", roadClass: "tertiary", cycleLane: "dedicated" })).toBe("bike_lane");
  });

  it("does not take a footway or a cycleway for a street just because they carry a road class", () => {
    expect(kind({ use: "footway", roadClass: "service_other" })).toBe("footway");
    expect(kind({ use: "cycleway", roadClass: "service_other" })).toBe("bike_path");
  });

  it("calls anything it doesn't know other, so the rule check says it can't tell", () => {
    for (const use of ["bridleway", "escalator", "platform", "rest_area", "service_area", "rail", "tram", "bus", "other", "something_new"]) {
      expect(kind({ use, roadClass: "service_other" }), use).toBe("other");
    }
    expect(kind({ use: "", roadClass: "" })).toBe("other");
    expect(kind({ use: "", roadClass: "not_a_class" })).toBe("other");
  });

  it("classifies the recorded Mission Beach edges as roads, a bike path and the boardwalk footway", () => {
    const edges = parseEdges(fixture("trace-mission.json"), 128) ?? [];
    const kinds = new Set(edges.map((e) => classifyEdge(e, {})));
    expect([...kinds].sort()).toEqual(["bike_path", "footway", "road"]);
  });
});

// ---------------------------------------------------------------------------------------------
// osmTags.ts
// ---------------------------------------------------------------------------------------------

describe("the tag question for QLever", () => {
  it("lists each way once, asks for the six tags and keeps ways that lack a tag", () => {
    const query = tagsQuery([30, 20, 30, 10]);
    expect(query).toContain("PREFIX osmway: <https://www.openstreetmap.org/way/>");
    expect(query).toContain("PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>");
    expect(query).toContain("SELECT ?way ?bicycle ?electric_bicycle ?access ?highway ?footway ?is_sidepath WHERE {");
    expect(query).toContain("VALUES ?way { osmway:30 osmway:20 osmway:10 }");
    for (const key of ["bicycle", "electric_bicycle", "access", "highway", "footway", "is_sidepath"]) {
      expect(query).toContain(`OPTIONAL { ?way osmkey:${key} ?${key} }`);
    }
  });

  it("lets only whole positive numbers reach the query, so nothing else can be written into it", () => {
    const query = tagsQuery([5, 0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60, 7]);
    expect(query).toContain("VALUES ?way { osmway:5 osmway:7 }");
    expect(tagsQuery([])).toContain("VALUES ?way {  }");
  });

  it("asks about no more than the cap", () => {
    const ids = Array.from({ length: MAX_TAG_WAYS + 500 }, (_, i) => i + 1);
    expect(tagsQuery(ids).match(/osmway:\d+/g)).toHaveLength(MAX_TAG_WAYS);
  });

  it("sends the query as the form field 'query'", () => {
    const form = new URLSearchParams(tagsBody([1, 2]));
    expect([...form.keys()]).toEqual(["query"]);
    expect(form.get("query")).toBe(tagsQuery([1, 2]));
  });
});

describe("QLever's answer", () => {
  it("reads the recorded Mission Beach answer: the boardwalk bans e-bikes, and plain streets carry only a highway tag", () => {
    const tags = parseTagsTsv(text("qlever-mission.tsv"));
    expect(tags?.size).toBe(26);
    expect(tags?.get(1268416485)).toEqual({ bicycle: "yes", electricBicycle: "no", access: "yes", highway: "pedestrian" });
    expect(tags?.get(5959696)).toEqual({ bicycle: "yes", electricBicycle: "no", access: "yes", highway: "footway" });
    expect(tags?.get(436400938)).toEqual({ highway: "secondary" });
    expect(tags?.get(1268416484)).toEqual({ highway: "cycleway", footway: "yes" });
  });

  it("reads the Del Mar answer: a designated bike path and a crosswalk that is marked footway=crossing", () => {
    const tags = parseTagsTsv(text("qlever-delmar.tsv"));
    expect(tags?.get(226335086)).toEqual({ bicycle: "designated", highway: "cycleway" });
    expect(tags?.get(754377600)).toEqual({ bicycle: "yes", highway: "footway", footway: "crossing" });
  });

  const head = "?way\t?bicycle\t?electric_bicycle\t?access\t?highway\t?footway\t?is_sidepath";
  const way = (id: number) => `<https://www.openstreetmap.org/way/${id}>`;

  it("sets sidepath for is_sidepath=yes and for footway=sidewalk, and not for is_sidepath=no", () => {
    const tsv = [
      head,
      `${way(1)}\t\t\t\t"cycleway"\t\t"yes"`,
      `${way(2)}\t\t\t\t"footway"\t"sidewalk"\t`,
      `${way(3)}\t\t\t\t"cycleway"\t\t"no"`,
      `${way(4)}\t\t\t\t"cycleway"\t\t`,
    ].join("\n");
    const tags = parseTagsTsv(tsv);
    expect(tags?.get(1)).toEqual({ highway: "cycleway", sidepath: true });
    expect(tags?.get(2)).toEqual({ highway: "footway", footway: "sidewalk", sidepath: true });
    expect(tags?.get(3)).toEqual({ highway: "cycleway" });
    expect(tags?.get(4)).toEqual({ highway: "cycleway" });
  });

  it("reads quoted values with a datatype or language tag, Windows line ends, capitals and spaces", () => {
    const tsv = `${head}\r\n${way(9)}\t"No"^^<http://www.w3.org/2001/XMLSchema#string>\t"no"@en\t " Private "\t"service"\t\t\r\n`;
    expect(parseTagsTsv(tsv)?.get(9)).toEqual({ bicycle: "no", electricBicycle: "no", access: "private", highway: "service" });
  });

  it("finds columns by name, in any order, and leaves out a tag that is empty", () => {
    const tsv = `?way\t?highway\t?bicycle\n${way(5)}\t"path"\t\n`;
    expect(parseTagsTsv(tsv)?.get(5)).toEqual({ highway: "path" });
  });

  it("keeps the first value when a way comes back twice, and any sign of a sidepath", () => {
    const tsv = [head, `${way(6)}\t"yes"\t\t\t"path"\t\t`, `${way(6)}\t"no"\t"no"\t\t"path"\t\t"yes"`].join("\n");
    expect(parseTagsTsv(tsv)?.get(6)).toEqual({ bicycle: "yes", electricBicycle: "no", highway: "path", sidepath: true });
  });

  it("skips rows that are not a way and blank lines", () => {
    const tsv = [head, "", `<https://www.openstreetmap.org/node/3>\t"yes"\t\t\t\t\t`, `${way(8)}\t"yes"\t\t\t\t\t`, ""].join("\n");
    const tags = parseTagsTsv(tsv);
    expect([...(tags?.keys() ?? [])]).toEqual([8]);
  });

  it("reads a table with no rows as no tags, and anything that isn't the table as no answer", () => {
    expect(parseTagsTsv(head)?.size).toBe(0);
    expect(parseTagsTsv(`${head}\n`)?.size).toBe(0);
    expect(parseTagsTsv("")).toBeNull();
    expect(parseTagsTsv("<html><body>Bad gateway</body></html>")).toBeNull();
    expect(parseTagsTsv('{"exception": "Query timed out"}')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// tiger.ts
// ---------------------------------------------------------------------------------------------

describe("the Census layers", () => {
  const byLayer = (layer: string) => TIGER_LAYERS.filter((l) => l.layer === layer);

  it("asks the six layers the page needs, reservations twice and the military layer from its own service", () => {
    expect(TIGER_LAYERS.map((l) => l.url.replace(TIGER_PREFIX, ""))).toEqual([
      "tigerWMS_Current/MapServer/80/query",
      "tigerWMS_Current/MapServer/82/query",
      "tigerWMS_Current/MapServer/28/query",
      "tigerWMS_Current/MapServer/14/query",
      "tigerWMS_Current/MapServer/16/query",
      "tigerWMS_Current/MapServer/18/query",
      "tigerWMS_Current/MapServer/36/query",
      "tigerWMS_Current/MapServer/40/query",
      "Special_Land_Use_Areas/MapServer/3/query",
    ]);
    expect(byLayer("reservation")).toHaveLength(2);
    expect(new Set(TIGER_LAYERS.map((l) => l.layer))).toEqual(new Set(LAYER_ORDER));
  });

  it("asks for the outline of states, counties and cities only", () => {
    expect(TIGER_LAYERS.filter((l) => l.outline !== null).map((l) => l.layer)).toEqual(["state", "county", "place"]);
  });

  it("writes a line the way Esri JSON does, longitude first, and a point likewise", () => {
    const points = [{ lat: 32.1, lon: -117.1 }, { lat: 32.2, lon: -117.2 }];
    expect(JSON.parse(esriGeometry({ kind: "line", points }))).toEqual({ paths: [[[-117.1, 32.1], [-117.2, 32.2]]], spatialReference: { wkid: 4326 } });
    expect(JSON.parse(esriGeometry({ kind: "point", point: points[1] }))).toEqual({ x: -117.2, y: 32.2, spatialReference: { wkid: 4326 } });
  });

  it("builds the form for the route on the city layer: intersects, the fields, a 5 m outline in degrees", () => {
    const place = byLayer("place")[0];
    const form = new URLSearchParams(tigerBody(place, { kind: "line", points: [{ lat: 32.1, lon: -117.1 }, { lat: 32.2, lon: -117.2 }] }));
    expect(Object.fromEntries(form)).toEqual({
      geometry: '{"paths":[[[-117.1,32.1],[-117.2,32.2]]],"spatialReference":{"wkid":4326}}',
      geometryType: "esriGeometryPolyline",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "NAME,BASENAME,GEOID,STATE",
      returnGeometry: "true",
      f: "json",
      outSR: "4326",
      maxAllowableOffset: "0.00005",
      geometryPrecision: "5",
    });
  });

  it("asks for no outline on a school district layer, or at the end point even on a city layer", () => {
    const line = { kind: "line", points: [{ lat: 32.1, lon: -117.1 }, { lat: 32.2, lon: -117.2 }] } as const;
    const point = { kind: "point", point: { lat: 32.2, lon: -117.2 } } as const;
    const school = new URLSearchParams(tigerBody(byLayer("school_unified")[0], line));
    expect(school.get("returnGeometry")).toBe("false");
    expect(school.has("maxAllowableOffset")).toBe(false);
    const end = new URLSearchParams(tigerBody(byLayer("place")[0], point));
    expect(end.get("geometryType")).toBe("esriGeometryPoint");
    expect(end.get("returnGeometry")).toBe("false");
    expect(end.has("outSR")).toBe(false);
    expect(end.get("geometry")).toBe('{"x":-117.2,"y":32.2,"spatialReference":{"wkid":4326}}');
  });
});

describe("the Census answer", () => {
  const tiger = fixture("tiger-mission.json") as { line: Record<string, unknown>; end: Record<string, unknown> };
  const layerNamed = (name: string): TigerLayer => TIGER_LAYERS.find((l) => l.url.includes(`${name}/query`)) as TigerLayer;

  it("reads the state from its postal code and the county and city from their state number", () => {
    const state = parseTigerLayer(layerNamed("MapServer/80"), tiger.line["tigerWMS_Current/MapServer/80"]);
    expect(state?.map(toJurisdiction)).toEqual([{ layer: "state", geoid: "06", name: "California", state: "CA" }]);
    const county = parseTigerLayer(layerNamed("MapServer/82"), tiger.line["tigerWMS_Current/MapServer/82"]);
    expect(county?.map(toJurisdiction)).toEqual([{ layer: "county", geoid: "06073", name: "San Diego County", state: "CA" }]);
    expect(county?.[0].rings).toHaveLength(1);
    expect(county?.[0].box).not.toBeNull();
  });

  it("names a city by its short name, San Diego and not San Diego city", () => {
    const place = parseTigerLayer(layerNamed("MapServer/28"), tiger.line["tigerWMS_Current/MapServer/28"]);
    expect(place?.map(toJurisdiction)).toEqual([{ layer: "place", geoid: "0666000", name: "San Diego", state: "CA" }]);
    expect(place?.[0].rings.length).toBeGreaterThan(1);
  });

  it("names a school district in full and keeps no outline for it", () => {
    const unified = parseTigerLayer(layerNamed("MapServer/14"), tiger.line["tigerWMS_Current/MapServer/14"]);
    expect(unified?.[0]).toMatchObject({ layer: "school_unified", geoid: "0634320", name: "San Diego City Unified School District", state: "CA", rings: [], box: null });
  });

  it("reads an empty layer as no areas, which is an answer", () => {
    expect(parseTigerLayer(layerNamed("MapServer/36"), tiger.line["tigerWMS_Current/MapServer/36"])).toEqual([]);
    expect(parseTigerLayer(layerNamed("MapServer/3"), tiger.line["Special_Land_Use_Areas/MapServer/3"])).toEqual([]);
  });

  it("gives reservations and bases no state, and keeps the name the Census gave", () => {
    const base = parseTigerLayer(layerNamed("MapServer/3"), { features: [{ attributes: { NAME: "Marine Corps Base Camp Pendleton", GEOID: "3449" } }] });
    expect(base?.map(toJurisdiction)).toEqual([{ layer: "military", geoid: "3449", name: "Marine Corps Base Camp Pendleton", state: null }]);
    const reservation = parseTigerLayer(layerNamed("MapServer/36"), { features: [{ attributes: { NAME: "Barona Reservation", GEOID: "0270" } }] });
    expect(reservation?.[0]).toMatchObject({ layer: "reservation", geoid: "0270", state: null });
  });

  it("treats TIGERweb's HTTP 200 error as a failure, not as an empty layer", () => {
    const failed = fixture("tiger-error.json");
    expect(parseTigerLayer(layerNamed("MapServer/82"), failed)).toBeNull();
  });

  it("treats a missing feature list, a feature without an id or a name, or a non-object as a failure", () => {
    const layer = layerNamed("MapServer/82");
    for (const bad of [null, "x", [], {}, { features: "none" }, { features: [null] }, { features: [{}] }, { features: [{ attributes: { NAME: "X" } }] }, { features: [{ attributes: { GEOID: "1" } }] }]) {
      expect(parseTigerLayer(layer, bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("drops an outline with a position that is not a pair of numbers, and keeps the area", () => {
    const layer = layerNamed("MapServer/82");
    const attributes = { NAME: "Test County", GEOID: "06999", STATE: "06" };
    const broken = parseTigerLayer(layer, { features: [{ attributes, geometry: { rings: [[[0, 0], ["x", 1], [1, 1]]] } }] });
    expect(broken?.[0]).toMatchObject({ geoid: "06999", rings: [], box: null });
    const fine = parseTigerLayer(layer, { features: [{ attributes, geometry: { rings: [[[0, 0], [0, 1], [1, 1], [0, 0]]] } }] });
    expect(fine?.[0].box).toEqual({ west: 0, south: 0, east: 1, north: 1 });
  });

  it("maps state numbers to postal codes, including territories, and gives null for a number that is not a state", () => {
    expect(stateFromFips("06")).toBe("CA");
    expect(stateFromFips("02")).toBe("AK");
    expect(stateFromFips("15")).toBe("HI");
    expect(stateFromFips("11")).toBe("DC");
    expect(stateFromFips("72")).toBe("PR");
    expect(stateFromFips("99")).toBeNull();
    expect(stateFromFips("")).toBeNull();
    expect(stateFromFips("6")).toBeNull();
  });

  it("keeps one of each area, by layer and then by id, and strips the outline for the plan", () => {
    const a = area("reservation", "0270", "Barona Reservation", null);
    const b = area("county", "06073", "San Diego County", "CA", rectangle(0, 0, 1, 1));
    const c = area("state", "06", "California", "CA");
    const d = area("county", "06037", "Los Angeles County", "CA");
    const sorted = uniqueAreas([a, b, c, d, { ...a }, { ...b }]);
    expect(sorted.map((x) => `${x.layer}:${x.geoid}`)).toEqual(["state:06", "county:06037", "county:06073", "reservation:0270"]);
    expect(toJurisdiction(b)).toEqual({ layer: "county", geoid: "06073", name: "San Diego County", state: "CA" });
  });
});

describe("placing a point in its state, county and city", () => {
  const county = area("county", "06073", "San Diego County", "CA", rectangle(-118, 32, -116, 33.5));
  const otherCounty = area("county", "04013", "Maricopa County", "AZ", rectangle(-116, 32, -112, 33.5));
  const city = area("place", "0666000", "San Diego", "CA", rectangle(-117.3, 32.6, -117.0, 32.9), rectangle(-117.2, 32.7, -117.1, 32.8));
  const state = area("state", "06", "California", "CA", rectangle(-124, 32, -114.5, 42));

  it("gives all four answers for a point inside, and takes the state from the county", () => {
    const locate = makeLocator({ states: [state], counties: [county, otherCounty], places: [city] });
    expect(locate({ lat: 32.65, lon: -117.25 })).toEqual({ state: "CA", countyGeoid: "06073", placeGeoid: "0666000", placeName: "San Diego" });
  });

  it("gives no city for a point in the city's hole or outside it, and keeps the county", () => {
    const locate = makeLocator({ states: [state], counties: [county], places: [city] });
    expect(locate({ lat: 32.75, lon: -117.15 })).toEqual({ state: "CA", countyGeoid: "06073", placeGeoid: null, placeName: null });
    expect(locate({ lat: 33.2, lon: -117.5 })).toEqual({ state: "CA", countyGeoid: "06073", placeGeoid: null, placeName: null });
  });

  it("takes the state from the county even where the state's own outline says otherwise", () => {
    const wrongState = area("state", "04", "Arizona", "AZ", rectangle(-118, 32, -116, 33.5));
    const locate = makeLocator({ states: [wrongState], counties: [county], places: [] });
    expect(locate({ lat: 32.5, lon: -117 }).state).toBe("CA");
  });

  it("falls back to the state's outline when no county holds the point, and says nothing for open water", () => {
    const locate = makeLocator({ states: [state], counties: [county], places: [] });
    expect(locate({ lat: 35, lon: -118.5 })).toEqual({ state: "CA", countyGeoid: null, placeGeoid: null, placeName: null });
    expect(locate({ lat: 25, lon: -130 })).toEqual(NOWHERE);
  });

  describe("a point just outside every outline", () => {
    // Two cities with a gap of 3 m between them, like the two sides of a street that is the city line.
    const west = area("place", "0600001", "West City", "CA", rectangle(-117.3, 32.6, -117.1, 32.9));
    const east = area("place", "0600002", "East City", "CA", rectangle(-117.09997, 32.6, -117, 32.9));
    const inGap = (lon: number) => ({ lat: 32.75, lon });

    it("is 15 m", () => {
      expect(BOUNDARY_SLACK_M).toBe(15);
    });

    it("goes to the nearer city when it falls in the gap between two", () => {
      const locate = makeLocator({ states: [], counties: [county], places: [west, east] });
      expect(locate(inGap(-117.09999)).placeName).toBe("West City");
      expect(locate(inGap(-117.09998)).placeName).toBe("East City");
    });

    it("goes to the city it is within 15 m of, whichever way the city's outline faces", () => {
      const locate = makeLocator({ states: [], counties: [county], places: [west] });
      expect(locate({ lat: 32.75, lon: -117.0999 }).placeName).toBe("West City");
      expect(locate({ lat: 32.75, lon: -117.3001 }).placeName).toBe("West City");
      expect(locate({ lat: 32.9001, lon: -117.2 }).placeName).toBe("West City");
    });

    it("stays outside a city it is more than 15 m from", () => {
      const locate = makeLocator({ states: [], counties: [county], places: [west] });
      expect(locate({ lat: 32.75, lon: -117.0998 })).toMatchObject({ placeGeoid: null, placeName: null });
      expect(locate({ lat: 32.75, lon: -117.05 })).toMatchObject({ placeGeoid: null, countyGeoid: "06073" });
    });

    it("applies to a county line too, and the state follows the county", () => {
      // Two counties in two states with a 3 m gap between them, like a road that is the state line.
      const californiaSide = area("county", "06025", "Imperial County", "CA", rectangle(-116, 32, -115, 33.5));
      const arizonaSide = area("county", "04027", "Yuma County", "AZ", rectangle(-114.99997, 32, -114, 33.5));
      const locate = makeLocator({ states: [], counties: [californiaSide, arizonaSide], places: [] });
      expect(locate({ lat: 32.75, lon: -114.99999 })).toMatchObject({ countyGeoid: "06025", state: "CA" });
      expect(locate({ lat: 32.75, lon: -114.99998 })).toMatchObject({ countyGeoid: "04027", state: "AZ" });
    });

    it("applies to the state's outline when no county is near", () => {
      const coast = area("state", "06", "California", "CA", rectangle(-124, 32, -114.5, 42));
      const locate = makeLocator({ states: [coast], counties: [], places: [] });
      expect(locate({ lat: 35, lon: -114.4999 })).toMatchObject({ state: "CA", countyGeoid: null });
      expect(locate({ lat: 35, lon: -114.4 })).toEqual(NOWHERE);
    });

    it("keeps a point in a hole of a city out of the city, unless it is within 15 m of the hole's edge", () => {
      const donut = area("place", "0600003", "Donut City", "CA", rectangle(-117.3, 32.6, -117, 32.9), rectangle(-117.2, 32.7, -117.1, 32.8));
      const locate = makeLocator({ states: [], counties: [county], places: [donut] });
      expect(locate({ lat: 32.75, lon: -117.15 }).placeGeoid).toBeNull();
      expect(locate({ lat: 32.75, lon: -117.10005 }).placeGeoid).toBe("0600003");
    });
  });

  it("answers the same for a point whether or not the last point was in the same area", () => {
    const plain = makeLocator({ states: [state], counties: [county, otherCounty], places: [city] });
    const walker = makeLocator({ states: [state], counties: [county, otherCounty], places: [city] });
    const points = [
      { lat: 32.65, lon: -117.25 }, { lat: 32.66, lon: -117.24 }, { lat: 32.5, lon: -115 }, { lat: 32.65, lon: -117.25 },
      { lat: 32.75, lon: -117.15 }, { lat: 32.85, lon: -117.05 }, { lat: 33, lon: -115 },
    ];
    for (const p of points) expect(walker(p)).toEqual(makeLocator({ states: [state], counties: [county, otherCounty], places: [city] })(p));
    expect(plain(null)).toEqual(NOWHERE);
  });

  it("answers nowhere for no point at all", () => {
    expect(makeLocator({ states: [], counties: [], places: [] })(null)).toEqual(NOWHERE);
  });
});

// ---------------------------------------------------------------------------------------------
// plan.ts: the line to Valhalla
// ---------------------------------------------------------------------------------------------

describe("the one-at-a-time line to Valhalla", () => {
  function fakeClock(): Clock & { time: number } {
    const clock = {
      time: 0,
      now: () => clock.time,
      sleep: async (ms: number) => {
        clock.time += ms;
      },
    };
    return clock;
  }

  it("starts each call at least a gap after the one before, and runs the first at once", async () => {
    const clock = fakeClock();
    const gate = createGate({ gapMs: 1000, clock });
    const starts: number[] = [];
    const task = async () => {
      starts.push(clock.now());
      return starts.length;
    };
    const results = await Promise.all([gate.run(task), gate.run(task), gate.run(task)]);
    expect(results).toEqual([1, 2, 3]);
    expect(starts).toEqual([0, 1000, 2000]);
  });

  it("does not wait when the last call was long ago", async () => {
    const clock = fakeClock();
    const gate = createGate({ gapMs: 1000, clock });
    await gate.run(async () => undefined);
    clock.time += 5000;
    let started = -1;
    await gate.run(async () => {
      started = clock.now();
    });
    expect(started).toBe(5000);
  });

  it("never runs two calls at once, even when they were all asked for at once", async () => {
    const gate = createGate({ gapMs: 0 });
    let running = 0;
    let most = 0;
    const task = async () => {
      running += 1;
      most = Math.max(most, running);
      await sleep(5);
      running -= 1;
    };
    await Promise.all([1, 2, 3, 4].map(() => gate.run(task)));
    expect(most).toBe(1);
  });

  it("turns a call away at once when too many are already in the line, and takes calls again when they finish", async () => {
    const gate = createGate({ gapMs: 0, maxPending: 2 });
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = gate.run(() => held);
    const second = gate.run(() => held);
    expect(await gate.run(async () => "third")).toBe(GATE_FULL);
    release();
    await Promise.all([first, second]);
    expect(await gate.run(async () => "fourth")).toBe("fourth");
  });

  it("keeps going when a call throws", async () => {
    const gate = createGate({ gapMs: 0 });
    await expect(gate.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await gate.run(async () => "after")).toBe("after");
  });
});

// ---------------------------------------------------------------------------------------------
// plan.ts: segments
// ---------------------------------------------------------------------------------------------

describe("building segments from edges", () => {
  const here: Where = { state: "CA", countyGeoid: "06073", placeGeoid: "0666000", placeName: "San Diego" };
  const there: Where = { state: "CA", countyGeoid: "06073", placeGeoid: "0611194", placeName: "Carlsbad" };
  /** Everything west of the split is here, everything east is there. */
  const splitAt = (lon: number) => (p: RoutePoint | null): Where => (!p ? NOWHERE : p.lon < lon ? here : there);
  const points = line(8);

  it("makes one segment from side-by-side edges of the same kind, way, city and county", () => {
    const edges = [
      edge({ wayId: 7, names: [], meters: 30, from: 0, to: 1 }),
      edge({ wayId: 7, names: ["Mission Boulevard"], meters: 40, from: 1, to: 3 }),
      edge({ wayId: 7, names: ["Mission Blvd"], meters: 50, from: 3, to: 4 }),
    ];
    expect(buildSegments(edges, points, new Map(), splitAt(0))).toEqual([
      { from: 0, to: 4, meters: 120, kind: "road", name: "Mission Boulevard", wayId: 7, tags: {}, state: "CA", countyGeoid: "06073", placeGeoid: "0666000", placeName: "San Diego" },
    ]);
  });

  it("starts a new segment when the way changes, though the kind and the street are the same", () => {
    const edges = [edge({ wayId: 7, from: 0, to: 1 }), edge({ wayId: 8, from: 1, to: 2 }), edge({ wayId: 8, from: 2, to: 3 })];
    const segments = buildSegments(edges, points, new Map(), splitAt(0));
    expect(segments.map((s) => [s.wayId, s.from, s.to])).toEqual([[7, 0, 1], [8, 1, 3]]);
  });

  it("starts a new segment when the kind changes along one way", () => {
    const edges = [edge({ wayId: 7, cycleLane: "none", from: 0, to: 1 }), edge({ wayId: 7, cycleLane: "dedicated", from: 1, to: 2 })];
    expect(buildSegments(edges, points, new Map(), splitAt(0)).map((s) => s.kind)).toEqual(["road", "bike_lane"]);
  });

  it("starts a new segment at a city line, and judges an edge by its middle so no edge is cut in two", () => {
    // The edge from point 2 to 6 has its middle at point 4, longitude -117.296.
    const edges = [edge({ wayId: 7, from: 0, to: 2 }), edge({ wayId: 7, from: 2, to: 6 }), edge({ wayId: 7, from: 6, to: 7 })];
    const west = buildSegments(edges, points, new Map(), splitAt(-117.2955));
    expect(west.map((s) => [s.placeName, s.from, s.to])).toEqual([["San Diego", 0, 6], ["Carlsbad", 6, 7]]);
    const east = buildSegments(edges, points, new Map(), splitAt(-117.2965));
    expect(east.map((s) => [s.placeName, s.from, s.to])).toEqual([["San Diego", 0, 2], ["Carlsbad", 2, 7]]);
  });

  it("starts a new segment at a county line when the city is the same", () => {
    const otherCounty: Where = { ...here, countyGeoid: "06059" };
    const locate = (p: RoutePoint | null): Where => (!p ? NOWHERE : p.lon < -117.2975 ? here : otherCounty);
    const edges = [edge({ wayId: 7, from: 0, to: 2 }), edge({ wayId: 7, from: 2, to: 4 })];
    expect(buildSegments(edges, points, new Map(), locate).map((s) => s.countyGeoid)).toEqual(["06073", "06059"]);
  });

  it("does not join two stretches of the same street when something else comes between", () => {
    const edges = [edge({ wayId: 7, from: 0, to: 1 }), edge({ wayId: 8, from: 1, to: 2 }), edge({ wayId: 7, from: 2, to: 3 })];
    expect(buildSegments(edges, points, new Map(), splitAt(0)).map((s) => s.wayId)).toEqual([7, 8, 7]);
  });

  it("joins edges with no way id only when they share a name", () => {
    const edges = [
      edge({ wayId: null, names: ["Ferry Landing"], from: 0, to: 1 }),
      edge({ wayId: null, names: ["Ferry Landing"], from: 1, to: 2 }),
      edge({ wayId: null, names: [], from: 2, to: 3 }),
      edge({ wayId: null, names: ["Other"], from: 3, to: 4 }),
    ];
    const segments = buildSegments(edges, points, new Map(), splitAt(0));
    expect(segments.map((s) => [s.name, s.from, s.to])).toEqual([["Ferry Landing", 0, 2], [null, 2, 3], ["Other", 3, 4]]);
    expect(segments.every((s) => s.wayId === null)).toBe(true);
  });

  it("gives each segment the tags of its way, classifies with them, and gives empty tags to a way with none", () => {
    const tags = new Map<number, PostedTags>([[7, { bicycle: "yes", footway: "sidewalk", highway: "footway" }]]);
    const edges = [edge({ use: "footway", wayId: 7, from: 0, to: 1 }), edge({ use: "footway", wayId: 8, from: 1, to: 2 })];
    const segments = buildSegments(edges, points, tags, splitAt(0));
    expect(segments.map((s) => [s.kind, s.tags])).toEqual([["sidewalk", { bicycle: "yes", footway: "sidewalk", highway: "footway" }], ["footway", {}]]);
  });

  it("keeps the first name any edge of the run has, and none when no edge has one", () => {
    const named = [edge({ names: [], from: 0, to: 1 }), edge({ names: ["B", "C"], from: 1, to: 2 })];
    expect(buildSegments(named, points, new Map(), splitAt(0))[0].name).toBe("B");
    expect(buildSegments([edge({ from: 0, to: 1 })], points, new Map(), splitAt(0))[0].name).toBeNull();
  });

  it("puts a segment nowhere when its middle can't be found, and builds none from no edges", () => {
    const outside = [edge({ from: 0, to: 20 })];
    expect(buildSegments(outside, points, new Map(), makeLocator({ states: [], counties: [], places: [] }))[0]).toMatchObject({ state: null, countyGeoid: null, placeGeoid: null, placeName: null });
    expect(buildSegments([], points, new Map(), splitAt(0))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// plan.ts: checking a request
// ---------------------------------------------------------------------------------------------

describe("checking the request", () => {
  const good = { from: { lat: 32.9474, lon: -117.2385 }, to: { lat: 32.9572, lon: -117.1893 } };

  it("reads a start and an end, and defaults to the balanced mode", () => {
    expect(parseRouteRequest(good)).toEqual({ ...good, prefer: "balanced", avoidHills: false });
  });

  it("reads avoidHills only as true or false", () => {
    expect(parseRouteRequest({ ...good, avoidHills: true })).toEqual({ ...good, prefer: "balanced", avoidHills: true });
    expect(parseRouteRequest({ ...good, avoidHills: "yes" })).toBeNull();
  });

  it("reads the avoid points and the roads mode, and ignores fields it doesn't know", () => {
    const avoid = [{ lat: 32.95, lon: -117.2 }];
    expect(parseRouteRequest({ ...good, avoid, prefer: "roads", note: "ignored" })).toEqual({ ...good, avoid, prefer: "roads", avoidHills: false });
    expect(parseRouteRequest({ ...good, avoid: [] })).toEqual({ ...good, avoid: [], prefer: "balanced", avoidHills: false });
    expect(parseRouteRequest({ from: { ...good.from, label: "home" }, to: good.to })).toEqual({ ...good, prefer: "balanced", avoidHills: false });
  });

  it("accepts a route in Alaska, Hawaii and Puerto Rico", () => {
    expect(parseRouteRequest({ from: { lat: 61.2181, lon: -149.9003 }, to: { lat: 61.2, lon: -149.8 } })).not.toBeNull();
    expect(parseRouteRequest({ from: { lat: 21.3069, lon: -157.8583 }, to: { lat: 21.28, lon: -157.84 } })).not.toBeNull();
    expect(parseRouteRequest({ from: { lat: 18.4655, lon: -66.1057 }, to: { lat: 18.45, lon: -66.07 } })).not.toBeNull();
  });

  it("rejects a body that is not an object, and a missing or malformed start or end", () => {
    const bad: unknown[] = [
      null, undefined, "route", 5, [], [good.from, good.to],
      {}, { from: good.from }, { to: good.to }, { from: null, to: good.to },
      { from: [32.9, -117.2], to: good.to },
      { from: { lat: 32.9 }, to: good.to },
      { from: { lat: "32.9", lon: -117.2 }, to: good.to },
      { from: { lat: 32.9, lon: "-117.2" }, to: good.to },
      { from: { lat: null, lon: -117.2 }, to: good.to },
    ];
    for (const body of bad) expect(parseRouteRequest(body), JSON.stringify(body)).toBeNull();
  });

  it("rejects coordinates that are not finite numbers or are off the map", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 91, -91]) {
      expect(parseRouteRequest({ from: { lat: value, lon: -117.2 }, to: good.to })).toBeNull();
    }
    expect(parseRouteRequest({ from: { lat: 32.9, lon: Number.NaN }, to: good.to })).toBeNull();
    expect(parseRouteRequest({ from: { lat: 32.9, lon: 181 }, to: good.to })).toBeNull();
  });

  it("rejects a start or an end outside the US", () => {
    const london = { lat: 51.5, lon: -0.12 };
    expect(parseRouteRequest({ from: london, to: { lat: 51.51, lon: -0.11 } })).toBeNull();
    expect(parseRouteRequest({ from: good.from, to: london })).toBeNull();
    expect(parseRouteRequest({ from: london, to: good.to })).toBeNull();
    expect(parseRouteRequest({ from: { lat: 0, lon: 0 }, to: { lat: 0.001, lon: 0.001 } })).toBeNull();
  });

  it("rejects the same start and end, and accepts two points a meter or so apart", () => {
    expect(parseRouteRequest({ from: good.from, to: { ...good.from } })).toBeNull();
    expect(parseRouteRequest({ from: good.from, to: { lat: good.from.lat + 0.00001, lon: good.from.lon } })).not.toBeNull();
  });

  it("rejects more than 50 km in a straight line and accepts a bit under", () => {
    const north = (meters: number) => ({ lat: good.from.lat + meters / 111195.08, lon: good.from.lon });
    expect(haversineMeters(good.from, north(49_900))).toBeLessThan(MAX_ROUTE_METERS);
    expect(parseRouteRequest({ from: good.from, to: north(49_900) })).not.toBeNull();
    expect(parseRouteRequest({ from: good.from, to: north(50_100) })).toBeNull();
    expect(parseRouteRequest({ from: good.from, to: { lat: 34.05, lon: -118.24 } })).toBeNull();
  });

  it("allows 20 avoid points and rejects 21, a non-list, or a bad point in the list", () => {
    const spot = (i: number) => ({ lat: 32.95 + i * 0.0001, lon: -117.2 });
    const many = (n: number) => Array.from({ length: n }, (_, i) => spot(i));
    expect(MAX_AVOID_POINTS).toBe(20);
    expect(parseRouteRequest({ ...good, avoid: many(20) })?.avoid).toHaveLength(20);
    expect(parseRouteRequest({ ...good, avoid: many(21) })).toBeNull();
    expect(parseRouteRequest({ ...good, avoid: spot(1) })).toBeNull();
    expect(parseRouteRequest({ ...good, avoid: null })).toBeNull();
    expect(parseRouteRequest({ ...good, avoid: "here" })).toBeNull();
    expect(parseRouteRequest({ ...good, avoid: [spot(1), { lat: 51.5, lon: -0.12 }] })).toBeNull();
    expect(parseRouteRequest({ ...good, avoid: [spot(1), { lat: 32.9 }] })).toBeNull();
    expect(parseRouteRequest({ ...good, avoid: [null] })).toBeNull();
  });

  it("rejects a prefer that is not balanced or roads, including null", () => {
    for (const prefer of ["fast", "", "ROADS", null, 1, true, ["roads"]]) expect(parseRouteRequest({ ...good, prefer }), JSON.stringify(prefer)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// plan.ts: the whole pipeline on recorded answers
// ---------------------------------------------------------------------------------------------

describe("a full plan for the Mission Beach route", () => {
  it("has the route's length, time, line and climb, and one segment per run of edges", async () => {
    const { result } = await planFor("mission");
    const plan = planOf(result);
    expect(plan.meters).toBe(3541);
    expect(plan.seconds).toBe(746);
    expect(plan.climbMeters).toBe(6);
    expect(plan.points).toHaveLength(128);
    expect(plan.segments).toHaveLength(26);
    expect(plan.segments.reduce((sum, s) => sum + s.meters, 0)).toBe(3541);
  });

  it("covers the whole line with segments that start where the last one ended", async () => {
    const plan = planOf((await planFor("mission")).result);
    expect(plan.segments[0].from).toBe(0);
    expect(plan.segments[plan.segments.length - 1].to).toBe(127);
    plan.segments.forEach((s, i) => {
      if (i > 0) expect(s.from).toBe(plan.segments[i - 1].to);
    });
  });

  it("goes by road, a short bike path, then the Ocean Front Walk footway, then two roads", async () => {
    const plan = planOf((await planFor("mission")).result);
    expect(plan.segments.map((s) => s.kind)).toEqual([
      ...Array<WayKind>(16).fill("road"),
      "bike_path",
      ...Array<WayKind>(7).fill("footway"),
      "road",
      "road",
    ]);
    const names = plan.segments.map((s) => s.name);
    expect(names[0]).toBeNull();
    expect(names[2]).toBe("Mission Boulevard");
    expect(names[10]).toBe("West Mission Bay Drive");
    expect(names[11]).toBe("Ventura Place");
    expect(names[16]).toBeNull();
    expect(names.slice(17, 24)).toEqual(Array(7).fill("Ocean Front Walk"));
    expect(names[24]).toBe("Garnet Avenue");
    expect(names[25]).toBe("Mission Boulevard");
  });

  it("carries the posted tags: the boardwalk allows bikes, bans e-bikes, and nothing else posts a rule", async () => {
    const plan = planOf((await planFor("mission")).result);
    const walk = plan.segments.filter((s) => s.name === "Ocean Front Walk");
    expect(walk).toHaveLength(7);
    for (const s of walk) expect(s.tags).toMatchObject({ bicycle: "yes", electricBicycle: "no", access: "yes" });
    expect(walk.map((s) => s.wayId)).toEqual([1268416485, 31294908, 1436246958, 5959696, 265724078, 150837578, 1444302842]);
    const others = plan.segments.filter((s) => s.name !== "Ocean Front Walk");
    expect(others.some((s) => s.tags.electricBicycle !== undefined || s.tags.access !== undefined)).toBe(false);
    expect(plan.segments.find((s) => s.wayId === 1137097297)?.tags).toEqual({ bicycle: "yes", highway: "unclassified" });
  });

  it("puts every segment in the City of San Diego, San Diego County, California", async () => {
    const plan = planOf((await planFor("mission")).result);
    for (const s of plan.segments) {
      expect(s.state).toBe("CA");
      expect(s.countyGeoid).toBe("06073");
      expect(s.placeGeoid).toBe("0666000");
      expect(s.placeName).toBe("San Diego");
    }
  });

  it("lists the areas crossed and the areas at the destination, with San Diego Unified at Crystal Pier", async () => {
    const plan = planOf((await planFor("mission")).result);
    const expected = [
      { layer: "state", geoid: "06", name: "California", state: "CA" },
      { layer: "county", geoid: "06073", name: "San Diego County", state: "CA" },
      { layer: "place", geoid: "0666000", name: "San Diego", state: "CA" },
      { layer: "school_unified", geoid: "0634320", name: "San Diego City Unified School District", state: "CA" },
    ];
    expect(plan.crossed).toEqual(expected);
    expect(plan.atEnd).toEqual(expected);
  });

  it("says where each part came from, and when", async () => {
    const before = Date.now();
    const plan = planOf((await planFor("mission")).result);
    expect(plan.sources.router).toContain("Valhalla");
    expect(plan.sources.router).toContain("FOSSGIS");
    expect(plan.sources.boundaries).toContain("Census");
    expect(plan.sources.tags).toContain("QLever");
    expect(plan.sources.tags).not.toMatch(/^Not read/);
    expect(plan.sources.read).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(plan.sources.read)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(plan.sources.read)).toBeLessThanOrEqual(Date.now());
  });

  it("is JSON that can be sent: no undefined holes, no outlines", async () => {
    const plan = planOf((await planFor("mission")).result);
    const copy = JSON.parse(JSON.stringify(plan)) as RoutePlan;
    expect(copy).toEqual(plan);
    expect(JSON.stringify(plan)).not.toContain("rings");
  });
});

describe("a full plan for the Del Mar Heights route", () => {
  it("climbs 105 m on 6.1 km, from a bike path through a crosswalk to a bike lane and then to roads", async () => {
    const plan = planOf((await planFor("delmar")).result);
    expect(plan.meters).toBe(6136);
    expect(plan.seconds).toBe(1286);
    expect(plan.climbMeters).toBe(105);
    expect(plan.points).toHaveLength(186);
    expect(plan.segments.map((s) => s.kind)).toEqual([
      "bike_path",
      "footway",
      "crossing",
      ...Array<WayKind>(36).fill("bike_lane"),
      ...Array<WayKind>(6).fill("road"),
    ]);
  });

  it("names the bike path, Del Mar Heights Road, Village Center Loop Road and the unnamed service roads", async () => {
    const plan = planOf((await planFor("delmar")).result);
    const names = plan.segments.map((s) => s.name);
    expect(names[0]).toBe("High Bluff Bike Path");
    expect(names.slice(1, 3)).toEqual([null, null]);
    expect(new Set(names.slice(3, 39))).toEqual(new Set(["Del Mar Heights Road"]));
    expect(new Set(names.slice(39, 42))).toEqual(new Set(["Village Center Loop Road"]));
    expect(names.slice(42)).toEqual([null, null, null]);
  });

  it("reads the designated bike path and the marked crosswalk from the tags", async () => {
    const plan = planOf((await planFor("delmar")).result);
    expect(plan.segments[0].tags).toEqual({ bicycle: "designated", highway: "cycleway" });
    expect(plan.segments[2]).toMatchObject({ kind: "crossing", wayId: 754377600, meters: 11 });
    expect(plan.segments[2].tags.footway).toBe("crossing");
  });

  it("is all in the City of San Diego, county 06073, California", async () => {
    const plan = planOf((await planFor("delmar")).result);
    expect(new Set(plan.segments.map((s) => `${s.state}/${s.countyGeoid}/${s.placeGeoid}`))).toEqual(new Set(["CA/06073/0666000"]));
  });

  it("crosses two elementary districts and one high school district, and ends in Del Mar Union, where Canyon Crest Academy is", async () => {
    const plan = planOf((await planFor("delmar")).result);
    expect(plan.crossed.map((j) => `${j.layer}:${j.geoid}`)).toEqual([
      "state:06",
      "county:06073",
      "place:0666000",
      "school_secondary:0634380",
      "school_elementary:0610740",
      "school_elementary:0636990",
    ]);
    expect(plan.crossed[3].name).toBe("San Dieguito Union High School District");
    expect(plan.atEnd.map((j) => `${j.layer}:${j.geoid}`)).toEqual([
      "state:06",
      "county:06073",
      "place:0666000",
      "school_secondary:0634380",
      "school_elementary:0610740",
    ]);
  });
});

describe("what the pipeline sends", () => {
  it("names the app and the site on every call, and the client on calls to Valhalla", async () => {
    const { calls } = await planFor("mission");
    expect(ROUTE_USER_AGENT).toBe("is-it-an-ebike route (https://is-it-an-ebike.vercel.app)");
    for (const call of calls) {
      expect(call.headers["User-Agent"], call.url).toBe(ROUTE_USER_AGENT);
      expect(call.headers.Referer, call.url).toBe("https://is-it-an-ebike.vercel.app/");
    }
    for (const call of calls.filter((c) => c.url.startsWith(VALHALLA_URL))) {
      expect(call.headers["X-Client-Id"]).toBe("is-it-an-ebike.vercel.app");
      expect(call.headers["Content-Type"]).toBe("application/json");
    }
  });

  it("calls Valhalla three times, in order: the route, then the edges of its own line, then the heights", async () => {
    const { calls } = await planFor("mission");
    const valhalla = calls.filter((c) => c.url.startsWith(VALHALLA_URL));
    expect(valhalla.map((c) => c.url)).toEqual([url.route, url.trace, url.height]);
    const shape = (fixture("route-mission.json") as { trip: { legs: { shape: string }[] } }).trip.legs[0].shape;
    expect(JSON.parse(valhalla[0].body)).toEqual(routeBody(ASKED.mission));
    expect(JSON.parse(valhalla[1].body)).toEqual(traceBody(shape));
    expect(JSON.parse(valhalla[2].body)).toEqual(heightBody(shape));
  });

  it("starts the Valhalla calls one at a time with the real gap between them", async () => {
    const { fetcher } = fixtureFetcher("mission");
    const starts: number[] = [];
    let open = 0;
    let most = 0;
    const timed = asFetch(async (input: string, init?: RequestInit) => {
      if (!String(input).startsWith(VALHALLA_URL)) return fetcher(input, init);
      starts.push(performance.now());
      open += 1;
      most = Math.max(most, open);
      await sleep(5);
      open -= 1;
      return fetcher(input, init);
    });
    planOf(await buildRoutePlan(ASKED.mission, timed, { gate: createGate({ gapMs: 40 }) }));
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(35);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(35);
    expect(most).toBe(1);
  });

  it("sends the avoid points as exclude_locations and the roads mode as use_roads 1", async () => {
    const avoid = [{ lat: 32.783218, lon: -117.253673 }];
    const { fetcher, calls } = fixtureFetcher("mission");
    planOf(await buildRoutePlan({ ...ASKED.mission, avoid, prefer: "roads" }, fetcher, quick));
    const body = JSON.parse(calls[0].body) as { exclude_locations: unknown; costing_options: { bicycle: { use_roads: number } } };
    expect(body.exclude_locations).toEqual(avoid);
    expect(body.costing_options.bicycle.use_roads).toBe(1);
  });

  it("asks QLever once, as a form with a tab-separated reply, for each of the route's 26 ways", async () => {
    const { calls } = await planFor("mission");
    const asked = calls.filter((c) => c.url === url.qlever);
    expect(asked).toHaveLength(1);
    expect(asked[0].headers.Accept).toBe("text/tab-separated-values");
    expect(asked[0].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const query = new URLSearchParams(asked[0].body).get("query") ?? "";
    expect(query.match(/osmway:\d+/g)).toHaveLength(26);
    expect(query).toContain("osmway:1268416485");
  });

  it("asks every Census layer twice at once, for the route's line and for the destination as given", async () => {
    const { calls } = await planFor("mission");
    const census = calls.filter((c) => c.url.startsWith(TIGER_PREFIX));
    expect(census).toHaveLength(TIGER_LAYERS.length * 2);
    expect(new Set(census.map((c) => c.url))).toEqual(new Set(TIGER_LAYERS.map((l) => l.url)));
    const forms = census.map((c) => new URLSearchParams(c.body));
    const lines = forms.filter((f) => f.get("geometryType") === "esriGeometryPolyline");
    const ends = forms.filter((f) => f.get("geometryType") === "esriGeometryPoint");
    expect(lines).toHaveLength(TIGER_LAYERS.length);
    expect(ends).toHaveLength(TIGER_LAYERS.length);
    for (const f of ends) expect(JSON.parse(f.get("geometry") ?? "")).toEqual({ x: -117.2557, y: 32.7967, spatialReference: { wkid: 4326 } });
    for (const f of lines) {
      const path = (JSON.parse(f.get("geometry") ?? "") as { paths: number[][][] }).paths[0];
      expect(path).toHaveLength(128);
      expect(path[0]).toEqual([-117.251486, 32.771206]);
    }
  });

  it("thins a long route to 300 points for the Census, keeping both ends", async () => {
    const wave = Array.from({ length: 1500 }, (_, i) => ({ lat: 32.7 + 0.01 * Math.sin(i / 30), lon: -117.3 + i * 0.00002 }));
    const longRoute = {
      trip: { legs: [{ shape: encodePolyline(wave) }], summary: { length: 3.2, time: 600 } },
    };
    const longTrace = { edges: [{ use: "road", cycle_lane: "none", road_class: "primary", surface: "paved", length: 3.2, way_id: 1, begin_shape_index: 0, end_shape_index: 1499, names: ["Long Road"] }] };
    const { fetcher, calls } = fixtureFetcher("mission", (call) => {
      if (call.url === url.route) return reply(JSON.stringify(longRoute));
      if (call.url === url.trace) return reply(JSON.stringify(longTrace));
      return undefined;
    });
    const plan = planOf(await buildRoutePlan({ from: wave[0], to: wave[1499] }, fetcher, quick));
    expect(plan.points).toHaveLength(1500);
    const lines = calls.filter((c) => c.url.startsWith(TIGER_PREFIX)).map((c) => new URLSearchParams(c.body)).filter((f) => f.get("geometryType") === "esriGeometryPolyline");
    for (const f of lines) {
      const path = (JSON.parse(f.get("geometry") ?? "") as { paths: number[][][] }).paths[0];
      expect(path.length).toBeLessThanOrEqual(TIGER_MAX_POINTS);
      expect(path.length).toBeGreaterThan(100);
      expect(path[0]).toEqual([wave[0].lon, wave[0].lat].map((n) => Number(n.toFixed(6))));
      expect(path[path.length - 1]).toEqual([wave[1499].lon, wave[1499].lat].map((n) => Number(n.toFixed(6))));
    }
  });

  it("logs nothing at all, since the points are a family's home and school", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    await planFor("mission", (call) => (call.url === url.qlever ? reply("down", 500) : undefined));
    await routeResponse(ASKED.delmar, fixtureFetcher("delmar").fetcher, quick);
    await routeResponse({ nope: true });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("when a server fails or runs long", () => {
  it("returns 'no route' when Valhalla says there is no path, and asks nothing else", async () => {
    const { result, calls } = await planFor("mission", (call) => (call.url === url.route ? reply(text("route-error-no-path.json"), 400) : undefined));
    expect(result).toEqual({ ok: false, error: "no_route" });
    expect(calls).toHaveLength(1);
  });

  it("returns busy for any other Valhalla error, a bad answer, a 429, a dropped connection or a slow answer", async () => {
    const cases: [string, Override][] = [
      ["500", () => reply("oops", 500)],
      ["429", () => reply("slow down", 429)],
      ["html", () => reply("<html>Bad gateway</html>", 200)],
      ["too far", () => reply(text("route-error-too-far.json"), 400)],
      ["not a route", () => reply("{}", 200)],
      ["dropped", () => Promise.reject(new TypeError("fetch failed"))],
      ["slow", hang],
    ];
    for (const [label, override] of cases) {
      const { result } = await planFor("mission", (call) => (call.url === url.route ? override(call) : undefined), { routeMs: 40 });
      expect(result, label).toEqual({ ok: false, error: "busy" });
    }
  });

  it("returns busy when the edges can't be read, since there is no plan without them", async () => {
    const cases: [string, Override][] = [
      ["500", () => reply("oops", 500)],
      ["400", () => reply(text("route-error-no-path.json"), 400)],
      ["empty", () => reply("{}")],
      ["other line", () => reply(JSON.stringify({ edges: [{ begin_shape_index: 0, end_shape_index: 999, length: 0.01 }] }))],
      ["slow", hang],
    ];
    for (const [label, override] of cases) {
      const { result } = await planFor("mission", (call) => (call.url === url.trace ? override(call) : undefined), { traceMs: 40 });
      expect(result, label).toEqual({ ok: false, error: "busy" });
    }
  });

  it("returns busy when the line to Valhalla is full", async () => {
    const gate = createGate({ gapMs: 0, maxPending: 1 });
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const occupied = gate.run(() => held);
    const { fetcher, calls } = fixtureFetcher("mission");
    const result = await buildRoutePlan(ASKED.mission, fetcher, { gate });
    expect(result).toEqual({ ok: false, error: "busy" });
    expect(calls).toHaveLength(0);
    release();
    await occupied;
  });

  it("returns busy when any Census layer fails, because a missing district would look like none", async () => {
    for (const layer of TIGER_LAYERS) {
      const { result } = await planFor("mission", (call) => (call.url === layer.url ? reply("down", 503) : undefined));
      expect(result, layer.url).toEqual({ ok: false, error: "busy" });
    }
  });

  it("returns busy when a Census layer sends its HTTP 200 error twice, and recovers when it sends it once", async () => {
    const failure = text("tiger-error.json");
    const always = await planFor("mission", (call) => (call.url === TIGER_LAYERS[1].url ? reply(failure) : undefined));
    expect(always.result).toEqual({ ok: false, error: "busy" });
    expect(always.calls.filter((c) => c.url === TIGER_LAYERS[1].url)).toHaveLength(4);

    let seen = 0;
    const once = await planFor("mission", (call) => (call.url === TIGER_LAYERS[1].url && seen++ === 0 ? reply(failure) : undefined));
    expect(planOf(once.result).crossed.map((j) => j.layer)).toContain("county");
    expect(once.calls.filter((c) => c.url === TIGER_LAYERS[1].url)).toHaveLength(3);
  });

  it("returns busy when the Census is slow, once its time is up", async () => {
    const { result } = await planFor("mission", (call) => (call.url === TIGER_LAYERS[2].url ? hang(call) : undefined), { boundariesMs: 60 });
    expect(result).toEqual({ ok: false, error: "busy" });
  });

  it("returns busy as soon as one stage fails, without waiting for the other to finish", async () => {
    const early = async (override: Override) => {
      const planned = planFor("mission", override, { boundariesMs: 2500, tagsMs: 2500 });
      return Promise.race([planned.then((p) => p.result), sleep(900).then(() => "waited" as const)]);
    };
    // The edges fail at once while the Census hangs.
    expect(
      await early((call) => {
        if (call.url === url.trace) return reply("down", 502);
        return call.url.startsWith(TIGER_PREFIX) ? hang(call) : undefined;
      }),
    ).toEqual({ ok: false, error: "busy" });
    // A Census layer fails at once while QLever hangs.
    expect(
      await early((call) => {
        if (call.url === TIGER_LAYERS[0].url) return reply("down", 502);
        return call.url === url.qlever ? hang(call) : undefined;
      }),
    ).toEqual({ ok: false, error: "busy" });
  });

  it("returns the plan with no tags, and says so, when QLever fails", async () => {
    const cases: [string, Override][] = [
      ["500", () => reply("down", 500)],
      ["html", () => reply("<html>Bad gateway</html>")],
      ["json error", () => reply('{"exception":"Query timed out"}')],
      ["dropped", () => Promise.reject(new TypeError("fetch failed"))],
      ["slow", hang],
    ];
    for (const [label, override] of cases) {
      const plan = planOf((await planFor("mission", (call) => (call.url === url.qlever ? override(call) : undefined), { tagsMs: 40 })).result);
      expect(plan.sources.tags, label).toMatch(/^Not read\. QLever did not answer in time/);
      expect(plan.segments, label).toHaveLength(26);
      expect(plan.segments.every((s) => Object.keys(s.tags).length === 0), label).toBe(true);
      expect(plan.segments.map((s) => s.kind), label).toContain("footway");
      expect(plan.segments[0].placeGeoid, label).toBe("0666000");
    }
  });

  it("returns the plan with a null climb when the height service fails, is slow, or has no readings", async () => {
    const cases: [string, Override][] = [
      ["500", () => reply("down", 500)],
      ["html", () => reply("<html></html>")],
      ["no heights", () => reply('{"range_height":[[0,null],[10,null]]}')],
      ["one height", () => reply('{"range_height":[[0,12]]}')],
      ["slow", hang],
    ];
    for (const [label, override] of cases) {
      const plan = planOf((await planFor("mission", (call) => (call.url === url.height ? override(call) : undefined), { heightMs: 40 })).result);
      expect(plan.climbMeters, label).toBeNull();
      expect(plan.segments, label).toHaveLength(26);
    }
  });

  it("does not ask QLever, and does not fail, when no edge has a way id", async () => {
    const noWays = { edges: [{ use: "road", cycle_lane: "none", road_class: "primary", surface: "paved", length: 3.541, begin_shape_index: 0, end_shape_index: 127, names: ["Mission Boulevard"] }] };
    const { result, calls } = await planFor("mission", (call) => (call.url === url.trace ? reply(JSON.stringify(noWays)) : undefined));
    const plan = planOf(result);
    expect(calls.some((c) => c.url === url.qlever)).toBe(false);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]).toMatchObject({ kind: "road", name: "Mission Boulevard", wayId: null, from: 0, to: 127, meters: 3541 });
  });
});

describe("listing the crossed areas along the route", () => {
  // The Mission Beach route runs north, from latitude 32.771 to 32.797. The south half is in the
  // city of Bravo (id 0600002) and the north half in Alpha (id 0600001), so the order by id
  // is the reverse of the order along the route. A third city, Charlie, only touches the route.
  const south = rectangle(-117.4, 32.7, -117.1, 32.784);
  const north = rectangle(-117.4, 32.784, -117.1, 32.9);
  const answer = (...areas: { name: string; geoid: string; ring?: Ring }[]) =>
    JSON.stringify({
      features: areas.map((a) => ({ attributes: { NAME: a.name, BASENAME: a.name, GEOID: a.geoid, STATE: "06" }, geometry: a.ring ? { rings: [a.ring] } : undefined })),
    });

  async function crossedWith(extra: Override) {
    const override: Override = (call) => {
      const placeLine = call.url === TIGER_LAYERS[2].url && new URLSearchParams(call.body).get("geometryType") === "esriGeometryPolyline";
      if (placeLine) {
        return reply(
          answer(
            { name: "Alpha", geoid: "0600001", ring: north },
            { name: "Charlie", geoid: "0600000", ring: rectangle(-117.1, 32.7, -117.0, 32.9) },
            { name: "Bravo", geoid: "0600002", ring: south },
          ),
        );
      }
      return extra(call);
    };
    return planOf((await planFor("mission", override)).result);
  }

  it("lists a layer's areas in the order the route reaches them, and the ones it only touches last", async () => {
    const plan = await crossedWith(() => undefined);
    expect(plan.crossed.filter((j) => j.layer === "place").map((j) => j.name)).toEqual(["Bravo", "Alpha", "Charlie"]);
    const placed = plan.segments.map((s) => s.placeName);
    expect(placed[0]).toBe("Bravo");
    expect(placed[placed.length - 1]).toBe("Alpha");
    expect(placed).not.toContain("Charlie");
    // The layers stay in their own order: state, county, city, then the districts.
    expect(plan.crossed.map((j) => j.layer)).toEqual(["state", "county", "place", "place", "place", "school_unified"]);
  });

  it("splits a segment where the route crosses from one city to the next", async () => {
    const plan = await crossedWith(() => undefined);
    const cities = plan.segments.map((s) => s.placeName);
    const changes = cities.filter((c, i) => i > 0 && c !== cities[i - 1]);
    expect(changes).toEqual(["Alpha"]);
  });

  it("uses the state's outline when no county holds a segment, and leaves the county empty", async () => {
    const california = JSON.stringify({
      features: [{ attributes: { NAME: "California", STUSAB: "CA", GEOID: "06" }, geometry: { rings: [rectangle(-118, 32, -116, 34)] } }],
    });
    const plan = planOf(
      (
        await planFor("mission", (call) => {
          if (new URLSearchParams(call.body).get("geometryType") !== "esriGeometryPolyline") return undefined;
          if (call.url === TIGER_LAYERS[0].url) return reply(california);
          if (call.url === TIGER_LAYERS[1].url) return reply('{"features":[]}');
          return undefined;
        })
      ).result,
    );
    for (const s of plan.segments) {
      expect(s.state).toBe("CA");
      expect(s.countyGeoid).toBeNull();
      expect(s.placeGeoid).toBe("0666000");
    }
    expect(plan.crossed.some((j) => j.layer === "county")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The route handler
// ---------------------------------------------------------------------------------------------

describe("the handler's answers", () => {
  const body = ASKED.mission;
  const asJson = async (res: Response) => (await res.json()) as Record<string, unknown>;

  it("answers 200 with the plan, and tells the browser and the CDN not to keep it", async () => {
    const { fetcher } = fixtureFetcher("mission");
    const res = await routeResponse(body, fetcher, quick);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const plan = (await res.json()) as RoutePlan;
    expect(plan.segments).toHaveLength(26);
    expect(plan.meters).toBe(3541);
  });

  it("answers 400 invalid, without calling anyone, for every kind of bad request", async () => {
    const bad: unknown[] = [
      null,
      "x",
      {},
      { from: body.from },
      { from: body.from, to: body.from },
      { from: { lat: 51.5, lon: -0.12 }, to: { lat: 51.51, lon: -0.11 } },
      { from: body.from, to: { lat: 34.05, lon: -118.24 } },
      { ...body, avoid: Array(21).fill(body.from) },
      { ...body, prefer: "fastest" },
    ];
    for (const request of bad) {
      const { fetcher, calls } = fixtureFetcher("mission");
      const res = await routeResponse(request, fetcher, quick);
      expect(res.status, JSON.stringify(request)).toBe(400);
      expect(await asJson(res)).toEqual({ error: "invalid" });
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(calls).toHaveLength(0);
    }
  });

  it("answers 404 no_route when Valhalla finds none", async () => {
    const { fetcher } = fixtureFetcher("mission", (call) => (call.url === url.route ? reply(text("route-error-no-path.json"), 400) : undefined));
    const res = await routeResponse(body, fetcher, quick);
    expect(res.status).toBe(404);
    expect(await asJson(res)).toEqual({ error: "no_route" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 busy when Valhalla or the Census fails or runs long", async () => {
    const overrides: Override[] = [
      (call) => (call.url === url.route ? reply("down", 502) : undefined),
      (call) => (call.url === url.trace ? reply("down", 502) : undefined),
      (call) => (call.url === TIGER_LAYERS[3].url ? reply("down", 502) : undefined),
    ];
    for (const override of overrides) {
      clearPlanCache();
      const res = await routeResponse(body, fixtureFetcher("mission", override).fetcher, quick);
      expect(res.status).toBe(503);
      expect(await asJson(res)).toEqual({ error: "busy" });
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    clearPlanCache();
    const slow = await routeResponse(body, fixtureFetcher("mission", (call) => (call.url === url.route ? hang(call) : undefined)).fetcher, { ...quick, limits: { routeMs: 30 } });
    expect(slow.status).toBe(503);
  });

  it("answers 503 busy, and logs only the kind of error, if the pipeline itself fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = { run: () => Promise.reject(new RangeError("lat 32.7712 lon -117.2517")) };
    const res = await routeResponse(body, fixtureFetcher("mission").fetcher, { gate: broken });
    expect(res.status).toBe(503);
    expect(await asJson(res)).toEqual({ error: "busy" });
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).toBe('[["route plan failed:","RangeError"]]');
  });

  it("answers the same request from memory, without asking anyone again, until the cache is cleared", async () => {
    const { fetcher, calls } = fixtureFetcher("mission");
    const first = await routeResponse(body, fetcher, quick);
    const asked = calls.length;
    expect(asked).toBeGreaterThan(20);
    const again = await routeResponse({ ...body, avoid: [] }, fetcher, quick);
    expect(calls.length).toBe(asked);
    expect(await again.json()).toEqual(await first.json());
    expect(again.headers.get("cache-control")).toBe("no-store");
    clearPlanCache();
    await routeResponse(body, fetcher, quick);
    expect(calls.length).toBe(asked * 2);
  });

  it("treats a point a meter away as the same request, and a different avoid point or mode as a different one", async () => {
    const { fetcher, calls } = fixtureFetcher("mission");
    await routeResponse(body, fetcher, quick);
    const asked = calls.length;
    await routeResponse({ ...body, from: { lat: body.from.lat + 0.000001, lon: body.from.lon } }, fetcher, quick);
    expect(calls.length).toBe(asked);
    await routeResponse({ ...body, prefer: "roads" }, fetcher, quick);
    expect(calls.length).toBe(asked * 2);
    await routeResponse({ ...body, avoid: [{ lat: 32.783218, lon: -117.253673 }] }, fetcher, quick);
    expect(calls.length).toBe(asked * 3);
  });

  it("does not cache a failure", async () => {
    const down = fixtureFetcher("mission", () => reply("down", 500));
    expect((await routeResponse(body, down.fetcher, quick)).status).toBe(503);
    const up = fixtureFetcher("mission");
    expect((await routeResponse(body, up.fetcher, quick)).status).toBe(200);
  });
});

describe("POST /api/route", () => {
  const post = (payload: string, ip: string) =>
    routeModule.POST(new Request("http://localhost/api/route", { method: "POST", body: payload, headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } }));

  afterEach(() => vi.unstubAllGlobals());

  it("is a POST route with a 60 second limit, and has no GET", () => {
    expect(Object.keys(routeModule).sort()).toEqual(["POST", "maxDuration"]);
    expect(routeModule.maxDuration).toBe(60);
  });

  it("answers 400 invalid for a body that is empty, not JSON, a list, or too big, without calling anyone", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const payload of ["", "not json", "[1,2]", "null", `{"pad":"${"x".repeat(9000)}"}`]) {
      const res = await post(payload, "198.51.100.10");
      expect(res.status, payload.slice(0, 20)).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid" });
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("answers 429 rate after 30 requests in ten minutes from one address, and not for another address", async () => {
    vi.stubGlobal("fetch", vi.fn());
    for (let i = 0; i < 30; i += 1) expect((await post("{}", "198.51.100.20")).status).toBe(400);
    const limited = await post("{}", "198.51.100.20");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate" });
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect((await post("{}", "198.51.100.21")).status).toBe(400);
  });

  it("answers a real request end to end through the default line to Valhalla", { timeout: 15_000 }, async () => {
    const { fetcher, calls } = fixtureFetcher("mission");
    vi.stubGlobal("fetch", fetcher);
    const res = await post(JSON.stringify(ASKED.mission), "198.51.100.30");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const plan = (await res.json()) as RoutePlan;
    expect(plan.segments.map((s) => s.kind)).toContain("footway");
    expect(plan.segments.every((s) => s.placeGeoid === "0666000")).toBe(true);
    expect(calls.filter((c) => c.url.startsWith(VALHALLA_URL))).toHaveLength(3);
  });
});
