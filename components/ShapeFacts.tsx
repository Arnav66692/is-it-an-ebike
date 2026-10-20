"use client";

// Wheels, number of wheels, weight and foot pegs, as read from a label or listing. Several state
// rules turn on these alone, so a value read from the text is always shown with its source, marked
// until the family checks it, and can be changed. Nothing here is hidden from the family.

import { useState } from "react";
import {
  twoWheelBoxes,
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
import { wheelsLeftAsRead, type FactCheck, type FactChecks } from "@/lib/provenance";
import type { BikeFacts, ReadField } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { t, type UiKey } from "@/lib/i18n/ui";
import { Choice, NumberField, triValue } from "./controls";
import { ReadNote, type OnConfirm } from "./ReadCheck";

interface Props {
  lang: Lang;
  facts: BikeFacts;
  checks: FactChecks;
  evidence: Partial<Record<FactKey, Ev[]>>;
  onChange: (next: BikeFacts) => void;
  onConfirm: OnConfirm;
}

/**
 * The words next to the wheel size box when the card shows Front and Rear boxes. They name the
 * sizes the box still covers, so once the family changed one size the box no longer claims both.
 */
export function wheelMatchesKey(check: FactCheck | undefined, facts: BikeFacts): UiKey {
  const left = check ? wheelsLeftAsRead(check, facts) : [];
  if (left.length === 1) return left[0] === "front" ? "readMatchesFront" : "readMatchesRear";
  return "readMatchesBoth";
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

export function ShapeFacts({ lang, facts, checks, evidence, onChange, onConfirm }: Props) {
  // Front and Rear boxes, once shown, stay until a new read draws a new card, so the box being
  // typed in is never removed mid-number (twoWheelBoxes in lib/checkerState.ts).
  const [split, setSplit] = useState(() => twoWheelBoxes(false, facts));
  if (twoWheelBoxes(split, facts) !== split) setSplit(true);
  if (!hasShapeFacts(facts, evidence)) return null;
  // Read from the facts, so an answer given in the follow-up questions shows here too. "Not sure" is
  // the same "not sure" the follow-up stores.
  const pegsUi = triValue(facts.hasFootPegs) ?? (facts.unsure.includes("pegs_kit") ? "unsure" : null);

  const ev = (key: ReadField, matchesKey?: UiKey) => (
    <ReadNote lang={lang} field={key} check={checks[key]} onConfirm={onConfirm} evidence={evidence[key]} matchesKey={matchesKey} />
  );
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
        {split ? (
          <>
            {wheelField(t(lang, "front"), facts.wheelFrontIn, (v) => onChange(withWheelSize(facts, v, false)), false)}
            {wheelField(t(lang, "rear"), facts.wheelRearIn, (v) => onChange({ ...facts, wheelRearIn: v }), false)}
            {/* Both sizes share one check, so its words and its box sit under both boxes and say which sizes it covers. */}
            <div className="space-y-1 sm:col-span-2">{ev("wheelSize", wheelMatchesKey(checks.wheelSize, facts))}</div>
          </>
        ) : (
          wheelField(t(lang, "wheelSizeIn"), facts.wheelFrontIn, (v) => onChange(withWheelSize(facts, v, true)), true)
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
