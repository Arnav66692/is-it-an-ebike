"use client";

import { useState } from "react";
import type { BikeFacts, QuestionId } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { Card, Choice, NumberField, triValue } from "./controls";

type Tri3 = "yes" | "no" | "unsure";

interface Props {
  lang: Lang;
  questions: QuestionId[];
  facts: BikeFacts;
  onChange: (next: BikeFacts) => void;
}

function withUnsure(f: BikeFacts, q: QuestionId, unsure: boolean): QuestionId[] {
  const rest = f.unsure.filter((x) => x !== q);
  return unsure ? [...rest, q] : rest;
}

export function FollowUps({ lang, questions, facts, onChange }: Props) {
  const [motorUi, setMotorUi] = useState<Tri3 | null>(triValue(facts.motorOver20));
  const [assistUi, setAssistUi] = useState<Tri3 | null>(triValue(facts.assistOver28));
  const [weightUi, setWeightUi] = useState<Tri3 | null>(triValue(facts.weightOver100));
  const [pegsUi, setPegsUi] = useState<Tri3 | null>(triValue(facts.hasFootPegs));
  const [sameSize, setSameSize] = useState(true);
  if (questions.length === 0) return null;

  const tri = [
    { value: "yes" as const, label: t(lang, "yes") },
    { value: "no" as const, label: t(lang, "no") },
    { value: "unsure" as const, label: t(lang, "notSure") },
  ];

  const setFast = (motor: Tri3 | null, assist: Tri3 | null) => {
    const unsure = motor === "unsure" || assist === "unsure";
    onChange({
      ...facts,
      motorOver20: motor === "yes" ? true : motor === "no" ? false : null,
      assistOver28: assist === "yes" ? true : assist === "no" ? false : null,
      unsure: withUnsure(facts, "fast_mode", unsure),
    });
  };

  return (
    <Card title={t(lang, "questionsTitle")}>
      <p className="text-sm text-muted">{t(lang, "questionsHelp")}</p>

      {questions.includes("wheels") ? (
        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 font-semibold">{t(lang, "qWheels")}</legend>
          <p className="text-sm text-muted">{t(lang, "qWheelsHelp")}</p>
          <div className="flex flex-wrap gap-4">
            <NumberField
              label={sameSize ? t(lang, "qWheels") : t(lang, "front")}
              value={facts.wheelFrontIn}
              min={6}
              max={30}
              onChange={(v) =>
                onChange({
                  ...facts,
                  wheelFrontIn: v,
                  wheelRearIn: sameSize ? v : facts.wheelRearIn,
                  wheelCount: facts.wheelCount ?? 2,
                  unsure: withUnsure(facts, "wheels", false),
                })
              }
            />
            {!sameSize ? (
              <NumberField
                label={t(lang, "rear")}
                value={facts.wheelRearIn}
                min={6}
                max={30}
                onChange={(v) => onChange({ ...facts, wheelRearIn: v, unsure: withUnsure(facts, "wheels", false) })}
              />
            ) : null}
          </div>
          <label className="check">
            <input type="checkbox" aria-label={`${t(lang, "front")} / ${t(lang, "rear")}`} checked={!sameSize} onChange={(e) => setSameSize(!e.target.checked)} />
            <span>
              {t(lang, "front")} / {t(lang, "rear")}
            </span>
          </label>
          <Choice
            legend={t(lang, "wheelCount")}
            options={[
              { value: "2", label: "2" },
              { value: "3", label: "3" },
            ]}
            value={facts.wheelCount === null ? null : (String(facts.wheelCount) as "2" | "3")}
            onChange={(v) => onChange({ ...facts, wheelCount: v === "3" ? 3 : 2 })}
          />
          <button
            type="button"
            className="btn btn-quiet"
            aria-pressed={facts.unsure.includes("wheels")}
            onClick={() => onChange({ ...facts, wheelFrontIn: null, wheelRearIn: null, wheelCount: null, unsure: withUnsure(facts, "wheels", true) })}
          >
            {t(lang, "notSure")}
          </button>
        </fieldset>
      ) : null}

      {questions.includes("fast_mode") ? (
        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 font-semibold">{t(lang, "qFast")}</legend>
          <Choice
            legend={t(lang, "qFastMotor")}
            options={tri}
            value={motorUi}
            onChange={(v) => {
              setMotorUi(v);
              setFast(v, assistUi);
            }}
          />
          <Choice
            legend={t(lang, "qFastAssist")}
            options={tri}
            value={assistUi}
            onChange={(v) => {
              setAssistUi(v);
              setFast(motorUi, v);
            }}
          />
        </fieldset>
      ) : null}

      {questions.includes("weight") ? (
        <Choice
          legend={t(lang, "qWeight")}
          options={tri}
          value={weightUi}
          onChange={(v) => {
            setWeightUi(v);
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
          value={pegsUi}
          onChange={(v) => {
            setPegsUi(v);
            const value = v === "yes" ? true : v === "no" ? false : null;
            onChange({ ...facts, hasFootPegs: value, needsPedalKit: value === true ? null : value, unsure: withUnsure(facts, "pegs_kit", v === "unsure") });
          }}
        />
      ) : null}
    </Card>
  );
}
