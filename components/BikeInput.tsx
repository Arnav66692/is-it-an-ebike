"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { tabTap, type InputTab, type RequestGate } from "@/lib/checkerState";
import { parseSpecText, type Extraction, type TextSource } from "@/lib/extract/parse";
import { shrinkPhoto } from "@/lib/photo/shrink";
import type { Lang } from "@/lib/i18n/names";
import { t, type UiKey } from "@/lib/i18n/ui";
import { Card } from "./controls";

type Tab = InputTab;

interface Props {
  lang: Lang;
  onRead: (extraction: Extraction, source: TextSource) => void;
  onManual: () => void;
  /** Only the newest read may fill in the facts. Switching tabs drops the older ones. */
  gate: RequestGate;
}

type ReaderProps = Pick<Props, "lang" | "onRead" | "gate">;

const MAX_SIDE = 2000;

/** Shrinks big phone photos before OCR so it runs faster. The image never leaves the device. */
function prepareImage(file: File): Promise<Blob> {
  return shrinkPhoto(file, MAX_SIDE, "image/jpeg", 0.92);
}

function LabelReader({ lang, onRead, gate }: ReaderProps) {
  const id = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<UiKey | null>(null);
  // The photo this reader is busy with. Picking a second photo makes the first one's progress stale.
  const job = useRef(0);

  async function handleFile(file: File) {
    const isCurrent = gate.start();
    job.current += 1;
    const mine = job.current;
    setError(null);
    setProgress(0);
    try {
      const image = await prepareImage(file);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text" && isCurrent()) setProgress(m.progress);
        },
      });
      const { data } = await worker.recognize(image);
      await worker.terminate();
      // The family moved on while this ran, so this label is no longer the bike being checked.
      if (!isCurrent()) return;
      const extraction = parseSpecText(data.text, "label");
      if (Object.keys(extraction.facts).length === 0) setError("readFailed");
      onRead(extraction, "label");
    } catch {
      if (isCurrent()) setError("readFailed");
    } finally {
      if (job.current === mine) setProgress(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="help">{t(lang, "labelHelp")}</p>
      <label htmlFor={id} className="btn w-full cursor-pointer">
        {t(lang, "choosePhoto")}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {/* The status line is always on the page, empty until a photo is read, so a screen reader
          hears "Reading the label" when it appears. A live region added with its words already in
          it is often not read out. */}
      <p role="status" className={progress !== null ? "meta" : "sr-only"}>
        {progress !== null ? t(lang, "reading") : ""}
      </p>
      {progress !== null ? (
        <div className="bar" role="progressbar" aria-label={t(lang, "reading")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="field-error">
          {t(lang, error)}
        </p>
      ) : null}
      <p className="meta">{t(lang, "labelPrivacy")}</p>
    </div>
  );
}

function LinkReader({ lang, onRead, gate }: ReaderProps) {
  const urlId = useId();
  const textId = useId();
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiKey | null>(null);

  async function fetchLink() {
    const isCurrent = gate.start();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = (await res.json()) as { ok: boolean; text?: string; error?: string };
      // The family moved on while this loaded, for example by pasting text or typing the facts in.
      if (!isCurrent()) return;
      if (!body.ok || !body.text) {
        const map: Record<string, UiKey> = { invalid: "linkInvalid", blocked: "linkBlocked", limited: "linkLimited" };
        setError(map[body.error ?? ""] ?? "linkFailed");
        return;
      }
      const extraction = parseSpecText(body.text, "listing");
      if (Object.keys(extraction.facts).length === 0) setError("nothingFound");
      onRead(extraction, "listing");
    } catch {
      if (isCurrent()) setError("linkFailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label htmlFor={urlId} className="field-label">
        {t(lang, "linkHelp")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={urlId}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="field flex-1"
        />
        <button type="button" className="btn btn-go" disabled={busy || url.trim().length === 0} onClick={() => void fetchLink()}>
          {busy ? t(lang, "fetching") : t(lang, "fetch")}
        </button>
      </div>
      <p className="meta">{t(lang, "linkPrivacy")}</p>
      {error ? (
        <p role="alert" className="field-error">
          {t(lang, error)}
        </p>
      ) : null}
      <label htmlFor={textId} className="field-label border-t border-line pt-4">
        {t(lang, "pasteLabel")}
      </label>
      <textarea id={textId} rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} className="field w-full" />
      <button
        type="button"
        className="btn btn-quiet"
        disabled={paste.trim().length === 0}
        onClick={() => {
          // Pasted text is read at once, and any link still loading no longer counts.
          gate.start();
          const extraction = parseSpecText(paste, "listing");
          setError(Object.keys(extraction.facts).length === 0 ? "nothingFound" : null);
          onRead(extraction, "listing");
        }}
      >
        {t(lang, "readText")}
      </button>
    </div>
  );
}

const TABS: { id: Tab; key: UiKey }[] = [
  { id: "label", key: "tabLabel" },
  { id: "link", key: "tabLink" },
  { id: "type", key: "tabType" },
];

/**
 * The tab the arrow keys move to, following the ARIA tabs pattern: Left and Right wrap, Home and
 * End go to the ends. Null for any other key. Moving only moves focus. Enter or Space opens the
 * tab, since opening "Type it in" starts a new bike (manual activation in the pattern).
 */
export function tabKey(index: number, key: string, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function BikeInput({ lang, onRead, onManual, gate }: Props) {
  const [tab, setTab] = useState<Tab>("label");
  const baseId = useId();
  const tabId = (id: Tab) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function open(next: Tab) {
    const tap = tabTap(tab, next);
    if (!tap.change) return;
    // A label or link still being read is for the tab the family just left.
    gate.cancel();
    setTab(next);
    if (tap.manual) onManual();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to = tabKey(index, e.key, TABS.length);
    if (to === null) return;
    e.preventDefault();
    buttons.current[to]?.focus();
  }

  return (
    <Card title={t(lang, "step2")} step={2}>
      <div role="tablist" className="tabs" aria-label={t(lang, "step2")}>
        {TABS.map((x, i) => (
          <button
            key={x.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            id={tabId(x.id)}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            aria-controls={panelId}
            // Only the open tab is a Tab stop. The arrow keys move between the tabs.
            tabIndex={tab === x.id ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => open(x.id)}
          >
            {t(lang, x.key)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)} className="pt-1">
        {tab === "label" ? <LabelReader lang={lang} onRead={onRead} gate={gate} /> : null}
        {tab === "link" ? <LinkReader lang={lang} onRead={onRead} gate={gate} /> : null}
        {tab === "type" ? <p className="help">{t(lang, "typeHelp")}</p> : null}
      </div>
    </Card>
  );
}
