"use client";

// The words a fact was read from, and the box the family ticks once it matches the bike. A fact
// read from a link or photo stays marked until it is ticked or changed, and until then the bottom
// line can't say YES (lib/provenance.ts, lib/rules/bottomLine.ts).

import { useId } from "react";
import type { Evidence as Ev } from "@/lib/extract/parse";
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
}

/**
 * Nothing for a fact the family typed. A short line for a read fact they changed or answered,
 * since it is theirs now. For any other read fact, the mark while it is not checked, and the box.
 */
export function ReadCheck({ lang, field, check, onConfirm, matchesKey }: CheckProps) {
  const noteId = useId();
  if (!check) return null;
  if (check.status === "theirs") {
    return (
      <p className="read-check text-sm text-muted" data-read-check="theirs">
        {t(lang, "readTheirs")}
      </p>
    );
  }
  const ticked = check.status === "ticked";
  const words = matchesKey ? t(lang, matchesKey) : t(lang, "readMatches");
  return (
    <div className="read-check space-y-1" data-confirmed={ticked ? "true" : "false"}>
      {ticked ? null : (
        <p id={noteId} className="read-mark">
          <span aria-hidden="true" className="read-mark-icon">
            !
          </span>
          <span>{t(lang, check.source === "photo" ? "readMarkPhoto" : "readMarkText")}</span>
        </p>
      )}
      <label className="check">
        <input
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

interface NoteProps extends CheckProps {
  evidence: Ev[] | undefined;
}

/**
 * What the text said, then the check for that fact. Once the pedal photo check gave the answer,
 * the text's words are shown as what it said before, since they may say the opposite.
 */
export function ReadNote({ lang, field, check, onConfirm, evidence, matchesKey }: NoteProps) {
  const label = check?.source === "photo" ? t(lang, "readFromBefore") : t(lang, "readFrom");
  return (
    <>
      <Evidence label={label} texts={evidence?.map((e) => e.text)} />
      <ReadCheck lang={lang} field={field} check={check} onConfirm={onConfirm} matchesKey={matchesKey} />
    </>
  );
}
