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
  if (place === "city_of_san_diego" || place === "carlsbad") {
    const ban = ruleNamed(j, "under_12_ban");
    if (
      ban &&
      (cls === 1 || cls === 2) &&
      age < (ban.min_age ?? 12) &&
      ban.effective_date !== null &&
      date >= ban.effective_date &&
      date < UNDER_12_RULE_ENDS
    ) {
      return {
        status: "no",
        reason: line("local_under_12", { place, since: ban.effective_date, cls }, ban),
        requirements: [],
      };
    }
    return pass;
  }
  if (place === "unincorporated_san_diego_county") {
    const power = ruleNamed(j, "authority_exists_no_adoption_found");
    if (power && (cls === 1 || cls === 2) && age < 12 && date < UNDER_12_RULE_ENDS) {
      return { status: "cant_confirm", reason: line("local_under_12_unclear", { place, cls }, power), requirements: [] };
    }
    return pass;
  }
  if (place === "sduhsd_campuses") {
    const limit = ruleNamed(j, "class_1_and_2_only_on_campus");
    if (limit && date >= (limit.effective_date ?? "") && cls === 3) {
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

function placeNotes(place: PlaceId, j: RawJurisdiction, input: EngineInput, status: Status, classes: number[]): Line[] {
  const notes: Line[] = [];
  const age = input.riderAge;
  const watts = input.facts.ratedWatts;
  const hasClass3 = classes.includes(3);
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
        add("sd_warning_period", "under_12_ban", { from: ban.citations_from });
      }
      if (age === 12) notes.push(line("sd_age_12"));
      if (status === "not_ebike") add("sd_emoto", "emoto_not_street_legal");
      add("sd_passengers", "passengers_need_permanent_second_seat");
      break;
    }
    case "carlsbad":
      if (status === "not_ebike") add("carlsbad_emoto", "emoto_impound");
      add("carlsbad_parks", "park_ban");
      add("carlsbad_impound", "in_person_course_to_recover_impounded_bike");
      add("carlsbad_passengers", "passengers_only_on_passenger_bikes");
      if (hasClass3) notes.push(line("carlsbad_class3_paths"));
      if (watts === 750) notes.push(line("city_page_750"));
      break;
    case "encinitas":
      if (status === "yes") add("encinitas_no_age_limit", "no_local_age_limit_found");
      if (hasClass3) notes.push(line("encinitas_class3_paths"));
      if (watts === 750) notes.push(line("city_page_750"));
      break;
    case "solana_beach":
      if (status === "not_ebike") add("solana_emoto", "emoto_needs_motorcycle_license");
      add("solana_sidewalks", "sidewalk_ban_in_business_district");
      if (age === 18) notes.push(line("solana_helmet_18"));
      break;
    case "del_mar":
      add("del_mar_bans", "park_sidewalk_and_lagoon_trail_bans");
      add("del_mar_coast_to_crest", "coast_to_crest_class1_and_2_allowed");
      break;
    case "unincorporated_san_diego_county":
      if (age < 12) notes.push(line("county_no_ordinance"));
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
    lastChecked: SD._meta.last_checked,
    verified: j.verified,
  };
}
