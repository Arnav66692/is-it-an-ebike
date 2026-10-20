"use client";

// Wheels, number of wheels, weight and foot pegs, as read from a label or listing. Several state
// rules turn on these alone, so a value read from the text is always shown with its source and
// can be changed. Nothing here is hidden from the family.

import {
  sameWheelSize,
  WEIGHT_MAX_LB,
  WEIGHT_MIN_LB,
  WHEEL_MAX_IN,
  WHEEL_MIN_IN,
  withFootPegs,
  withWeight,
  withWheelCount,
  withWheelSize,
} from "@/lib/checkerState";
import type { Evidence as Ev, FactKey } from "@/lib/extract/parse";
import type { BikeFacts } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { Choice, Evidence, NumberField, triValue } from "./controls";

interface Props {
  lang: Lang;
  facts: BikeFacts;
  evidence: Partial<Record<FactKey, Ev[]>>;
  onChange: (next: BikeFacts) => void;
}

/** True when the text gave any of these facts, or the facts already hold one. */
export function hasShapeFacts(facts: BikeFacts, evidence: Partial<Record<FactKey, Ev[]>>): boolean {
  return (
    facts.wheelFrontIn !== null ||
    facts.wheelRearIn !== null ||
    facts.wheelCount !== null ||
    facts.weightLb !== null ||
    facts.hasFootPegs !== null ||
    facts.unsure.includes("pegs_kit") ||
    Boolean(evidence.wheelSize || evidence.wheelCount || evidence.weightLb || evidence.hasFootPegs)
  );
}

export function ShapeFacts({ lang, facts, evidence, onChange }: Props) {
  if (!hasShapeFacts(facts, evidence)) return null;
  // Read from the facts, so an answer given in the follow-up questions shows here too. "Not sure" is
  // the same "not sure" the follow-up stores.
  const pegsUi = triValue(facts.hasFootPegs) ?? (facts.unsure.includes("pegs_kit") ? "unsure" : null);

  const ev = (key: FactKey) => <Evidence label={t(lang, "readFrom")} texts={evidence[key]?.map((e) => e.text)} />;
  const wheelError = t(lang, "rangeError", { min: WHEEL_MIN_IN, max: WHEEL_MAX_IN });
  const wheelField = (label: string, value: number | null, set: (v: number | null) => void, withEvidence: boolean) => (
    <NumberField
      label={label}
      value={value}
      min={WHEEL_MIN_IN}
      max={WHEEL_MAX_IN}
      rangeError={wheelError}
      onChange={set}
      evidence={withEvidence ? ev("wheelSize") : undefined}
    />
  );
  // A "not sure" keeps the question on screen, so it can still be changed.
  const showPegs = facts.hasFootPegs !== null || facts.unsure.includes("pegs_kit") || Boolean(evidence.hasFootPegs);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{t(lang, "shapeTitle")}</legend>
      <p className="text-sm text-muted">{t(lang, "shapeHelp")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {sameWheelSize(facts) ? (
          wheelField(t(lang, "wheelSizeIn"), facts.wheelFrontIn, (v) => onChange(withWheelSize(facts, v, true)), true)
        ) : (
          <>
            {wheelField(t(lang, "front"), facts.wheelFrontIn, (v) => onChange(withWheelSize(facts, v, false)), false)}
            {wheelField(t(lang, "rear"), facts.wheelRearIn, (v) => onChange({ ...facts, wheelRearIn: v }), true)}
          </>
        )}
        <NumberField
          label={t(lang, "weightLb")}
          value={facts.weightLb}
          min={WEIGHT_MIN_LB}
          max={WEIGHT_MAX_LB}
          rangeError={t(lang, "rangeError", { min: WEIGHT_MIN_LB, max: WEIGHT_MAX_LB })}
          onChange={(v) => onChange(withWeight(facts, v))}
          evidence={ev("weightLb")}
        />
      </div>
      <div className="space-y-1">
        <Choice
          legend={t(lang, "wheelCount")}
          options={[
            { value: "2", label: "2" },
            { value: "3", label: "3" },
          ]}
          value={facts.wheelCount === null ? null : (String(facts.wheelCount) as "2" | "3")}
          onChange={(v) => onChange(withWheelCount(facts, v === "3" ? 3 : 2))}
        />
        {ev("wheelCount")}
      </div>
      {showPegs ? (
        <div className="space-y-1">
          <Choice
            legend={t(lang, "footPegs")}
            options={[
              { value: "yes" as const, label: t(lang, "yes") },
              { value: "no" as const, label: t(lang, "no") },
              { value: "unsure" as const, label: t(lang, "notSure") },
            ]}
            value={pegsUi}
            onChange={(v) => onChange(withFootPegs(facts, v))}
          />
          {ev("hasFootPegs")}
        </div>
      ) : null}
    </fieldset>
  );
}
