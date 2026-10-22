"use client";

import { useState } from "react";
import {
  pegsKitShown,
  sameWheelSize,
  weightShown,
  WHEEL_MAX_IN,
  WHEEL_MIN_IN,
  withOneWheelSize,
  withWheelCount,
  withWheelSize,
} from "@/lib/checkerState";
import type { BikeFacts, QuestionId } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { Card, Choice, NumberField, triValue } from "./controls";

type Tri3 = "yes" | "no" | "unsure";

interface Props {
  lang: Lang;
  questions: QuestionId[];
  facts: BikeFacts;
  /** The family answered. */
  onChange: (next: BikeFacts) => void;
}

function withUnsure(f: BikeFacts, q: QuestionId, unsure: boolean): QuestionId[] {
  const rest = f.unsure.filter((x) => x !== q);
  return unsure ? [...rest, q] : rest;
}

export function FollowUps({ lang, questions, facts, onChange }: Props) {
  // Every answer is read from the facts on each render, so an answer changed on the facts card shows
  // here at once, and a click on any answer always changes the facts. The facts keep one "not sure"
  // for both fast-mode parts, so only which part was "not sure" is kept here.
  const [fastUnsure, setFastUnsure] = useState(() => {
    const unsure = facts.unsure.includes("fast_mode");
    return { motor: unsure && facts.motorOver20 === null, assist: unsure && facts.assistOver28 === null };
  });
  const [sameSize, setSameSize] = useState(sameWheelSize(facts));
  if (questions.length === 0) return null;

  const fastFlag = facts.unsure.includes("fast_mode");
  const wheelsUnsure = facts.unsure.includes("wheels");
  const motorUi: Tri3 | null = triValue(facts.motorOver20) ?? (fastFlag && fastUnsure.motor ? "unsure" : null);
  const assistUi: Tri3 | null = triValue(facts.assistOver28) ?? (fastFlag && fastUnsure.assist ? "unsure" : null);

  const wheelError = t(lang, "rangeError", { min: WHEEL_MIN_IN, max: WHEEL_MAX_IN });
  const tri = [
    { value: "yes" as const, label: t(lang, "yes") },
    { value: "no" as const, label: t(lang, "no") },
    { value: "unsure" as const, label: t(lang, "notSure") },
  ];

  const setFast = (motor: Tri3 | null, assist: Tri3 | null) => {
    setFastUnsure({ motor: motor === "unsure", assist: assist === "unsure" });
    const unsure = motor === "unsure" || assist === "unsure";
    onChange({
      ...facts,
      motorOver20: motor === "yes" ? true : motor === "no" ? false : null,
      assistOver28: assist === "yes" ? true : assist === "no" ? false : null,
      unsure: withUnsure(facts, "fast_mode", unsure),
    });
  };

  return (
    <Card title={t(lang, "questionsTitle")} level={3}>
      <p className="help">{t(lang, "questionsHelp")}</p>

      {questions.includes("wheels") ? (
        <fieldset className="question">
          <legend>{t(lang, "qWheels")}</legend>
          <p className="help">{t(lang, "qWheelsHelp")}</p>
          <div className="flex flex-wrap gap-4">
            <NumberField
              label={sameSize ? t(lang, "qWheels") : t(lang, "front")}
              value={facts.wheelFrontIn}
              min={WHEEL_MIN_IN}
              max={WHEEL_MAX_IN}
              rangeError={wheelError}
              onChange={(v) => onChange(withWheelSize(facts, v, sameSize))}
            />
            {!sameSize ? (
              <NumberField
                label={t(lang, "rear")}
                value={facts.wheelRearIn}
                min={WHEEL_MIN_IN}
                max={WHEEL_MAX_IN}
                rangeError={wheelError}
                onChange={(v) => onChange({ ...facts, wheelRearIn: v, unsure: withUnsure(facts, "wheels", false) })}
              />
            ) : null}
          </div>
          <label className="check">
            <input
              type="checkbox"
              aria-label={t(lang, "wheelsDiffer")}
              checked={!sameSize}
              onChange={(e) => {
                const one = !e.target.checked;
                setSameSize(one);
                // Back to one size: the rear takes the front size, so no hidden rear size stays in the facts.
                if (one && facts.wheelRearIn !== facts.wheelFrontIn) onChange(withOneWheelSize(facts));
              }}
            />
            <span>{t(lang, "wheelsDiffer")}</span>
          </label>
          <Choice
            legend={t(lang, "wheelCount")}
            options={[
              { value: "2", label: "2" },
              { value: "3", label: "3" },
            ]}
            value={facts.wheelCount === null ? null : (String(facts.wheelCount) as "2" | "3")}
            onChange={(v) => onChange(withWheelCount(facts, v === "3" ? 3 : 2))}
          />
          {/* A toggle that shows when it is on, like a picked choice. Pressed again, it is off and the question is open again. */}
          <button
            type="button"
            className="btn btn-quiet justify-self-start"
            aria-pressed={wheelsUnsure}
            onClick={() =>
              onChange(
                wheelsUnsure
                  ? { ...facts, unsure: withUnsure(facts, "wheels", false) }
                  : { ...facts, wheelFrontIn: null, wheelRearIn: null, wheelCount: null, unsure: withUnsure(facts, "wheels", true) },
              )
            }
          >
            {wheelsUnsure ? <span aria-hidden="true">✓</span> : null}
            {t(lang, "notSure")}
          </button>
        </fieldset>
      ) : null}

      {questions.includes("fast_mode") ? (
        <fieldset className="question">
          <legend>{t(lang, "qFast")}</legend>
          <Choice
            legend={t(lang, "qFastMotor")}
            options={tri}
            value={motorUi}
            onChange={(v) => setFast(v, assistUi)}
          />
          <Choice
            legend={t(lang, "qFastAssist")}
            options={tri}
            value={assistUi}
            onChange={(v) => setFast(motorUi, v)}
          />
        </fieldset>
      ) : null}

      {questions.includes("weight") ? (
        <Choice
          legend={t(lang, "qWeight")}
          options={tri}
          value={weightShown(facts)}
          onChange={(v) => {
            onChange({
              ...facts,
              weightLb: null,
              weightOver100: v === "yes" ? true : v === "no" ? false : null,
              unsure: withUnsure(facts, "weight", v === "unsure"),
            });
          }}
        />
      ) : null}

      {questions.includes("pegs_kit") ? (
        <Choice
          legend={t(lang, "qPegs")}
          options={tri}
          value={pegsKitShown(facts)}
          onChange={(v) => {
            const value = v === "yes" ? true : v === "no" ? false : null;
            onChange({ ...facts, hasFootPegs: value, needsPedalKit: value === true ? null : value, unsure: withUnsure(facts, "pegs_kit", v === "unsure") });
          }}
        />
      ) : null}
    </Card>
  );
}
