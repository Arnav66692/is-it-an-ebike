// The map page's state as plain functions, so the filters, the clusters, the list and the
// "Search this area" rule are tested without a browser. components/BikeMap.tsx and
// components/MapView.tsx call these.

import { countSpots, distanceMeters, MIN_DATA_ZOOM, nearestSpots, SPOT_KINDS, type Bounds, type LatLon, type NearSpot, type Spot, type SpotCounts, type SpotKind } from "./osm";

// ---------- Filters ----------

/** Which kinds show on the map and in the list. */
export type KindFilter = Readonly<Record<SpotKind, boolean>>;

export const ALL_KINDS: KindFilter = { rack: true, shop: true, repair: true };

/** The filter with one kind flipped. A new object, so React sees the change. */
export function toggleKind(filter: KindFilter, kind: SpotKind): KindFilter {
  return { ...filter, [kind]: !filter[kind] };
}

export function filterSpots(spots: readonly Spot[], filter: KindFilter): Spot[] {
  return spots.filter((s) => filter[s.kind]);
}

export interface ChipCount {
  kind: SpotKind;
  on: boolean;
  /** How many of this kind are in view, shown or hidden, or null before any search. */
  count: number | null;
}

/** One chip per kind, in the map key's order, with how many of that kind are in view. */
export function chipCounts(inView: readonly Spot[], filter: KindFilter, searched: boolean): ChipCount[] {
  const counts: SpotCounts = countSpots(inView);
  return SPOT_KINDS.map((kind) => ({ kind, on: filter[kind], count: searched ? counts[kind] : null }));
}

// ---------- Clusters ----------

/** Marks this many pixels apart or closer, in one grid cell, join into one bubble. */
export const CLUSTER_CELL_PX = 56;
/** From this zoom on, every mark shows on its own. */
export const CLUSTER_OFF_ZOOM = 18;

export interface ScreenPoint {
  id: string;
  /** Pixel position at the current zoom, in the map's own world pixels. */
  x: number;
  y: number;
}

export interface Cluster {
  /** Stable for the same members, so React keeps the same mark. */
  key: string;
  ids: string[];
  x: number;
  y: number;
}

export interface Clustered {
  singles: string[];
  clusters: Cluster[];
}

/**
 * Groups marks by a square grid in pixels. A cell with one mark keeps it single. A cell with
 * more becomes one bubble at their middle. Ids in `keep`, like the picked spot, always show on
 * their own, so their popup has a mark to open on.
 */
export function clusterGrid(points: readonly ScreenPoint[], cellPx: number, keep: ReadonlySet<string> = new Set()): Clustered {
  const cells = new Map<string, ScreenPoint[]>();
  const singles: string[] = [];
  for (const p of points) {
    if (keep.has(p.id)) {
      singles.push(p.id);
      continue;
    }
    const cell = `${Math.floor(p.x / cellPx)}:${Math.floor(p.y / cellPx)}`;
    const list = cells.get(cell);
    if (list) list.push(p);
    else cells.set(cell, [p]);
  }
  const groups: ScreenPoint[][] = [];
  for (const members of cells.values()) {
    if (members.length === 1) singles.push(members[0].id);
    else groups.push(members);
  }
  return { singles, clusters: mergeNear(groups, cellPx) };
}

function middle(members: readonly ScreenPoint[]): { x: number; y: number } {
  return { x: members.reduce((sum, p) => sum + p.x, 0) / members.length, y: members.reduce((sum, p) => sum + p.y, 0) / members.length };
}

/**
 * Two bubbles from neighbouring cells can land on top of each other, so any two whose middles
 * are closer than a cell join, until no two are that close.
 */
function mergeNear(groups: readonly ScreenPoint[][], cellPx: number): Cluster[] {
  let merged = groups.map((members) => ({ members, ...middle(members) }));
  let joined = true;
  while (joined) {
    joined = false;
    const next: typeof merged = [];
    for (const g of merged) {
      const near = next.findIndex((n) => Math.hypot(n.x - g.x, n.y - g.y) < cellPx);
      if (near < 0) {
        next.push(g);
        continue;
      }
      const members = [...next[near].members, ...g.members];
      next[near] = { members, ...middle(members) };
      joined = true;
    }
    merged = next;
  }
  return merged.map(({ members, x, y }) => ({ key: `${members.length}:${members[0].id}`, ids: members.map((p) => p.id), x, y }));
}

/** The bubble's size class, so a big group reads bigger. Every size is a 44 px tap target or more. */
export function clusterSize(count: number): "s" | "m" | "l" {
  if (count < 10) return "s";
  if (count < 100) return "m";
  return "l";
}

/** The box around a group of spots, for zooming in on a bubble. */
export function boundsOf(spots: readonly LatLon[]): Bounds | null {
  if (spots.length === 0) return null;
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const s of spots) {
    south = Math.min(south, s.lat);
    north = Math.max(north, s.lat);
    west = Math.min(west, s.lon);
    east = Math.max(east, s.lon);
  }
  return { south, west, north, east };
}

// ---------- The list and the picked spot ----------

/**
 * The nearest spots to the middle of the map, closest first. When the rider picked a mark that
 * is not among them, it joins the end of the list, so its row can light up.
 */
export function listSpots(spots: readonly Spot[], from: LatLon, limit: number, selectedId: string | null): NearSpot[] {
  const near = nearestSpots(spots, from, limit);
  if (!selectedId || near.some((n) => n.spot.id === selectedId)) return near;
  const picked = spots.find((s) => s.id === selectedId);
  return picked ? [...near, { spot: picked, meters: distanceMeters(from, picked) }] : near;
}

export type SelectAction = { type: "pick"; id: string } | { type: "close"; id: string } | { type: "prune"; ids: ReadonlySet<string> };

/**
 * The picked spot. A pick from the list or a mark sets it. Closing that spot's popup clears it,
 * but closing an older popup, which Leaflet does while it opens the new one, doesn't. A spot
 * that left the map, by a filter or new data, is no longer picked.
 */
export function selectReducer(selected: string | null, action: SelectAction): string | null {
  switch (action.type) {
    case "pick":
      return action.id;
    case "close":
      return selected === action.id ? null : selected;
    case "prune":
      return selected !== null && !action.ids.has(selected) ? null : selected;
  }
}

/** How close the map goes for a spot picked from the list. */
export const SPOT_ZOOM = 17;

export interface SpotMove {
  center: LatLon;
  zoom: number;
  openId: string;
  /** Glide there, unless the rider asked for less motion. */
  animate: boolean;
}

/** The move for a spot picked from the list: centered on it, never farther out than now. */
export function moveToSpot(spot: Spot, currentZoom: number, reducedMotion: boolean): SpotMove {
  return { center: { lat: spot.lat, lon: spot.lon }, zoom: Math.max(currentZoom, SPOT_ZOOM), openId: spot.id, animate: !reducedMotion };
}

// ---------- Search this area ----------

export interface AreaState {
  /** The view last asked for, or null before the first search. */
  searched: Bounds | null;
  searchedZoom: number;
  /** Goes up with every search, so "Try again" on the same view asks again. */
  nonce: number;
  /** The next view that rests at the data zoom searches by itself, after a place pick or my location. */
  autoNext: boolean;
}

export const AREA_START: AreaState = { searched: null, searchedZoom: 0, nonce: 0, autoNext: false };

export interface ViewLike {
  bounds: Bounds;
  zoom: number;
}

export type AreaAction = { type: "view"; view: ViewLike } | { type: "autoNext" } | { type: "search"; view: ViewLike } | { type: "retry" };

function searchView(state: AreaState, view: ViewLike): AreaState {
  return { searched: view.bounds, searchedZoom: view.zoom, nonce: state.nonce + 1, autoNext: false };
}

/**
 * When the map asks for data. The first view at the data zoom, and the first view after a place
 * pick or my location, search by themselves. Any other move waits for "Search this area".
 */
export function areaReducer(state: AreaState, action: AreaAction): AreaState {
  switch (action.type) {
    case "autoNext":
      return { ...state, autoNext: true };
    case "view":
      if (action.view.zoom < MIN_DATA_ZOOM) return state;
      return state.autoNext || state.searched === null ? searchView(state, action.view) : state;
    case "search":
      return action.view.zoom < MIN_DATA_ZOOM ? state : searchView(state, action.view);
    case "retry":
      return state.searched === null ? state : { ...state, nonce: state.nonce + 1 };
  }
}

function contains(outer: Bounds, inner: Bounds): boolean {
  return inner.south >= outer.south && inner.north <= outer.north && inner.west >= outer.west && inner.east <= outer.east;
}

/**
 * Whether to offer "Search this area": the map is close enough, and the view reaches past the
 * area last asked for, or the racks there were capped and the rider zoomed in to see more.
 */
export function canSearchArea(state: AreaState, view: ViewLike | null, capped: boolean): boolean {
  if (!view || view.zoom < MIN_DATA_ZOOM || state.searched === null || state.autoNext) return false;
  if (!contains(state.searched, view.bounds)) return true;
  return capped && view.zoom > state.searchedZoom;
}
