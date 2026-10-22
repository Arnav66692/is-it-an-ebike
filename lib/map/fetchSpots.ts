// The two network calls the map page makes, each only when the rider moves the map close enough
// or submits a place. Racks and shops come from our own /api/map route, which asks the public
// Overpass servers and mirrors (lib/map/overpassServer.ts). Answers for a view are kept in memory
// for this visit only, so panning back and forth doesn't ask again. Nothing is written to storage.

import {
  boundsKey,
  countSpots,
  MAX_RACKS,
  nominatimUrl,
  overpassRemarkError,
  parseNominatim,
  parseOverpass,
  roundBounds,
  type Bounds,
  type FoundPlace,
  type Spot,
} from "./osm";

/** Why a call failed, in the words the page picks a message by. */
export type FetchFailure = "rate" | "failed";

export class MapFetchError extends Error {
  readonly failure: FetchFailure;

  constructor(failure: FetchFailure) {
    super(failure === "rate" ? "rate limited" : "request failed");
    this.failure = failure;
    this.name = "MapFetchError";
  }
}

export interface SpotAnswer {
  spots: Spot[];
  /** True when Overpass sent as many racks as the cap allows, so some may be left out. */
  capped: boolean;
}

const CACHE_LIMIT = 40;
/**
 * Our server tries up to four Overpass servers at 12 seconds each, so it can take a while.
 * Past this the page says the service is busy and stops waiting.
 */
export const OVERPASS_WAIT_MS = 50_000;
const cache = new Map<string, SpotAnswer>();

/** For tests. */
export function clearSpotCache(): void {
  cache.clear();
}

function remember(key: string, answer: SpotAnswer): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, answer);
}

/** 429 is the rate limit. Our route answers 503 when every Overpass server is busy, and a gateway can answer 502 or 504. */
const BUSY_STATUSES = new Set([429, 502, 503, 504]);

function failureOf(status: number): FetchFailure {
  return BUSY_STATUSES.has(status) ? "rate" : "failed";
}

/** Our route's URL for a view, rounded to two decimals so the CDN sees the same key for nearby views. */
export function mapApiUrl(bounds: Bounds): string {
  const r = roundBounds(bounds);
  const params = new URLSearchParams({
    south: r.south.toFixed(2),
    west: r.west.toFixed(2),
    north: r.north.toFixed(2),
    east: r.east.toFixed(2),
  });
  return `/api/map?${params.toString()}`;
}

/** The racks, shops and repair stations in a view, from the cache when this view was asked before. */
export async function fetchSpots(bounds: Bounds, signal?: AbortSignal, fetcher: typeof fetch = fetch, waitMs = OVERPASS_WAIT_MS): Promise<SpotAnswer> {
  const key = boundsKey(bounds);
  const hit = cache.get(key);
  if (hit) return hit;
  // One controller for the page's abort and the wait limit, so both cancel the request.
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener("abort", stop);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, waitMs);
  let json: unknown;
  try {
    const res = await fetcher(mapApiUrl(bounds), { method: "GET", signal: controller.signal });
    if (!res.ok) throw new MapFetchError(failureOf(res.status));
    json = await res.json();
  } catch (err) {
    if (err instanceof MapFetchError) throw err;
    if (signal?.aborted) throw err;
    throw new MapFetchError(timedOut ? "rate" : "failed");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
  if (overpassRemarkError(json)) throw new MapFetchError("failed");
  const spots = parseOverpass(json);
  const answer = { spots, capped: countSpots(spots).rack >= MAX_RACKS };
  remember(key, answer);
  return answer;
}

/** Up to five US places that match a name. */
export async function searchPlaces(query: string, lang: "en" | "es", signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<FoundPlace[]> {
  let res: Response;
  try {
    res = await fetcher(nominatimUrl(query, lang), { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new MapFetchError("failed");
  }
  if (!res.ok) throw new MapFetchError(failureOf(res.status));
  try {
    return parseNominatim(await res.json());
  } catch {
    throw new MapFetchError("failed");
  }
}
