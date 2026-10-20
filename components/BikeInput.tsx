"use client";

import { useId, useRef, useState } from "react";
import type { RequestGate } from "@/lib/checkerState";
import { parseSpecText, type Extraction, type TextSource } from "@/lib/extract/parse";
import type { Lang } from "@/lib/i18n/names";
import { t, type UiKey } from "@/lib/i18n/ui";
import { Card } from "./controls";

type Tab = "label" | "link" | "type";

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
async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.92));
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
    <div className="space-y-3">
      <p>{t(lang, "labelHelp")}</p>
      <label htmlFor={id} className="btn w-full cursor-pointer">
        {t(lang, "choosePhoto")}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {progress !== null ? (
        <div role="status" aria-live="polite" className="space-y-1">
          <p className="text-sm">{t(lang, "reading")}</p>
          <div className="bar">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-semibold">
          {t(lang, error)}
        </p>
      ) : null}
      <p className="text-sm text-muted">{t(lang, "labelPrivacy")}</p>
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
      <label htmlFor={urlId} className="block font-semibold">
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
        <button type="button" className="btn" disabled={busy || url.trim().length === 0} onClick={() => void fetchLink()}>
          {busy ? t(lang, "fetching") : t(lang, "fetch")}
        </button>
      </div>
      <p className="text-sm text-muted">{t(lang, "linkPrivacy")}</p>
      {error ? (
        <p role="alert" className="text-sm font-semibold">
          {t(lang, error)}
        </p>
      ) : null}
      <label htmlFor={textId} className="block pt-2 font-semibold">
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

export function BikeInput({ lang, onRead, onManual, gate }: Props) {
  const [tab, setTab] = useState<Tab>("label");
  const tabs: { id: Tab; key: UiKey }[] = [
    { id: "label", key: "tabLabel" },
    { id: "link", key: "tabLink" },
    { id: "type", key: "tabType" },
  ];
  return (
    <Card title={t(lang, "step2")} step={2}>
      <div role="tablist" className="tabs" aria-label={t(lang, "step2")}>
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => {
              // A label or link still being read is for the tab the family just left.
              if (x.id !== tab) gate.cancel();
              setTab(x.id);
              if (x.id === "type") onManual();
            }}
          >
            {t(lang, x.key)}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "label" ? <LabelReader lang={lang} onRead={onRead} gate={gate} /> : null}
        {tab === "link" ? <LinkReader lang={lang} onRead={onRead} gate={gate} /> : null}
        {tab === "type" ? <p className="text-sm text-muted">{t(lang, "step3Help")}</p> : null}
      </div>
    </Card>
  );
}
