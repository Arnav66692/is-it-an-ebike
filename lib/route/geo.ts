// Plain geometry for the legal route check: reading the router's encoded line, measuring it,
// thinning it for the Census query and testing which boundary a point is in. Every function here
// depends only on its arguments, so the tests need no network.

import type { RoutePoint } from "./types";

const EARTH_RADIUS_M = 6_371_008.8;
const METERS_PER_DEGREE = (Math.PI / 180) * EARTH_RADIUS_M;

/** True for a plain JSON object, so an answer from another server can be read without trusting its shape. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A polygon ring as Esri JSON writes it: a list of [longitude, latitude] pairs. */
export type Ring = readonly (readonly number[])[];

export interface Box {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface Chunk {
  value: number;
  next: number;
}

/** One signed number from an encoded line, or null when the text ends mid-number or is not valid. */
function readChunk(text: string, start: number): Chunk | null {
  let packed = 0;
  let shift = 0;
  let i = start;
  for (;;) {
    if (i >= text.length) return null;
    const code = text.charCodeAt(i) - 63;
    i += 1;
    if (code < 0 || code > 63) return null;
    // Multiplying instead of shifting keeps a long, corrupt number from wrapping around.
    packed += (code & 0x1f) * 2 ** shift;
    shift += 5;
    if (code < 0x20) break;
    if (shift > 35) return null;
  }
  // The lowest bit is the sign: odd numbers are negative.
  return { value: packed % 2 === 1 ? -(packed + 1) / 2 : packed / 2, next: i };
}

/**
 * Reads a Google-style encoded line. Valhalla writes its shapes with 6 decimals, so that is the
 * default. Returns null when the text is cut short, holds a character the format doesn't use, or
 * leaves the map. A router answer like that is not worth guessing at.
 */
export function decodePolyline(encoded: string, precision = 6): RoutePoint[] | null {
  const factor = 10 ** precision;
  const points: RoutePoint[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  while (i < encoded.length) {
    const dLat = readChunk(encoded, i);
    if (!dLat) return null;
    const dLon = readChunk(encoded, dLat.next);
    if (!dLon) return null;
    i = dLon.next;
    lat += dLat.value;
    lon += dLon.value;
    const point = { lat: lat / factor, lon: lon / factor };
    if (Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return null;
    points.push(point);
  }
  return points;
}

/** Great-circle distance in meters. Over 50 km the error against the true ellipsoid is far below a block. */
export function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The point half way along points[from..to] by length, so a long edge is judged where its middle
 * is and not at an end. Null when the range does not sit inside the line.
 */
export function midpointAlong(points: readonly RoutePoint[], from: number, to: number): RoutePoint | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= points.length) return null;
  let total = 0;
  for (let i = from; i < to; i += 1) total += haversineMeters(points[i], points[i + 1]);
  if (total === 0) return points[from];
  let remaining = total / 2;
  for (let i = from; i < to; i += 1) {
    const step = haversineMeters(points[i], points[i + 1]);
    if (remaining <= step) {
      const t = step === 0 ? 0 : remaining / step;
      return {
        lat: points[i].lat + (points[i + 1].lat - points[i].lat) * t,
        lon: points[i].lon + (points[i + 1].lon - points[i].lon) * t,
      };
    }
    remaining -= step;
  }
  return points[to];
}

interface Flat {
  x: number;
  y: number;
}

/** Local flat meters around a reference latitude, which is exact enough to measure a few kilometers. */
function flatten(points: readonly RoutePoint[]): Flat[] {
  const lat0 = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * METERS_PER_DEGREE;
  return points.map((p) => ({ x: p.lon * kx, y: p.lat * METERS_PER_DEGREE }));
}

/** Distance from (px, py) to the segment from (ax, ay) to (bx, by), all in the same flat units. */
function pointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToSegment(p: Flat, a: Flat, b: Flat): number {
  return pointToSegment(p.x, p.y, a.x, a.y, b.x, b.y);
}

interface Span {
  lo: number;
  hi: number;
  /** The point between lo and hi that sits farthest from the straight line joining them. */
  far: number;
  gap: number;
}

function widestPoint(flat: readonly Flat[], lo: number, hi: number): Span {
  let far = lo;
  let gap = 0;
  for (let i = lo + 1; i < hi; i += 1) {
    const d = distanceToSegment(flat[i], flat[lo], flat[hi]);
    if (d > gap) {
      gap = d;
      far = i;
    }
  }
  return { lo, hi, far, gap };
}

/**
 * Thins a line to at most maxPoints, keeping the ends. It is Douglas-Peucker run from the biggest
 * detour down: the point that strays farthest from the current shape is kept first, so the points
 * that are dropped are the ones that matter least, whatever the limit is.
 */
export function simplifyPolyline(points: readonly RoutePoint[], maxPoints: number): RoutePoint[] {
  const limit = Math.max(2, Math.floor(maxPoints));
  if (points.length <= limit) return [...points];
  const flat = flatten(points);
  const keep = new Set<number>([0, points.length - 1]);
  const open: Span[] = [widestPoint(flat, 0, points.length - 1)];
  while (keep.size < limit && open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].gap > open[best].gap) best = i;
    const [span] = open.splice(best, 1);
    if (span.gap === 0) break;
    keep.add(span.far);
    if (span.far - span.lo > 1) open.push(widestPoint(flat, span.lo, span.far));
    if (span.hi - span.far > 1) open.push(widestPoint(flat, span.far, span.hi));
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}

/** The smallest box around the rings, or null when they hold no point. */
export function ringsBox(rings: readonly Ring[]): Box | null {
  let box: Box | null = null;
  for (const ring of rings) {
    for (const position of ring) {
      const [lon, lat] = position;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      box = box
        ? { west: Math.min(box.west, lon), south: Math.min(box.south, lat), east: Math.max(box.east, lon), north: Math.max(box.north, lat) }
        : { west: lon, south: lat, east: lon, north: lat };
    }
  }
  return box;
}

export function boxContains(box: Box, point: RoutePoint): boolean {
  return point.lon >= box.west && point.lon <= box.east && point.lat >= box.south && point.lat <= box.north;
}

/** True when the point is in the box or within the given meters of it. A quick test before measuring a distance to an outline. */
export function boxNear(box: Box, point: RoutePoint, meters: number): boolean {
  const latPad = meters / METERS_PER_DEGREE;
  const lonPad = latPad / Math.max(Math.cos((point.lat * Math.PI) / 180), 0.01);
  return point.lon >= box.west - lonPad && point.lon <= box.east + lonPad && point.lat >= box.south - latPad && point.lat <= box.north + latPad;
}

/** Meters from the point to the closest edge of the rings, inside or out, or Infinity when the rings have no edge. */
export function distanceToRingsMeters(point: RoutePoint, rings: readonly Ring[]): number {
  const kx = Math.cos((point.lat * Math.PI) / 180) * METERS_PER_DEGREE;
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const d = pointToSegment(0, 0, (a[0] - point.lon) * kx, (a[1] - point.lat) * METERS_PER_DEGREE, (b[0] - point.lon) * kx, (b[1] - point.lat) * METERS_PER_DEGREE);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * True when the point is inside the polygon the rings describe. It counts how many ring edges a ray
 * from the point crosses, across all rings at once. An odd count is inside. That one rule handles a
 * polygon in several parts and a hole in it (a ring inside a ring), whichever way the rings run.
 */
export function pointInRings(point: RoutePoint, rings: readonly Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > point.lat !== yj > point.lat && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Boxes around the places this feature covers: the lower 48 with DC, Alaska, Hawaii, and Puerto
 * Rico with the U.S. Virgin Islands. They are rough on purpose and take in some of Canada, Mexico
 * and the Caribbean. They only turn away a point that is plainly somewhere else, such as London.
 * The Census lookup says what is really there. The far Aleutian islands, past the 180th meridian,
 * are left out.
 */
const US_BOXES: readonly Box[] = [
  { west: -125.1, south: 24.3, east: -66.8, north: 49.5 },
  { west: -179.9, south: 51, east: -129.9, north: 71.6 },
  { west: -160.4, south: 18.8, east: -154.7, north: 22.4 },
  { west: -67.5, south: 17.6, east: -64.5, north: 18.6 },
];

export function inUnitedStates(point: RoutePoint): boolean {
  return US_BOXES.some((box) => boxContains(box, point));
}
