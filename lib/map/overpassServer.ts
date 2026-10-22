// The server side of the map data. The browser asks our /api/map route for one rounded view, and
// the route asks the public Overpass servers in turn until one answers. A server's error page has
// no CORS headers, so asking from the server is the only way the page can tell "busy" from
// "broken". Answers are cached by Vercel's CDN per rounded view, and nothing else is stored.

import { OVERPASS_URL, overpassBody, overpassRemarkError, roundBounds, type Bounds } from "./osm";

/** Tried in this order. The first is the main public server, the rest are public mirrors. */
export const OVERPASS_ENDPOINTS: readonly string[] = [
  OVERPASS_URL,
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** How long one server gets before the route moves on to the next. */
export const PER_TRY_MS = 12_000;
export const MAP_USER_AGENT = "is-it-an-ebike map (https://is-it-an-ebike.vercel.app)";
export const CACHE_HIT_HEADERS = "public, s-maxage=86400, stale-while-revalidate=604800";

/** The US, Alaska, Hawaii, Puerto Rico and the US Virgin Islands fit inside this box. */
const LAT_MIN = 15;
const LAT_MAX = 72;
const LON_MIN = -180;
const LON_MAX = -60;
/** A zoom 13 view on a large screen is well under this, so a bigger box is not from the page. */
export const MAX_SPAN_DEG = 0.75;

const PARAMS = ["south", "west", "north", "east"] as const;

/** The bounds in a query string, or null when one is missing, not a number, outside the US or too big. */
export function parseBoundsParams(params: URLSearchParams): Bounds | null {
  const values: number[] = [];
  for (const name of PARAMS) {
    const raw = params.get(name);
    if (raw === null || raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    values.push(n);
  }
  const [south, west, north, east] = values;
  if (south < LAT_MIN || north > LAT_MAX || west < LON_MIN || east > LON_MAX) return null;
  if (north <= south || east <= west) return null;
  if (north - south > MAX_SPAN_DEG || east - west > MAX_SPAN_DEG) return null;
  return roundBounds({ south, west, north, east });
}

export interface OverpassHit {
  elements: unknown[];
  endpoint: string;
}

/** One server's answer, or null when it failed, was slow, or sent something that isn't a clean answer. */
async function tryEndpoint(endpoint: string, body: string, fetcher: typeof fetch, perTryMs: number): Promise<unknown[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), perTryMs);
  try {
    const res = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": MAP_USER_AGENT,
      },
      body,
      signal: controller.signal,
    });
    if (res.status !== 200) return null;
    const json: unknown = await res.json();
    if (overpassRemarkError(json)) return null;
    const elements = (json as { elements?: unknown })?.elements;
    return Array.isArray(elements) ? elements : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Asks each server in order and returns the first clean answer, or null when every one failed. */
export async function fetchOverpass(
  bounds: Bounds,
  fetcher: typeof fetch = fetch,
  endpoints: readonly string[] = OVERPASS_ENDPOINTS,
  perTryMs: number = PER_TRY_MS,
): Promise<OverpassHit | null> {
  const body = overpassBody(bounds);
  for (const endpoint of endpoints) {
    const elements = await tryEndpoint(endpoint, body, fetcher, perTryMs);
    if (elements) return { elements, endpoint };
  }
  return null;
}

function noStore(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** The whole answer for one GET, without the rate limit, so tests can pass their own fetch. */
export async function mapResponse(url: URL, fetcher: typeof fetch = fetch, endpoints?: readonly string[], perTryMs?: number): Promise<Response> {
  const bounds = parseBoundsParams(url.searchParams);
  if (!bounds) return noStore(400, { error: "invalid" });
  const hit = await fetchOverpass(bounds, fetcher, endpoints, perTryMs);
  if (!hit) return noStore(503, { error: "busy" });
  return Response.json(
    { elements: hit.elements },
    { status: 200, headers: { "cache-control": CACHE_HIT_HEADERS, "x-map-source": new URL(hit.endpoint).hostname } },
  );
}
