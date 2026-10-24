// The network calls the map page makes, each only when the rider moves the map close enough or
// submits a place. Racks, shops and repair shops come from the saved state files in
// public/map/states/ (lib/map/stateData.ts), and every state, DC and Puerto Rico has its racks
// saved, so a US view answers at once with no live call, from a whole state down to one street.
// Our own /api/map route is the fallback, for small views only:
// when the index or a file a view needs doesn't load, for a view off every state's box, and for
// the racks of a file that holds shops only or a state with no file, which the data has none of
// now. The route asks the public Overpass servers and mirrors (lib/map/overpassServer.ts). Answers
// are kept in memory for this visit only, so panning back and forth doesn't ask again. Nothing is
// written to storage.

import {
  boundsKey,
  countSpots,
  inBounds,
  LIVE_MAX_SPAN_DEG,
  MAX_RACKS,
  nominatimUrl,
  overpassRemarkError,
  parseNominatim,
  parsePhoton,
  photonUrl,
  parseOverpass,
  roundBounds,
  type Bounds,
  type FoundPlace,
  type Spot,
} from "./osm";
import {
  chooseAreas,
  liveFill,
  parseStateFile,
  parseStateIndex,
  STATE_DIR,
  STATE_INDEX_URL,
  type AreaChoice,
  type StateArea,
  type StateIndex,
} from "./stateData";

/** Why a call failed, in the words the page picks a message by. "zoom" means the view is too wide for the live route. */
export type FetchFailure = "rate" | "failed" | "zoom";

export class MapFetchError extends Error {
  readonly failure: FetchFailure;

  constructor(failure: FetchFailure) {
    super(failure === "rate" ? "rate limited" : failure === "zoom" ? "view too wide" : "request failed");
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

/**
 * Every saved spot in a view, with no cap, so the counts for a whole state are true. The map draws
 * only the marks near the screen and groups crowded ones into bubbles.
 */
export function spotsInView(all: readonly Spot[], b: Bounds): SpotAnswer {
  return { spots: all.filter((s) => inBounds(s, b)), capped: false };
}

/** True when a view is wider than the live route takes, after rounding out the way the request does. */
export function tooWideForLive(bounds: Bounds): boolean {
  const r = roundBounds(bounds);
  return r.north - r.south > LIVE_MAX_SPAN_DEG || r.east - r.west > LIVE_MAX_SPAN_DEG;
}

interface SavedView {
  spots: Spot[];
  choice: AreaChoice;
}

/**
 * Every spot in the saved files a view needs, or null when the view needs the live route for
 * everything: no index, a state with no saved file, or a file that didn't load.
 */
async function savedView(bounds: Bounds, fetcher: typeof fetch): Promise<SavedView | null> {
  const index = await loadIndex(fetcher);
  if (!index) return null;
  const choice = chooseAreas(index, bounds);
  if (choice.live) return null;
  const loaded = await Promise.all(choice.areas.map((a) => loadArea(a, fetcher)));
  if (loaded.some((spots) => spots === null)) return null;
  return { spots: loaded.flatMap((spots) => spots ?? []), choice };
}

/**
 * The racks, shops and repair spots in a view: saved files first, then the live route, from the
 * cache when asked before. Where the saved files hold shops only, onShops gets the saved shops at
 * once, and the answer adds the live racks when they arrive.
 */
export async function fetchSpots(
  bounds: Bounds,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
  waitMs = OVERPASS_WAIT_MS,
  onShops?: (answer: SpotAnswer) => void,
): Promise<SpotAnswer> {
  const saved = await savedView(bounds, fetcher);
  if (saved && !saved.choice.liveRacks) return spotsInView(saved.spots, bounds);
  if (saved) onShops?.(spotsInView(saved.spots, bounds));
  // The page may have moved on while the saved files loaded.
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const live = await liveSpots(bounds, signal, fetcher, waitMs);
  if (!saved) return live;
  const both = spotsInView([...saved.spots, ...liveFill(live.spots, saved.choice.areas)], bounds);
  return { spots: both.spots, capped: both.capped || live.capped };
}

/** The live route's answer for a view, from the cache when asked before. */
async function liveSpots(bounds: Bounds, signal: AbortSignal | undefined, fetcher: typeof fetch, waitMs: number): Promise<SpotAnswer> {
  // Our server refuses a wider view, so say "zoom in" instead of asking.
  if (tooWideForLive(bounds)) throw new MapFetchError("zoom");
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

/** One geocoder's answer, parsed, with its failures in the words the page picks a message by. */
async function askGeocoder(url: string, parse: (json: unknown) => FoundPlace[], signal: AbortSignal | undefined, fetcher: typeof fetch): Promise<FoundPlace[]> {
  let res: Response;
  try {
    res = await fetcher(url, { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new MapFetchError("failed");
  }
  if (!res.ok) throw new MapFetchError(failureOf(res.status));
  try {
    return parse(await res.json());
  } catch {
    throw new MapFetchError("failed");
  }
}

/**
 * Up to five US places that match a name. Nominatim answers first. It matches words exactly, so
 * "scripps ranch highschool" or a typo finds nothing, and then Photon, which forgives both, is asked.
 * Photon is asked too when Nominatim is busy or down. Only when both fail does the search fail.
 */
export async function searchPlaces(query: string, lang: "en" | "es", signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<FoundPlace[]> {
  let failure: MapFetchError | null = null;
  try {
    const found = await askGeocoder(nominatimUrl(query, lang), parseNominatim, signal, fetcher);
    if (found.length > 0) return found;
  } catch (err) {
    if (signal?.aborted || !(err instanceof MapFetchError)) throw err;
    failure = err;
  }
  try {
    return await askGeocoder(photonUrl(query), parsePhoton, signal, fetcher);
  } catch (err) {
    if (signal?.aborted || !(err instanceof MapFetchError)) throw err;
    throw failure ?? err;
  }
}
