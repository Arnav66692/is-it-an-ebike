// The network calls the map page makes, each only when the rider moves the map close enough or
// submits a place. Racks, shops and repair shops come first from the saved state files in
// public/map/states/ (lib/map/stateData.ts), so a view answers at once. Only a view in a state
// with no saved file asks our own /api/map route, which asks the public Overpass servers and
// mirrors (lib/map/overpassServer.ts). Answers are kept in memory for this visit only, so panning
// back and forth doesn't ask again. Nothing is written to storage.

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
import { chooseAreas, parseStateFile, parseStateIndex, STATE_DIR, STATE_INDEX_URL, type StateArea, type StateIndex } from "./stateData";

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
  /** True when the view holds more racks than the cap allows, so some are left out. */
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

let stateIndex: Promise<StateIndex | null> | null = null;
const stateFiles = new Map<string, Promise<Spot[] | null>>();

/** For tests: forget the saved data, or start from a given index without loading one. */
export function clearStateData(index?: StateIndex): void {
  stateFiles.clear();
  stateIndex = index ? Promise.resolve(index) : null;
}

/** Loads JSON once, and forgets a failed load so the next view tries again. */
function loadOnce<T>(fetcher: typeof fetch, url: string, parse: (json: unknown) => T | null, forget: () => void): Promise<T | null> {
  return fetcher(url)
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => (json === null ? null : parse(json)))
    .catch(() => null)
    .then((value) => {
      if (value === null) forget();
      return value;
    });
}

function loadIndex(fetcher: typeof fetch): Promise<StateIndex | null> {
  stateIndex ??= loadOnce(fetcher, STATE_INDEX_URL, parseStateIndex, () => {
    stateIndex = null;
  });
  return stateIndex;
}

function loadArea(area: StateArea, fetcher: typeof fetch): Promise<Spot[] | null> {
  let file = stateFiles.get(area.id);
  if (!file) {
    file = loadOnce(fetcher, STATE_DIR + area.file, (json) => parseStateFile(json, area.id), () => stateFiles.delete(area.id));
    stateFiles.set(area.id, file);
  }
  return file;
}

/** Saved spots in a view, with racks capped the same way a live answer is. */
export function spotsInView(all: readonly Spot[], b: Bounds): SpotAnswer {
  const inView = all.filter((s) => s.lat >= b.south && s.lat <= b.north && s.lon >= b.west && s.lon <= b.east);
  let racks = 0;
  const spots = inView.filter((s) => s.kind !== "rack" || ++racks <= MAX_RACKS);
  return { spots, capped: racks > MAX_RACKS };
}

/**
 * The view's spots from the saved state files, or null when the view needs the live route: no
 * index, a state with no saved file, or a file that didn't load.
 */
export async function savedSpots(bounds: Bounds, fetcher: typeof fetch = fetch): Promise<SpotAnswer | null> {
  const index = await loadIndex(fetcher);
  if (!index) return null;
  const choice = chooseAreas(index, bounds);
  if (choice.live) return null;
  const loaded = await Promise.all(choice.areas.map((a) => loadArea(a, fetcher)));
  if (loaded.some((spots) => spots === null)) return null;
  return spotsInView(loaded.flatMap((spots) => spots ?? []), bounds);
}

/** The racks, shops and repair spots in a view: saved files first, then the live route, from the cache when asked before. */
export async function fetchSpots(bounds: Bounds, signal?: AbortSignal, fetcher: typeof fetch = fetch, waitMs = OVERPASS_WAIT_MS): Promise<SpotAnswer> {
  const saved = await savedSpots(bounds, fetcher);
  if (saved) return saved;
  // The page may have moved on while the saved files loaded.
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
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
