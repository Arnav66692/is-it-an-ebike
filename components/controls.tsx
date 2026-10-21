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
      <legend className="field-label">{legend}</legend>
      {help ? <p className="help">{help}</p> : null}
      <div className="flex flex-wrap gap-2 pt-1">
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
  help?: string;
  evidence?: ReactNode;
  /** Shown when the typed number is outside min to max. The fact then stays unknown. */
  rangeError?: string;
}

/**
 * A number box that passes on only a number from min to max. Anything else counts as unknown
 * and shows an error, so a typo or a millimeter size can't settle a rule. The typed text is kept,
 * so the family can see and fix it.
 *
 * It is a text box with a number keypad, not type="number". A number input changes its value on
 * a mouse wheel turn, a trackpad swipe or an arrow key, and a screen reader's arrow keys can do
 * it too. A change nobody typed must never stand in for a fact the family checked, so only typing
 * changes the number here (the GOV.UK Design System gives the same advice for number inputs).
 */
export function NumberField({ label, value, onChange, min, max, help, evidence, rangeError }: NumberFieldProps) {
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
    <div className="space-y-2">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {help ? <p className="help">{help}</p> : null}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
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
        className="field w-40 max-w-full"
      />
      {showError && rangeError ? (
        <p id={errorId} role="alert" className="field-error">
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
    <p className="meta">
      {label}:{" "}
      {texts.slice(0, 2).map((t, i) => (
        <span key={i}>
          {i > 0 ? " " : null}
          <q className="quote">{t}</q>
        </span>
      ))}
    </p>
  );
}

interface CardProps {
  title: string;
  step?: number;
  /** The heading level. A step is an h2. A card inside a step, like the follow-up questions, is an h3. */
  level?: 2 | 3;
  children: ReactNode;
}

export function Card({ title, step, level = 2, children }: CardProps) {
  // An id from useId, not from the title. aria-labelledby is a list split on spaces, so a title
  // like "Check the facts" would point at ids that don't exist and leave the region unnamed.
  const headingId = useId();
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <section className="card space-y-5" aria-labelledby={headingId}>
      {/* tabIndex -1 lets the page move keyboard focus to a card's heading without adding a tab stop. */}
      <Heading id={headingId} tabIndex={-1} className="card-title">
        {step ? (
          <span aria-hidden="true" className="step">
            {step}
          </span>
        ) : null}
        {title}
      </Heading>
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

/**
 * A step that comes later, shown as a quiet outline with its number, so the four steps show
 * from the start. It holds only a short line about what fills it.
 */
export function LaterStep({ title, step, hint }: { title: string; step: number; hint: string }) {
  const headingId = useId();
  return (
    <section className="card card-later space-y-1" aria-labelledby={headingId}>
      <h2 id={headingId} className="card-title">
        <span aria-hidden="true" className="step">
          {step}
        </span>
        {title}
      </h2>
      <p className="help pl-10">{hint}</p>
    </section>
  );
}
