"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { MAX_READ_MPH, type Evidence as Ev, type FactKey } from "@/lib/extract/parse";
import type { BikeFacts, ClassNum } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { isUiKey, t } from "@/lib/i18n/ui";
import { applyPedalCall } from "@/lib/photo/pedalRule";
import { Card, Choice, Evidence, fromTri, NumberField, triValue } from "./controls";
import { PedalPhotoCheck } from "./PedalPhotoCheck";
import { ShapeFacts } from "./ShapeFacts";

type Tri3 = "yes" | "no" | "unsure";

/** The largest motor figure the form takes, the same as the parser's. */
const MAX_WATTS = 20000;

interface Props {
  lang: Lang;
  facts: BikeFacts;
  evidence: Partial<Record<FactKey, Ev[]>>;
  flags: string[];
  onChange: Dispatch<SetStateAction<BikeFacts>>;
  onCheck: () => void;
}

export function FactsCard({ lang, facts, evidence, flags, onChange, onCheck }: Props) {
  const [pedalsUi, setPedalsUi] = useState<Tri3 | null>(triValue(facts.hasPedals));
  const [throttleUi, setThrottleUi] = useState<Tri3 | null>(triValue(facts.hasThrottle));
  const set = (patch: Partial<BikeFacts>) => onChange({ ...facts, ...patch });
  const rangeError = (min: number, max: number) => t(lang, "rangeError", { min, max });
  const ev = (key: FactKey) => <Evidence label={t(lang, "readFrom")} texts={evidence[key]?.map((e) => e.text)} />;
  const triOptions = [
    { value: "yes" as const, label: t(lang, "yes") },
    { value: "no" as const, label: t(lang, "no") },
    { value: "unsure" as const, label: t(lang, "notSure") },
  ];

  const toggleClass = (c: ClassNum) => {
    const has = facts.classes.includes(c);
    const next = has ? facts.classes.filter((x) => x !== c) : [...facts.classes, c].sort();
    set({ classes: next as ClassNum[] });
  };

  return (
    <Card title={t(lang, "step3")} step={3}>
      <p className="text-sm text-muted">{t(lang, "step3Help")}</p>
      {flags.length > 0 ? (
        <ul className="list-disc space-y-1 rounded-lg bg-sunk p-3 pl-7 text-sm">
          {[...new Set(flags)].map((f) => {
            const key = `flag_${f}`;
            return isUiKey(key) ? <li key={f}>{t(lang, key)}</li> : null;
          })}
        </ul>
      ) : null}

      <div className="space-y-1">
        <Choice
          legend={t(lang, "pedals")}
          options={triOptions}
          value={pedalsUi}
          onChange={(v) => {
            setPedalsUi(v);
            set({ hasPedals: fromTri(v) });
          }}
        />
        {ev("hasPedals")}
        <PedalPhotoCheck
          lang={lang}
          onCall={(call) => {
            if (call === "ask") return;
            setPedalsUi(call === "pedals" ? "yes" : "no");
            onChange((prev) => applyPedalCall(prev, call));
          }}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t(lang, "classLabel")}</legend>
        <p className="text-sm text-muted">{t(lang, "classHelp")}</p>
        <div className="flex flex-wrap gap-2">
          {([1, 2, 3] as ClassNum[]).map((c) => (
            <label key={c} className="choice">
              <input type="checkbox" className="sr-only" aria-label={`${lang === "es" ? "Clase" : "Class"} ${c}`} checked={facts.classes.includes(c)} onChange={() => toggleClass(c)} />
              <span>{`${lang === "es" ? "Clase" : "Class"} ${c}`}</span>
            </label>
          ))}
          <label className="choice">
            <input type="checkbox" className="sr-only" aria-label={t(lang, "classNone")} checked={facts.classes.length === 0} onChange={() => set({ classes: [] })} />
            <span>{t(lang, "classNone")}</span>
          </label>
        </div>
        {ev("classes")}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label={t(lang, "ratedWatts")} value={facts.ratedWatts} min={0} max={MAX_WATTS} rangeError={rangeError(0, MAX_WATTS)} onChange={(v) => set({ ratedWatts: v })} evidence={ev("ratedWatts")} />
        <NumberField label={t(lang, "peakWatts")} value={facts.peakWatts} min={0} max={MAX_WATTS} rangeError={rangeError(0, MAX_WATTS)} onChange={(v) => set({ peakWatts: v })} evidence={ev("peakWatts")} />
        {facts.wattsUpTo !== null || evidence.wattsUpTo ? (
          <NumberField label={t(lang, "upToWatts")} value={facts.wattsUpTo} min={0} max={MAX_WATTS} rangeError={rangeError(0, MAX_WATTS)} onChange={(v) => set({ wattsUpTo: v })} evidence={ev("wattsUpTo")} />
        ) : null}
      </div>

      <div className="space-y-1">
        <Choice
          legend={t(lang, "throttle")}
          options={triOptions}
          value={throttleUi}
          onChange={(v) => {
            setThrottleUi(v);
            set({ hasThrottle: fromTri(v), throttleMph: v === "no" ? null : facts.throttleMph });
          }}
        />
        {ev("hasThrottle")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* A throttle speed read from the text stays visible even with "no throttle", so a stray one can be cleared. */}
        {facts.hasThrottle !== false || facts.throttleMph !== null ? (
          <NumberField label={t(lang, "throttleMph")} value={facts.throttleMph} min={0} max={MAX_READ_MPH} rangeError={rangeError(0, MAX_READ_MPH)} onChange={(v) => set({ throttleMph: v })} evidence={ev("throttleMph")} />
        ) : null}
        <NumberField label={t(lang, "assistMph")} value={facts.assistMph} min={0} max={MAX_READ_MPH} rangeError={rangeError(0, MAX_READ_MPH)} onChange={(v) => set({ assistMph: v })} evidence={ev("assistMph")} />
        {facts.topSpeedMph !== null || evidence.topSpeedMph ? (
          <NumberField label={t(lang, "topMph")} value={facts.topSpeedMph} min={0} max={MAX_READ_MPH} rangeError={rangeError(0, MAX_READ_MPH)} onChange={(v) => set({ topSpeedMph: v })} evidence={ev("topSpeedMph")} />
        ) : null}
      </div>

      <ShapeFacts lang={lang} facts={facts} evidence={evidence} onChange={onChange} />

      {facts.switchable === true || evidence.switchable ? (
        <div>
          <label className="check">
            <input type="checkbox" aria-label={t(lang, "unlock")} checked={facts.switchable === true} onChange={(e) => set({ switchable: e.target.checked ? true : null })} />
            <span>{t(lang, "unlock")}</span>
          </label>
          {ev("switchable")}
        </div>
      ) : null}

      <button type="button" className="btn w-full sm:w-auto" onClick={onCheck}>
        {t(lang, "check")}
      </button>
    </Card>
  );
}
