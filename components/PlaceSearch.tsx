"use client";

// "Where do they ride?": one search box for any US state, county, city, town or community. It is
// an ARIA 1.2 combobox with a list of results, so it works with the arrow keys, Enter and Escape,
// and a screen reader hears how many places matched. The place index loads the first time the
// box is used. Each pick shows as a chip with a labeled remove button.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { placeHint, type Lang } from "@/lib/i18n/names";
import { isUiKey, t } from "@/lib/i18n/ui";
import { pickLabels, type PickLabels } from "@/lib/places/linked";
import { loadPlaceIndex } from "@/lib/places/load";
import { resolvePlace } from "@/lib/places/resolve";
import { enterChoice, placeLabel, searchResults, type PlaceLabel } from "@/lib/places/search";
import type { PlaceEntry, PlaceIndex } from "@/lib/places/types";

/** Where the list's highlight is. -1 means no option is highlighted. */
export interface ComboState {
  open: boolean;
  active: number;
}

export const CLOSED: ComboState = { open: false, active: -1 };

export interface ComboKeyResult {
  next: ComboState;
  /** The option to pick, or null. */
  pick: number | null;
  /** True when Escape on a closed list clears the box. */
  clear: boolean;
  /** True when the key was used here, so the browser's own action is stopped. */
  handled: boolean;
}

/**
 * What a key does in the search box, following the ARIA 1.2 combobox pattern. Down and Up open
 * the list and move the highlight, wrapping at the ends. Enter picks the highlighted place. With
 * none highlighted, it picks `enterPick`, the one place the typed name can only mean in the
 * answer's state (enterChoice in lib/places/search.ts), or else highlights the first place, so a
 * place the family hasn't seen is never picked for them. On a closed list with text in the box,
 * Enter (a phone keyboard's Search key) opens the list again and picks nothing. Escape closes the
 * list, and on a closed list clears the box.
 */
export function comboKey(state: ComboState, key: string, count: number, hasText: boolean, enterPick: number | null = null): ComboKeyResult {
  const none = { pick: null, clear: false, handled: true };
  switch (key) {
    case "ArrowDown":
      if (count === 0) return { next: { open: true, active: -1 }, ...none };
      return { next: { open: true, active: state.open ? (state.active + 1) % count : 0 }, ...none };
    case "ArrowUp":
      if (count === 0) return { next: { open: true, active: -1 }, ...none };
      return { next: { open: true, active: state.open && state.active > 0 ? state.active - 1 : count - 1 }, ...none };
    case "Enter":
      if (count === 0) return { next: state, pick: null, clear: false, handled: false };
      if (!state.open) return hasText ? { next: { open: true, active: -1 }, ...none } : { next: state, pick: null, clear: false, handled: false };
      if (state.active >= 0 && state.active < count) return { next: CLOSED, pick: state.active, clear: false, handled: true };
      if (enterPick !== null && enterPick >= 0 && enterPick < count) return { next: CLOSED, pick: enterPick, clear: false, handled: true };
      return { next: { open: true, active: 0 }, ...none };
    case "Escape":
      if (state.open) return { next: CLOSED, ...none };
      return { next: CLOSED, pick: null, clear: hasText, handled: hasText };
    case "Tab":
      return { next: CLOSED, pick: null, clear: false, handled: false };
    default:
      return { next: state, pick: null, clear: false, handled: false };
  }
}

/** The words a screen reader hears about the list: loading, a failed load, no match, or how many matched. */
export function comboStatus(lang: Lang, query: string, loading: boolean, failed: boolean, count: number): string {
  if (failed) return t(lang, "whereFailed");
  if (query.trim() === "") return "";
  if (loading) return t(lang, "whereLoading");
  if (count === 0) return t(lang, "whereNone");
  return count === 1 ? t(lang, "whereCountOne") : t(lang, "whereCountMany", { n: count });
}

/** True when the status line is shown on the page: a failed load, or text typed while loading or with no match. */
export function statusVisible(query: string, loading: boolean, failed: boolean, count: number): boolean {
  if (failed) return true;
  return query.trim() !== "" && (loading || count === 0);
}

/** The second line of a result: what kind of place it is, then its county and state. */
export function resultDetail(entry: PlaceEntry, label: PlaceLabel, lang: Lang): string {
  const key = `kind_${entry.kind}`;
  const kind = isUiKey(key) ? t(lang, key) : "";
  if (entry.kind === "state") return kind;
  return [kind, label.where, label.state].filter(Boolean).join(", ");
}

/**
 * A short cue under a checked record's own result, like "Includes Carmel Valley, Pacific Highlands
 * Ranch and the CCA area" under the City of San Diego. Empty for every other place.
 */
export function resultHint(entry: PlaceEntry, lang: Lang): string {
  const r = resolvePlace(entry);
  if (!r.localRecord || (r.why !== "checked_city" && r.why !== "sd_county")) return "";
  return placeHint(r.localRecord, lang);
}

export interface ChipPick {
  id: string;
  label: PlaceLabel;
  /** The chip's second line, the same as the result's, like "City, San Diego County, CA". */
  detail: string;
}

interface Props {
  lang: Lang;
  /** The state the answer uses now. Enter on its own only picks a place in this state. */
  state: string;
  /** The places picked so far, labeled in the page's language. */
  picks: ChipPick[];
  onPick: (entry: PlaceEntry, labels: PickLabels) => void;
  onRemove: (id: string) => void;
  /** Loads the place index. Tests pass their own. */
  loadIndex?: () => Promise<PlaceIndex>;
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="20" height="20" className="combo-icon">
      <circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M13 13l4.25 4.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * For this long after a place is picked or removed, a tap on a chip's remove button does nothing.
 * A new chip can land right under the finger that picked it, and a quick second tap must not remove it.
 */
export const CHIP_GUARD_MS = 450;

/** True when a remove tap comes too soon after the last pick or removal to be meant for the chip now there. */
export function tooSoonToRemove(now: number, lastChange: number): boolean {
  return now - lastChange < CHIP_GUARD_MS;
}

/**
 * Where focus goes after a chip is removed: the remove button of the chip that took its place, or
 * of the one before it. With no chip left, a keyboard or mouse goes back to the search box, and a
 * touch goes to the box's label, so a phone doesn't open its keyboard over half the screen.
 */
export function focusAfterRemove(at: number, left: number, touch: boolean): { chip: number } | "input" | "label" {
  if (left > 0) return { chip: Math.min(at, left - 1) };
  return touch ? "label" : "input";
}

export function PlaceSearch({ lang, state, picks, onPick, onRemove, loadIndex = loadPlaceIndex }: Props) {
  const inputId = useId();
  const helpId = useId();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const label = useRef<HTMLLabelElement>(null);
  const chips = useRef<HTMLUListElement>(null);
  // When the last pick or removal happened, and how the last remove button was pressed.
  const lastChange = useRef(0);
  const pointer = useRef<string | null>(null);
  // Set by a removal, so focus moves once the chips are drawn again.
  const refocus = useRef<{ at: number; touch: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [combo, setCombo] = useState<ComboState>(CLOSED);
  const [index, setIndex] = useState<PlaceIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  /** Starts loading the index the first time the box is used, and again after a failed load. */
  function ensureIndex() {
    if (index || loading) return;
    setLoading(true);
    setFailed(false);
    loadIndex()
      .then((loaded) => {
        setIndex(loaded);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setFailed(true);
      });
  }

  const found = useMemo(() => (index && query.trim() !== "" ? searchResults(index, query) : []), [index, query]);
  const results = found.map((r) => r.entry);
  const expanded = combo.open && results.length > 0;
  const optionId = (i: number) => `${listId}-o${i}`;
  const status = comboStatus(lang, query, loading || (index === null && !failed), failed, results.length);
  // The count is only read out, since the list shows it. Loading, no match and a failed load are
  // shown too, so a family who mistypes sees why no list opened.
  const statusShown = statusVisible(query, loading || (index === null && !failed), failed, results.length);

  // After a chip is removed, focus moves to the chip that took its place, or back to the search.
  useEffect(() => {
    const want = refocus.current;
    if (!want) return;
    refocus.current = null;
    const target = focusAfterRemove(want.at, picks.length, want.touch);
    if (target === "input") input.current?.focus();
    else if (target === "label") label.current?.focus();
    else chips.current?.querySelectorAll?.<HTMLButtonElement>(".chip-remove")[target.chip]?.focus();
  }, [picks.length]);

  // The highlighted place stays in view as the arrow keys move through a list that scrolls.
  useEffect(() => {
    if (!expanded || combo.active < 0) return;
    const option = list.current?.children?.[combo.active] as HTMLElement | undefined;
    option?.scrollIntoView?.({ block: "nearest" });
  }, [expanded, combo.active]);

  function pick(i: number) {
    const entry = results[i];
    if (!entry || !index) return;
    onPick(entry, pickLabels(index, entry));
    lastChange.current = Date.now();
    setQuery("");
    setCombo(CLOSED);
    input.current?.focus();
  }

  /** Opens the list again for the text still in the box, when it was closed by a tap elsewhere. */
  function reopen() {
    if (!combo.open && query.trim() !== "") setCombo({ open: true, active: -1 });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {/* tabIndex -1 lets focus land here after the last chip is removed by touch, with no keyboard popping up. */}
        <label ref={label} htmlFor={inputId} className="field-label" tabIndex={-1}>
          {t(lang, "whereLabel")}
        </label>
        <p id={helpId} className="help">
          {t(lang, "whereHelp")}
        </p>
      </div>
      <div className="combo">
        <div className="combo-field">
          <SearchIcon />
          <input
            ref={input}
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={expanded && combo.active >= 0 ? optionId(combo.active) : undefined}
            aria-describedby={helpId}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={t(lang, "wherePlaceholder")}
            value={query}
            className="field combo-input"
            onFocus={() => {
              ensureIndex();
              reopen();
            }}
            onClick={reopen}
            onChange={(e) => {
              ensureIndex();
              setQuery(e.target.value);
              setCombo({ open: true, active: -1 });
            }}
            onKeyDown={(e) => {
              const r = comboKey(combo, e.key, results.length, query !== "", enterChoice(found, state));
              if (r.handled) e.preventDefault();
              if (r.pick !== null) {
                pick(r.pick);
                return;
              }
              if (r.clear) setQuery("");
              setCombo(r.next);
            }}
            onBlur={() => setCombo(CLOSED)}
          />
        </div>
        <ul ref={list} id={listId} role="listbox" aria-label={t(lang, "whereResults")} hidden={!expanded} className="combo-list">
          {results.map((entry, i) => {
            const label = index ? placeLabel(index, entry, lang) : null;
            if (!label) return null;
            const checked = resolvePlace(entry).checked;
            const hint = resultHint(entry, lang);
            return (
              <li
                key={entry.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === combo.active}
                className="combo-option"
                // Keeps focus in the box, so a tap picks the place without closing the list first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className="combo-name">{label.name}</span>
                <span className="combo-where">{resultDetail(entry, label, lang)}</span>
                {hint ? <span className="combo-where">{hint}</span> : null}
                {checked ? <span className="combo-checked">{t(lang, "whereChecked")}</span> : null}
              </li>
            );
          })}
        </ul>
      </div>
      {/* Always on the page, so a screen reader hears each change in the count. */}
      <p role="status" className={statusShown ? "combo-status" : "sr-only"} data-shown={statusShown ? "true" : "false"}>
        {status}
      </p>
      {picks.length > 0 ? (
        // role="list" keeps the list and its name for VoiceOver, which drops them from a list styled with no bullets.
        <ul ref={chips} className="chips" role="list" aria-label={t(lang, "wherePicked")}>
          {picks.map((p, i) => (
            <li key={p.id} className="chip">
              <span className="chip-text">
                <span className="chip-name">{p.label.name}</span>
                {p.detail ? <span className="chip-where">{p.detail}</span> : null}
              </span>
              <button
                type="button"
                className="chip-remove"
                aria-label={t(lang, "whereRemove", { place: p.label.text })}
                title={t(lang, "whereRemove", { place: p.label.text })}
                onPointerDown={(e) => {
                  pointer.current = e.pointerType;
                }}
                onClick={() => {
                  const touch = pointer.current === "touch" || pointer.current === "pen";
                  pointer.current = null;
                  const now = Date.now();
                  if (tooSoonToRemove(now, lastChange.current)) return;
                  lastChange.current = now;
                  refocus.current = { at: i, touch };
                  onRemove(p.id);
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
