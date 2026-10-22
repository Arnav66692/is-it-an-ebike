// Bike racks, bike shops and repair stations from OpenStreetMap. The map page asks the public
// Overpass API for the part of the map on screen, and the public Nominatim API for a place the
// rider names. Everything here is plain functions, so the query, the parser and the sort are
// tested without a browser. docs/MAP_DATA.md lists the sources, licenses and limits.

export type SpotKind = "rack" | "shop" | "repair";

export const SPOT_KINDS: readonly SpotKind[] = ["rack", "shop", "repair"];

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** One rack, shop or repair station, with only the tags the page shows. */
export interface Spot extends LatLon {
  id: string;
  kind: SpotKind;
  name: string | null;
  capacity: number | null;
  covered: boolean | null;
  /** True when the access tag says private, no or customers, so the rider should check the signs. */
  restricted: boolean;
  hours: string | null;
  phone: string | null;
  website: string | null;
}

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** The map asks for data only this close in, so one query covers a few square miles at most. */
export const MIN_DATA_ZOOM = 13;
/** Wait this long after the map stops moving before asking. */
export const MOVE_DEBOUNCE_MS = 700;
export const MAX_RACKS = 500;
export const MAX_SHOPS = 100;
export const MAX_REPAIRS = 100;
const QUERY_TIMEOUT_S = 25;

/** The continental US at a wide zoom, where the page starts. */
export const US_CENTER: LatLon = { lat: 39.5, lon: -98.35 };
export const US_ZOOM = 4;
/** How close the map goes for a found place or the rider's location. */
export const PLACE_ZOOM = 15;

/** The grid step that bounds are rounded out to, about 1 km, so a small pan reuses the last answer. */
const GRID = 0.01;

const fixed = (n: number) => Number(n.toFixed(4));

/** The view rounded out to the grid, so the query covers the whole view and nearby views share one key. */
export function roundBounds(b: Bounds): Bounds {
  return {
    south: fixed(Math.floor(b.south / GRID) * GRID),
    west: fixed(Math.floor(b.west / GRID) * GRID),
    north: fixed(Math.ceil(b.north / GRID) * GRID),
    east: fixed(Math.ceil(b.east / GRID) * GRID),
  };
}

export function boundsKey(b: Bounds): string {
  const r = roundBounds(b);
  return `${r.south},${r.west},${r.north},${r.east}`;
}

/**
 * The Overpass QL query for one view. Racks are nodes or ways, and a way comes back with its
 * center point. Each kind has its own cap, so a dense downtown can't crowd the shops out.
 */
export function overpassQuery(b: Bounds): string {
  const r = roundBounds(b);
  const bbox = `${r.south},${r.west},${r.north},${r.east}`;
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_S}][bbox:${bbox}];`,
    `(node["amenity"="bicycle_parking"];way["amenity"="bicycle_parking"];)->.racks;`,
    `.racks out center ${MAX_RACKS};`,
    `(node["shop"="bicycle"];way["shop"="bicycle"];)->.shops;`,
    `.shops out center ${MAX_SHOPS};`,
    `(node["amenity"="bicycle_repair_station"];way["amenity"="bicycle_repair_station"];)->.fix;`,
    `.fix out center ${MAX_REPAIRS};`,
  ].join("\n");
}

/** The POST body Overpass reads. A form body keeps the request simple, so the browser sends no preflight. */
export function overpassBody(b: Bounds): string {
  return `data=${encodeURIComponent(overpassQuery(b))}`;
}

type Tags = Record<string, string | undefined>;

interface OverpassElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: unknown;
}

function kindOf(tags: Tags): SpotKind | null {
  if (tags.amenity === "bicycle_parking") return "rack";
  if (tags.shop === "bicycle") return "shop";
  if (tags.amenity === "bicycle_repair_station") return "repair";
  return null;
}

function text(v: string | undefined): string | null {
  const s = v?.trim();
  return s ? s : null;
}

function capacityOf(v: string | undefined): number | null {
  const s = v?.trim() ?? "";
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

function coveredOf(v: string | undefined): boolean | null {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}

const RESTRICTED = new Set(["private", "no", "customers", "permissive_customers", "residents"]);

/** A website only when it is a plain http or https link, so a tag can never put a script link on the page. */
export function safeWebsite(v: string | undefined): string | null {
  const s = text(v);
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toSpot(el: OverpassElement): Spot | null {
  if (typeof el.type !== "string" || typeof el.id !== "number") return null;
  const tags = (el.tags && typeof el.tags === "object" ? el.tags : {}) as Tags;
  const kind = kindOf(tags);
  if (!kind) return null;
  const lat = num(el.lat) ?? num(el.center?.lat);
  const lon = num(el.lon) ?? num(el.center?.lon);
  if (lat === null || lon === null) return null;
  return {
    id: `${el.type}/${el.id}`,
    kind,
    lat,
    lon,
    name: text(tags.name),
    capacity: kind === "rack" ? capacityOf(tags.capacity) : null,
    covered: kind === "rack" ? coveredOf(tags.covered) : null,
    restricted: RESTRICTED.has(tags.access ?? ""),
    hours: kind === "shop" ? text(tags.opening_hours) : null,
    phone: kind === "shop" ? text(tags.phone ?? tags["contact:phone"]) : null,
    website: kind === "shop" ? safeWebsite(tags.website ?? tags["contact:website"]) : null,
  };
}

/** The spots in an Overpass JSON answer. Anything without a kind or a point is skipped, and each element counts once. */
export function parseOverpass(json: unknown): Spot[] {
  const elements = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const seen = new Set<string>();
  const spots: Spot[] = [];
  for (const el of elements) {
    if (!el || typeof el !== "object") continue;
    const spot = toSpot(el as OverpassElement);
    if (!spot || seen.has(spot.id)) continue;
    seen.add(spot.id);
    spots.push(spot);
  }
  return spots;
}

/** Overpass can answer 200 with a remark when a query runs out of time or memory. */
export function overpassRemarkError(json: unknown): boolean {
  const remark = (json as { remark?: unknown })?.remark;
  return typeof remark === "string" && /error|timed out|out of memory/i.test(remark);
}

export interface SpotCounts {
  rack: number;
  shop: number;
  repair: number;
}

export function countSpots(spots: readonly Spot[]): SpotCounts {
  const counts: SpotCounts = { rack: 0, shop: 0, repair: 0 };
  for (const s of spots) counts[s.kind] += 1;
  return counts;
}

export function inBounds(p: LatLon, b: Bounds): boolean {
  return p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in meters. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearSpot {
  spot: Spot;
  meters: number;
}

/** The spots nearest a point, closest first. Ties keep their id order, so the list never shuffles. */
export function nearestSpots(spots: readonly Spot[], from: LatLon, limit: number): NearSpot[] {
  return spots
    .map((spot) => ({ spot, meters: distanceMeters(from, spot) }))
    .sort((a, b) => a.meters - b.meters || a.spot.id.localeCompare(b.spot.id))
    .slice(0, Math.max(0, limit));
}

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

/** A distance the way a US rider reads it, feet under a tenth of a mile, then miles. */
export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.max(10, Math.round((meters * FEET_PER_METER) / 10) * 10)} ft`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** The spot on openstreetmap.org, where the rider can also get directions. */
export function osmLink(p: LatLon): string {
  const lat = p.lat.toFixed(6);
  const lon = p.lon.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`;
}

/** A Nominatim search for a US place by name. */
export function nominatimUrl(query: string, lang: "en" | "es"): string {
  const params = new URLSearchParams({ format: "json", countrycodes: "us", limit: "5", "accept-language": lang, q: query.trim() });
  return `${NOMINATIM_URL}?${params.toString()}`;
}

export interface FoundPlace {
  id: string;
  label: string;
  lat: number;
  lon: number;
  bounds: Bounds | null;
}

/** How close to go for a found place: closer for an address, wider for a town. Never wider than the data zoom. */
export function zoomForPlace(place: FoundPlace): number {
  if (!place.bounds) return PLACE_ZOOM;
  const span = Math.max(place.bounds.north - place.bounds.south, place.bounds.east - place.bounds.west);
  if (span < 0.01) return 17;
  if (span < 0.05) return PLACE_ZOOM;
  return Math.max(MIN_DATA_ZOOM, 14);
}

/** The places in a Nominatim answer. Rows without a point are skipped. */
export function parseNominatim(json: unknown): FoundPlace[] {
  if (!Array.isArray(json)) return [];
  const places: FoundPlace[] = [];
  for (const row of json as Record<string, unknown>[]) {
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    const label = typeof row?.display_name === "string" ? row.display_name : "";
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !label) continue;
    const box = Array.isArray(row.boundingbox) ? row.boundingbox.map(Number) : [];
    const bounds = box.length === 4 && box.every(Number.isFinite) ? { south: box[0], north: box[1], west: box[2], east: box[3] } : null;
    places.push({ id: String(row.place_id ?? `${lat},${lon}`), label, lat, lon, bounds });
  }
  return places;
}
