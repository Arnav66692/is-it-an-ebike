// Measures how much of each San Diego County community (Census CDP) is a military base or a
// tribal reservation. County ordinances don't govern that land, so a community that is mostly
// base or reservation can't take the county's record. The build compares the result with
// NOT_COUNTY_LAND in lib/places/sanDiego.ts and stops when they differ.

import { NOT_COUNTY_LAND_SHARE, type NotCountyLandReason } from "../../lib/places/sanDiego";
import { containsPoint, type ShapeFeature } from "./shapes";

/** Sample points per side of each community's bounding box. */
const GRID = 120;

export interface LandShare {
  geoid: string;
  name: string;
  reason: NotCountyLandReason;
  /** Percent of the sample points inside the community that fall on the base or reservation, to one decimal. */
  share: number;
  /** The base or reservation most of those points fall on. */
  area: string;
}

function overlaps(a: ShapeFeature, b: ShapeFeature): boolean {
  return a.bbox[0] <= b.bbox[2] && b.bbox[0] <= a.bbox[2] && a.bbox[1] <= b.bbox[3] && b.bbox[1] <= a.bbox[3];
}

interface Hits {
  count: number;
  byArea: Map<string, number>;
}

function addHit(hits: Hits, area: string): void {
  hits.count += 1;
  hits.byArea.set(area, (hits.byArea.get(area) ?? 0) + 1);
}

function topArea(hits: Hits): string {
  return [...hits.byArea.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * The share of one community's land on a base and on a reservation, by sampling a grid of points
 * over its bounding box and keeping the points inside it.
 */
function measure(cdp: ShapeFeature, bases: ShapeFeature[], reservations: ShapeFeature[]) {
  const nearBases = bases.filter((f) => overlaps(f, cdp));
  const nearReservations = reservations.filter((f) => overlaps(f, cdp));
  const military: Hits = { count: 0, byArea: new Map() };
  const tribal: Hits = { count: 0, byArea: new Map() };
  const [x0, y0, x1, y1] = cdp.bbox;
  let inside = 0;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / GRID;
      const y = y0 + ((j + 0.5) * (y1 - y0)) / GRID;
      if (!containsPoint(cdp, x, y)) continue;
      inside += 1;
      const base = nearBases.find((f) => containsPoint(f, x, y));
      if (base) addHit(military, base.props.FULLNAME);
      const reservation = nearReservations.find((f) => containsPoint(f, x, y));
      if (reservation) addHit(tribal, reservation.props.NAMELSAD);
    }
  }
  return { inside, military, tribal };
}

/**
 * Every community in `geoids` where more than NOT_COUNTY_LAND_SHARE percent of the land is a base
 * or a reservation, in GEOID order.
 */
export function measureNotCountyLand(
  places: ShapeFeature[],
  bases: ShapeFeature[],
  reservations: ShapeFeature[],
  geoids: ReadonlySet<string>,
): LandShare[] {
  const out: LandShare[] = [];
  for (const cdp of places.filter((p) => geoids.has(p.props.GEOID))) {
    const { inside, military, tribal } = measure(cdp, bases, reservations);
    if (inside === 0) throw new Error(`${cdp.props.NAMELSAD} has no sample point inside it`);
    const isMilitary = military.count >= tribal.count;
    const hits = isMilitary ? military : tribal;
    const share = round1((100 * hits.count) / inside);
    if (share <= NOT_COUNTY_LAND_SHARE) continue;
    out.push({ geoid: cdp.props.GEOID, name: cdp.props.NAME, reason: isMilitary ? "military" : "tribal", share, area: topArea(hits) });
  }
  return out.sort((a, b) => a.geoid.localeCompare(b.geoid));
}
