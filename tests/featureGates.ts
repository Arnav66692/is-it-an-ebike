// The safety gates for the school districts, the mods check and the bike finder, run by
// tests/featureGates.test.ts and written into RESULTS.md by scripts/build-results.ts. Each gate
// counts answers that must never happen, so every one must be 0.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModAnswerCard } from "../components/ModsCheck";
import { CATALOG } from "../lib/bikes/catalog";
import { catalogFacts } from "../lib/bikes/facts";
import { finderLine } from "../lib/bikes/finder";
import { answerMod, modApplies, outcomesFor, type ModAnswer, type ModChoice } from "../lib/mods/answer";
import { FROM_2027, MODS_DATA, MODS_SOURCE } from "../lib/mods/data";
import { baseFacts, outcomeFacts, withMod } from "../lib/mods/facts";
import { answerRide, MODS_DATA_STATE, type RideAnswer } from "../lib/mods/ride";
import { SDUHSD_LEAID, withDistricts, type DistrictIndexFile } from "../lib/places/districts";
import { parsePlaceIndex } from "../lib/places/parse";
import { resolvePlace } from "../lib/places/resolve";
import type { PlaceIndexFile } from "../lib/places/types";
import { bottomLine, evaluate, PLACE_IDS, STATE_CODES } from "../lib/rules";
import { emptyFacts, type BikeFacts, type ClassNum, type PlaceId } from "../lib/rules/types";
import { CA_ANSWERS_BEFORE, caAnswersDigest } from "./modsDigest";
import { CHECKED_CITIES } from "../lib/places/sanDiego";
import { checkPiece, checkRoute, type RouteRider } from "../lib/route/legal";
import { ROUTE_RULES } from "../lib/route/ruleData";
import type { RouteSegment } from "../lib/route/types";

const ROOT = join(__dirname, "..");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;

export interface DistrictGates {
  districts: number;
  /** SDUHSD maps to the SDUHSD campus record. */
  sduhsd_mapped: boolean;
  /** Any other district mapped to a checked record. */
  other_checked: number;
}

export function districtGates(): DistrictGates {
  const index = withDistricts(parsePlaceIndex(readJson<PlaceIndexFile>("public/places/us-places.json")), readJson<DistrictIndexFile>("public/places/us-districts.json"));
  const districts = index.entries.filter((e) => e.kind === "district");
  const sduhsd = districts.find((d) => d.geoid === SDUHSD_LEAID);
  return {
    districts: districts.length,
    sduhsd_mapped: sduhsd !== undefined && resolvePlace(sduhsd).localRecord === "sduhsd_campuses",
    other_checked: districts.filter((d) => d.geoid !== SDUHSD_LEAID && resolvePlace(d).checked).length,
  };
}

export interface ModGates {
  mods: number;
  answers: number;
  yes: number;
  /** YES for an outcome the source doesn't read as the same class or a new class. */
  yes_beyond_source: number;
  /** YES with no outcome picked, or "something else". */
  yes_unanswered: number;
  /** Rendered reasons, rules, dates and penalties that are not a string in the data. */
  claims_not_in_data: number;
  claims: number;
}

const MOD_DATES = ["2026-10-21", "2026-12-31", FROM_2027, "2029-01-01", "2029-12-31"];

function strings(value: unknown, out: Set<string>): Set<string> {
  if (typeof value === "string") out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

function claimsOf(html: string): string[] {
  return [...html.matchAll(/data-claim=""[^>]*>([^<]*)</g)].map((m) =>
    m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
  );
}

export function modGates(): ModGates {
  const source = strings(readJson<unknown>("data/mods/ca-mods.json"), new Set());
  const gates: ModGates = { mods: MODS_DATA.mods.length, answers: 0, yes: 0, yes_beyond_source: 0, yes_unanswered: 0, claims_not_in_data: 0, claims: 0 };
  const rendered = new Set<string>();
  for (const mod of MODS_DATA.mods) {
    const raw = MODS_SOURCE.mods.find((m) => m.mod_id === mod.id);
    for (const cls of [1, 2, 3] as ClassNum[]) {
      if (!modApplies(mod, cls)) continue;
      const choices: ModChoice[] = [null, "other", ...outcomesFor(mod, cls).map((o) => o.index)];
      for (const choice of choices) {
        for (const date of MOD_DATES) {
          for (const city of [false, true]) {
            const answer = answerMod(MODS_DATA, mod, cls, choice, date, city);
            gates.answers += 1;
            if (!answer.yes) continue;
            gates.yes += 1;
            const index = typeof choice === "number" ? choice : outcomesFor(mod, cls).length === 1 && !mod.ask ? outcomesFor(mod, cls)[0].index : null;
            if (index === null) gates.yes_unanswered += 1;
            const effect = index === null ? null : raw?.outcomes[index]?.legal_effect;
            if (effect !== "same_class" && effect !== "different_class") gates.yes_beyond_source += 1;
          }
        }
      }
      for (const choice of choices) {
        const answer = answerMod(MODS_DATA, mod, cls, choice, MOD_DATES[2], true);
        const key = JSON.stringify(answer);
        if (rendered.has(key)) continue;
        rendered.add(key);
        for (const lang of ["en", "es"] as const) {
          for (const claim of claimsOf(renderToStaticMarkup(createElement(ModAnswerCard, { mod, answer, lang })))) {
            gates.claims += 1;
            if (!source.has(claim)) gates.claims_not_in_data += 1;
          }
        }
      }
    }
  }
  return gates;
}

export interface ModRideGates {
  states: number;
  rides: number;
  yes: number;
  /** YES where the engine on the bike after the mod, for that state, places, age and date, says anything but YES. */
  yes_engine_not_yes: number;
  /** YES with no outcome picked, "something else", or an outcome that depends on the result. */
  yes_unsettled: number;
  /** California rides whose mods-data answer, rules or penalties differ from answerMod for the same inputs, or turn a NO into YES. */
  ca_changed: number;
  /** 1 when answerMod's California answers differ from the fingerprint taken before the change. */
  ca_digest_changed: number;
}

const TODAY = "2026-10-21";
const RIDE_AGES = [10, 14, 16, 30];
/** The family's follow-up answers: no fast mode, 26 inch wheels, 60 lb, no foot pegs or pedal kit. */
const ANSWERED: BikeFacts = { ...emptyFacts(), motorOver20: false, assistOver28: false, wheelCount: 2, wheelFrontIn: 26, wheelRearIn: 26, weightLb: 60, hasFootPegs: false, needsPedalKit: false };
/** Typed rated watts: a 500 W motor, a 1000 W motor for the "now over 750 W" outcomes, and none typed. */
const RIDE_WATTS: (number | null)[] = [500, 1000, null];

/** The California-data part of an answer, which must match answerMod exactly. */
function caPart(a: ModAnswer): string {
  return JSON.stringify([a.reasons, a.effects, a.breaks, a.rules, a.sanDiego, a.notEbike, a.from2027, a.penalties, a.classAfter]);
}

function checkCa(answer: RideAnswer, ca: ModAnswer): boolean {
  if (answer.ca === null || caPart(answer) !== caPart(ca) || JSON.stringify(answer.ca) !== JSON.stringify(ca)) return false;
  if (answer.yes && !ca.yes) return false;
  if (!ca.yes) return answer.kind === ca.kind && !answer.yes;
  if (answer.engine?.line.kind === "yes") return answer.yes && answer.kind === ca.kind;
  return !answer.yes;
}

/**
 * Every state, four ages, every mod, class and choice, and three bikes, on Oct 21, 2026. California
 * runs with no place and with the City of San Diego.
 */
export function modRideGates(): ModRideGates {
  const gates: ModRideGates = { states: STATE_CODES.length, rides: 0, yes: 0, yes_engine_not_yes: 0, yes_unsettled: 0, ca_changed: 0, ca_digest_changed: 0 };
  const digest = caAnswersDigest(MODS_DATA);
  gates.ca_digest_changed = digest.n === CA_ANSWERS_BEFORE.n && digest.sha === CA_ANSWERS_BEFORE.sha ? 0 : 1;
  for (const state of STATE_CODES) {
    const placeSets: PlaceId[][] = state === MODS_DATA_STATE ? [[], ["city_of_san_diego"]] : [[]];
    for (const places of placeSets) {
      for (const riderAge of RIDE_AGES) {
        const ride = { state, places, otherPlaces: false, riderAge, rideDate: TODAY };
        for (const watts of RIDE_WATTS) {
          for (const mod of MODS_DATA.mods) {
            for (const cls of [1, 2, 3] as ClassNum[]) {
              if (!modApplies(mod, cls)) continue;
              const base = baseFacts(cls, watts, ANSWERED);
              const outcomes = outcomesFor(mod, cls);
              for (const choice of [null, "other", ...outcomes.map((o) => o.index)] as ModChoice[]) {
                const answer = answerRide(MODS_DATA, mod, cls, choice, base, ride);
                gates.rides += 1;
                if (state === MODS_DATA_STATE) {
                  const ca = answerMod(MODS_DATA, mod, cls, choice, TODAY, places.includes("city_of_san_diego"), riderAge);
                  if (!checkCa(answer, ca)) gates.ca_changed += 1;
                }
                if (!answer.yes) continue;
                gates.yes += 1;
                const index = typeof choice === "number" ? choice : outcomes.length === 1 && !mod.ask ? outcomes[0].index : null;
                const change = index === null ? "unsettled" : outcomeFacts(mod.id, index);
                if (change === "unsettled") {
                  gates.yes_unsettled += 1;
                  continue;
                }
                const facts = withMod(base, change);
                const line = bottomLine(evaluate({ state, riderAge, rideDate: TODAY, facts, places, otherPlaces: false }), TODAY);
                if (line.kind !== "yes") gates.yes_engine_not_yes += 1;
              }
            }
          }
        }
      }
    }
  }
  return gates;
}

export interface FinderGates {
  bikes: number;
  rides: number;
  yes: number;
  /** YES where the engine, on the maker's facts alone, says the ride is not allowed. */
  yes_engine_refuses: number;
  /** YES for a pedal-less e-moto, or a bike whose pages don't say it has pedals. */
  yes_without_pedals: number;
}

const FINDER_AGES = [3, 5, 8, 10, 12, 13, 14, 15, 16, 17, 18, 21, 30, 65, 100];
const CA_PLACE_SETS: PlaceId[][] = [[], ...PLACE_IDS.map((p) => [p]), ["city_of_san_diego", "sduhsd_campuses"]];

export function finderGates(): FinderGates {
  const gates: FinderGates = { bikes: CATALOG.length, rides: 0, yes: 0, yes_engine_refuses: 0, yes_without_pedals: 0 };
  for (const state of STATE_CODES) {
    for (const places of state === "CA" ? CA_PLACE_SETS : [[]]) {
      for (const age of FINDER_AGES) {
        for (const otherPlaces of [false, true]) {
          const ride = { state, places, age, otherPlaces, rideDate: TODAY };
          for (const bike of CATALOG) {
            gates.rides += 1;
            const line = finderLine(bike, ride);
            if (line.kind !== "yes") continue;
            gates.yes += 1;
            const plain = bottomLine(evaluate({ state, riderAge: age, rideDate: TODAY, facts: catalogFacts(bike), places, otherPlaces }), TODAY);
            if (plain.kind === "no_illegal") gates.yes_engine_refuses += 1;
            if (bike.pedals !== true || bike.vehicle_type !== "e-bike") gates.yes_without_pedals += 1;
          }
        }
      }
    }
  }
  return gates;
}

// ---------- The legal route check ----------

export interface RouteGates {
  pieces: number;
  pieces_yes: number;
  /** A piece counted toward a YES that the raw rule files block. */
  piece_yes_rules_block: number;
  routes: number;
  routes_yes: number;
  /** A route YES where the engine's own bottom line for that rider, bike and place is not YES. */
  route_yes_engine_not_yes: number;
}

type RawKindRule = { classes: number[]; status: string; where: string };
type RawLocal = { kinds: Record<string, RawKindRule[] | undefined>; notChecked: string[] };
type RawState = { kinds: Record<string, Record<string, string | boolean>> };

const ROUTE_KINDS = ["road", "bike_lane", "separated_bikeway", "bike_path", "sidewalk", "footway", "trail"] as const;

/** The strictest reading of the raw rule files, written out apart from lib/route/legal.ts. */
function rawRouteBlocks(state: RawState | undefined, local: RawLocal | undefined, checkedPlace: boolean, kind: string, cls: number, posted: boolean): boolean {
  if (posted) return true;
  const rule = state?.kinds?.[kind];
  if (!rule) return true;
  const status = rule[String(cls)];
  const localRules = (local?.kinds?.[kind] ?? []).filter((r) => r.classes.includes(cls));
  if (status === "unclear") return true;
  if (status === "banned") return !(rule.localMayAllow === true && localRules.some((r) => r.status === "allowed" && r.where === "everywhere"));
  if (!checkedPlace) return false;
  if (!local) return rule.localMayRestrict === true;
  if (localRules.some((r) => r.status !== "allowed")) return true;
  return local.notChecked.includes(kind) && rule.localMayRestrict === true;
}

/** A full set of facts for a class, so the engine can answer without follow-up questions. */
function routeFacts(cls: ClassNum): BikeFacts {
  return {
    ...emptyFacts(),
    hasPedals: true,
    classes: [cls],
    ratedWatts: 500,
    hasThrottle: cls === 2,
    throttleMph: cls === 2 ? 20 : null,
    assistMph: cls === 3 ? 28 : 20,
    topSpeedMph: cls === 3 ? 28 : 20,
    switchable: false,
    motorOver20: false,
    assistOver28: false,
    wheelCount: 2,
    wheelFrontIn: 26,
    wheelRearIn: 26,
    weightLb: 60,
    weightOver100: false,
    hasFootPegs: false,
    needsPedalKit: false,
  };
}

export function routeGates(): RouteGates {
  const states = readJson<{ states: Record<string, RawState> }>("data/rules/route/states.json").states;
  const local: Record<string, RawLocal> = {
    ...readJson<{ jurisdictions: Record<string, RawLocal> }>("data/rules/route/local_sd_a.json").jurisdictions,
    ...readJson<{ jurisdictions: Record<string, RawLocal> }>("data/rules/route/local_sd_b.json").jurisdictions,
  };
  const spots = [...CHECKED_CITIES.map((c) => ({ record: c.record as PlaceId, placeGeoid: c.geoid as string | null })), { record: "unincorporated_san_diego_county" as PlaceId, placeGeoid: null }];
  const g: RouteGates = { pieces: 0, pieces_yes: 0, piece_yes_rules_block: 0, routes: 0, routes_yes: 0, route_yes_engine_not_yes: 0 };

  for (const state of Object.keys(states)) {
    for (const kind of ROUTE_KINDS) {
      for (const cls of [1, 2, 3] as const) {
        for (const spot of state === "CA" ? [...spots, null] : [null]) {
          for (const posted of [false, true]) {
            const seg: RouteSegment = {
              from: 0,
              to: 1,
              meters: 100,
              kind,
              name: null,
              wayId: null,
              tags: posted ? { bicycle: "no" } : {},
              state,
              countyGeoid: spot ? "06073" : "00000",
              placeGeoid: spot ? spot.placeGeoid : "0000000",
              placeName: spot ? null : "Elsewhere",
            };
            const piece = checkPiece(seg, 0, [cls], ROUTE_RULES);
            const towardYes = piece.status === "allowed" || piece.status === "unchecked";
            g.pieces += 1;
            if (towardYes) g.pieces_yes += 1;
            if (towardYes && rawRouteBlocks(states[state], spot ? local[spot.record] : undefined, spot !== null, kind, cls, posted)) g.piece_yes_rules_block += 1;
          }
        }
      }
    }
  }

  const rideDate = "2026-10-23";
  for (const spot of spots) {
    for (let age = 8; age <= 20; age += 1) {
      for (const cls of [1, 2, 3] as const) {
        const facts = routeFacts(cls);
        const seg: RouteSegment = { from: 0, to: 1, meters: 500, kind: "road", name: null, wayId: null, tags: {}, state: "CA", countyGeoid: "06073", placeGeoid: spot.placeGeoid, placeName: null };
        const plan = {
          points: [
            { lat: 32.9, lon: -117.2 },
            { lat: 32.905, lon: -117.2 },
          ],
          meters: 500,
          seconds: 120,
          climbMeters: null,
          segments: [seg],
          crossed: [{ layer: "state" as const, geoid: "06", name: "California", state: "CA" }],
          atEnd: [],
          sources: { router: "gate", boundaries: "gate", tags: "gate", read: rideDate },
        };
        const rider: RouteRider = { riderAge: age, rideDate, facts, sduhsdCampus: false };
        const verdict = checkRoute(plan, rider, ROUTE_RULES);
        g.routes += 1;
        if (verdict.kind !== "yes") continue;
        g.routes_yes += 1;
        const engine = bottomLine(evaluate({ state: "CA", places: [spot.record], riderAge: age, rideDate, facts, otherPlaces: false }), rideDate);
        if (engine.kind !== "yes") g.route_yes_engine_not_yes += 1;
      }
    }
  }
  return g;
}
