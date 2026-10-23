// The router side of the legal route check: what we ask the public Valhalla server for, how its
// answers are read, and how an edge of the route becomes a kind of way. The pipeline in plan.ts
// does the asking. This file only builds request bodies and reads answers, so the tests need no
// network.
//
// FOSSGIS usage policy for valhalla1.openstreetmap.de. Read on 2026-10-23 from
// https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/ (the live page sits behind
// a bot check, so the text was read from the Internet Archive copy of 2026-10-02) and from the
// Valhalla docs, which say the demo server follows the same fair-use policy as the OSRM and
// Nominatim demos:
//   - A real User-Agent that names the app. A library's default does not count, and posing as
//     another app gets the address blocked. Send a Referer too when it is possible.
//   - At most one request per second. A script gets one connection at a time.
//   - No scraping and no mass downloads. Commercial use only if the service is not a substantial
//     part of the offer. Sites with a lot of traffic may not use it.
//   - Wherever the route shows, give the OpenStreetMap credit, link https://www.openstreetmap.org/fixthemap
//     and show a contact email. That is the page's job, not this file's.
//   - No promise it is up. It is one volunteer-run server, and access can be pulled at any time.
//   - The Valhalla docs ask apps with end users to send an X-Client-Id header and say hello in
//     the Valhalla GitHub discussions. The URL should be changeable, so VALHALLA_URL can set it.
// What we do about it: plan.ts sends one request at a time, at least a second apart, from a single
// queue, and gives up with "busy" when the queue is long. A route costs three requests (route,
// trace_attributes, height), and a repeat of the same route is served from a short in-memory cache.

import type { PostedTags, RoutePoint, RouteRequest, WayKind } from "./types";
import { decodePolyline, isRecord } from "./geo";

/** The public FOSSGIS server. The policy asks apps not to hardcode it, so the environment can change it. */
export const VALHALLA_URL: string = (process.env.VALHALLA_URL || "https://valhalla1.openstreetmap.de").replace(/\/+$/, "");

export const VALHALLA_PATHS = { route: "/route", trace: "/trace_attributes", height: "/height" } as const;

/** How freely the route may use streets, from 0 to 1. "balanced" favors paths and quiet streets, and "roads" uses streets and bike lanes. */
export const USE_ROADS = { balanced: 0.25, roads: 1 } as const;

/** How willing the rider is to climb, from 0 (avoid hills) to 1 (don't mind them). Half way suits a family, and near zero avoids the big ones. */
export const USE_HILLS = { normal: 0.5, avoid: 0.05 } as const;

/** What Valhalla is asked for each edge of the route. Nothing else is read. */
const EDGE_ATTRIBUTES = [
  "edge.use",
  "edge.cycle_lane",
  "edge.road_class",
  "edge.names",
  "edge.length",
  "edge.way_id",
  "edge.begin_shape_index",
  "edge.end_shape_index",
  "edge.surface",
  "edge.sidewalk_left",
  "edge.sidewalk_right",
  "edge.bicycle_network",
] as const;

function location(point: RoutePoint): { lat: number; lon: number } {
  return { lat: point.lat, lon: point.lon };
}

/**
 * The body of the route request. exclude_locations is the current name for what older Valhalla
 * called avoid_locations. Both worked on the FOSSGIS server on 2026-10-23, and the route changed
 * the same way with either, so the current name is the one used.
 */
export function routeBody(request: RouteRequest) {
  const body = {
    locations: [location(request.from), location(request.to)],
    costing: "bicycle",
    costing_options: {
      bicycle: { bicycle_type: "Hybrid", use_roads: USE_ROADS[request.prefer ?? "balanced"], use_hills: USE_HILLS[request.avoidHills ? "avoid" : "normal"] },
    },
    directions_options: { units: "kilometers" },
  };
  const avoid = request.avoid ?? [];
  return avoid.length > 0 ? { ...body, exclude_locations: avoid.map(location) } : body;
}

/** Asks which edges the route's own line runs along. edge_walk follows the line exactly, with no guessing. */
export function traceBody(shape: string) {
  return {
    encoded_polyline: shape,
    costing: "bicycle",
    shape_match: "edge_walk",
    filters: { attributes: [...EDGE_ATTRIBUTES], action: "include" },
  };
}

/** Asks for the height along the route's line, one reading per vertex. */
export function heightBody(shape: string) {
  return { encoded_polyline: shape, range: true };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Valhalla's "this is not a route" answers, from the error table in its API reference: 442 no path
 * between the points, 171 no suitable street near a point, 170 the points are in unconnected
 * regions. They come with HTTP 400, and 442 was recorded from the FOSSGIS server (see
 * tests/fixtures/route). Any other error, like 154 for a route over the distance limit or 130 for
 * a location it can't read, is something wrong with the request or the server, so it is not here.
 */
const NO_ROUTE_CODES: ReadonlySet<number> = new Set([170, 171, 442]);

export function isNoRoute(status: number, json: unknown): boolean {
  return status === 400 && isRecord(json) && finite(json.error_code) && NO_ROUTE_CODES.has(json.error_code);
}

export interface ParsedRoute {
  /** The encoded line exactly as Valhalla wrote it, to send back for the edge and height lookups. */
  shape: string;
  points: RoutePoint[];
  meters: number;
  seconds: number;
}

/** The line, length and time of the route, or null when the answer is not a clean one-leg route. */
export function parseRoute(json: unknown): ParsedRoute | null {
  if (!isRecord(json) || !isRecord(json.trip)) return null;
  const { legs, summary } = json.trip;
  if (!Array.isArray(legs) || legs.length < 1 || !isRecord(legs[0]) || !isRecord(summary)) return null;
  const shape = legs[0].shape;
  if (typeof shape !== "string" || shape === "") return null;
  if (!finite(summary.length) || summary.length < 0 || !finite(summary.time) || summary.time < 0) return null;
  const points = decodePolyline(shape);
  if (!points || points.length < 2) return null;
  return { shape, points, meters: Math.round(summary.length * 1000), seconds: Math.round(summary.time) };
}

/** One edge of the route: a stretch of one way between two junctions. */
export interface ValhallaEdge {
  /** Valhalla's use, like "road", "cycleway" or "footway". Empty when it didn't say. */
  use: string;
  /** "none", "shared", "dedicated" or "separated". */
  cycleLane: string;
  /** "motorway" down to "service_other". Footways and cycleways are service_other too. */
  roadClass: string;
  surface: string;
  names: string[];
  /** Length along the route, which is less than the whole edge at either end of the route. */
  meters: number;
  /** The OpenStreetMap way id, or null when Valhalla gave none. */
  wayId: number | null;
  /** First and last index in the route's points. */
  from: number;
  to: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function wayIdOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * The edges of the route in order, or null when any edge cannot be placed on the route's line.
 * Each edge must start and end on a point of the line, so a mismatch means the answer is for some
 * other line and every kind and place would land on the wrong piece.
 */
export function parseEdges(json: unknown, pointCount: number): ValhallaEdge[] | null {
  if (!isRecord(json) || !Array.isArray(json.edges)) return null;
  const edges: ValhallaEdge[] = [];
  for (const raw of json.edges) {
    if (!isRecord(raw)) return null;
    const from = raw.begin_shape_index;
    const to = raw.end_shape_index;
    if (typeof from !== "number" || typeof to !== "number" || !Number.isInteger(from) || !Number.isInteger(to)) return null;
    if (from < 0 || to < from || to >= pointCount) return null;
    if (!finite(raw.length) || raw.length < 0) return null;
    edges.push({
      use: text(raw.use),
      cycleLane: text(raw.cycle_lane) || "none",
      roadClass: text(raw.road_class),
      surface: text(raw.surface),
      names: Array.isArray(raw.names) ? raw.names.filter((n): n is string => typeof n === "string" && n !== "") : [],
      meters: Math.round(raw.length * 1000),
      wayId: wayIdOf(raw.way_id),
      from,
      to,
    });
  }
  return edges;
}

/** Valhalla's "no reading here" value for a height. Real ground is never below -1000 m. */
const MIN_HEIGHT_M = -1000;

/** One height per route point, in order, with null where there is no reading. Null when the answer doesn't match the route. */
export function parseHeightReadings(json: unknown, points: number): (number | null)[] | null {
  if (!isRecord(json) || !Array.isArray(json.range_height) || json.range_height.length !== points) return null;
  return json.range_height.map((pair: unknown) => (Array.isArray(pair) && finite(pair[1]) && pair[1] > MIN_HEIGHT_M ? pair[1] : null));
}

/** The heights along the route in order, in meters, with places that have no reading left out. Null when the answer isn't heights. */
export function parseHeights(json: unknown): number[] | null {
  if (!isRecord(json) || !Array.isArray(json.range_height)) return null;
  const heights: number[] = [];
  for (const pair of json.range_height) {
    if (!Array.isArray(pair)) return null;
    const height = pair[1];
    if (finite(height) && height > MIN_HEIGHT_M) heights.push(height);
  }
  return heights;
}

/**
 * A rise has to reach this many meters before it counts. The heights are whole meters read off a
 * grid about 30 m wide, so a flat road wobbles by a meter or so between readings. Adding up every
 * upward wobble would turn a flat route into one with a hill.
 */
export const MIN_RISE_M = 2;

/**
 * Total climb along the route in meters. A climb is counted from the lowest point reached since the
 * last counted climb, once it has risen MIN_RISE_M above it. A long steady slope is counted in
 * full, and a wobble that never reaches MIN_RISE_M adds nothing.
 */
export function totalClimbMeters(heights: readonly number[]): number {
  if (heights.length === 0) return 0;
  let low = heights[0];
  let climb = 0;
  for (const height of heights) {
    if (height < low) {
      low = height;
    } else if (height - low >= MIN_RISE_M) {
      climb += height - low;
      low = height;
    }
  }
  return Math.round(climb);
}

/** Surfaces a bike on thin tires can't count on. Valhalla's other surfaces are all paved. */
const UNPAVED_SURFACES: ReadonlySet<string> = new Set(["compacted", "gravel", "dirt", "path", "impassable"]);

/** Uses that are a street open to cars, where a bike lane may run along the side. */
const STREET_USES: ReadonlySet<string> = new Set([
  "road",
  "residential",
  "living_street",
  "service_road",
  "parking_aisle",
  "driveway",
  "alley",
  "turn_channel",
  "ramp",
  "culdesac",
  "emergency_access",
  "drive_through",
]);

/** The road classes Valhalla gives a street, from motorway down to service_other. */
const STREET_CLASSES: ReadonlySet<string> = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "service_other",
]);

const FOOTWAY_USES: ReadonlySet<string> = new Set(["footway", "sidewalk", "pedestrian", "steps", "elevator"]);
const PATH_USES: ReadonlySet<string> = new Set(["path", "mountain_bike", "track"]);

/** A street piece is a bike lane or a separated bikeway when Valhalla says so, and plain road otherwise. */
function streetKind(edge: ValhallaEdge): WayKind {
  if (edge.cycleLane === "dedicated") return "bike_lane";
  if (edge.cycleLane === "separated") return "separated_bikeway";
  return "road";
}

/**
 * What kind of way an edge runs on. The rules go from the most specific to the most general, and
 * the first that fits wins:
 *  1. A crosswalk, by Valhalla's use or by footway=crossing, is a crossing. A ferry is a ferry.
 *  2. Footways, sidewalks, pedestrian ways, steps and elevators are a sidewalk when OpenStreetMap
 *     or Valhalla says so (footway=sidewalk, use sidewalk, or a way tagged as running beside a
 *     street), and a footway otherwise.
 *  3. A cycleway is a trail when its surface is unpaved. Beside a street (sidepath) it is a
 *     separated bikeway. Away from streets it is a bike path.
 *  4. A path, mountain bike trail or track is a trail when unpaved. When paved it is a bike path if
 *     bikes are designated or allowed, and a footway if not. An unknown surface counts as paved.
 *  5. A street is a bike lane, a separated bikeway or plain road by its cycle_lane. Valhalla gives
 *     every footway and cycleway a road class too, so the class only decides when the use is
 *     missing. A use we don't know, like a bridleway or an escalator, is "other" so the rule check
 *     says it can't tell and does not call it a street.
 */
export function classifyEdge(edge: ValhallaEdge, tags: PostedTags): WayKind {
  const { use } = edge;
  if (use === "pedestrian_crossing" || tags.footway === "crossing") return "crossing";
  if (use === "ferry" || use === "rail-ferry") return "ferry";
  const unpaved = UNPAVED_SURFACES.has(edge.surface);
  if (FOOTWAY_USES.has(use)) {
    return use === "sidewalk" || tags.footway === "sidewalk" || tags.sidepath === true ? "sidewalk" : "footway";
  }
  if (use === "cycleway") {
    if (unpaved) return "trail";
    return tags.sidepath === true ? "separated_bikeway" : "bike_path";
  }
  if (PATH_USES.has(use)) {
    if (unpaved) return "trail";
    return tags.bicycle === "designated" || tags.bicycle === "yes" ? "bike_path" : "footway";
  }
  if (STREET_USES.has(use) || (use === "" && STREET_CLASSES.has(edge.roadClass))) return streetKind(edge);
  return "other";
}
