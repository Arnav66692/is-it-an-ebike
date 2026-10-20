// The San Diego local layer. A local record never relaxes a state rule, so every local
// verdict starts from the state outcome for the same class and can only get stricter.

import sdJson from "@/data/rules/san_diego_local.json";
import type { RawJurisdiction, RawLocalRule, RawSanDiego } from "./raw";
import type { ClassOutcome, StateEvaluation } from "./state";
import type { EngineInput, Line, PlaceId, Source, SourceKind, Status, Verdict } from "./types";

const SD = sdJson as unknown as RawSanDiego;

export const PLACE_IDS: PlaceId[] = [
  "city_of_san_diego",
  "carlsbad",
  "encinitas",
  "solana_beach",
  "del_mar",
  "unincorporated_san_diego_county",
  "sduhsd_campuses",
];

const UNDER_12_RULE_ENDS =
  SD.statewide_baseline.find((r) => r.rule === "local_under_12_authority")?.ends ?? "2029-01-01";

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
  const under12 = (cls === 1 || cls === 2) && date < UNDER_12_RULE_ENDS;
  const ban = ruleNamed(j, "under_12_ban");
  if (ban && under12 && age < (ban.min_age ?? 12) && ban.effective_date !== null && date >= ban.effective_date) {
    return {
      status: "no",
      reason: line("local_under_12", { place, since: ban.effective_date, cls }, ban),
      requirements: [],
    };
  }
  const power = ruleNamed(j, "authority_exists_no_adoption_found");
  if (power && under12 && age < 12) {
    return { status: "cant_confirm", reason: line("local_under_12_unclear", { place, cls }, power), requirements: [] };
  }
  return pass;
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

function placeNotes(place: PlaceId, j: RawJurisdiction, input: EngineInput, status: Status, classes: number[]): Line[] {
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
      if (status === "no" && age < 12) add("sd_course_in_lieu", "course_in_lieu_of_fine");
      if (ban?.citations_from && input.rideDate < ban.citations_from && age < 12) {
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
      if (status === "no" && age < 12) add("carlsbad_disability", "disability_exemption");
      if (status === "not_ebike") add("carlsbad_emoto", "emoto_impound");
      if (mayBeClass1or2 && status !== "not_ebike") add("carlsbad_under_12_passengers", "under_12_passenger_ban");
      if (mayRide) {
        add("carlsbad_sidewalks", "sidewalk_ban");
        add("carlsbad_parks", "park_ban");
        add("carlsbad_trail_dismount", "trail_dismount");
        add("carlsbad_passengers", "passengers_only_on_passenger_bikes");
        if (age < 18) add("carlsbad_impound", "in_person_course_to_recover_impounded_bike");
        if (hasClass3) add("carlsbad_class3_paths", "park_and_trail_vehicle_limit");
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
      if (age < 12) add("county_no_ordinance", "no_local_age_limit_found", { date: checked });
      if (mayRide) {
        add("county_sidewalks", "sidewalk_ban_in_business_district");
        add("county_parks", "county_parks_designated_areas_only");
        add("county_dpr_sites", "dpr_designations");
        if (hasClass3) add("county_dpr_class3", "dpr_designations");
      }
      break;
    case "sduhsd_campuses":
      break;
  }
  return notes;
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
    // The state verdict came from a check that doesn't depend on class (pedals, never-legal).
    const fake: ClassOutcome = {
      cls: 3,
      status: state.status,
      reason: state.reason,
      requirements: state.requirements,
      cautions: state.cautions,
      questions: state.questions,
    };
    outcome = localOutcome(place, j, fake, age, date);
  } else {
    perClass = se.outcomes.map((o) => localOutcome(place, j, o, age, date));
    if (se.classesKnown) {
      outcome = perClass.reduce((a, b) => (SEVERITY[b.status] > SEVERITY[a.status] ? b : a));
      if (outcome.status === "yes" && perClass.length > 1) {
        outcome = { ...perClass[perClass.length - 1] };
      }
    } else if (perClass.every((o) => o.status === "no" || o.status === "not_ebike")) {
      outcome = perClass.every((o) => o.status === "not_ebike")
        ? perClass[0]
        : { cls: 3, status: "no", reason: line("no_any_class"), requirements: [], cautions: [], questions: [] };
    } else {
      outcome = { cls: 3, status: state.status === "need_info" ? "need_info" : "cant_confirm", reason: state.reason, requirements: [], cautions: [], questions: state.questions };
    }
  }

  const notes = placeNotes(place, j, input, outcome.status, state.classes);
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
    cautions: outcome.status === "yes" ? state.cautions : [],
    notes,
    questions: outcome.status === "need_info" ? state.questions : [],
    classes: state.classes,
    sources: sourcesOf(lines, state.sources),
    lastChecked: j.checked_through ?? SD._meta.last_checked,
    verified: j.verified,
    level: j.verification_level,
  };
}
