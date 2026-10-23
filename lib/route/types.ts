// The shapes the legal route check passes around. The server (app/api/route) builds a RoutePlan
// from a bike router, the Census boundary service and OpenStreetMap tags. It knows nothing about
// the rider. The page then checks the plan against the rules (lib/route/legal.ts), so the rider's
// age and bike never leave the phone.

/** What kind of way a piece of the route runs on. */
export type WayKind =
  /** A street with no bike lane. */
  | "road"
  /** A painted or buffered bike lane on a street. */
  | "bike_lane"
  /** A protected lane or cycle track beside a street. */
  | "separated_bikeway"
  /** A paved path for bikes away from any street, a Class I bike path in California. */
  | "bike_path"
  /** A sidewalk beside a street. */
  | "sidewalk"
  /** A walkway or pedestrian path that is not a sidewalk. */
  | "footway"
  /** An unpaved path or track. */
  | "trail"
  /** A crosswalk or a short crossing link. */
  | "crossing"
  | "ferry"
  | "other";

export const WAY_KINDS: readonly WayKind[] = ["road", "bike_lane", "separated_bikeway", "bike_path", "sidewalk", "footway", "trail", "crossing", "ferry", "other"];

export interface RoutePoint {
  lat: number;
  lon: number;
}

/** The OpenStreetMap tags on a way that can show a posted rule. Only these are read. */
export interface PostedTags {
  /** bicycle=*, like "no", "dismount", "designated" or "yes". */
  bicycle?: string;
  /** electric_bicycle=*, a posted e-bike rule. */
  electricBicycle?: string;
  /** access=*, like "private" or "no". */
  access?: string;
  /** highway=*, like "cycleway", "footway" or "path". */
  highway?: string;
  /** footway=*, like "sidewalk" or "crossing". */
  footway?: string;
  /** True when the way is tagged as running beside a street (is_sidepath=yes or footway=sidewalk). */
  sidepath?: boolean;
}

export interface RouteSegment {
  /** First and last index in RoutePlan.points, both included. */
  from: number;
  to: number;
  meters: number;
  kind: WayKind;
  name: string | null;
  /** The OpenStreetMap way id, or null when the router didn't give one. */
  wayId: number | null;
  tags: PostedTags;
  /** Two-letter state code at the segment's middle. */
  state: string | null;
  /** Five-digit county GEOID at the segment's middle. */
  countyGeoid: string | null;
  /** Seven-digit incorporated place GEOID at the segment's middle, or null outside any city. */
  placeGeoid: string | null;
  placeName: string | null;
}

export type JurisdictionLayer =
  | "state"
  | "county"
  | "place"
  | "school_unified"
  | "school_secondary"
  | "school_elementary"
  | "reservation"
  | "military";

/** A Census area the route crosses or ends in. */
export interface Jurisdiction {
  layer: JurisdictionLayer;
  geoid: string;
  name: string;
  /** Two-letter state code, when the layer has one. */
  state: string | null;
}

export interface RoutePlan {
  points: RoutePoint[];
  meters: number;
  seconds: number;
  /** Total climb along the route, or null when the router didn't say. */
  climbMeters: number | null;
  /** The ground height at each point, in meters, null where there is no reading. Missing when the height service didn't answer. */
  heights?: (number | null)[] | null;
  segments: RouteSegment[];
  /** Every Census area the route crosses. */
  crossed: Jurisdiction[];
  /** The Census areas at the destination, so a school there can be checked. */
  atEnd: Jurisdiction[];
  /** Where each part came from and when it was read, for the source line. */
  sources: { router: string; boundaries: string; tags: string; read: string };
}

/** What the page asks our server for. */
export interface RouteRequest {
  from: RoutePoint;
  to: RoutePoint;
  /** Points whose nearest ways the router must avoid, from an earlier route's illegal pieces. */
  avoid?: RoutePoint[];
  /** "roads" keeps to streets and bike lanes when paths or sidewalks are the problem. */
  prefer?: "balanced" | "roads";
  /** Steer around steep climbs, for a weak motor or a low battery. */
  avoidHills?: boolean;
}
