// The legal route pipeline. Given a start, an end and some places to avoid, it asks a bike router
// for the route, asks the router which way every piece of the route runs on, reads the tags posted
// on those ways, and asks the Census Bureau which areas the route crosses. Then it joins the
// answers into one RoutePlan. It knows nothing about the rider. The page checks the plan against
// the rules, so the rider's age and bike never leave the phone.
//
// Three public servers are asked, each for what it knows best:
//   Valhalla (FOSSGIS)   the route, its edges and its heights. Its usage policy is in valhalla.ts.
//   QLever               the tags on the route's ways, like bicycle=no. A failure here is no tags,
//                        and the plan says so. It never fails the route.
//   TIGERweb (Census)    the state, county, city, school districts, reservation and base.
// Every call carries a User-Agent that names the app. Nothing is logged or stored, because the
// coordinates are a family's home and school.
//
// The fetcher is passed in, so the tests run the whole pipeline on recorded answers.

import { createHash } from "node:crypto";
import { haversineMeters, inUnitedStates, isRecord, midpointAlong, simplifyPolyline } from "./geo";
import { parseTagsTsv, QLEVER_URL, tagsBody } from "./osmTags";
import {
  LAYER_ORDER,
  makeLocator,
  parseTigerLayer,
  TIGER_LAYERS,
  TIGER_MAX_POINTS,
  tigerBody,
  toJurisdiction,
  uniqueAreas,
  type Area,
  type TigerLayer,
  type TigerShape,
  type Where,
} from "./tiger";
import type { Jurisdiction, JurisdictionLayer, PostedTags, RoutePlan, RoutePoint, RouteRequest, RouteSegment, WayKind } from "./types";
import {
  classifyEdge,
  heightBody,
  isNoRoute,
  parseEdges,
  parseHeights,
  parseRoute,
  routeBody,
  totalClimbMeters,
  traceBody,
  VALHALLA_PATHS,
  VALHALLA_URL,
  type ParsedRoute,
  type ValhallaEdge,
} from "./valhalla";

export { classifyEdge };

export const ROUTE_USER_AGENT = "is-it-an-ebike route (https://is-it-an-ebike.vercel.app)";
const ROUTE_REFERER = "https://is-it-an-ebike.vercel.app/";
const CLIENT_ID = "is-it-an-ebike.vercel.app";

/** How long each kind of call gets before the pipeline gives up on it. */
export interface PlanLimits {
  routeMs: number;
  traceMs: number;
  heightMs: number;
  tagsMs: number;
  boundariesMs: number;
}

export const PLAN_LIMITS: PlanLimits = { routeMs: 12_000, traceMs: 12_000, heightMs: 4_000, tagsMs: 8_000, boundariesMs: 15_000 };

/** A Census layer that answered badly gets one more try, but only if at least this long is left. */
const MIN_RETRY_MS = 1_500;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** What the gate hands back when too many calls are already waiting. */
export const GATE_FULL: unique symbol = Symbol("gate full");

/**
 * A single line for calls to one server. Calls go one at a time and start at least gapMs apart,
 * which is how the FOSSGIS policy reads: one request per second, one connection for a script. When
 * more than maxPending calls are in the line, the next one is turned away at once. A crowd then
 * gets "busy", where the server gets no more than its share and a visitor isn't left waiting.
 */
export interface Gate {
  run<T>(task: () => Promise<T>): Promise<T | typeof GATE_FULL>;
}

export interface GateOptions {
  gapMs: number;
  maxPending: number;
  clock: Clock;
}

export function createGate(options: Partial<GateOptions> = {}): Gate {
  const { gapMs, maxPending, clock } = { gapMs: 1_000, maxPending: 6, clock: systemClock, ...options };
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;
  let pending = 0;
  return {
    run<T>(task: () => Promise<T>): Promise<T | typeof GATE_FULL> {
      if (pending >= maxPending) return Promise.resolve(GATE_FULL);
      pending += 1;
      const turn = tail.then(async () => {
        const wait = lastStart + gapMs - clock.now();
        if (wait > 0) await clock.sleep(wait);
        lastStart = clock.now();
        return task();
      });
      // A task that throws must not stop the calls queued behind it.
      tail = turn.catch(() => undefined);
      return turn.finally(() => {
        pending -= 1;
      });
    },
  };
}

/** The one line to Valhalla for this server instance. */
const valhallaGate: Gate = createGate();

export interface PlanOptions {
  gate?: Gate;
  limits?: Partial<PlanLimits>;
}

interface Reply<T> {
  status: number;
  body: T;
}

const readJson = (res: Response): Promise<unknown> => res.json();
const readText = (res: Response): Promise<string> => res.text();

/**
 * One call with a time limit that covers the body as well as the headers. Null means it failed or
 * ran out of time. The reason is dropped on purpose: an error from a fetch can carry the address
 * it was called with, and nothing about a family's route is allowed in a log.
 */
async function exchange<T>(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  read: (res: Response) => Promise<T>,
): Promise<Reply<T> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { ...init, signal: controller.signal });
    return { status: res.status, body: await read(res) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function headers(extra: Record<string, string>): Record<string, string> {
  return { "User-Agent": ROUTE_USER_AGENT, Referer: ROUTE_REFERER, ...extra };
}

type Asked = { kind: "ok"; json: unknown } | { kind: "none" } | { kind: "busy" };

/** One call to Valhalla through the gate. "none" is Valhalla saying there is no route. Everything else that isn't an answer is "busy". */
async function askValhalla(fetcher: typeof fetch, gate: Gate, path: string, body: unknown, timeoutMs: number): Promise<Asked> {
  const init: RequestInit = {
    method: "POST",
    headers: headers({ "Content-Type": "application/json", Accept: "application/json", "X-Client-Id": CLIENT_ID }),
    body: JSON.stringify(body),
  };
  const reply = await gate.run(() => exchange(fetcher, VALHALLA_URL + path, init, timeoutMs, readJson));
  if (reply === GATE_FULL || reply === null) return { kind: "busy" };
  if (reply.status === 200) return { kind: "ok", json: reply.body };
  return isNoRoute(reply.status, reply.body) ? { kind: "none" } : { kind: "busy" };
}

/** One Census layer. A bad answer, including TIGERweb's HTTP 200 error, gets one more try if time allows. */
async function askLayer(layer: TigerLayer, shape: TigerShape, fetcher: typeof fetch, deadline: number): Promise<Area[] | null> {
  const init: RequestInit = {
    method: "POST",
    headers: headers({ "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }),
    body: tigerBody(layer, shape),
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const left = deadline - Date.now();
    if (left <= 0 || (attempt > 0 && left < MIN_RETRY_MS)) return null;
    const reply = await exchange(fetcher, layer.url, init, left, readJson);
    const areas = reply && reply.status === 200 ? parseTigerLayer(layer, reply.body) : null;
    if (areas) return areas;
  }
  return null;
}

/** The list, or null when any one of its items is null. */
function allOrNull<T>(items: readonly (T | null)[]): T[] | null {
  const out: T[] = [];
  for (const item of items) {
    if (item === null) return null;
    out.push(item);
  }
  return out;
}

interface Boundaries {
  crossed: Area[];
  atEnd: Area[];
}

/**
 * Every Census layer for the route and for the end point, all at once. If any layer fails the
 * whole read fails, because a missing city or school district would look like "not there" and a
 * legal check built on that would be wrong.
 */
async function readBoundaries(points: readonly RoutePoint[], destination: RoutePoint, fetcher: typeof fetch, limitMs: number): Promise<Boundaries | null> {
  const deadline = Date.now() + limitMs;
  const line: TigerShape = { kind: "line", points: simplifyPolyline(points, TIGER_MAX_POINTS) };
  const end: TigerShape = { kind: "point", point: destination };
  const [alongLine, atPoint] = await Promise.all([
    Promise.all(TIGER_LAYERS.map((layer) => askLayer(layer, line, fetcher, deadline))),
    Promise.all(TIGER_LAYERS.map((layer) => askLayer(layer, end, fetcher, deadline))),
  ]);
  const crossed = allOrNull(alongLine);
  const atEnd = allOrNull(atPoint);
  if (!crossed || !atEnd) return null;
  return { crossed: uniqueAreas(crossed.flat()), atEnd: uniqueAreas(atEnd.flat()) };
}

const TAGS_READ = "OpenStreetMap tags, read through QLever";
const TAGS_MISSING = "Not read. QLever did not answer in time, so signs posted on these ways were not checked.";

interface TagsRead {
  tags: Map<number, PostedTags>;
  source: string;
}

/** The posted tags on the route's ways. If QLever fails or is slow the tags are empty and the source line says so. */
async function readTags(wayIds: readonly number[], fetcher: typeof fetch, limitMs: number): Promise<TagsRead> {
  if (wayIds.length === 0) return { tags: new Map(), source: TAGS_READ };
  const init: RequestInit = {
    method: "POST",
    headers: headers({ "Content-Type": "application/x-www-form-urlencoded", Accept: "text/tab-separated-values" }),
    body: tagsBody(wayIds),
    redirect: "follow",
  };
  const reply = await exchange(fetcher, QLEVER_URL, init, limitMs, readText);
  const tags = reply && reply.status === 200 ? parseTagsTsv(reply.body) : null;
  return tags ? { tags, source: TAGS_READ } : { tags: new Map(), source: TAGS_MISSING };
}

/** Total climb in meters, or null when Valhalla's height service is slow, busy or has no readings here. */
async function readClimb(shape: string, fetcher: typeof fetch, gate: Gate, limitMs: number): Promise<number | null> {
  const asked = await askValhalla(fetcher, gate, VALHALLA_PATHS.height, heightBody(shape), limitMs);
  if (asked.kind !== "ok") return null;
  const heights = parseHeights(asked.json);
  return heights && heights.length >= 2 ? totalClimbMeters(heights) : null;
}

interface Details {
  edges: ValhallaEdge[];
  tags: TagsRead;
  climbMeters: number | null;
}

/** The edges, then the tags and the climb together. Without the edges there is no plan, so those failures are fatal. */
async function readDetails(route: ParsedRoute, fetcher: typeof fetch, gate: Gate, limits: PlanLimits): Promise<Details | null> {
  const traced = await askValhalla(fetcher, gate, VALHALLA_PATHS.trace, traceBody(route.shape), limits.traceMs);
  if (traced.kind !== "ok") return null;
  const edges = parseEdges(traced.json, route.points.length);
  if (!edges) return null;
  const wayIds = edges.flatMap((edge) => (edge.wayId === null ? [] : [edge.wayId]));
  const [tags, climbMeters] = await Promise.all([readTags(wayIds, fetcher, limits.tagsMs), readClimb(route.shape, fetcher, gate, limits.heightMs)]);
  return { edges, tags, climbMeters };
}

interface Piece {
  edge: ValhallaEdge;
  kind: WayKind;
  tags: PostedTags;
  at: Where;
  /** Pieces that share a key and sit side by side become one segment. */
  key: string;
}

function pieceOf(edge: ValhallaEdge, points: readonly RoutePoint[], tagsByWay: ReadonlyMap<number, PostedTags>, locate: (point: RoutePoint | null) => Where): Piece {
  const tags = (edge.wayId === null ? undefined : tagsByWay.get(edge.wayId)) ?? {};
  const kind = classifyEdge(edge, tags);
  const at = locate(midpointAlong(points, edge.from, edge.to));
  // Two edges with no way id are the same way only if they share a name.
  const way = edge.wayId === null ? `name:${edge.names[0] ?? ""}` : `way:${edge.wayId}`;
  const key = [kind, way, at.placeGeoid ?? "", at.countyGeoid ?? "", at.state ?? ""].join("|");
  return { edge, kind, tags, at, key };
}

function segmentOf(run: readonly Piece[]): RouteSegment {
  const first = run[0];
  const last = run[run.length - 1];
  return {
    from: first.edge.from,
    to: last.edge.to,
    meters: run.reduce((sum, piece) => sum + piece.edge.meters, 0),
    kind: first.kind,
    name: run.map((piece) => piece.edge.names[0]).find((name) => name !== undefined) ?? null,
    wayId: first.edge.wayId,
    tags: first.tags,
    state: first.at.state,
    countyGeoid: first.at.countyGeoid,
    placeGeoid: first.at.placeGeoid,
    placeName: first.at.placeName,
  };
}

/**
 * One segment for each run of side-by-side edges with the same kind, way, city and county. The
 * router cuts a way at every junction, so a long street comes as dozens of edges, and the rule
 * check wants it as one piece. The place of each edge is read at its middle, so an edge never
 * straddles two cities in the answer.
 */
export function buildSegments(
  edges: readonly ValhallaEdge[],
  points: readonly RoutePoint[],
  tagsByWay: ReadonlyMap<number, PostedTags>,
  locate: (point: RoutePoint | null) => Where,
): RouteSegment[] {
  const runs: Piece[][] = [];
  for (const edge of edges) {
    const piece = pieceOf(edge, points, tagsByWay, locate);
    const current = runs[runs.length - 1];
    if (current && current[0].key === piece.key) current.push(piece);
    else runs.push([piece]);
  }
  return runs.map(segmentOf);
}

function rankKey(area: { layer: JurisdictionLayer; geoid: string; state: string | null }): string {
  return area.layer === "state" ? `state:${area.state}` : `${area.layer}:${area.geoid}`;
}

/** How far along the route each state, county and city first shows up, by segment number. */
function firstUse(segments: readonly RouteSegment[]): Map<string, number> {
  const first = new Map<string, number>();
  segments.forEach((segment, index) => {
    const keys = [segment.state && `state:${segment.state}`, segment.countyGeoid && `county:${segment.countyGeoid}`, segment.placeGeoid && `place:${segment.placeGeoid}`];
    for (const key of keys) if (key && !first.has(key)) first.set(key, index);
  });
  return first;
}

/** The crossed areas by layer, and within a layer in the order the route reaches them. Areas it only touches come last. */
function alongRoute(areas: readonly Area[], segments: readonly RouteSegment[]): Jurisdiction[] {
  const used = firstUse(segments);
  const rank = (area: Area): number => used.get(rankKey(area)) ?? Number.POSITIVE_INFINITY;
  const layer = (area: Area): number => LAYER_ORDER.indexOf(area.layer);
  return [...areas]
    .sort((a, b) => layer(a) - layer(b) || (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0))
    .map(toJurisdiction);
}

function ofLayer(areas: readonly Area[], layer: JurisdictionLayer): Area[] {
  return areas.filter((area) => area.layer === layer);
}

/** Thrown when a stage that returns null for "failed" does, so Promise.all can stop at the first failure. */
class StageFailed extends Error {}

async function mustSucceed<T>(stage: Promise<T | null>): Promise<T> {
  const result = await stage;
  if (result === null) throw new StageFailed("stage failed");
  return result;
}

export type PlanFailure = "no_route" | "busy";

export type PlanResult = { ok: true; plan: RoutePlan } | { ok: false; error: PlanFailure };

const BUSY: PlanResult = { ok: false, error: "busy" };

const SOURCE_ROUTER = "Valhalla bicycle router on OpenStreetMap data, run by FOSSGIS";
const SOURCE_BOUNDARIES = "U.S. Census Bureau TIGERweb";

/**
 * Builds the plan for one request. The route comes first, since everything else hangs off its
 * line. Then the Census lookups run beside the edge, tag and height reads. A route Valhalla can't
 * find is "no_route". Valhalla, the edges or the Census failing or running long is "busy". QLever
 * and the height service failing is not, and the plan carries a note or a null instead.
 */
export async function buildRoutePlan(request: RouteRequest, fetcher: typeof fetch = fetch, options: PlanOptions = {}): Promise<PlanResult> {
  const limits = { ...PLAN_LIMITS, ...options.limits };
  const gate = options.gate ?? valhallaGate;
  const asked = await askValhalla(fetcher, gate, VALHALLA_PATHS.route, routeBody(request), limits.routeMs);
  if (asked.kind === "none") return { ok: false, error: "no_route" };
  if (asked.kind === "busy") return BUSY;
  const route = parseRoute(asked.json);
  if (!route) return BUSY;

  // Either one failing ends the request at once, so a visitor isn't kept waiting on the other.
  let boundaries: Boundaries;
  let details: Details;
  try {
    [boundaries, details] = await Promise.all([
      mustSucceed(readBoundaries(route.points, request.to, fetcher, limits.boundariesMs)),
      mustSucceed(readDetails(route, fetcher, gate, limits)),
    ]);
  } catch (error) {
    if (error instanceof StageFailed) return BUSY;
    throw error;
  }

  const locate = makeLocator({
    states: ofLayer(boundaries.crossed, "state"),
    counties: ofLayer(boundaries.crossed, "county"),
    places: ofLayer(boundaries.crossed, "place"),
  });
  const segments = buildSegments(details.edges, route.points, details.tags.tags, locate);
  const plan: RoutePlan = {
    points: route.points,
    meters: route.meters,
    seconds: route.seconds,
    climbMeters: details.climbMeters,
    segments,
    crossed: alongRoute(boundaries.crossed, segments),
    atEnd: boundaries.atEnd.map(toJurisdiction),
    sources: { router: SOURCE_ROUTER, boundaries: SOURCE_BOUNDARIES, tags: details.tags.source, read: new Date().toISOString() },
  };
  return { ok: true, plan };
}

/** As far as a family might ride and still ask. Valhalla's own limit for bikes is 150 km. */
export const MAX_ROUTE_METERS = 50_000;
export const MAX_AVOID_POINTS = 20;

function readPoint(value: unknown): RoutePoint | null {
  if (!isRecord(value)) return null;
  const { lat, lon } = value;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const point = { lat, lon };
  return inUnitedStates(point) ? point : null;
}

/**
 * The request in the body, or null when any part is not right: a point that isn't two finite
 * numbers inside the US, the same start and end, more than 50 km between them, more than 20
 * avoid points, or a prefer that is not "balanced" or "roads". Fields it doesn't know are ignored.
 */
export function parseRouteRequest(body: unknown): RouteRequest | null {
  if (!isRecord(body)) return null;
  const from = readPoint(body.from);
  const to = readPoint(body.to);
  if (!from || !to) return null;
  if (from.lat === to.lat && from.lon === to.lon) return null;
  if (haversineMeters(from, to) > MAX_ROUTE_METERS) return null;
  const prefer = body.prefer === undefined ? "balanced" : body.prefer;
  if (prefer !== "balanced" && prefer !== "roads") return null;
  if (body.avoid === undefined) return { from, to, prefer };
  if (!Array.isArray(body.avoid) || body.avoid.length > MAX_AVOID_POINTS) return null;
  const avoid: RoutePoint[] = [];
  for (const item of body.avoid) {
    const point = readPoint(item);
    if (!point) return null;
    avoid.push(point);
  }
  return { from, to, avoid, prefer };
}

// A repeat of the same route is served from memory. The key is a hash of the request rounded to
// about a meter, so a coordinate is never a key, and nothing is written anywhere. An entry
// lasts a few minutes and goes when the server instance does.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 24;
const planCache = new Map<string, { at: number; plan: RoutePlan }>();

export function clearPlanCache(): void {
  planCache.clear();
}

function rounded(point: RoutePoint): string {
  return `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
}

function cacheKey(request: RouteRequest): string {
  const avoid = [...new Set((request.avoid ?? []).map(rounded))].sort();
  const text = JSON.stringify([rounded(request.from), rounded(request.to), avoid, request.prefer ?? "balanced"]);
  return createHash("sha256").update(text).digest("hex");
}

function remember(key: string, plan: RoutePlan, now: number): void {
  planCache.delete(key);
  planCache.set(key, { at: now, plan });
  for (const oldest of planCache.keys()) {
    if (planCache.size <= CACHE_MAX) break;
    planCache.delete(oldest);
  }
}

function recall(key: string, now: number): RoutePlan | null {
  const hit = planCache.get(key);
  if (!hit) return null;
  if (now - hit.at > CACHE_TTL_MS) {
    planCache.delete(key);
    return null;
  }
  return hit.plan;
}

function noStore(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * The whole answer for one POST body, without the rate limit, so the tests can pass their own
 * fetch. 400 for a request that isn't right, 404 when there is no route, 503 when a server the
 * plan needs failed or ran long, 200 with the plan otherwise. Nothing is cached by the browser or
 * the CDN, because every answer is about one family's trip.
 */
export async function routeResponse(body: unknown, fetcher: typeof fetch = fetch, options: PlanOptions = {}): Promise<Response> {
  const request = parseRouteRequest(body);
  if (!request) return noStore(400, { error: "invalid" });
  const key = cacheKey(request);
  const cached = recall(key, Date.now());
  if (cached) return noStore(200, cached);
  let result: PlanResult;
  try {
    result = await buildRoutePlan(request, fetcher, options);
  } catch (error) {
    // Only the kind of error is logged. Its message could carry the address or body of a request.
    console.error("route plan failed:", error instanceof Error ? error.name : typeof error);
    return noStore(503, { error: "busy" });
  }
  if (!result.ok) return noStore(result.error === "no_route" ? 404 : 503, { error: result.error });
  remember(key, result.plan, Date.now());
  return noStore(200, result.plan);
}
