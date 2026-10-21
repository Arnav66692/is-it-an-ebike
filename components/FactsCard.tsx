"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { withThrottleAnswer } from "@/lib/checkerState";
import { MAX_READ_MPH, type Evidence as Ev, type FactKey } from "@/lib/extract/parse";
import { checkCounts, pedalCallNeedsTick, type FactChecks } from "@/lib/provenance";
import type { BikeFacts, ClassNum, ReadField } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { isUiKey, t } from "@/lib/i18n/ui";
import { answerGate, confirmThroughGate, type PedalCall } from "@/lib/photo/pedalRule";
import { Card, Choice, fromTri, NumberField, triValue } from "./controls";
import { PedalPhotoCheck } from "./PedalPhotoCheck";
import { ReadNote, type OnConfirm } from "./ReadCheck";
import { ShapeFacts } from "./ShapeFacts";

type Tri3 = "yes" | "no" | "unsure";

/** The largest motor figure the form takes, the same as the parser's. */
const MAX_WATTS = 20000;

/** How far above the bottom of the screen the facts list must start before the Check bar sticks, in px. */
const STICKY_AFTER = 260;

/** Up to this many read facts, the progress shows one segment per fact. Past it, one bar. */
const MAX_SEGMENTS = 12;

interface Props {
  lang: Lang;
  facts: BikeFacts;
  /** Which facts were read from a link or photo, and which of those the family has checked. */
  checks: FactChecks;
  evidence: Partial<Record<FactKey, Ev[]>>;
  flags: string[];
  /** The family changed the facts. A read fact they change counts as checked. */
  onChange: (next: BikeFacts) => void;
  /** The family ticked or cleared "It matches the bike" on a read fact. */
  onConfirm: OnConfirm;
  /**
   * The whole-bike photo check made a call. It only fills the pedals answer. It is called from
   * the newest card drawn, so it can check the call against the facts on screen as it lands.
   */
  onPedalCall: (call: PedalCall) => void;
  onCheck: () => void;
}

export function FactsCard({ lang, facts, checks, evidence, flags, onChange, onConfirm, onPedalCall, onCheck }: Props) {
  // The answers shown are read from the facts every time, so the pedals answer always shows what
  // the facts hold, even after the photo check fills it. Only a "not sure" pick is kept here, since
  // the facts store it as unknown, the same as no answer.
  const [pedalsUnsure, setPedalsUnsure] = useState(false);
  const [throttleUnsure, setThrottleUnsure] = useState(false);
  // The throttle speed a "No" answer cleared, put back when the answer moves off "No" again.
  const [throttleSetAside, setThrottleSetAside] = useState<number | null>(null);
  const pedalsUi: Tri3 | null = triValue(facts.hasPedals) ?? (pedalsUnsure ? "unsure" : null);
  const throttleUi: Tri3 | null = triValue(facts.hasThrottle) ?? (throttleUnsure ? "unsure" : null);
  // A pedals answer the family picks, or ticks, while a photo check runs must not be replaced by the photo's call.
  const [pedalAnswers] = useState(answerGate);
  // Goes up with each pedals answer the family picks, so the photo check's message about the old answer is cleared.
  const [pedalPicks, setPedalPicks] = useState(0);
  // The pedals box, so the photo check can move keyboard focus to it when its call needs a tick.
  const pedalsBox = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<BikeFacts>) => onChange({ ...facts, ...patch });
  const rangeError = (min: number, max: number) => t(lang, "rangeError", { min, max });
  // Ticking the pedals box is the family's own pedals answer, newer than a photo check still running.
  const confirm: OnConfirm = confirmThroughGate(pedalAnswers, onConfirm);
  const ev = (key: ReadField, boxRef?: Ref<HTMLInputElement>) => (
    <ReadNote lang={lang} field={key} check={checks[key]} onConfirm={confirm} evidence={evidence[key]} boxRef={boxRef} />
  );
  const counts = checkCounts(checks);
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

  const allChecked = counts.read > 0 && counts.confirmed === counts.read;
  // On a phone the Check bar stays at the bottom of the screen only once the facts list reaches
  // well up the screen. Before that it waits at the list's end, so it never sits on the card's
  // top edge over the step heading, cut off at the bottom of the screen.
  const listTop = useRef<HTMLDivElement>(null);
  const [sticky, setSticky] = useState(true);
  useEffect(() => {
    const top = listTop.current;
    if (!top || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver(
      ([e]) => setSticky(e.isIntersecting || e.boundingClientRect.top < (e.rootBounds?.top ?? 0)),
      { rootMargin: `0px 0px -${STICKY_AFTER}px 0px` },
    );
    watch.observe(top);
    return () => watch.disconnect();
  }, []);

  return (
    <Card title={t(lang, "step3")} step={3}>
      {flags.length > 0 ? (
        <ul className="flags">
          {[...new Set(flags)].map((f) => {
            const key = `flag_${f}`;
            return isUiKey(key) ? <li key={f}>{t(lang, key)}</li> : null;
          })}
        </ul>
      ) : null}

      <div ref={listTop} aria-hidden="true" />
      <div className="facts">
        <div className="fact">
          <Choice
            legend={t(lang, "pedals")}
            options={triOptions}
            value={pedalsUi}
            onChange={(v) => {
              pedalAnswers.edited("picked");
              setPedalPicks((n) => n + 1);
              setPedalsUnsure(v === "unsure");
              set({ hasPedals: fromTri(v) });
            }}
          />
          {ev("hasPedals", pedalsBox)}
          {/* tickAfter sees the facts on screen as the check started. Only a pedals pick or tick
              could change the pedals answer before the call lands, and either one drops the call. */}
          <PedalPhotoCheck
            lang={lang}
            startCheck={pedalAnswers.start}
            tickAfter={(call) => pedalCallNeedsTick({ facts, checks }, call)}
            picks={pedalPicks}
            onCall={(call) => {
              if (call !== "ask") onPedalCall(call);
            }}
            focusTick={() => {
              const box = pedalsBox.current;
              box?.focus();
              return box !== null;
            }}
          />
        </div>

        <fieldset className="fact space-y-2">
          <legend className="field-label">{t(lang, "classLabel")}</legend>
          <p className="help">{t(lang, "classHelp")}</p>
          <div className="flex flex-wrap gap-2 pt-1">
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

        <div className="fact-group fact-grid">
          <div className="fact">
            <NumberField label={t(lang, "ratedWatts")} value={facts.ratedWatts} min={0} max={MAX_WATTS} rangeError={rangeError(0, MAX_WATTS)} onChange={(v) => set({ ratedWatts: v })} evidence={ev("ratedWatts")} />
          </div>
          <div className="fact">
            <NumberField label={t(lang, "peakWatts")} value={facts.peakWatts} min={0} max={MAX_WATTS} rangeError={rangeError(0, MAX_WATTS)} onChange={(v) => set({ peakWatts: v })} evidence={ev("peakWatts")} />
          </div>
          {facts.wattsUpTo !== null || evidence.wattsUpTo ? (
            <div className="fact">
              <NumberField label={t(lang, "upToWatts")} value={facts.wattsUpTo} min={0} max={MAX_WATTS} rangeError={rangeError(0, MAX_WATTS)} onChange={(v) => set({ wattsUpTo: v })} evidence={ev("wattsUpTo")} />
            </div>
          ) : null}
        </div>

        <div className="fact">
          <Choice
            legend={t(lang, "throttle")}
            options={triOptions}
            value={throttleUi}
            onChange={(v) => {
              setThrottleUnsure(v === "unsure");
              const next = withThrottleAnswer(facts, fromTri(v), throttleSetAside);
              setThrottleSetAside(next.setAside);
              onChange(next.facts);
            }}
          />
          {ev("hasThrottle")}
        </div>

        <div className="fact-group fact-grid">
          {/* A throttle speed read from the text stays visible even with "no throttle", so a stray one can be cleared. */}
          {facts.hasThrottle !== false || facts.throttleMph !== null ? (
            <div className="fact">
              <NumberField label={t(lang, "throttleMph")} value={facts.throttleMph} min={0} max={MAX_READ_MPH} rangeError={rangeError(0, MAX_READ_MPH)} onChange={(v) => set({ throttleMph: v })} evidence={ev("throttleMph")} />
            </div>
          ) : null}
          <div className="fact">
            <NumberField label={t(lang, "assistMph")} value={facts.assistMph} min={0} max={MAX_READ_MPH} rangeError={rangeError(0, MAX_READ_MPH)} onChange={(v) => set({ assistMph: v })} evidence={ev("assistMph")} />
          </div>
          {facts.topSpeedMph !== null || evidence.topSpeedMph ? (
            <div className="fact">
              <NumberField label={t(lang, "topMph")} value={facts.topSpeedMph} min={0} max={MAX_READ_MPH} rangeError={rangeError(0, MAX_READ_MPH)} onChange={(v) => set({ topSpeedMph: v })} evidence={ev("topSpeedMph")} />
            </div>
          ) : null}
        </div>

        <ShapeFacts lang={lang} facts={facts} checks={checks} evidence={evidence} onChange={onChange} onConfirm={confirm} />

        {facts.switchable === true || evidence.switchable ? (
          <div className="fact">
            <label className="check">
              <input type="checkbox" aria-label={t(lang, "unlock")} checked={facts.switchable === true} onChange={(e) => set({ switchable: e.target.checked ? true : null })} />
              <span>{t(lang, "unlock")}</span>
            </label>
            {ev("switchable")}
          </div>
        ) : null}
      </div>

      {/* The count's status line is always on the page, empty until a fact is read, so a screen
          reader hears it change when the photo check fills in the pedals on a bike typed in. The
          short count and the bar show the same numbers to the eye. */}
      <div className="check-bar no-print" data-sticky={sticky ? "true" : "false"}>
        {counts.read > 0 ? (
          <div className="space-y-2" aria-hidden="true">
            {/* One short line at every width. Once every read fact is checked it turns green with a mark. */}
            <p className="check-count" data-done={allChecked ? "true" : "false"}>
              {allChecked ? "✓ " : ""}
              {t(lang, "readCountShort", { done: counts.confirmed, total: counts.read })}
            </p>
            {counts.read <= MAX_SEGMENTS ? (
              <div className="segs" data-done={allChecked ? "true" : "false"}>
                {Array.from({ length: counts.read }, (_, i) => (
                  <i key={i} data-on={i < counts.confirmed ? "true" : "false"} />
                ))}
              </div>
            ) : (
              <div className="bar" data-done={allChecked ? "true" : "false"}>
                <div style={{ width: `${Math.round((100 * counts.confirmed) / counts.read)}%` }} />
              </div>
            )}
          </div>
        ) : null}
        <p role="status" className="sr-only">
          {counts.read > 0 ? t(lang, "readCount", { done: counts.confirmed, total: counts.read }) : ""}
        </p>
        <button type="button" className="btn btn-go w-full" onClick={onCheck}>
          {t(lang, "check")}
        </button>
      </div>
    </Card>
  );
}
