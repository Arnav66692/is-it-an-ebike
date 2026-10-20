"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n/names";
import { t, type UiKey } from "@/lib/i18n/ui";
import { callIfCurrent, PEDAL_MODEL_MB, type PedalCall } from "@/lib/photo/pedalRule";

type Step = "closed" | "confirm" | "choose" | "working";

const RESULT_KEY: Record<PedalCall, UiKey> = {
  pedals: "photoCheckPedals",
  no_pedals: "photoCheckNoPedals",
  ask: "photoCheckAsk",
};

/** The same result, for when the pedals answer still has to be ticked before the answer can say YES. */
const TICK_KEY: Partial<Record<UiKey, UiKey>> = {
  photoCheckPedals: "photoCheckPedalsTick",
  photoCheckNoPedals: "photoCheckNoPedalsTick",
};

/** The message to show. A right call still needs the family's tick, so the message says so while the box is empty. */
export function photoMessage(message: UiKey, needsTick: boolean): UiKey {
  return needsTick ? (TICK_KEY[message] ?? message) : message;
}

interface Props {
  lang: Lang;
  /** Called as a check starts. The check it returns turns false once the family picks a pedals answer. */
  startCheck: () => () => boolean;
  onCall: (call: PedalCall) => void;
  /** True while the pedals answer is read and not yet checked against the bike. */
  needsTick: boolean;
}

/** Optional whole-bike photo check. It loads nothing until tapped and only ever fills the pedals answer. */
export function PedalPhotoCheck({ lang, startCheck, onCall, needsTick }: Props) {
  const id = useId();
  const [step, setStep] = useState<Step>("closed");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<UiKey | null>(null);
  // False once this card leaves the page, for example when a new label is read.
  const onPage = useRef(true);
  useEffect(() => {
    onPage.current = true;
    return () => {
      onPage.current = false;
    };
  }, []);

  async function accept() {
    setMessage(null);
    const { hasWebGpu } = await import("@/lib/photo/runPedalCheck");
    if (await hasWebGpu()) {
      setStep("choose");
    } else {
      setMessage("photoCheckNoWebGpu");
      setStep("closed");
    }
  }

  async function handleFile(file: File) {
    setStep("working");
    setMessage(null);
    setProgress(0);
    // The family's own pedals answer, picked while the check runs, is newer than the photo, so it wins.
    const untouched = startCheck();
    try {
      const { runPedalCheck } = await import("@/lib/photo/runPedalCheck");
      const call = await callIfCurrent(
        () => runPedalCheck(file, (p) => onPage.current && setProgress(p)),
        () => onPage.current && untouched(),
        onCall,
      );
      if (call !== null) setMessage(RESULT_KEY[call]);
      else if (onPage.current) setMessage("photoCheckKept");
    } catch {
      if (onPage.current) setMessage("photoCheckFailed");
    } finally {
      if (onPage.current) setStep("choose");
    }
  }

  const isProblem = message === "photoCheckFailed" || message === "photoCheckNoWebGpu";

  return (
    <div className="space-y-2 rounded-lg bg-sunk p-3">
      {step === "closed" ? (
        <>
          <button type="button" className="btn btn-quiet" onClick={() => setStep("confirm")}>
            {t(lang, "photoCheckOpen")}
          </button>
          <p className="text-sm text-muted">{t(lang, "photoCheckHelp")}</p>
        </>
      ) : null}

      {step === "confirm" ? (
        <>
          <p className="text-sm">{t(lang, "photoCheckSize", { mb: PEDAL_MODEL_MB })}</p>
          <p className="text-sm text-muted">{t(lang, "photoCheckTested")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => void accept()}>
              {t(lang, "photoCheckStart")}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setStep("closed")}>
              {t(lang, "photoCheckCancel")}
            </button>
          </div>
        </>
      ) : null}

      {step === "choose" ? (
        <>
          <label htmlFor={id} className="btn w-full cursor-pointer">
            {t(lang, "photoCheckChoose")}
          </label>
          <input
            id={id}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label={t(lang, "photoCheckChoose")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </>
      ) : null}

      {step === "working" ? (
        <div role="status" aria-live="polite" className="space-y-1">
          <p className="text-sm">{progress < 1 ? t(lang, "photoCheckLoading") : t(lang, "photoCheckRunning")}</p>
          {progress < 1 ? (
            <div className="bar">
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p role={isProblem ? "alert" : "status"} className="text-sm font-semibold">
          {t(lang, photoMessage(message, needsTick))}
        </p>
      ) : null}
    </div>
  );
}
