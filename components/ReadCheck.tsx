"use client";

// The words a fact was read from, and the box the family ticks once it matches the bike. A fact
// read from a link or photo stays marked until it is ticked or changed, and until then the bottom
// line can't say YES (lib/provenance.ts, lib/rules/bottomLine.ts).

import { useId, type Ref } from "react";
import { quoteText, type Evidence as Ev } from "@/lib/extract/parse";
import type { FactCheck } from "@/lib/provenance";
import type { ReadField } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { t, type UiKey } from "@/lib/i18n/ui";
import { READ_FIELD_NAMES } from "@/lib/i18n/verdicts";
import { Evidence } from "./controls";

export type OnConfirm = (field: ReadField, confirmed: boolean) => void;

interface CheckProps {
  lang: Lang;
  field: ReadField;
  check: FactCheck | undefined;
  onConfirm: OnConfirm;
  /** The words next to the box, when "It matches the bike" doesn't say enough, like two wheel sizes. */
  matchesKey?: UiKey;
  /** Set to the box while it is on the page, so the page can move keyboard focus to it. */
  boxRef?: Ref<HTMLInputElement>;
  /** The words the fact was read from, shown in the same row as its mark. */
  quotes?: string[];
}

/** The words a fact was read from, as quotes, at most two. */
function Quotes({ texts }: { texts: string[] }) {
  return (
    <>
      {texts.slice(0, 2).map((text, i) => (
        <span key={i}>
          {i > 0 ? " " : null}
          <q className="quote">{text}</q>
        </span>
      ))}
    </>
  );
}

/**
 * Nothing for a fact the family typed. A short line for a read fact they changed or answered,
 * since it is theirs now. For any other read fact, one tinted row: a short mark that says where
 * it was read, the words it was read from, and the box. Ticking the box turns the mark into
 * "Checked against the bike" in the same place, at the same size, so the box never moves under the
 * finger and a quick second tap still lands on it.
 */
export function ReadCheck({ lang, field, check, onConfirm, matchesKey, boxRef, quotes = [] }: CheckProps) {
  const noteId = useId();
  if (!check) return null;
  if (check.status === "theirs") {
    return (
      <p className="read-theirs" data-read-check="theirs">
        {t(lang, "readTheirs")}
      </p>
    );
  }
  const ticked = check.status === "ticked";
  const photo = check.source === "photo";
  const words = matchesKey ? t(lang, matchesKey) : t(lang, "readMatches");
  const markText = t(lang, photo ? "readMarkPhoto" : "readMarkText");
  return (
    <div className="read-check" data-confirmed={ticked ? "true" : "false"}>
      <p id={noteId} className="read-line">
        <span className={ticked ? "read-mark read-mark-done" : "read-mark"} data-read-mark={check.status}>
          <span aria-hidden="true" className="read-mark-icon">
            {ticked ? "\u2713" : "!"}
          </span>
          {/* Both words share one grid cell, so the mark keeps the width of the longer one. Only
              the words for the box's state are visible, and only they are read out. */}
          <span className="read-mark-words">
            <span className={ticked ? "invisible" : undefined}>{markText}</span>
            <span className={ticked ? undefined : "invisible"}>{t(lang, "readMarkChecked")}</span>
          </span>
        </span>
        {quotes.length > 0 ? (
          <span className="read-quote">
            {/* After the photo check, the text's words are what it said before, since they may say the opposite. */}
            {photo ? `${t(lang, "readFromBefore")}: ` : null}
            <Quotes texts={quotes} />
          </span>
        ) : null}
      </p>
      <label className="check">
        <input
          ref={boxRef}
          type="checkbox"
          checked={ticked}
          data-read-check={check.status}
          onChange={(e) => onConfirm(field, e.target.checked)}
          aria-label={matchesKey ? words : t(lang, "readMatchesFor", { field: READ_FIELD_NAMES[lang][field] })}
          aria-describedby={ticked ? undefined : noteId}
        />
        <span>{words}</span>
      </label>
    </div>
  );
}

interface NoteProps extends Omit<CheckProps, "quotes"> {
  evidence: Ev[] | undefined;
}

/**
 * The row for a read fact still to check: its mark, the words it was read from and its box. A fact
 * the family set themselves keeps the words it was read from, as "Read from", above the line that
 * says it counts as checked.
 */
export function ReadNote({ lang, field, check, onConfirm, evidence, matchesKey, boxRef }: NoteProps) {
  const quotes = evidence?.map(quoteText) ?? [];
  if (check && check.status !== "theirs") {
    return <ReadCheck lang={lang} field={field} check={check} onConfirm={onConfirm} matchesKey={matchesKey} boxRef={boxRef} quotes={quotes} />;
  }
  return (
    <>
      <Evidence label={t(lang, "readFrom")} texts={quotes} />
      <ReadCheck lang={lang} field={field} check={check} onConfirm={onConfirm} matchesKey={matchesKey} boxRef={boxRef} />
    </>
  );
}
