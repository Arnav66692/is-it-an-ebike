"use client";

// Small form controls with large tap targets and real labels, so the page works with
// screen readers and on a phone held in one hand.

import { useId, type ReactNode } from "react";

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface ChoiceProps<T extends string> {
  legend: string;
  help?: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

/** A row of buttons that act as one radio group. */
export function Choice<T extends string>({ legend, help, options, value, onChange }: ChoiceProps<T>) {
  const name = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{legend}</legend>
      {help ? <p className="text-sm text-muted">{help}</p> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="choice">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              aria-label={o.label}
              className="sr-only"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  evidence?: ReactNode;
}

export function NumberField({ label, value, onChange, min, max, step = 1, help, evidence }: NumberFieldProps) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {help ? <p className="text-sm text-muted">{help}</p> : null}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
        className="field w-36"
      />
      {evidence}
    </div>
  );
}

export function Evidence({ label, texts }: { label: string; texts?: string[] }) {
  if (!texts || texts.length === 0) return null;
  return (
    <p className="text-xs text-muted">
      {label}: {texts.slice(0, 2).map((t, i) => (
        <q key={i} className="mx-1 rounded bg-sunk px-1 py-0.5 font-mono not-italic">
          {t}
        </q>
      ))}
    </p>
  );
}

export function Card({ title, step, children }: { title: string; step?: number; children: ReactNode }) {
  return (
    <section className="card space-y-4" aria-labelledby={`${title}-h`}>
      <h2 id={`${title}-h`} className="flex items-center gap-2 text-lg font-bold">
        {step ? (
          <span aria-hidden="true" className="step">
            {step}
          </span>
        ) : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function triValue(v: boolean | null): "yes" | "no" | "unsure" | null {
  if (v === true) return "yes";
  if (v === false) return "no";
  return null;
}

export function fromTri(v: "yes" | "no" | "unsure"): boolean | null {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}
