// Shared types for the rules engine. The engine never writes legal text.
// It returns codes and parameters, and lib/i18n turns them into sentences.

export type ClassNum = 1 | 2 | 3;
export type ClassKey = "class_1" | "class_2" | "class_3";
export type AppliesTo = "all_ebikes" | ClassKey;

/** true, false, or null when we don't know. */
export type Tri = boolean | null;

/** Follow-up questions the engine can ask when a state rule needs a fact a label can't show. */
export type QuestionId = "wheels" | "fast_mode" | "weight" | "pegs_kit";

/** Everything the engine knows about one bike. Null means unknown. */
export interface BikeFacts {
  hasPedals: Tri;
  /** Class or classes stated on the label or listing. Empty when none is stated. */
  classes: ClassNum[];
  /** Rated, nominal or continuous motor watts. An unqualified number on a label counts as rated. */
  ratedWatts: number | null;
  peakWatts: number | null;
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
  /** The text mentions an unlock, off-road or race mode. */
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
  | "rules_table";

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
