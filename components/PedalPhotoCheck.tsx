"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n/names";
import { t, type UiKey } from "@/lib/i18n/ui";
import { callIfCurrent, PEDAL_MODEL_MB, type AnswerChange, type AnswerWatch, type PedalCall } from "@/lib/photo/pedalRule";

export type Step = "closed" | "confirm" | "choose" | "working";

const RESULT_KEY: Record<PedalCall, UiKey> = {
  pedals: "photoCheckPedals",
  no_pedals: "photoCheckNoPedals",
  ask: "photoCheckAsk",
};

/**
 * The same result, for when the pedals answer still has to be ticked before the answer can say YES.
 * A close call leaves the answer as it was, so when that answer was read from text and is still
 * unchecked, the message says to tick it rather than to pick an answer. Picking the answer already
 * shown changes nothing, so it would leave the answer unchecked.
 */
const TICK_KEY: Partial<Record<UiKey, UiKey>> = {
  photoCheckPedals: "photoCheckPedalsTick",
  photoCheckNoPedals: "photoCheckNoPedalsTick",
  photoCheckAsk: "photoCheckAskTick",
};

/**
 * The message for a call. When the pedals answer still needs the family's tick after the call,
 * the message says so. It is picked once, when the call lands, so a later tick never changes the
 * words and a screen reader doesn't hear them again.
 */
export function photoMessage(message: UiKey, tick: boolean): UiKey {
  return tick ? (TICK_KEY[message] ?? message) : message;
}

/** A message about something that went wrong. It is an alert, not a status. */
function isProblem(message: UiKey | null): boolean {
  return message === "photoCheckFailed" || message === "photoCheckNoWebGpu";
}

/**
 * The words on the check's one status line: what it is doing while it works, then the result.
 * Null leaves the line empty. A problem is shown as an alert instead.
 */
export function photoStatus(step: Step, progress: number, message: UiKey | null): UiKey | null {
  if (step === "working") return progress < 1 ? "photoCheckLoading" : "photoCheckRunning";
  return message !== null && !isProblem(message) ? message : null;
}

/** Where keyboard focus goes once the check moves to a step: the open button, the start button, the photo input or the pedals box. */
export type FocusTarget = "open" | "start" | "choose" | "tick";

const NEEDS_TICK: ReadonlySet<UiKey> = new Set(Object.values(TICK_KEY));

/**
 * Where keyboard focus goes after the check moves to `step`. Each step draws different controls,
 * so the one just used leaves the page, and focus must move or it drops to the page itself. While
 * a photo is checked, the photo input stays on the page, so focus stays on it. A result that says
 * to tick the pedals box moves focus to that box.
 */
export function focusAfter(step: Step, message: UiKey | null): FocusTarget {
  if (step === "closed") return "open";
  if (step === "confirm") return "start";
  return message !== null && NEEDS_TICK.has(message) ? "tick" : "choose";
}

/** The message for a call dropped because the family changed the pedals answer while the check ran. */
export function keptMessage(change: AnswerChange | null): UiKey {
  return change === "ticked" ? "photoCheckKeptTick" : "photoCheckKept";
}

/**
 * Runs one photo check and returns the message to show when it ends, or null once the card has
 * left the page. The call fills the pedals answer only while the card is on the page and the
 * family hasn't picked a pedals answer or used the pedals box since the check started. Otherwise
 * the call is dropped and the message says why. The message is picked here, once, so a later
 * tick never changes the words a screen reader already heard. A failed run throws.
 */
export async function photoCheckMessage(
  run: () => Promise<{ call: PedalCall }>,
  watch: AnswerWatch,
  onPage: () => boolean,
  onCall: (call: PedalCall) => void,
  tickAfter: (call: PedalCall) => boolean,
): Promise<UiKey | null> {
  const call = await callIfCurrent(run, () => onPage() && watch.untouched(), onCall);
  if (call !== null) return photoMessage(RESULT_KEY[call], tickAfter(call));
  return onPage() ? keptMessage(watch.change()) : null;
}

interface Props {
  lang: Lang;
  /** Called as a check starts. What it returns tracks the family's pedals answer while the check runs. */
  startCheck: () => AnswerWatch;
  onCall: (call: PedalCall) => void;
  /** True when the pedals answer will still have to be ticked once this call is applied. */
  tickAfter: (call: PedalCall) => boolean;
  /**
   * Goes up each time the family picks a pedals answer. The message is about the answer before
   * that pick, so it is cleared rather than left saying something like "the answer above is now no".
   */
  picks: number;
  /** Moves keyboard focus to the pedals box. False when the box isn't on the page. */
  focusTick: () => boolean;
}

/** Optional whole-bike photo check. It loads nothing until tapped and only ever fills the pedals answer. */
export function PedalPhotoCheck({ lang, startCheck, onCall, tickAfter, picks, focusTick }: Props) {
  const id = useId();
  const [step, setStep] = useState<Step>("closed");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<UiKey | null>(null);
  const [seenPicks, setSeenPicks] = useState(picks);
  if (picks !== seenPicks) {
    setSeenPicks(picks);
    setMessage(null);
  }
  // A language switch draws the message again in the other language, and a screen reader would
  // read it out long after it was true, like a tick instruction for a box already ticked. So the
  // switch clears it, the same as the checker's read count.
  const [seenLang, setSeenLang] = useState(lang);
  if (lang !== seenLang) {
    setSeenLang(lang);
    setMessage(null);
  }
  // False once this card leaves the page, for example when a new label is read.
  const onPage = useRef(true);
  useEffect(() => {
    onPage.current = true;
    return () => {
      onPage.current = false;
    };
  }, []);
  // The newest onCall, so a call that lands seconds after the check started is checked against
  // the facts on screen as it lands (pedalCallOn in lib/provenance.ts).
  const latestCall = useRef(onCall);
  useLayoutEffect(() => {
    latestCall.current = onCall;
  });

  const panel = useRef<HTMLDivElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // Set when the family moves the check to another step, so focus moves once that step is drawn.
  const moveFocus = useRef(false);
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    // A family that moved on to another part of the page while a photo was checked keeps their place.
    const active = document.activeElement;
    if (active && active !== document.body && !panel.current?.contains(active)) return;
    const target = focusAfter(step, message);
    if (target === "tick" && focusTick()) return;
    const to = { open: openButton, start: startButton, choose: photoInput, tick: photoInput }[target];
    to.current?.focus();
  });

  function go(next: Step) {
    moveFocus.current = true;
    setStep(next);
  }

  async function accept() {
    setMessage(null);
    const { hasWebGpu } = await import("@/lib/photo/runPedalCheck");
    if (await hasWebGpu()) {
      go("choose");
    } else {
      setMessage("photoCheckNoWebGpu");
      go("closed");
    }
  }

  async function handleFile(file: File) {
    setStep("working");
    setMessage(null);
    setProgress(0);
    // The family's own pedals answer, given while the check runs, is newer than the photo, so it wins.
    const watch = startCheck();
    try {
      const { runPedalCheck } = await import("@/lib/photo/runPedalCheck");
      const next = await photoCheckMessage(
        () => runPedalCheck(file, (p) => onPage.current && setProgress(p)),
        watch,
        () => onPage.current,
        (call) => latestCall.current(call),
        tickAfter,
      );
      if (next !== null) setMessage(next);
    } catch {
      if (onPage.current) setMessage("photoCheckFailed");
    } finally {
      if (onPage.current) go("choose");
    }
  }

  const status = photoStatus(step, progress, message);
  const working = step === "working";

  return (
    <div ref={panel} className="panel">
      <div className="space-y-2">
        {step === "closed" ? (
          <>
            <button ref={openButton} type="button" className="link-btn link-icon" onClick={() => go("confirm")}>
              {t(lang, "photoCheckOpen")}
            </button>
            <p className="meta">{t(lang, "photoCheckHelp")}</p>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            <p>{t(lang, "photoCheckSize", { mb: PEDAL_MODEL_MB })}</p>
            <p className="meta">{t(lang, "photoCheckTested")}</p>
            <div className="actions">
              <button ref={startButton} type="button" className="btn" onClick={() => void accept()}>
                {t(lang, "photoCheckStart")}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => go("closed")}>
                {t(lang, "photoCheckCancel")}
              </button>
            </div>
          </>
        ) : null}

        {/* The photo input stays on the page while a photo is checked, so keyboard focus stays on it.
            It does nothing then: a tap or Enter opens no file picker and starts no second check. */}
        {step === "choose" || working ? (
          <>
            <label htmlFor={id} className="btn w-full cursor-pointer" data-busy={working ? "true" : undefined}>
              {t(lang, "photoCheckChoose")}
            </label>
            <input
              ref={photoInput}
              id={id}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label={t(lang, "photoCheckChoose")}
              aria-disabled={working ? true : undefined}
              onClick={(e) => {
                if (working) e.preventDefault();
              }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && !working) void handleFile(file);
                e.target.value = "";
              }}
            />
          </>
        ) : null}

        {message && isProblem(message) ? (
          <p role="alert" className="field-error">
            {t(lang, message)}
          </p>
        ) : null}
      </div>

      {/* Always on the page, empty until there is something to say, so a screen reader reads out
          each change: the working words, then the result. A line put on the page already holding
          its words is often not read out. */}
      <p role="status" className={step === "working" ? "mt-2" : "mt-2 font-semibold"}>
        {status ? t(lang, status) : ""}
      </p>
      {step === "working" && progress < 1 ? (
        <div className="bar mt-1">
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}
