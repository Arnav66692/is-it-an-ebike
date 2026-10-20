// Shapes of the verified rules files in data/rules/ and the hand-built data/overlay.json.
// Only the fields the engine reads are typed here.

import type { AppliesTo, ClassKey, VerificationLevel } from "./types";

export interface RawRef {
  citation: string | null;
  source_url: string | null;
  quote: string | null;
  effective_date: string | null;
}

export interface RawDefinition extends RawRef {
  requires_pedals: boolean | null;
  max_motor_watts: number | null;
  motor_watts_comparison: "less_than" | "at_most" | "no_watt_cap" | "other";
  max_motor_hp: number | null;
  class1_assist_max_mph: number | null;
  class2_throttle_max_mph: number | null;
  class3_assist_max_mph: number | null;
  notes: string | null;
}

export interface RawAgeRule extends RawRef {
  applies_to: AppliesTo;
  min_age: number;
  exceptions: string | null;
  notes: string | null;
}

export interface RawHelmetRule extends RawRef {
  applies_to: AppliesTo;
  required_under_age: number | null;
  all_ages: boolean;
  notes: string | null;
}

export interface RawFlags {
  license_required: boolean | null;
  registration_required: boolean | null;
  insurance_required: boolean | null;
}

export interface RawLicense extends RawRef, RawFlags {
  by_class: Record<ClassKey, RawFlags> | null;
  notes: string | null;
}

export interface RawCaution {
  applies_to: AppliesTo;
  rider_under_age: number | null;
  condition: string | null;
  verdict: "not_an_ebike" | "unclear";
  valid_until: string | null;
  reason: string;
}

export interface RawPendingChange {
  bill: string;
  signed: string | null;
  effective_date: string | null;
  summary: string;
  source_url: string;
}

export interface RawState {
  code: string;
  name: string;
  last_checked: string;
  confidence: string;
  has_three_class_law: boolean;
  definition: RawDefinition;
  min_age_status: "rule" | "none_in_state_law" | "unknown";
  min_age: RawAgeRule[] | null;
  helmet_status: "rule" | "none_in_state_law" | "unknown";
  helmet: RawHelmetRule[] | null;
  license_registration_insurance: RawLicense;
  local_authority: RawRef & {
    can_add_age_limits_or_bans: boolean | null;
    details: string | null;
  };
  non_ebike_devices: RawRef & {
    treated_as: string | null;
    license_needed: boolean | null;
    min_age: number | null;
    notes: string | null;
  };
  pending_changes: RawPendingChange[];
  never_return_legal: boolean;
  never_return_legal_reason: string | null;
  verdict_cautions: RawCaution[];
  verified_by_verifier: string | null;
}

export interface RawLocalRule {
  rule: string;
  applies_to: string[];
  min_age?: number | null;
  citation: string;
  source_url: string;
  /** Verbatim text from source_url, or null when no verbatim quote was recorded. */
  quote: string | null;
  effective_date: string | null;
  adopted_date?: string;
  /** First day a citation can be issued, after a warnings-only period. */
  citations_from?: string;
  citations_from_citation?: string;
  citations_from_source_url?: string;
  citations_from_source_type?: string;
  /** The local rule's own end date. Null means its enacted text gives none. */
  ends?: string | null;
  source_type: string;
  notes?: string;
}

/** One enacted or official text a skeptic read for the record. */
export interface RawPrimarySource {
  number: string | null;
  url: string;
  effective: string | null;
  quote: string;
}

export interface RawJurisdiction {
  id: string;
  jurisdiction: string;
  type: string;
  covers: string;
  verified: string;
  verification_level: VerificationLevel;
  /** The day the record was last checked against primary text. */
  checked_through: string;
  verified_note: string;
  local_age_limits: RawLocalRule[];
  campus_class_limits: RawLocalRule[];
  tag_and_course_requirements: RawLocalRule[];
  helmet_rules: RawLocalRule[];
  emoto_enforcement: RawLocalRule[];
  other_local_rules: RawLocalRule[];
  open_questions: string[];
  resolved_questions?: { question: string; answer: string; source_url: string }[];
  primary_sources: RawPrimarySource[];
}

export interface RawSanDiego {
  _meta: { last_checked: string };
  statewide_baseline: RawLocalRule[];
  jurisdictions: RawJurisdiction[];
}

export interface OverlayCaution extends RawCaution {
  state: string;
  /** First day the caution applies, when it starts later than today. */
  valid_from?: string | null;
  /** The exact provision, when it differs from the definition's citation. */
  citation?: string;
  source_url?: string;
  source_field: string;
  source_quote: string;
  note?: string;
}

export interface OverlayAgeException {
  state: string;
  applies_to: AppliesTo;
  min_age: number;
  /** "parent_supervision" when only a parent or guardian may supervise, as in Utah. */
  type: "supervision" | "parent_supervision";
  from_age: number;
  source_field: string;
  source_quote: string;
}

export type OverlayEffect =
  | { type: "end_age_rule"; applies_to: AppliesTo; min_age: number }
  | { type: "end_helmet_rule"; applies_to: AppliesTo; all_ages: boolean }
  | {
      type: "add_helmet_rule";
      applies_to: AppliesTo;
      required_under_age: number | null;
      all_ages: boolean;
      citation: string;
      source_quote: string;
    }
  | { type: "end_license_by_class"; applies_to: ClassKey }
  | {
      type: "add_age_rule";
      applies_to: AppliesTo;
      min_age: number;
      citation: string;
      source_quote: string;
      exception?: { type: "supervision_or_certificate"; from_age: number };
    };

export interface OverlayScheduledChange {
  state: string;
  effective_date: string;
  bill: string;
  source_url: string;
  code: string;
  effects: OverlayEffect[];
}

export interface OverlayWattFallback {
  state: string;
  from: string | null;
  min_watts: number;
  max_watts: number | null;
  code: string;
  source_field: string;
  source_quote: string;
}

/** Equipment a Class 3 must have in a state, shown as a requirement on a Class 3 yes. */
export interface OverlayClass3Equipment {
  state: string;
  code: string;
  /** The equipment is part of the Class 3 definition, so without it the bike is not a Class 3. */
  definition: boolean;
  source_field: string;
  source_quote: string;
  citation: string;
  source_url: string;
  statute_quote: string;
}

export interface Overlay {
  stop_pedaling_class2: { states: string[]; decided_on: string; decided_by: string };
  class3_equipment: OverlayClass3Equipment[];
  supplemental_cautions: OverlayCaution[];
  age_exceptions: OverlayAgeException[];
  license_detail: { state: string; code: string; source_quote: string }[];
  watt_fallbacks: OverlayWattFallback[];
  scheduled_changes: OverlayScheduledChange[];
}
