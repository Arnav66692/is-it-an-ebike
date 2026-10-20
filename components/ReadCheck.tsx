"use client";

// The words a fact was read from, and the box the family ticks once it matches the bike. A fact
// read from a link or photo stays marked until it is ticked or changed, and until then the bottom
// line can't say YES (lib/provenance.ts, lib/rules/bottomLine.ts).

import { useId } from "react";
import type { Evidence as Ev } from "@/lib/extract/parse";
import type { FactCheck } from "@/lib/provenance";
import type { ReadField } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { READ_FIELD_NAMES } from "@/lib/i18n/verdicts";
import { Evidence } from "./controls";

export type OnConfirm = (field: ReadField, confirmed: boolean) => void;

interface CheckProps {
  lang: Lang;
  field: ReadField;
  check: FactCheck | undefined;
  onConfirm: OnConfirm;
}

/** Nothing for a fact the family typed. For a read fact, the mark while it is not checked, and the box. */
export function ReadCheck({ lang, field, check, onConfirm }: CheckProps) {
  const noteId = useId();
  if (!check) return null;
  return (
    <div className="read-check space-y-1" data-confirmed={check.confirmed ? "true" : "false"}>
      {check.confirmed ? null : (
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
          checked={check.confirmed}
          onChange={(e) => onConfirm(field, e.target.checked)}
          aria-label={t(lang, "readMatchesFor", { field: READ_FIELD_NAMES[lang][field] })}
          aria-describedby={check.confirmed ? undefined : noteId}
        />
        <span>{t(lang, "readMatches")}</span>
      </label>
    </div>
  );
}

interface NoteProps extends CheckProps {
  evidence: Ev[] | undefined;
}

/** What the text said, then the check for that fact. */
export function ReadNote({ lang, field, check, onConfirm, evidence }: NoteProps) {
  return (
    <>
      <Evidence label={t(lang, "readFrom")} texts={evidence?.map((e) => e.text)} />
      <ReadCheck lang={lang} field={field} check={check} onConfirm={onConfirm} />
    </>
  );
}
