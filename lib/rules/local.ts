// The San Diego local layer. A local record never relaxes a state rule, so every local
// verdict starts from the state outcome for the same class and can only get stricter.

import sdJson from "@/data/rules/san_diego_local.json";
import { addDays } from "./dates";
import type { RawJurisdiction, RawLocalRule, RawSanDiego } from "./raw";
import { sharedOutcome, type ClassOutcome, type StateEvaluation } from "./state";
import { CAUTION_STATE_AFTER_CHECK, type EngineInput, type Line, type PlaceId, type Source, type SourceKind, type Status, type Verdict } from "./types";

const SD = sdJson as unknown as RawSanDiego;

export const PLACE_IDS: PlaceId[] = [
  "city_of_san_diego",
  "carlsbad",
  "encinitas",
  "solana_beach",
  "del_mar",
  "chula_vista",
  "coronado",
  "el_cajon",
  "escondido",
  "imperial_beach",
  "la_mesa",
  "lemon_grove",
  "national_city",
  "oceanside",
  "poway",
  "san_marcos",
  "santee",
  "vista",
  "unincorporated_san_diego_county",
  "sduhsd_campuses",
];

/** VC 21214.7, the state power behind every local under-12 ban, is repealed on this date. */
const UNDER_12_RULE_ENDS =
  SD.statewide_baseline.find((r) => r.rule === "local_under_12_authority")?.ends ?? "2029-01-01";

/** The age VC 21214.7(b) lets a city or the county set for Class 1 and 2. */
const UNDER_12_AGE = 12;

/**
 * VC 21214.7(b) lets a city or the county ban riders under 12 "by ordinance or resolution", and a
 * resolution can take effect the day it is adopted. What guarantees lead time is VC 21214.7(e): a
 * public information campaign for at least 30 calendar days before either is enacted. Each no-ban
 * record says its city or County news was read for such a campaign through checked_through, so no
 * ban can be in force for 30 days after that. Past that a new under-12 ban could be in force, or
 * the state could extend VC 21214.7 and keep a ban that was due to end, and we would not know.
 */
const ORDINANCE_DELAY_DAYS = 30;

/** The last ride date this place's under-12 check can vouch for. */
export function under12CheckedThrough(j: RawJurisdiction): string {
  return addDays(j.checked_through, ORDINANCE_DELAY_DAYS);
}

const SEVERITY: Record<Status, number> = { not_ebike: 4, no: 3, cant_confirm: 2, need_info: 1, yes: 0 };

export function jurisdiction(place: PlaceId): RawJurisdiction {
  const found = SD.jurisdictions.find((j) => j.id === place);
  if (!found) throw new Error(`Unknown San Diego place "${place}"`);
  return found;
}

function allRules(j: RawJurisdiction): RawLocalRule[] {
  return [
    ...j.local_age_limits,
    ...j.campus_class_limits,
    ...j.tag_and_course_requirements,
    ...j.helmet_rules,
    ...j.emoto_enforcement,
    ...j.other_local_rules,
  ];
}

function ruleNamed(j: RawJurisdiction, name: string): RawLocalRule | undefined {
  return allRules(j).find((r) => r.rule === name);
}

function kindOf(sourceType: string): SourceKind {
  switch (sourceType) {
    case "statute":
      return "statute";
    case "press_release":
      return "press_release";
    case "news":
      return "news";
    case "ordinance_text":
      return "ordinance_text";
    case "administrative_regulation":
      return "administrative_regulation";
    case "staff_report":
      return "staff_report";
    case "packet_draft":
      return "packet_draft";
    default:
      return "official_page";
  }
}

function sourceOf(rule: RawLocalRule): Source {
  return {
    citation: rule.citation,
    url: rule.source_url,
    quote: rule.quote,
    effective: rule.effective_date,
    kind: kindOf(rule.source_type),
  };
}

function line(code: string, params?: Line["params"], rule?: RawLocalRule): Line {
  return { code, params, source: rule ? sourceOf(rule) : undefined, detail: null };
}

/**
 * Rules every rider at this place must follow on a yes, whatever their age. Today that is the
 * City of San Diego helmet rule, SDMC 84.21(a) and (c), which can be read to cover every operator.
 */
function placeRequirements(j: RawJurisdiction, date: string): Line[] {
  const helmet = ruleNamed(j, "helmet_all_operators");
  if (helmet && (helmet.effective_date === null || date >= helmet.effective_date)) {
    return [line("sd_helmet_all_riders", undefined, helmet)];
  }
  return [];
}

interface LocalRuleResult {
  status: "pass" | "no" | "cant_confirm";
  reason: Line | null;
  requirements: Line[];
}

function localRule(place: PlaceId, j: RawJurisdiction, cls: number, age: number, date: string): LocalRuleResult {
  const pass: LocalRuleResult = { status: "pass", reason: null, requirements: [] };
  if (place === "sduhsd_campuses") {
    const limit = ruleNamed(j, "class_1_and_2_only_on_campus");
    if (limit && (limit.effective_date === null || date >= limit.effective_date) && cls === 3) {
      return { status: "no", reason: line("campus_class3", { cls }, limit), requirements: [] };
    }
    const requirements: Line[] = [];
    const tag = ruleNamed(j, "district_tag_required");
    const course = ruleNamed(j, "safety_course_required");
    const helmet = ruleNamed(j, "helmet_all_ages_for_campus_riders");
    const walk = ruleNamed(j, "walk_bikes_on_campus_and_factory_passenger_seat");
    if (course) requirements.push(line("req_campus_course", undefined, course));
    if (tag) requirements.push(line("req_campus_tag", undefined, tag));
    if (helmet) requirements.push(line("req_campus_helmet", undefined, helmet));
    if (walk) requirements.push(line("req_campus_walk", undefined, walk));
    return { status: "pass", reason: null, requirements };
  }
  // VC 21214.7(b) lets a city or the county ban riders under 12 from Class 1 and 2.
  // The data says whether a place adopted the ban, or has the power with adoption unconfirmed.
  const classOneOrTwo = cls === 1 || cls === 2;
  const ban = ruleNamed(j, "under_12_ban");
  if (ban && classOneOrTwo && age < (ban.min_age ?? UNDER_12_AGE) && ban.effective_date !== null && date >= ban.effective_date) {
    // A ban with its own end date (the City of San Diego) is repealed on that date. A ban
    // whose text gives no end date (Carlsbad) stays on the books after the state power lapses,
    // and whether it still applies then is unsettled, so it can't turn into a yes.
    const repealed = typeof ban.ends === "string" && date >= ban.ends;
    if (!repealed && date >= UNDER_12_RULE_ENDS) {
      return {
        status: "cant_confirm",
        reason: line("local_under_12_no_end", { powerEnds: UNDER_12_RULE_ENDS }, ban),
        requirements: [],
      };
    }
    if (!repealed) {
      return {
        status: "no",
        reason: line("local_under_12", { place, since: ban.effective_date, cls }, ban),
        requirements: [],
      };
    }
  }
  // A ban whose start is uncertain may already be in force before the date its text gives, so
  // between the earliest possible start and that date an under-12 answer can't be a yes.
  const earliest = ban?.start_unclear_from;
  if (ban && earliest && ban.effective_date && classOneOrTwo && age < (ban.min_age ?? UNDER_12_AGE) && date >= earliest && date < ban.effective_date) {
    return {
      status: "cant_confirm",
      reason: line("local_under_12_start_unclear", { from: earliest, since: ban.effective_date }, ban),
      requirements: [],
    };
  }
  // These sentences don't name the place or the class, so the lines carry neither. Places with the
  // same check date then share one item under What's missing instead of repeating it word for word.
  // No ban in force on the ride date. That is only known up to the place's check, plus the time
  // a new ordinance needs to take effect. Past that, an under-12 answer can't be a yes.
  const checkedThrough = under12CheckedThrough(j);
  if (classOneOrTwo && age < UNDER_12_AGE && date > checkedThrough) {
    return {
      status: "cant_confirm",
      reason: line("local_under_12_after_check", { checked: j.checked_through, through: checkedThrough }, ban ?? ruleNamed(j, "no_local_age_limit_found")),
      requirements: [],
    };
  }
  const power = ruleNamed(j, "authority_exists_no_adoption_found");
  if (power && classOneOrTwo && date < UNDER_12_RULE_ENDS && age < UNDER_12_AGE) {
    return { status: "cant_confirm", reason: line("local_under_12_unclear", undefined, power), requirements: [] };
  }
  return { ...pass, requirements: placeRequirements(j, date) };
}

function localOutcome(place: PlaceId, j: RawJurisdiction, o: ClassOutcome, age: number, date: string): ClassOutcome {
  const campus = place === "sduhsd_campuses";
  if (o.status === "not_ebike") {
    if (campus) {
      const limit = ruleNamed(j, "emotos_not_permitted_on_campus");
      return { ...o, status: "no", reason: line("campus_no_emoto", undefined, limit) };
    }
    return o;
  }
  const rule = localRule(place, j, o.cls, age, date);
  if (rule.status === "no" && rule.reason) return { ...o, status: "no", reason: rule.reason, requirements: [] };
  if (o.status === "no") return o;
  if (rule.status === "cant_confirm" && rule.reason) {
    return { ...o, status: "cant_confirm", reason: rule.reason, requirements: [] };
  }
  if (o.status !== "yes") return o;
  return {
    ...o,
    reason: line(campus ? "campus_allowed" : "local_allowed", { place, cls: o.cls, age }),
    requirements: [...o.requirements, ...rule.requirements],
  };
}

/** The source for a warnings-only period, which can differ from the rule's own source. */
function warningSource(rule: RawLocalRule): Source {
  return {
    citation: rule.citations_from_citation ?? rule.citation,
    url: rule.citations_from_source_url ?? rule.source_url,
    quote: null,
    effective: null,
    kind: kindOf(rule.citations_from_source_type ?? rule.source_type),
  };
}

/**
 * True when the card says no only because of the local under-12 ban, in every class it could be.
 * Local relief, like a fine waiver or an exemption, only matters then. When state law also says
 * no, for example a Class 3 under 16, that relief changes nothing.
 */
function onlyLocalBan(outcome: ClassOutcome, perClass: ClassOutcome[]): boolean {
  if (outcome.status !== "no") return false;
  const outcomes = perClass.length > 0 ? perClass : [outcome];
  const illegal = outcomes.filter((o) => o.status === "no" || o.status === "not_ebike");
  return illegal.length > 0 && illegal.every((o) => o.reason.code === "local_under_12");
}

function placeNotes(
  place: PlaceId,
  j: RawJurisdiction,
  input: EngineInput,
  status: Status,
  classes: number[],
  localBanOnly: boolean,
): Line[] {
  const notes: Line[] = [];
  const age = input.riderAge;
  const watts = input.facts.ratedWatts;
  const hasClass3 = classes.includes(3);
  /** Class 1 or 2, or a class we don't know yet. */
  const mayBeClass1or2 = classes.length === 0 || classes.some((c) => c === 1 || c === 2);
  /** Where-to-ride notes only matter when the rider may ride at all. */
  const mayRide = status !== "no" && status !== "not_ebike";
  const checked = j.checked_through;
  const add = (code: string, ruleName?: string, params?: Line["params"]) => {
    const rule = ruleName ? ruleNamed(j, ruleName) : undefined;
    if (ruleName && !rule) return;
    notes.push(line(code, params, rule));
  };

  switch (place) {
    case "city_of_san_diego": {
      const ban = ruleNamed(j, "under_12_ban");
      if (localBanOnly) add("sd_course_in_lieu", "course_in_lieu_of_fine");
      if (localBanOnly && ban?.citations_from && input.rideDate < ban.citations_from) {
        notes.push({ code: "sd_warning_period", params: { from: ban.citations_from }, source: warningSource(ban), detail: null });
      }
      if (age === 12) add("sd_age_12", "under_12_ban");
      if (status === "not_ebike") add("sd_emoto", "emoto_not_street_legal");
      if (mayRide) {
        add("sd_sidewalks", "no_sidewalk_riding_by_businesses");
        add("sd_parks", "park_bicycle_limits");
        add("sd_boardwalks", "boardwalk_motorized_device_ban");
        add("sd_passengers", "passengers_only_on_multi_rider_ebikes");
      }
      break;
    }
    case "carlsbad":
      if (localBanOnly) add("carlsbad_disability", "disability_exemption");
      if (status === "not_ebike") add("carlsbad_emoto", "emoto_impound");
      if (mayBeClass1or2 && status !== "not_ebike") add("carlsbad_under_12_passengers", "under_12_passenger_ban");
      if (mayRide) {
        add("carlsbad_sidewalks", "sidewalk_ban");
        add("carlsbad_parks", "park_ban");
        add("carlsbad_trail_dismount", "trail_dismount");
        add("carlsbad_passengers", "passengers_only_on_passenger_bikes");
        if (age < 18) add("carlsbad_impound", "in_person_course_to_recover_impounded_bike");
        if (hasClass3) {
          add("carlsbad_class3_paths", "park_and_trail_vehicle_limit");
          add("carlsbad_class3_trails", "class3_trails_city_flier");
        }
      }
      if (watts === 750) notes.push(line("city_page_750"));
      break;
    case "encinitas":
      if (status === "yes") add("encinitas_no_age_limit", "no_local_age_limit_found", { date: checked });
      if (status === "not_ebike") add("encinitas_emoto", "emoto_trail_and_park_ban");
      if (mayRide) {
        add("encinitas_sidewalks", "sidewalk_ban_in_business_district");
        add("encinitas_parks_unclear", "park_beach_trail_vehicle_ban_unclear");
        add("encinitas_passengers", "passengers_only_if_designed_for_passengers");
        if (hasClass3) notes.push(line("encinitas_class3_paths"));
      }
      if (watts === 750) notes.push(line("city_page_750"));
      break;
    case "solana_beach":
      if (status === "not_ebike") add("solana_emoto", "state_emoto_removal");
      add("solana_parks_motor", "motor_vehicles_banned_in_parks_and_beaches");
      if (mayRide) {
        add("solana_sidewalks", "sidewalk_ban_in_business_district");
        add("solana_passengers", "passengers_only_where_designed");
        add("solana_course", "course_in_lieu_of_penalty");
      }
      if (age === 18) notes.push(line("solana_helmet_18"));
      break;
    case "del_mar":
      if (mayRide) {
        add("del_mar_bans", "park_sidewalk_and_lagoon_trail_bans");
        add("del_mar_beaches", "self_propelled_vehicles_beach_park_ban");
        add("del_mar_coast_to_crest", "coast_to_crest_class1_and_2_allowed");
      }
      break;
    case "unincorporated_san_diego_county":
      // The note says state law lets the County adopt a ban, which is only true before VC 21214.7 is repealed.
      if (age < UNDER_12_AGE && input.rideDate < UNDER_12_RULE_ENDS) add("county_no_ordinance", "no_local_age_limit_found", { date: checked });
      if (mayRide) {
        add("county_sidewalks", "sidewalk_ban_in_business_district");
        add("county_parks", "county_parks_designated_areas_only");
        add("county_parks_vehicle_rule", "county_parks_vehicle_license_and_registration");
        add("county_dpr_sites", "dpr_designations");
        if (hasClass3) add("county_dpr_class3", "dpr_designations");
      }
      break;
    case "sduhsd_campuses":
      break;
    default:
      notes.push(...cityNotes(place, j, input, status, classes, localBanOnly));
  }
  return notes;
}

/**
 * When a city note shows. "ride": the rider may ride at all. "class3": a Class 3 rider who may ride.
 * "class12": the bike may be Class 1 or 2 and is an e-bike. "ride12": the same, and the rider may ride.
 * "under18": a rider under 18 who may ride.
 * "ban_only": the answer is no only because of the city's under-12 ban.
 */
type CityNoteWhen = "ride" | "ride12" | "always" | "not_ebike" | "class3" | "class12" | "under18" | "ban_only";

/**
 * One city note: the sentence code and the record rule it rests on. A rule not yet in force on the
 * ride date shows as "Starting <date>:" and the sentence. A note shows only from its "from" day, if
 * any, and stops showing on its "until" day.
 */
interface CityNote {
  code: string;
  rule: string;
  when: CityNoteWhen;
  from?: string;
  until?: string;
}

/**
 * Notes for the cities added on Oct 20, 2026. Each note names the record rule behind it, so a note
 * never shows without its source. The age, warning and e-moto lines all cities share come first.
 */
const CITY_NOTES: Partial<Record<PlaceId, CityNote[]>> = {
  national_city: [
    { code: "nc_sidewalks", rule: "sidewalk_ban", when: "ride" },
    { code: "nc_parks", rule: "park_motorized_ban", when: "ride" },
    { code: "nc_offroad", rule: "offroad_seizure", when: "not_ebike" },
  ],
  lemon_grove: [
    { code: "lg_pending", rule: "no_local_age_limit_found", when: "ride" },
    { code: "lg_sidewalks", rule: "business_sidewalk_ban", when: "ride" },
    { code: "lg_parks", rule: "park_motor_vehicle_ban", when: "ride" },
  ],
  imperial_beach: [
    { code: "ib_pier", rule: "pier_ban", when: "ride" },
    { code: "ib_beach", rule: "beach_vehicle_ban", when: "ride" },
    { code: "ib_parks", rule: "park_bicycle_rules", when: "ride" },
    { code: "ib_sidewalks", rule: "business_sidewalk_ban", when: "ride" },
  ],
  vista: [
    { code: "vista_sidewalks", rule: "sidewalk_ban", when: "ride" },
    { code: "vista_dismount", rule: "dismount_at_crosswalks", when: "ride" },
    { code: "vista_passengers", rule: "passengers_manufacturer_seat", when: "ride" },
    { code: "vista_parks", rule: "park_path_limits", when: "ride" },
  ],
  oceanside: [
    { code: "oc_pier", rule: "pier_and_plaza_ban", when: "ride" },
    { code: "oc_sidewalks", rule: "sidewalk_rules", when: "ride" },
    { code: "oc_beach", rule: "beach_motorized_ban", when: "ride" },
    { code: "oc_seizure", rule: "seizure", when: "ride" },
  ],
  coronado: [
    { code: "cor_under_12_passengers", rule: "under_12_passenger_ban", when: "class12" },
    { code: "cor_sidewalks", rule: "sidewalk_and_boardwalk_ban", when: "ride" },
    { code: "cor_beaches_parks", rule: "beach_park_vehicle_ban", when: "ride" },
  ],
  santee: [
    { code: "santee_under_12_passengers", rule: "under_12_passenger_ban", when: "class12" },
    { code: "santee_sidewalks", rule: "posted_sidewalk_ban", when: "ride" },
    { code: "santee_parks", rule: "park_vehicle_rule", when: "ride" },
  ],
  el_cajon: [
    { code: "ec_parks", rule: "park_and_facility_ebike_ban", when: "ride" },
    { code: "ec_sidewalks", rule: "sidewalk_vehicle_ban", when: "ride" },
  ],
  poway: [
    { code: "poway_under_12_passengers", rule: "under_12_passenger_ban", when: "class12" },
    { code: "poway_no_passengers_under_18", rule: "passengers_under_18_operator", when: "under18" },
    { code: "poway_speed", rule: "speed_limits", when: "ride" },
    { code: "poway_where", rule: "where_to_ride", when: "ride" },
    { code: "poway_impound", rule: "impound", when: "ride" },
    { code: "poway_trails_page", rule: "trails_page", when: "ride" },
  ],
  la_mesa: [
    { code: "lm_emoto", rule: "emoto_removal", when: "not_ebike" },
    { code: "lm_sidewalks", rule: "sidewalk_vehicle_ban", when: "ride" },
    { code: "lm_parks", rule: "park_motorized_vehicle_ban", when: "ride" },
  ],
  chula_vista: [
    { code: "cv_under_12_passengers", rule: "under_12_passenger_ban", when: "class12" },
    { code: "cv_no_passengers_under_18", rule: "passengers_under_18_operator", when: "under18" },
    { code: "cv_sidewalks", rule: "sidewalk_rules", when: "ride" },
    { code: "cv_parks", rule: "park_path_limits", when: "ride" },
    { code: "cv_impound", rule: "impound", when: "ride" },
  ],
  escondido: [
    { code: "esc_under_12_passengers", rule: "under_12_passenger_ban", when: "class12" },
    { code: "esc_fines_start", rule: "under_12_warning_period", when: "ban_only", until: "2027-01-15" },
    { code: "esc_sidewalks_soon", rule: "sidewalk_ban", when: "ride", until: "2026-11-15" },
    { code: "esc_sidewalks", rule: "sidewalk_ban", when: "ride", from: "2026-11-15" },
    { code: "esc_parks", rule: "recreational_area_vehicle_limit", when: "ride" },
    { code: "esc_seizure", rule: "seizure", when: "ride" },
  ],
  san_marcos: [
    { code: "sm_sidewalks", rule: "sidewalk_rules", when: "ride" },
    { code: "sm_class3_parks", rule: "class3_park_and_trail_ban", when: "class3" },
    { code: "sm_parks", rule: "park_and_trail_limits", when: "ride12" },
    { code: "sm_trail_list", rule: "director_trail_list", when: "ride12" },
  ],
};

function cityNotes(
  place: PlaceId,
  j: RawJurisdiction,
  input: EngineInput,
  status: Status,
  classes: number[],
  localBanOnly: boolean,
): Line[] {
  const notes: Line[] = [];
  const age = input.riderAge;
  const mayBeClass1or2 = classes.length === 0 || classes.some((c) => c === 1 || c === 2);
  const mayRide = status !== "no" && status !== "not_ebike";
  const ban = ruleNamed(j, "under_12_ban");
  const noBan = ruleNamed(j, "no_local_age_limit_found");
  // The note says state law lets the city adopt a ban, which is only true before VC 21214.7 is repealed.
  if (noBan && age < UNDER_12_AGE && mayBeClass1or2 && status !== "not_ebike" && input.rideDate < UNDER_12_RULE_ENDS) {
    notes.push(line("city_no_age_limit", { place, date: j.checked_through }, noBan));
  }
  if (ban && localBanOnly) {
    const course = ruleNamed(j, "course_in_lieu_of_fine");
    if (course) notes.push(line("city_course_in_lieu", undefined, course));
    if (ban.citations_from && input.rideDate < ban.citations_from) {
      notes.push({ code: "city_warning_period", params: { from: ban.citations_from }, source: warningSource(ban), detail: null });
    }
  }
  if (ban && age === UNDER_12_AGE && (ban.min_age ?? UNDER_12_AGE) === UNDER_12_AGE && mayBeClass1or2 && status !== "not_ebike") {
    notes.push(line("city_age_12", undefined, ban));
  }
  const stateEmoto = ruleNamed(j, "state_emoto_removal");
  if (status === "not_ebike" && stateEmoto) notes.push(line("city_emoto_state_law", { place }, stateEmoto));
  for (const note of CITY_NOTES[place] ?? []) {
    const rule = ruleNamed(j, note.rule);
    if (!rule) continue;
    const shows =
      note.when === "always" ||
      (note.when === "ride" && mayRide) ||
      (note.when === "not_ebike" && status === "not_ebike") ||
      (note.when === "class3" && mayRide && classes.includes(3)) ||
      (note.when === "class12" && mayBeClass1or2 && status !== "not_ebike") ||
      (note.when === "ride12" && mayBeClass1or2 && mayRide) ||
      (note.when === "under18" && mayRide && age < 18) ||
      (note.when === "ban_only" && localBanOnly);
    if (!shows || (note.from && input.rideDate < note.from) || (note.until && input.rideDate >= note.until)) continue;
    // A rule whose start is uncertain shows as in force from the earliest day it may apply.
    const starts = rule.start_unclear_from ?? rule.effective_date;
    if (starts && input.rideDate < starts) notes.push(line("city_starting", { date: starts, note: note.code }, rule));
    else notes.push(line(note.code, undefined, rule));
  }
  return notes;
}

function dedupeLines(lines: Line[]): Line[] {
  const seen = new Set<string>();
  return lines.filter((l) => {
    const key = `${l.code}|${JSON.stringify(l.params ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourcesOf(lines: Line[], extra: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of [...lines.map((l) => l.source).filter((s): s is Source => Boolean(s)), ...extra]) {
    if (!s.citation && !s.url) continue;
    const key = `${s.citation ?? ""}|${s.url ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function evaluateLocal(place: PlaceId, se: StateEvaluation, input: EngineInput): Verdict {
  const j = jurisdiction(place);
  const age = input.riderAge;
  const date = input.rideDate;
  const state = se.verdict;

  let outcome: ClassOutcome;
  let perClass: ClassOutcome[] = [];
  if (se.outcomes.length === 0) {
    // The state verdict came from a check that doesn't depend on class: no pedals, pedals
    // unknown, facts that disagree, or a state that never confirms. The class is unknown, so
    // no class rule may run here. A campus still bars a machine that is not an e-bike, and
    // anything else carries the state answer through unchanged.
    const stateOutcome: ClassOutcome = {
      cls: 3,
      status: state.status,
      reason: state.reason,
      requirements: state.requirements,
      cautions: state.cautions,
      questions: state.questions,
    };
    outcome = state.status === "not_ebike" ? localOutcome(place, j, stateOutcome, age, date) : stateOutcome;
  } else {
    perClass = se.outcomes.map((o) => localOutcome(place, j, o, age, date));
    if (se.classesKnown) {
      outcome = perClass.reduce((a, b) => (SEVERITY[b.status] > SEVERITY[a.status] ? b : a));
      if (outcome.status === "yes" && perClass.length > 1) {
        // The bike can run as each class, so the line names them all and the steps for each are kept.
        const top = perClass[perClass.length - 1];
        outcome = {
          ...top,
          reason: { ...top.reason, params: { ...top.reason.params, multi: perClass.map((o) => o.cls).join("/") } },
          requirements: dedupeLines(perClass.flatMap((o) => o.requirements)),
        };
      }
    } else if (perClass.every((o) => o.status === "no" || o.status === "not_ebike")) {
      // Every class barred for the same reason, like the campus e-moto rule, names that reason.
      outcome = perClass.every((o) => o.status === "not_ebike")
        ? perClass[0]
        : (sharedOutcome(perClass) ?? { cls: 3, status: "no", reason: line("no_any_class"), requirements: [], cautions: [], questions: [] });
    } else {
      outcome = { cls: 3, status: state.status === "need_info" ? "need_info" : "cant_confirm", reason: state.reason, requirements: [], cautions: [], questions: state.questions };
    }
  }

  const notes = placeNotes(place, j, input, outcome.status, state.classes, onlyLocalBan(outcome, perClass));
  if (outcome.status === "no" && outcome.reason.code === "no_any_class") {
    notes.unshift(...perClass.map((o) => ({ ...o.reason, params: { ...o.reason.params, cls: o.cls } })));
  }
  const lines = [outcome.reason, ...outcome.requirements, ...notes];
  return {
    scope: "local",
    id: place,
    status: outcome.status,
    reason: outcome.reason,
    requirements: outcome.requirements,
    // The state horizon line belongs to the state card, which the bottom line names for it.
    cautions: outcome.status === "yes" ? state.cautions.filter((c) => c.code !== CAUTION_STATE_AFTER_CHECK) : [],
    notes,
    questions: outcome.status === "need_info" ? state.questions : [],
    classes: state.classes,
    sources: sourcesOf(lines, state.sources),
    lastChecked: j.checked_through ?? SD._meta.last_checked,
    verified: j.verified,
    level: j.verification_level,
  };
}
