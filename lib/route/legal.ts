// Is this route legal for this rider on this bike? The route plan (lib/route/types.ts) says what
// each piece of the route runs on and where it is. The rules engine (lib/rules) answers for the
// rider and bike in every state and checked place the route crosses, exactly as the checker does.
// Then each piece is checked against three things: the state's where-you-ride rules, the checked
// city's or county's own rules, and any posted sign mapped in OpenStreetMap. A piece no rule
// settles can't support a YES. A place whose own rules weren't read is named on the answer, the
// way the checker names one, and never treated as checked.

import { bottomLine, evaluate, STATE_CODES, type BikeFacts, type BottomLine, type ClassNum, type PlaceId } from "@/lib/rules";
import { CHECKED_CITIES, SD_COUNTY_FIPS, SD_STATE } from "@/lib/places/sanDiego";
import type { LegalKind, LocalFacility, LocalKindRule, LocalWayRules, RouteRules, StateKindRule, WayStatus } from "./rules";
import type { Jurisdiction, RoutePlan, RoutePoint, RouteSegment, WayKind } from "./types";

/**
 * What the check found for one piece of the route.
 * allowed: every rule that applies allows it.
 * banned: a rule bans this bike or rider here.
 * unclear: a rule here may ban it and the check can't tell, so it can't support a YES.
 * unchecked: state law allows it, and the place's own rules weren't read, so the place is named.
 */
export type PieceStatus = "allowed" | "banned" | "unclear" | "unchecked";

export type ReasonCode =
  | "state_banned"
  | "state_unclear"
  | "state_no_rules"
  | "local_banned"
  | "local_banned_somewhere"
  | "local_unclear"
  | "local_not_checked"
  | "local_allows"
  | "facility_banned"
  | "facility_unclear"
  | "posted_no_bikes"
  | "posted_dismount"
  | "posted_no_ebikes"
  | "posted_no_access"
  | "place_not_checked"
  | "kind_unknown";

export interface PieceReason {
  code: ReasonCode;
  status: Exclude<PieceStatus, "allowed">;
  /** A state code, a local record id, or "osm" for a posted sign. */
  by: string;
  kind: WayKind;
  where?: string;
  whereNote?: string;
  facility?: string;
  citation?: string;
  url?: string;
  quote?: string;
}

export interface CheckedPiece {
  index: number;
  segment: RouteSegment;
  status: PieceStatus;
  reasons: PieceReason[];
  /** The checked local record that governs this piece, or null outside checked places. */
  record: PlaceId | null;
}

export interface RiderAnswer {
  state: string;
  /** The engine's bottom line, or null when the rules table has no entry for the state. */
  line: BottomLine | null;
  places: PlaceId[];
}

/** Neighbouring pieces that fail for the same reason, joined so the answer names them once. */
export interface RouteProblem {
  status: "banned" | "unclear";
  reason: PieceReason;
  name: string | null;
  meters: number;
  pieces: number[];
}

export interface RouteVerdict {
  kind: "yes" | "no_illegal" | "no_unconfirmed";
  rider: RiderAnswer[];
  pieces: CheckedPiece[];
  problems: RouteProblem[];
  /** Names of the places the route crosses whose own rules weren't read. */
  unchecked: string[];
  /** The middle of every problem piece, for the router to avoid on the next try. */
  avoid: RoutePoint[];
  meters: Record<PieceStatus, number>;
}

export interface RouteRider {
  riderAge: number;
  /** YYYY-MM-DD. */
  rideDate: string;
  facts: BikeFacts;
  /** The family said the ride ends at a San Dieguito Union High School District campus. */
  sduhsdCampus: boolean;
  /**
   * The Map can skip the rider and bike check and take the bike as legal for the rider, as the
   * family asked. Every piece is still checked for the bike's class, and the answer says what it assumed.
   */
  assumeBikeLegal?: boolean;
}

/** The checked local record for a piece: one of the 18 cities, or the county outside them. */
export function recordFor(seg: RouteSegment): PlaceId | null {
  if (seg.state !== SD_STATE || seg.countyGeoid !== SD_COUNTY_FIPS) return null;
  if (seg.placeGeoid === null) return "unincorporated_san_diego_county";
  return CHECKED_CITIES.find((c) => c.geoid === seg.placeGeoid)?.record ?? null;
}

/** The rule kind a way follows. A crossing is part of the street, and a ferry isn't ridden. */
function ruleKind(kind: WayKind): LegalKind | "ferry" | null {
  if (kind === "crossing") return "road";
  if (kind === "ferry") return "ferry";
  if (kind === "other") return null;
  return kind;
}

const RANK: Record<WayStatus, number> = { allowed: 0, unclear: 1, banned: 2 };

function worst(statuses: readonly WayStatus[]): WayStatus {
  return statuses.reduce<WayStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "allowed");
}

/** A state rule for the bike's classes. An unknown class counts only when every class agrees. */
export function stateStatus(rule: StateKindRule, classes: readonly ClassNum[]): WayStatus {
  if (classes.length === 0) return rule["1"] === rule["2"] && rule["2"] === rule["3"] ? rule["1"] : "unclear";
  return worst(classes.map((c) => rule[String(c) as "1" | "2" | "3"]));
}

function covers(ruleClasses: readonly ClassNum[], classes: readonly ClassNum[]): boolean {
  return classes.length === 0 || ruleClasses.some((c) => classes.includes(c));
}

function localReason(r: LocalKindRule | LocalFacility, code: ReasonCode, status: PieceReason["status"], by: string, kind: WayKind): PieceReason {
  return {
    code,
    status,
    by,
    kind,
    citation: r.citation,
    url: r.source_url,
    quote: r.quote,
    ...("where" in r ? { where: r.where, whereNote: r.whereNote } : { facility: r.names[0] }),
  };
}

/** A named place's own rule, matched by the way's name. */
function facilityReasons(local: LocalWayRules, seg: RouteSegment, classes: readonly ClassNum[], by: string): PieceReason[] {
  const name = seg.name?.trim().toLowerCase();
  if (!name) return [];
  return local.facilities
    .filter((f) => f.names.some((n) => n.trim().toLowerCase() === name) && covers(f.classes, classes) && f.status !== "allowed")
    .map((f) => localReason(f, f.status === "banned" ? "facility_banned" : "facility_unclear", f.status === "banned" ? "banned" : "unclear", by, seg.kind));
}

/** A checked place's rules for one kind of way. Null means its code holds no rule here, so state law decides. */
function localKindReasons(local: LocalWayRules, kind: LegalKind, seg: RouteSegment, classes: readonly ClassNum[], by: string, state: StateKindRule): PieceReason[] | null {
  const rules = (local.kinds[kind] ?? []).filter((r) => covers(r.classes, classes));
  if (rules.length > 0) {
    return rules
      .filter((r) => r.status !== "allowed")
      .map((r) => {
        if (r.status === "unclear") return localReason(r, "local_unclear", "unclear", by, seg.kind);
        // A ban only in business districts or posted areas: the map can't tell where those are.
        return r.where === "everywhere"
          ? localReason(r, "local_banned", "banned", by, seg.kind)
          : localReason(r, "local_banned_somewhere", "unclear", by, seg.kind);
      });
  }
  if (local.notChecked.includes(kind) && state.localMayRestrict) return [{ code: "local_not_checked", status: "unclear", by, kind: seg.kind }];
  return null;
}

/** A sign mapped in OpenStreetMap that keeps this bike off the way. */
function postedReasons(seg: RouteSegment): PieceReason[] {
  const out: PieceReason[] = [];
  const base = { status: "banned" as const, by: "osm", kind: seg.kind };
  if (seg.tags.bicycle === "no") out.push({ ...base, code: "posted_no_bikes" });
  if (seg.tags.bicycle === "dismount") out.push({ ...base, code: "posted_dismount" });
  if (seg.tags.electricBicycle === "no") out.push({ ...base, code: "posted_no_ebikes" });
  if (seg.tags.access === "no") out.push({ ...base, code: "posted_no_access" });
  return out;
}

function statusOf(reasons: readonly PieceReason[]): PieceStatus {
  if (reasons.some((r) => r.status === "banned")) return "banned";
  if (reasons.some((r) => r.status === "unclear")) return "unclear";
  if (reasons.some((r) => r.status === "unchecked")) return "unchecked";
  return "allowed";
}

/** Checks one piece of the route for a bike of these classes. */
export function checkPiece(seg: RouteSegment, index: number, classes: readonly ClassNum[], rules: RouteRules): CheckedPiece {
  const record = recordFor(seg);
  const posted = postedReasons(seg);
  const kind = ruleKind(seg.kind);
  // The law, with its quote, comes before a posted sign mapped in OpenStreetMap.
  const done = (reasons: PieceReason[]): CheckedPiece => ({ index, segment: seg, status: statusOf(reasons), reasons, record });
  if (kind === "ferry") return done(posted);
  if (kind === null) return done([{ code: "kind_unknown", status: "unclear", by: seg.state ?? "", kind: seg.kind }, ...posted]);
  const state = seg.state ? rules.states[seg.state] : undefined;
  if (!state) return done([{ code: "state_no_rules", status: "unclear", by: seg.state ?? "", kind: seg.kind }, ...posted]);
  const stateRule = state.kinds[kind];
  const fromState = stateStatus(stateRule, classes);
  const base = { by: seg.state ?? "", kind: seg.kind, citation: state.citation, url: state.source_url, quote: stateRule.basis };
  const local = record ? rules.local[record] : undefined;
  const facilities = local && record ? facilityReasons(local, seg, classes, record) : [];

  if (fromState === "banned") {
    // Only a checked local rule that allows this class here lifts a state ban the state lets locals lift.
    const lifted =
      stateRule.localMayAllow && local && (local.kinds[kind] ?? []).some((r) => r.status === "allowed" && r.where === "everywhere" && classes.length > 0 && classes.every((c) => r.classes.includes(c)));
    return done([...facilities, ...(lifted ? [] : [{ ...base, code: "state_banned" as const, status: "banned" as const }]), ...posted]);
  }
  if (fromState === "unclear") return done([...facilities, { ...base, code: "state_unclear", status: "unclear" }, ...posted]);
  // Unread local rules only matter where state law lets the place restrict this kind of way.
  if (!record) return done([...(stateRule.localMayRestrict ? [{ code: "place_not_checked" as const, status: "unchecked" as const, by: seg.placeName ?? seg.countyGeoid ?? "", kind: seg.kind }] : []), ...posted]);
  if (!local) return done([...(stateRule.localMayRestrict ? [{ code: "local_not_checked" as const, status: "unclear" as const, by: record, kind: seg.kind }] : []), ...posted]);
  // A checked place's own ban always counts, even where state law may preempt it: the answer never
  // says YES against enacted text.
  const fromLocal = localKindReasons(local, kind, seg, classes, record, stateRule) ?? [];
  return done([...facilities, ...fromLocal, ...posted]);
}

/** The classes the rules engine settled for this bike in a state, or the ones the label states. */
function classesFor(rider: readonly RiderAnswer[], facts: BikeFacts, verdictClasses: Map<string, ClassNum[]>): ClassNum[] {
  const settled = rider.flatMap((r) => verdictClasses.get(r.state) ?? []);
  return [...new Set(settled.length > 0 ? settled : facts.classes)].sort();
}

function namesOf(list: readonly Jurisdiction[]): string[] {
  return [...new Set(list.map((j) => j.name))];
}

/** The places the route crosses whose own rules weren't read, by name. */
export function uncheckedPlaces(plan: RoutePlan): string[] {
  const checkedCities = new Set(CHECKED_CITIES.map((c) => c.geoid));
  const outside = plan.crossed.filter((j) => {
    if (j.layer === "reservation" || j.layer === "military") return true;
    if (j.layer === "place") return !checkedCities.has(j.geoid);
    if (j.layer === "county") return j.geoid !== SD_COUNTY_FIPS;
    return false;
  });
  return namesOf(outside);
}

/** Every state the route runs through, in route order. */
function statesOf(plan: RoutePlan): string[] {
  const fromPieces = plan.segments.map((s) => s.state).filter((s): s is string => s !== null);
  const fromAreas = plan.crossed.filter((j) => j.layer === "state" && j.state !== null).map((j) => j.state as string);
  return [...new Set([...fromPieces, ...fromAreas])];
}

/** The engine's answer for the rider and bike in each state, with the checked places the route crosses there. */
function riderAnswers(plan: RoutePlan, rider: RouteRider, verdictClasses: Map<string, ClassNum[]>): RiderAnswer[] {
  const unchecked = uncheckedPlaces(plan).length > 0;
  return statesOf(plan).map((state) => {
    if (!STATE_CODES.includes(state)) return { state, line: null, places: [] };
    const records = plan.segments.filter((s) => s.state === state).map(recordFor);
    const places = [...new Set(records.filter((r): r is PlaceId => r !== null))];
    if (state === SD_STATE && rider.sduhsdCampus) places.push("sduhsd_campuses");
    const someUnchecked = unchecked || records.some((r) => r === null);
    const result = evaluate({ state, places, riderAge: rider.riderAge, rideDate: rider.rideDate, facts: rider.facts, otherPlaces: someUnchecked });
    verdictClasses.set(state, result.state.classes);
    return { state, line: bottomLine(result, rider.rideDate), places };
  });
}

function sameProblem(a: PieceReason, b: PieceReason): boolean {
  return a.code === b.code && a.by === b.by && a.facility === b.facility && a.citation === b.citation;
}

/** Joins neighbouring problem pieces that fail for the same first reason. */
function problemsOf(pieces: readonly CheckedPiece[]): RouteProblem[] {
  const out: RouteProblem[] = [];
  for (const p of pieces) {
    if (p.status !== "banned" && p.status !== "unclear") continue;
    const reason = p.reasons.find((r) => r.status === p.status) as PieceReason;
    const last = out[out.length - 1];
    const prev = last ? last.pieces[last.pieces.length - 1] : -2;
    if (last && prev === p.index - 1 && last.status === p.status && sameProblem(last.reason, reason)) {
      last.meters += p.segment.meters;
      last.pieces.push(p.index);
      if (!last.name) last.name = p.segment.name;
      continue;
    }
    out.push({ status: p.status, reason, name: p.segment.name, meters: p.segment.meters, pieces: [p.index] });
  }
  return out;
}

function middleOf(plan: RoutePlan, seg: RouteSegment): RoutePoint {
  return plan.points[Math.round((seg.from + seg.to) / 2)] ?? plan.points[seg.from];
}

/** The whole answer for one route. */
export function checkRoute(plan: RoutePlan, rider: RouteRider, rules: RouteRules): RouteVerdict {
  const verdictClasses = new Map<string, ClassNum[]>();
  const answers = rider.assumeBikeLegal ? [] : riderAnswers(plan, rider, verdictClasses);
  const classes = classesFor(answers, rider.facts, verdictClasses);
  const pieces = plan.segments.map((seg, i) => checkPiece(seg, i, classes, rules));
  const meters: Record<PieceStatus, number> = { allowed: 0, banned: 0, unclear: 0, unchecked: 0 };
  for (const p of pieces) meters[p.status] += p.segment.meters;
  const problems = problemsOf(pieces);

  const riderKinds = answers.map((a) => (a.line ? a.line.kind : "no_unconfirmed"));
  const kind =
    riderKinds.includes("no_illegal") || pieces.some((p) => p.status === "banned")
      ? "no_illegal"
      : riderKinds.includes("no_unconfirmed") || pieces.some((p) => p.status === "unclear") || pieces.length === 0
        ? "no_unconfirmed"
        : "yes";

  return {
    kind,
    rider: answers,
    pieces,
    problems,
    unchecked: uncheckedPlaces(plan),
    avoid: problems.flatMap((pr) => pr.pieces.map((i) => middleOf(plan, pieces[i].segment))),
    meters,
  };
}
