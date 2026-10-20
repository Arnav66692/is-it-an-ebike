"use client";

// Small form controls with large tap targets and real labels, so the page works with
// screen readers and on a phone held in one hand.

import { useId, useState, type ReactNode } from "react";
import { numberInRange } from "@/lib/checkerState";

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
  /** Shown when the typed number is outside min to max. The fact then stays unknown. */
  rangeError?: string;
}

/**
 * A number box that passes on only a number from min to max. Anything else counts as unknown
 * and shows an error, so a typo or a millimeter size can't settle a rule. The typed text is kept,
 * so the family can see and fix it.
 */
export function NumberField({ label, value, onChange, min, max, step = 1, help, evidence, rangeError }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  const [shown, setShown] = useState(value);
  const [left, setLeft] = useState(false);
  // The value can change from outside, for example a "not sure" button. Show it then.
  if (value !== shown) {
    setShown(value);
    if (numberInRange(text, min, max) !== value) setText(value === null ? "" : String(value));
  }
  const invalid = text.trim() !== "" && numberInRange(text, min, max) === null;
  const overMax = max !== undefined && Number(text) > max;
  const showError = invalid && (left || overMax);
  const errorId = `${id}-range`;
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
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = numberInRange(raw, min, max);
          setShown(n);
          if (n !== value) onChange(n);
        }}
        onBlur={() => setLeft(true)}
        aria-invalid={showError}
        aria-describedby={showError && rangeError ? errorId : undefined}
        className="field w-36"
      />
      {showError && rangeError ? (
        <p id={errorId} role="alert" className="text-sm font-semibold">
          {rangeError}
        </p>
      ) : null}
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
      {/* tabIndex -1 lets the page move keyboard focus to a card's heading without adding a tab stop. */}
      <h2 id={`${title}-h`} tabIndex={-1} className="flex items-center gap-2 text-lg font-bold">
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
