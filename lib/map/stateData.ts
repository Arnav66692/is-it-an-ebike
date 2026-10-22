// The map's saved data: one compact file per US state, or per tile of a big state, in
// public/map/states/, with index.json listing each file's box. scripts/map/build_states.py writes
// them from OpenStreetMap and Overture Maps, and docs/MAP_DATA.md describes the format. Everything
// here is a plain function, so the parser and the area choice are tested without a browser.

import { safeWebsite, type Bounds, type LatLon, type Spot, type SpotSource } from "./osm";

export const STATE_INDEX_URL = "/map/states/index.json";
export const STATE_DIR = "/map/states/";

/** One saved file and the box it covers. */
export interface StateArea {
  id: string;
  state: string;
  bounds: Bounds;
  file: string;
}

/** A state with no saved file yet, so views there ask the live route. */
export interface MissingState {
  id: string;
  bounds: Bounds;
}

export interface StateIndex {
  areas: StateArea[];
  missing: MissingState[];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** A [south, west, north, east] box, or null when it isn't one. */
function boxOf(v: unknown): Bounds | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [south, west, north, east] = v.map(num);
  if (south === null || west === null || north === null || east === null) return null;
  return { south, west, north, east };
}

/** A file name the page may ask for: letters, digits and dashes, ending in .json, never a path. */
const SAFE_FILE = /^[A-Za-z0-9-]+\.json$/;

/** The index, or null when it is not one. Rows without a box or a safe file name are skipped. */
export function parseStateIndex(json: unknown): StateIndex | null {
  const root = json as { areas?: unknown; missing?: unknown } | null;
  if (!root || typeof root !== "object" || !Array.isArray(root.areas)) return null;
  const areas: StateArea[] = [];
  for (const row of root.areas as Record<string, unknown>[]) {
    const bounds = boxOf(row?.bbox);
    const id = str(row?.id);
    const file = str(row?.file);
    if (!bounds || !id || !file || !SAFE_FILE.test(file)) continue;
    areas.push({ id, state: str(row.state) ?? id, bounds, file });
  }
  const missing: MissingState[] = [];
  for (const row of (Array.isArray(root.missing) ? root.missing : []) as Record<string, unknown>[]) {
    const bounds = boxOf(row?.bbox);
    const id = str(row?.id);
    if (bounds && id) missing.push({ id, bounds });
  }
  return { areas, missing };
}

export function overlaps(a: Bounds, b: Bounds): boolean {
  return a.south <= b.north && a.north >= b.south && a.west <= b.east && a.east >= b.west;
}

function contains(b: Bounds, p: LatLon): boolean {
  return p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east;
}

export interface AreaChoice {
  /** The saved files to load for this view. */
  areas: StateArea[];
  /** True when the view sits in a state with no saved file, so the live route answers instead. */
  live: boolean;
}

/**
 * Which saved files answer a view. The view's center decides: inside a saved area, every saved
 * area the view touches is loaded. Inside a state with no saved file, the live route answers.
 * Off every state's box, such as out at sea, whatever saved areas the view touches answer, and
 * the live route only when there are none.
 */
export function chooseAreas(index: StateIndex, view: Bounds): AreaChoice {
  const center = { lat: (view.south + view.north) / 2, lon: (view.west + view.east) / 2 };
  const touching = index.areas.filter((a) => overlaps(a.bounds, view));
  if (index.areas.some((a) => contains(a.bounds, center))) return { areas: touching, live: false };
  if (index.missing.some((m) => contains(m.bounds, center))) return { areas: [], live: true };
  return { areas: touching, live: touching.length === 0 };
}

const RACK_COVERED = 1;
const RACK_UNCOVERED = 2;
const RACK_PRIVATE = 4;

const SOURCES: Record<string, SpotSource> = { o: "osm", v: "overture", ov: "both" };

function rackOf(row: unknown, id: string): Spot | null {
  if (!Array.isArray(row)) return null;
  const lat = num(row[0]);
  const lon = num(row[1]);
  if (lat === null || lon === null) return null;
  const cap = num(row[2]);
  const flags = num(row[3]) ?? 0;
  return {
    id,
    kind: "rack",
    lat,
    lon,
    name: null,
    capacity: cap !== null && cap > 0 ? cap : null,
    covered: flags & RACK_COVERED ? true : flags & RACK_UNCOVERED ? false : null,
    restricted: (flags & RACK_PRIVATE) !== 0,
    hours: null,
    phone: null,
    website: null,
    source: "osm",
  };
}

function placeOf(row: unknown, id: string): Spot | null {
  if (!row || typeof row !== "object") return null;
  const p = row as Record<string, unknown>;
  const lat = num(p.y);
  const lon = num(p.x);
  const k = p.k;
  if (lat === null || lon === null || (k !== "s" && k !== "r" && k !== "st")) return null;
  const stand = k === "st";
  return {
    id,
    kind: k === "s" ? "shop" : "repair",
    lat,
    lon,
    name: str(p.n),
    capacity: null,
    covered: null,
    restricted: p.c === 1,
    hours: str(p.h),
    phone: str(p.p),
    website: safeWebsite(str(p.w) ?? undefined),
    address: str(p.a),
    repairs: k === "s" && p.f === 1,
    stand,
    source: SOURCES[String(p.s)] ?? "osm",
  };
}

/** The spots in one saved file. Ids are the file's id plus the row, so each spot keeps its id between visits. */
export function parseStateFile(json: unknown, areaId: string): Spot[] {
  const root = json as { r?: unknown; p?: unknown } | null;
  if (!root || typeof root !== "object") return [];
  const spots: Spot[] = [];
  const racks = Array.isArray(root.r) ? root.r : [];
  racks.forEach((row, i) => {
    const spot = rackOf(row, `${areaId}/r${i}`);
    if (spot) spots.push(spot);
  });
  const places = Array.isArray(root.p) ? root.p : [];
  places.forEach((row, i) => {
    const spot = placeOf(row, `${areaId}/p${i}`);
    if (spot) spots.push(spot);
  });
  return spots;
}
