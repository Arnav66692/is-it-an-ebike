// Loads the verified table and the overlay once, and turns each state record into
// dated rules the engine can apply to a ride date.

import statesJson from "@/data/rules/all_states.normalized.json";
import overlayJson from "@/data/overlay.json";
import { fieldsOf, parseCondition, type ConditionNode } from "./condition";
import { firstIsoDate, type DateWindow } from "./dates";
import type {
  Overlay,
  OverlayScheduledChange,
  OverlayWattFallback,
  RawCaution,
  RawFlags,
  RawRef,
  RawState,
} from "./raw";
import type { AppliesTo, ClassKey, ClassNum, Source } from "./types";

export const STATES = statesJson as unknown as Record<string, RawState>;
export const OVERLAY = overlayJson as unknown as Overlay;

export interface CompiledCaution {
  appliesTo: AppliesTo;
  riderUnderAge: number | null;
  node: ConditionNode | null;
  condition: string | null;
  verdict: "not_an_ebike" | "unclear";
  window: DateWindow;
  reason: string;
  supplemental: boolean;
  touchesFastMode: boolean;
  source: Source;
}

export interface AgeException {
  type: "supervision" | "parent_supervision" | "supervision_or_certificate";
  fromAge: number;
  quote: string;
}

export interface CompiledAgeRule {
  appliesTo: AppliesTo;
  minAge: number;
  window: DateWindow;
  source: Source;
  exception: AgeException | null;
  /** Under the age only with a license or permit, which in practice bars young riders (Oregon before 2027). */
  licenseBars: boolean;
  detail: string | null;
}

export interface CompiledHelmetRule {
  appliesTo: AppliesTo;
  underAge: number | null;
  allAges: boolean;
  window: DateWindow;
  source: Source;
}

export interface CompiledState {
  code: string;
  name: string;
  lastChecked: string;
  confidence: string;
  neverLegal: boolean;
  neverLegalReason: string | null;
  def: {
    requiresPedals: boolean | null;
    maxWatts: number | null;
    comparison: "less_than" | "at_most" | "no_watt_cap" | "other";
    maxHp: number | null;
    classMax: Record<ClassNum, number>;
    source: Source;
  };
  cautions: CompiledCaution[];
  /** Some caution names throttle, motor-only speed or an unlock mode, so an unanswered fast-mode question blocks a yes. */
  fastModeExplicit: boolean;
  ageStatus: RawState["min_age_status"];
  ages: CompiledAgeRule[];
  helmetStatus: RawState["helmet_status"];
  helmets: CompiledHelmetRule[];
  license: {
    flags: RawFlags;
    byClass: Record<ClassKey, RawFlags> | null;
    byClassUntil: Partial<Record<ClassKey, string>>;
    source: Source;
  };
  licenseDetailCode: string | null;
  nonEbike: { treatedAs: string | null; source: Source };
  localAuthority: { canAdd: boolean | null; details: string | null; source: Source };
  stopPedalingClass2: boolean;
  /** Equipment a Class 3 must have here, like California's speedometer. */
  class3Equipment: { code: string; definition: boolean; source: Source }[];
  /** E-bikes may ride only on roads posted at or under this speed, like New York's 30 mph. */
  roadLimits: { code: string; mph: number; source: Source }[];
  wattFallbacks: OverlayWattFallback[];
  scheduled: OverlayScheduledChange[];
}

const FAST_MODE_FIELDS = new Set(["throttle_max_mph", "motor_only_max_mph", "switchable_out_of_class"]);

export function sourceOf(ref: RawRef, kind: Source["kind"] = "statute"): Source {
  return {
    citation: ref.citation,
    url: ref.source_url,
    quote: ref.quote,
    effective: ref.effective_date,
    kind,
  };
}

function compileCaution(
  c: RawCaution,
  source: Source,
  supplemental: boolean,
  from: string | null = null,
): CompiledCaution {
  const node = c.condition ? parseCondition(c.condition) : null;
  const fields = node ? fieldsOf(node) : [];
  return {
    appliesTo: c.applies_to,
    riderUnderAge: c.rider_under_age,
    node,
    condition: c.condition,
    verdict: c.verdict,
    window: { from, until: c.valid_until },
    reason: c.reason,
    supplemental,
    touchesFastMode: fields.some((field) => FAST_MODE_FIELDS.has(field)),
    source,
  };
}

function matchesEnd(
  changes: OverlayScheduledChange[],
  predicate: (effect: OverlayScheduledChange["effects"][number]) => boolean,
): string | null {
  for (const change of changes) {
    if (change.effects.some(predicate)) return change.effective_date;
  }
  return null;
}

function compileState(raw: RawState): CompiledState {
  const scheduled = OVERLAY.scheduled_changes.filter((c) => c.state === raw.code);
  const exceptions = OVERLAY.age_exceptions.filter((e) => e.state === raw.code);
  const def = raw.definition;

  const cautions: CompiledCaution[] = [
    ...raw.verdict_cautions.map((c) =>
      compileCaution(c, { ...sourceOf(def), kind: "rules_table" }, false),
    ),
    ...OVERLAY.supplemental_cautions
      .filter((c) => c.state === raw.code)
      .map((c) =>
        compileCaution(
          c,
          // The card names the provision the caution rests on, not only the definition's subsection.
          { citation: c.citation ?? def.citation, url: c.source_url ?? def.source_url, quote: c.source_quote, kind: "rules_table" },
          true,
          c.valid_from ?? null,
        ),
      ),
  ];

  const ages: CompiledAgeRule[] = (raw.min_age ?? []).map((rule) => {
    const until = matchesEnd(
      scheduled,
      (e) => e.type === "end_age_rule" && e.applies_to === rule.applies_to && e.min_age === rule.min_age,
    );
    const exception = exceptions.find(
      (e) => e.applies_to === rule.applies_to && e.min_age === rule.min_age,
    );
    return {
      appliesTo: rule.applies_to,
      minAge: rule.min_age,
      window: { from: firstIsoDate(rule.effective_date), until },
      source: sourceOf(rule),
      exception: exception
        ? { type: exception.type, fromAge: exception.from_age, quote: exception.source_quote }
        : null,
      licenseBars: raw.code === "OR" && rule.applies_to === "all_ebikes" && rule.min_age === 16,
      detail: rule.exceptions,
    };
  });
  for (const change of scheduled) {
    for (const effect of change.effects) {
      if (effect.type !== "add_age_rule") continue;
      ages.push({
        appliesTo: effect.applies_to,
        minAge: effect.min_age,
        window: { from: change.effective_date, until: null },
        source: {
          citation: effect.citation,
          url: change.source_url,
          quote: effect.source_quote,
          effective: change.effective_date,
          kind: "statute",
        },
        exception: effect.exception
          ? { type: effect.exception.type, fromAge: effect.exception.from_age, quote: effect.source_quote }
          : null,
        licenseBars: false,
        detail: null,
      });
    }
  }

  const helmets: CompiledHelmetRule[] = (raw.helmet ?? []).map((rule) => ({
    appliesTo: rule.applies_to,
    underAge: rule.required_under_age,
    allAges: rule.all_ages,
    window: {
      from: firstIsoDate(rule.effective_date),
      until: matchesEnd(
        scheduled,
        (e) => e.type === "end_helmet_rule" && e.applies_to === rule.applies_to && e.all_ages === rule.all_ages,
      ),
    },
    source: sourceOf(rule),
  }));
  for (const change of scheduled) {
    for (const effect of change.effects) {
      if (effect.type !== "add_helmet_rule") continue;
      helmets.push({
        appliesTo: effect.applies_to,
        underAge: effect.required_under_age,
        allAges: effect.all_ages,
        window: { from: change.effective_date, until: null },
        source: {
          citation: effect.citation,
          url: change.source_url,
          quote: effect.source_quote,
          effective: change.effective_date,
          kind: "statute",
        },
      });
    }
  }

  const byClassUntil: Partial<Record<ClassKey, string>> = {};
  for (const change of scheduled) {
    for (const effect of change.effects) {
      if (effect.type === "end_license_by_class") byClassUntil[effect.applies_to] = change.effective_date;
    }
  }

  const lic = raw.license_registration_insurance;
  return {
    code: raw.code,
    name: raw.name,
    lastChecked: raw.last_checked,
    confidence: raw.confidence,
    neverLegal: raw.never_return_legal,
    neverLegalReason: raw.never_return_legal_reason,
    def: {
      requiresPedals: def.requires_pedals,
      maxWatts: def.max_motor_watts,
      comparison: def.motor_watts_comparison,
      maxHp: def.max_motor_hp,
      classMax: {
        1: def.class1_assist_max_mph ?? 20,
        2: def.class2_throttle_max_mph ?? 20,
        3: def.class3_assist_max_mph ?? 28,
      },
      source: sourceOf(def),
    },
    cautions,
    fastModeExplicit: cautions.some((c) => c.touchesFastMode),
    ageStatus: raw.min_age_status,
    ages,
    helmetStatus: raw.helmet_status,
    helmets,
    license: {
      flags: {
        license_required: lic.license_required,
        registration_required: lic.registration_required,
        insurance_required: lic.insurance_required,
      },
      byClass: lic.by_class,
      byClassUntil,
      source: sourceOf(lic),
    },
    licenseDetailCode: OVERLAY.license_detail.find((d) => d.state === raw.code)?.code ?? null,
    nonEbike: { treatedAs: raw.non_ebike_devices.treated_as, source: sourceOf(raw.non_ebike_devices) },
    localAuthority: {
      canAdd: raw.local_authority.can_add_age_limits_or_bans,
      details: raw.local_authority.details,
      source: sourceOf(raw.local_authority),
    },
    stopPedalingClass2: OVERLAY.stop_pedaling_class2.states.includes(raw.code),
    class3Equipment: OVERLAY.class3_equipment
      .filter((e) => e.state === raw.code)
      .map((e) => ({
        code: e.code,
        definition: e.definition,
        source: { citation: e.citation, url: e.source_url, quote: e.statute_quote, kind: "statute" as const },
      })),
    roadLimits: OVERLAY.road_limits
      .filter((r) => r.state === raw.code)
      .map((r) => ({
        code: r.code,
        mph: r.max_posted_mph,
        source: { citation: r.citation, url: r.source_url, quote: r.statute_quote, kind: "statute" as const },
      })),
    wattFallbacks: OVERLAY.watt_fallbacks.filter((w) => w.state === raw.code),
    scheduled,
  };
}

const compiled = new Map<string, CompiledState>();

export function getState(code: string): CompiledState {
  const key = code.toUpperCase();
  const cached = compiled.get(key);
  if (cached) return cached;
  const raw = STATES[key];
  if (!raw) throw new Error(`Unknown state code "${code}"`);
  const result = compileState(raw);
  compiled.set(key, result);
  return result;
}

export const STATE_CODES: string[] = Object.keys(STATES).sort();
