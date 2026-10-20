// Shared types for the rules engine. The engine never writes legal text.
// It returns codes and parameters, and lib/i18n turns them into sentences.

export type ClassNum = 1 | 2 | 3;
export type ClassKey = "class_1" | "class_2" | "class_3";
export type AppliesTo = "all_ebikes" | ClassKey;

/** true, false, or null when we don't know. */
export type Tri = boolean | null;

/** Follow-up questions the engine can ask when a state rule needs a fact a label can't show. */
export const QUESTION_IDS = ["wheels", "fast_mode", "weight", "pegs_kit"] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

export function isQuestionId(value: string): value is QuestionId {
  return (QUESTION_IDS as readonly string[]).includes(value);
}

/**
 * The caution the engine adds when the fast-mode answer is "not sure" in a state whose
 * table names no fast-mode rule. The card can still say yes, but the bottom line can't.
 */
export const CAUTION_FAST_MODE_UNVERIFIED = "caution_fast_mode_unverified";

/**
 * The caution the state card shows when the ride date is past the state record's re-check
 * horizon. It matches the bottom line's "stale" item, which names the same card.
 */
export const CAUTION_STATE_AFTER_CHECK = "caution_state_after_check";

/**
 * Requirement codes that limit which streets an e-bike may use, like New York's 30 mph roads. A
 * YES with one of these can't say it covers every public street.
 */
export const ROAD_LIMIT_CODES: readonly string[] = ["req_roads_max_speed"];

/**
 * The bike facts a product link, a label photo or the whole-bike pedal photo check can fill in,
 * in the order the facts card shows them. "wheelSize" is the front and rear sizes together. A
 * value read this way can be wrong, so the bottom line can't say YES until the family checks it.
 */
export const READ_FIELDS = [
  "hasPedals",
  "classes",
  "ratedWatts",
  "peakWatts",
  "wattsUpTo",
  "hasThrottle",
  "throttleMph",
  "assistMph",
  "topSpeedMph",
  "wheelSize",
  "weightLb",
  "wheelCount",
  "hasFootPegs",
  "switchable",
] as const;
export type ReadField = (typeof READ_FIELDS)[number];

/** Everything the engine knows about one bike. Null means unknown. */
export interface BikeFacts {
  hasPedals: Tri;
  /** Class or classes stated on the label or listing. Empty when none is stated. */
  classes: ClassNum[];
  /** Rated, nominal or continuous motor watts. An unqualified number on a label counts as rated. */
  ratedWatts: number | null;
  peakWatts: number | null;
  /** A watt figure from a listing that doesn't say rated or peak. Rated watts are at most this. */
  wattsUpTo: number | null;
  hasThrottle: Tri;
  /** Top throttle speed stated for some mode. */
  throttleMph: number | null;
  /** Top assisted speed stated on the label or listing. */
  assistMph: number | null;
  /** A "top speed" whose mode the text doesn't say. */
  topSpeedMph: number | null;
  /** Follow-up answer. Can the motor alone push it past 20 mph in any mode? */
  motorOver20: Tri;
  /** Follow-up answer. Can pedal assist go past 28 mph in any mode? */
  assistOver28: Tri;
  /** It has an unlock, off-road or race mode, as the text says or the family ticks. */
  switchable: Tri;
  hasFootPegs: Tri;
  needsPedalKit: Tri;
  wheelCount: 2 | 3 | null;
  wheelFrontIn: number | null;
  wheelRearIn: number | null;
  weightLb: number | null;
  weightOver100: Tri;
  /** Follow-up questions the user answered with "not sure". */
  unsure: QuestionId[];
}

export type Status = "yes" | "no" | "not_ebike" | "cant_confirm" | "need_info";

export type SourceKind =
  | "statute"
  | "bill"
  | "official_page"
  | "press_release"
  | "news"
  | "ordinance_text"
  | "administrative_regulation"
  | "staff_report"
  | "packet_draft"
  | "rules_table";

/**
 * How completely a San Diego record was read in enacted text.
 * primary_verified: every rule that can change a verdict was read in ordinance, code, resolution, board or statute text.
 * primary_partial: some rules were, others rest only on an official web page.
 * primary_not_found: the enacted text was not found.
 */
export type VerificationLevel = "primary_verified" | "primary_partial" | "primary_not_found";

export interface Source {
  citation: string | null;
  url: string | null;
  quote?: string | null;
  effective?: string | null;
  kind?: SourceKind;
}

/** One sentence on a verdict card, as a code plus parameters. */
export interface Line {
  code: string;
  params?: Record<string, string | number>;
  source?: Source;
  /** English text from the rules table, shown under "details". */
  detail?: string | null;
}

export type PlaceId =
  | "city_of_san_diego"
  | "carlsbad"
  | "encinitas"
  | "solana_beach"
  | "del_mar"
  | "chula_vista"
  | "coronado"
  | "el_cajon"
  | "escondido"
  | "imperial_beach"
  | "la_mesa"
  | "lemon_grove"
  | "national_city"
  | "oceanside"
  | "poway"
  | "san_marcos"
  | "santee"
  | "vista"
  | "unincorporated_san_diego_county"
  | "sduhsd_campuses";

export interface Verdict {
  scope: "state" | "local";
  /** State code like "CA", or a San Diego place id. */
  id: string;
  status: Status;
  reason: Line;
  requirements: Line[];
  cautions: Line[];
  notes: Line[];
  questions: QuestionId[];
  /** The classes the verdict covered. Empty when the class is unknown. */
  classes: ClassNum[];
  sources: Source[];
  lastChecked: string;
  /** How the rule was checked: statute_verified, secondary_only or unclear. */
  verified: string;
  /** Local cards only. How completely the place's record was read in enacted text. */
  level?: VerificationLevel;
}

export interface EngineInput {
  state: string;
  places: PlaceId[];
  riderAge: number;
  /** YYYY-MM-DD in the rider's own time zone. */
  rideDate: string;
  facts: BikeFacts;
}

export interface EngineResult {
  state: Verdict;
  local: Verdict[];
  /** Show the "local rules may be stricter" line for places we don't cover. */
  localNotice: boolean;
}

export function emptyFacts(): BikeFacts {
  return {
    hasPedals: null,
    classes: [],
    ratedWatts: null,
    peakWatts: null,
    wattsUpTo: null,
    hasThrottle: null,
    throttleMph: null,
    assistMph: null,
    topSpeedMph: null,
    motorOver20: null,
    assistOver28: null,
    switchable: null,
    hasFootPegs: null,
    needsPedalKit: null,
    wheelCount: null,
    wheelFrontIn: null,
    wheelRearIn: null,
    weightLb: null,
    weightOver100: null,
    unsure: [],
  };
}

export const CLASS_KEYS: Record<ClassNum, ClassKey> = {
  1: "class_1",
  2: "class_2",
  3: "class_3",
};
