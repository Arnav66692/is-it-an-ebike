// The Census side of the legal route check. TIGERweb, the Census Bureau's public map service,
// says which state, county, city, school district, reservation and military base a line or a point
// is in. The pipeline in plan.ts does the asking, one request per layer. This file writes the
// requests and reads the answers, so the tests need no network.
//
// For states, counties and cities the answer also carries each area's outline. The pipeline uses
// the outlines to put the middle of every piece of the route in its own state, county and city,
// because "the route crosses San Diego" is not enough to say which piece is in which city.

import { boxContains, boxNear, distanceToRingsMeters, isRecord, pointInRings, ringsBox, type Box, type Ring } from "./geo";
import type { Jurisdiction, JurisdictionLayer, RoutePoint } from "./types";

const ROOT = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb";
const CURRENT = `${ROOT}/tigerWMS_Current/MapServer`;

/**
 * The route is thinned to this many points before it is sent. Douglas-Peucker keeps the corners
 * first, so the thinned line follows the real one closely, and a city route is under the limit
 * already.
 */
export const TIGER_MAX_POINTS = 300;

export interface TigerLayer {
  /** Our name for the layer. Federal and state reservations are two Census layers with one name. */
  layer: JurisdictionLayer;
  /** The address to POST a query to. */
  url: string;
  /** The fields to read. Asking for a field the layer lacks fails the whole query. */
  fields: string;
  /**
   * How much the outline may be simplified, in degrees, or null when the answer needs no outline.
   * The city and county outlines decide which piece of the route is in which city, and a beach
   * path can sit 11 m inside a city line. On the Mission Beach route the closest piece of the
   * boardwalk is 10.8 m inside the San Diego line at full detail, 10.9 m with outlines simplified
   * to 5 m, and 14.2 m with 20 m. So the city and county outlines use 5 m, which keeps the worst
   * error to 5 m. The state outline is only the fallback when no county is near a point, so it
   * can be much coarser.
   */
  outline: number | null;
}

/**
 * Layer numbers are for the 2026 Census vintage, checked on 2026-10-23 against the service's own
 * list: 80 States, 82 Counties, 28 Incorporated Places, 14 Unified, 16 Secondary and 18 Elementary
 * School Districts, 36 Federal and 40 State American Indian Reservations. Military Installations
 * are in a different service, Special_Land_Use_Areas, as layer 3. Reservations and military bases
 * have no state field.
 */
export const TIGER_LAYERS: readonly TigerLayer[] = [
  { layer: "state", url: `${CURRENT}/80/query`, fields: "NAME,STUSAB,GEOID", outline: 0.0005 },
  { layer: "county", url: `${CURRENT}/82/query`, fields: "NAME,GEOID,STATE", outline: 0.00005 },
  { layer: "place", url: `${CURRENT}/28/query`, fields: "NAME,BASENAME,GEOID,STATE", outline: 0.00005 },
  { layer: "school_unified", url: `${CURRENT}/14/query`, fields: "NAME,GEOID,STATE", outline: null },
  { layer: "school_secondary", url: `${CURRENT}/16/query`, fields: "NAME,GEOID,STATE", outline: null },
  { layer: "school_elementary", url: `${CURRENT}/18/query`, fields: "NAME,GEOID,STATE", outline: null },
  { layer: "reservation", url: `${CURRENT}/36/query`, fields: "NAME,GEOID", outline: null },
  { layer: "reservation", url: `${CURRENT}/40/query`, fields: "NAME,GEOID", outline: null },
  { layer: "military", url: `${ROOT}/Special_Land_Use_Areas/MapServer/3/query`, fields: "NAME,GEOID", outline: null },
];

/** The order areas are listed in: the big ones first, and the ones a rule might single out last. */
export const LAYER_ORDER: readonly JurisdictionLayer[] = [
  "state",
  "county",
  "place",
  "school_unified",
  "school_secondary",
  "school_elementary",
  "reservation",
  "military",
];

/** What a query is asked about: the whole route, or the one point where it ends. */
export type TigerShape = { kind: "line"; points: readonly RoutePoint[] } | { kind: "point"; point: RoutePoint };

/** The shape in Esri JSON, which writes longitude first. */
export function esriGeometry(shape: TigerShape): string {
  const spatialReference = { wkid: 4326 };
  if (shape.kind === "point") return JSON.stringify({ x: shape.point.lon, y: shape.point.lat, spatialReference });
  return JSON.stringify({ paths: [shape.points.map((p) => [p.lon, p.lat])], spatialReference });
}

/**
 * The form body of one query: everything the shape touches. The outline comes only for a layer
 * that needs it and only for the route, since the end point is just looked up by name.
 */
export function tigerBody(layer: TigerLayer, shape: TigerShape): string {
  const tolerance = shape.kind === "line" ? layer.outline : null;
  const form: Record<string, string> = {
    geometry: esriGeometry(shape),
    geometryType: shape.kind === "point" ? "esriGeometryPoint" : "esriGeometryPolyline",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: layer.fields,
    returnGeometry: String(tolerance !== null),
    f: "json",
  };
  if (tolerance !== null) {
    form.outSR = "4326";
    form.maxAllowableOffset = String(tolerance);
    form.geometryPrecision = "5";
  }
  return new URLSearchParams(form).toString();
}

/** A Census area, with its outline when the layer was asked for it. */
export interface Area extends Jurisdiction {
  rings: Ring[];
  box: Box | null;
}

/** The two-letter code for each state FIPS number, so county, city and district rows can say which state. */
const STATE_BY_FIPS: Readonly<Record<string, string>> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE",
  "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA",
  "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
  "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
};

export function stateFromFips(fips: string): string | null {
  return STATE_BY_FIPS[fips] ?? null;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The outline rings of a feature, or an empty list when it has none. Every position must be a pair of numbers. */
function ringsOf(geometry: unknown): Ring[] {
  if (!isRecord(geometry) || !Array.isArray(geometry.rings)) return [];
  const rings: Ring[] = [];
  for (const ring of geometry.rings) {
    if (!Array.isArray(ring)) return [];
    const positions: number[][] = [];
    for (const position of ring) {
      if (!Array.isArray(position) || typeof position[0] !== "number" || typeof position[1] !== "number") return [];
      if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) return [];
      positions.push([position[0], position[1]]);
    }
    rings.push(positions);
  }
  return rings;
}

function stateOf(layer: TigerLayer, attributes: Record<string, unknown>): string | null {
  if (layer.layer === "state") return cleanText(attributes.STUSAB) || stateFromFips(cleanText(attributes.GEOID));
  return stateFromFips(cleanText(attributes.STATE));
}

/**
 * The areas in one layer's answer, or null when the answer is not a clean one. TIGERweb reports
 * its own errors as HTTP 200 with an "error" object, so a status check alone would call a failed
 * query "no areas here", and the route would look like it crossed nothing.
 */
export function parseTigerLayer(layer: TigerLayer, json: unknown): Area[] | null {
  if (!isRecord(json) || json.error !== undefined || !Array.isArray(json.features)) return null;
  const areas: Area[] = [];
  for (const feature of json.features) {
    if (!isRecord(feature) || !isRecord(feature.attributes)) return null;
    const attributes = feature.attributes;
    const geoid = cleanText(attributes.GEOID);
    // A city's own short name reads better in a sentence than "San Diego city".
    const name = (layer.layer === "place" ? cleanText(attributes.BASENAME) : "") || cleanText(attributes.NAME);
    if (geoid === "" || name === "") return null;
    const rings = layer.outline !== null ? ringsOf(feature.geometry) : [];
    areas.push({ layer: layer.layer, geoid, name, state: stateOf(layer, attributes), rings, box: ringsBox(rings) });
  }
  return areas;
}

/** The area without its outline, which is the shape the plan carries. */
export function toJurisdiction(area: Area): Jurisdiction {
  return { layer: area.layer, geoid: area.geoid, name: area.name, state: area.state };
}

/** One of each area, in the order of the layers and then by id, so two reads of the same place compare equal. */
export function uniqueAreas(areas: readonly Area[]): Area[] {
  const seen = new Set<string>();
  const out: Area[] = [];
  for (const area of areas) {
    const key = `${area.layer}:${area.geoid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(area);
  }
  return out.sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer) || (a.geoid < b.geoid ? -1 : a.geoid > b.geoid ? 1 : 0));
}

/** Where a point sits: the state, county and city around it. */
export interface Where {
  state: string | null;
  countyGeoid: string | null;
  placeGeoid: string | null;
  placeName: string | null;
}

export const NOWHERE: Where = { state: null, countyGeoid: null, placeGeoid: null, placeName: null };

/** The outlines of the states, counties and cities the route touches. */
export interface Outlines {
  states: readonly Area[];
  counties: readonly Area[];
  places: readonly Area[];
}

function contains(area: Area, point: RoutePoint): boolean {
  return area.box !== null && boxContains(area.box, point) && pointInRings(point, area.rings);
}

/** The area that holds the point. The one that held the last point is tried first, since a route stays in one area for a long stretch. */
function findArea(areas: readonly Area[], last: Area | null, point: RoutePoint): Area | null {
  if (last && contains(last, point)) return last;
  return areas.find((area) => area !== last && contains(area, point)) ?? null;
}

/**
 * How far outside an outline a point can be and still count as in the area. A street that is the
 * line between two cities runs within a few meters of both outlines. The street map and the
 * outlines are drawn separately, so its middle can fall just outside both, and calling that
 * "no city" would read as unincorporated land. Along West 47th Avenue in Kansas City, between
 * Roeland Park, Westwood and Kansas City, 10 of 65 segments did. A point farther out than this is
 * left outside, since it really is not in the area.
 */
export const BOUNDARY_SLACK_M = 15;

/** The area whose outline is closest to the point, if that is within BOUNDARY_SLACK_M. */
function nearestArea(areas: readonly Area[], point: RoutePoint): Area | null {
  let nearest: Area | null = null;
  let nearestMeters = Infinity;
  for (const area of areas) {
    if (area.box === null || !boxNear(area.box, point, BOUNDARY_SLACK_M)) continue;
    const meters = distanceToRingsMeters(point, area.rings);
    if (meters < nearestMeters) {
      nearest = area;
      nearestMeters = meters;
    }
  }
  return nearestMeters <= BOUNDARY_SLACK_M ? nearest : null;
}

/**
 * Returns a function that says which state, county and city a point is in. A point that no outline
 * holds goes to the nearest outline within BOUNDARY_SLACK_M, and is left outside beyond that. The
 * county decides the state, because a county never crosses a state line and so the two can't
 * disagree at a border. The state's own outline is only used when no county is near the point.
 */
export function makeLocator(outlines: Outlines): (point: RoutePoint | null) => Where {
  let lastCounty: Area | null = null;
  let lastPlace: Area | null = null;
  return (point) => {
    if (!point) return NOWHERE;
    const inCounty = findArea(outlines.counties, lastCounty, point);
    const inPlace = findArea(outlines.places, lastPlace, point);
    if (inCounty) lastCounty = inCounty;
    if (inPlace) lastPlace = inPlace;
    const county = inCounty ?? nearestArea(outlines.counties, point);
    const place = inPlace ?? nearestArea(outlines.places, point);
    const state = county ? county.state : (findArea(outlines.states, null, point) ?? nearestArea(outlines.states, point))?.state ?? null;
    return { state, countyGeoid: county?.geoid ?? null, placeGeoid: place?.geoid ?? null, placeName: place?.name ?? null };
  };
}
