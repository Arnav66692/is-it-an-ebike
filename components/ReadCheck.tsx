"use client";

// The words a fact was read from, under the fact on the facts card, so the family sees where it
// came from and can change it if the bike says otherwise (lib/provenance.ts).

import { quoteText, type Evidence as Ev } from "@/lib/extract/parse";
import { isAsRead, type FactCheck } from "@/lib/provenance";
import type { BikeFacts, ReadField } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { Evidence } from "./controls";

/** A small page with lines of text. The words beside it say where the fact was read, so the mark is never alone. */
function MarkIcon() {
  return (
    <svg aria-hidden="true" className="read-mark-icon" viewBox="0 0 14 14" width="14" height="14" fill="none">
      <rect x="0.75" y="0.75" width="12.5" height="12.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 4.75h7M3.5 7h7M3.5 9.25h4.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
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

interface NoteProps {
  lang: Lang;
  field: ReadField;
  facts: BikeFacts;
  check: FactCheck | undefined;
  evidence: Ev[] | undefined;
}

/**
 * Nothing for a fact the family typed. For a read fact that still holds the value read, one tinted
 * row: a short mark that says where it was read, and the words it was read from. A read fact the
 * family changed keeps the words it was read from, as "Read from".
 */
export function ReadNote({ lang, field, facts, check, evidence }: NoteProps) {
  const quotes = evidence?.map(quoteText) ?? [];
  if (!check || !isAsRead(check, field, facts)) return <Evidence label={t(lang, "readFrom")} texts={quotes} />;
  const photo = check.source === "photo";
  return (
    <div className="read-check">
      <p className="read-line">
        <span className="read-mark" data-read-mark={check.source}>
          <MarkIcon />
          <span className="read-mark-words">
            <span>{t(lang, photo ? "readMarkPhoto" : "readMarkText")}</span>
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
    </div>
  );
}
