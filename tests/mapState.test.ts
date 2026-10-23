// The map page's interactive state: the filter chips and their counts, the clusters, the list
// and the picked spot, and when "Search this area" shows.

import { describe, expect, it } from "vitest";
import {
  ALL_KINDS,
  AREA_START,
  areaReducer,
  boundsOf,
  canSearchArea,
  chipCounts,
  CLUSTER_CELL_PX,
  clusterGrid,
  clusterSize,
  filterSpots,
  listSpots,
  moveToSpot,
  selectReducer,
  SPOT_ZOOM,
  toggleKind,
  type AreaState,
} from "@/lib/map/mapState";
import { MIN_DATA_ZOOM, SAVED_DATA_ZOOM, type Spot, type SpotKind } from "@/lib/map/osm";
import { MAP_TEXT } from "@/lib/i18n/map";

function spot(id: string, kind: SpotKind, lat: number, lon: number): Spot {
  return { id, kind, lat, lon, name: null, capacity: null, covered: null, restricted: false, hours: null, phone: null, website: null };
}

const SPOTS = [
  spot("node/1", "rack", 32.715, -117.16),
  spot("node/2", "rack", 32.716, -117.161),
  spot("node/3", "shop", 32.72, -117.15),
  spot("node/4", "repair", 32.71, -117.155),
  spot("node/5", "rack", 32.7, -117.14),
];

describe("filter chips", () => {
  it("starts with every kind on and hides only the kind turned off", () => {
    expect(filterSpots(SPOTS, ALL_KINDS)).toHaveLength(5);
    const noRacks = toggleKind(ALL_KINDS, "rack");
    expect(noRacks).toEqual({ rack: false, shop: true, repair: true });
    expect(filterSpots(SPOTS, noRacks).map((s) => s.kind)).toEqual(["shop", "repair"]);
    expect(toggleKind(noRacks, "rack")).toEqual(ALL_KINDS);
  });

  it("never changes the filter it was given", () => {
    const before = { ...ALL_KINDS };
    toggleKind(ALL_KINDS, "shop");
    expect(ALL_KINDS).toEqual(before);
  });

  it("counts every kind in view on its chip, hidden or not, and shows no count before a search", () => {
    const filter = toggleKind(ALL_KINDS, "shop");
    expect(chipCounts(SPOTS, filter, true)).toEqual([
      { kind: "rack", on: true, count: 3 },
      { kind: "shop", on: false, count: 1 },
      { kind: "repair", on: true, count: 1 },
    ]);
    expect(chipCounts([], ALL_KINDS, false).map((c) => c.count)).toEqual([null, null, null]);
    expect(chipCounts([], ALL_KINDS, true).map((c) => c.count)).toEqual([0, 0, 0]);
  });
});

describe("clusters", () => {
  const pts = [
    { id: "a", x: 10, y: 10 },
    { id: "b", x: 20, y: 30 },
    { id: "c", x: 40, y: 50 },
    { id: "d", x: 200, y: 200 },
  ];

  it("joins marks in one grid cell into a bubble at their middle, and leaves a lone mark single", () => {
    const { singles, clusters } = clusterGrid(pts, CLUSTER_CELL_PX);
    expect(singles).toEqual(["d"]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids).toEqual(["a", "b", "c"]);
    expect(clusters[0].x).toBeCloseTo(70 / 3);
    expect(clusters[0].y).toBeCloseTo(30);
  });

  it("keeps the picked spot out of any bubble, so its popup has a mark", () => {
    const { singles, clusters } = clusterGrid(pts, CLUSTER_CELL_PX, new Set(["b"]));
    expect(singles.sort()).toEqual(["b", "d"]);
    expect(clusters[0].ids).toEqual(["a", "c"]);
  });

  it("joins bubbles from neighbouring cells that would sit on top of each other", () => {
    // Cells 0 and 1 across x = 56, so the grid alone makes two bubbles 10 px apart.
    const edge = [
      { id: "a", x: 50, y: 10 },
      { id: "b", x: 52, y: 12 },
      { id: "c", x: 60, y: 10 },
      { id: "d", x: 62, y: 12 },
    ];
    const { singles, clusters } = clusterGrid(edge, CLUSTER_CELL_PX);
    expect(singles).toEqual([]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids.sort()).toEqual(["a", "b", "c", "d"]);
    expect(clusters[0].x).toBeCloseTo(56);
  });

  it("accounts for every mark exactly once", () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ id: `n${i}`, x: (i * 37) % 900, y: (i * 53) % 700 }));
    const { singles, clusters } = clusterGrid(many, CLUSTER_CELL_PX, new Set(["n7"]));
    const all = [...singles, ...clusters.flatMap((c) => c.ids)];
    expect(all).toHaveLength(300);
    expect(new Set(all).size).toBe(300);
    expect(clusters.every((c) => c.ids.length >= 2)).toBe(true);
    // No two bubbles end up closer than a cell.
    for (const a of clusters) for (const b of clusters) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(CLUSTER_CELL_PX);
  });

  it("sizes a bubble by its count and boxes its spots for the zoom in", () => {
    expect([2, 9, 10, 99, 100, 500].map(clusterSize)).toEqual(["s", "s", "m", "m", "l", "l"]);
    expect(boundsOf(SPOTS)).toEqual({ south: 32.7, west: -117.161, north: 32.72, east: -117.14 });
    expect(boundsOf([])).toBeNull();
  });
});

describe("the list and the picked spot", () => {
  const middle = { lat: 32.715, lon: -117.16 };

  it("lists the nearest first and adds a picked mark that is farther out at the end", () => {
    expect(listSpots(SPOTS, middle, 2, null).map((n) => n.spot.id)).toEqual(["node/1", "node/2"]);
    expect(listSpots(SPOTS, middle, 2, "node/5").map((n) => n.spot.id)).toEqual(["node/1", "node/2", "node/5"]);
    expect(listSpots(SPOTS, middle, 2, "node/2").map((n) => n.spot.id)).toEqual(["node/1", "node/2"]);
    expect(listSpots(SPOTS, middle, 2, "gone").map((n) => n.spot.id)).toEqual(["node/1", "node/2"]);
  });

  it("picks from the list or a mark, and clears only when that spot's own popup closes", () => {
    let sel = selectReducer(null, { type: "pick", id: "node/3" });
    expect(sel).toBe("node/3");
    // Leaflet closes the old popup while it opens the new one.
    sel = selectReducer(sel, { type: "pick", id: "node/4" });
    sel = selectReducer(sel, { type: "close", id: "node/3" });
    expect(sel).toBe("node/4");
    sel = selectReducer(sel, { type: "close", id: "node/4" });
    expect(sel).toBeNull();
  });

  it("drops the pick when a filter or new data takes its spot off the map", () => {
    const shown = new Set(filterSpots(SPOTS, toggleKind(ALL_KINDS, "repair")).map((s) => s.id));
    expect(selectReducer("node/4", { type: "prune", ids: shown })).toBeNull();
    expect(selectReducer("node/3", { type: "prune", ids: shown })).toBe("node/3");
  });

  it("moves the map to a spot picked from the list, opens its popup, and never zooms out", () => {
    const shop = SPOTS[2];
    expect(moveToSpot(shop, 14, false)).toEqual({ center: { lat: 32.72, lon: -117.15 }, zoom: SPOT_ZOOM, openId: "node/3", animate: true });
    expect(moveToSpot(shop, 19, false).zoom).toBe(19);
    expect(moveToSpot(shop, 14, true).animate).toBe(false);
  });
});

describe("Search this area", () => {
  const AREA = { south: 32.7, west: -117.17, north: 32.73, east: -117.14 };
  const view = (dLat: number, zoom = 15) => ({ bounds: { ...AREA, south: AREA.south + dLat, north: AREA.north + dLat }, zoom });

  it("searches the first view at the data zoom by itself, and not a wider one", () => {
    expect(areaReducer(AREA_START, { type: "view", view: view(0, MIN_DATA_ZOOM - 1) })).toBe(AREA_START);
    const first = areaReducer(AREA_START, { type: "view", view: view(0) });
    expect(first.searched).toEqual(AREA);
    expect(first.nonce).toBe(1);
  });

  it("waits for the button after the rider pans, and shows it only once the view leaves the searched area", () => {
    const first = areaReducer(AREA_START, { type: "view", view: view(0) });
    expect(canSearchArea(first, view(0), false)).toBe(false);
    const panned = areaReducer(first, { type: "view", view: view(0.02) });
    expect(panned).toBe(first);
    expect(canSearchArea(panned, view(0.02), false)).toBe(true);
    const searched = areaReducer(panned, { type: "search", view: view(0.02) });
    expect(searched.nonce).toBe(2);
    expect(canSearchArea(searched, view(0.02), false)).toBe(false);
  });

  it("shows the button after zooming out past the area, or zooming in where racks were capped", () => {
    const first = areaReducer(AREA_START, { type: "view", view: view(0, 15) });
    const wider = { bounds: { south: 32.69, west: -117.18, north: 32.74, east: -117.13 }, zoom: 14 };
    expect(canSearchArea(first, wider, false)).toBe(true);
    const closer = { bounds: { south: 32.71, west: -117.16, north: 32.72, east: -117.15 }, zoom: 16 };
    expect(canSearchArea(first, closer, false)).toBe(false);
    expect(canSearchArea(first, closer, true)).toBe(true);
  });

  it("hides the button too far out, and searches by itself again after a place pick", () => {
    const first: AreaState = areaReducer(AREA_START, { type: "view", view: view(0) });
    expect(canSearchArea(first, view(0.5, SAVED_DATA_ZOOM - 1), false)).toBe(false);
    const picking = areaReducer(first, { type: "autoNext" });
    expect(canSearchArea(picking, view(0.5), false)).toBe(false);
    const moved = areaReducer(picking, { type: "view", view: view(0.5) });
    expect(moved.searched).toEqual(view(0.5).bounds);
    expect(moved.autoNext).toBe(false);
  });

  it("asks the same area again on Try again", () => {
    const first = areaReducer(AREA_START, { type: "view", view: view(0) });
    const again = areaReducer(first, { type: "retry" });
    expect(again.searched).toEqual(first.searched);
    expect(again.nonce).toBe(first.nonce + 1);
    expect(areaReducer(AREA_START, { type: "retry" })).toBe(AREA_START);
  });

  it("has the new words in English and Spanish", () => {
    for (const key of ["searchArea", "tryAgain", "recenter", "filterLabel", "emptyState"] as const) {
      expect(MAP_TEXT.en[key], key).toBeTruthy();
      expect(MAP_TEXT.es[key], key).toBeTruthy();
      expect(MAP_TEXT.es[key]).not.toBe(MAP_TEXT.en[key]);
    }
    expect(MAP_TEXT.en.emptyState).toBe("Zoom in or pick a place to see racks and shops.");
  });
});
