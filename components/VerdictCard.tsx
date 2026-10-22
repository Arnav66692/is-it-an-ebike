"use client";

import { cardGaps, type BottomLineGap } from "@/lib/rules/bottomLine";
import type { Line, ReadField, Source, Status, Verdict } from "@/lib/rules/types";
import { capitalize, cardWhere, citationText, formatDate, placeName, stateLaw, stateName, type Lang } from "@/lib/i18n/names";
import { t, isUiKey } from "@/lib/i18n/ui";
import { keepWords } from "@/lib/i18n/keep";
import { renderLine, uniqueRendered } from "@/lib/i18n/verdicts";

/**
 * Why an allowed card still answers NO. `gaps` are what the bottom line names on this card: a
 * "not sure" fast-mode answer, a record not read in enacted text, or a ride date past the state
 * check. `facts` is true while a fact read from a link or photo is not checked against the bike.
 * Null when the card is not allowed, or allowed with nothing held back.
 */
export interface HeldBack {
  gaps: BottomLineGap[];
  facts: boolean;
}

export function heldBack(verdict: Verdict, rideDate: string, stateCode: string, unconfirmed: readonly ReadField[] = []): HeldBack | null {
  if (verdict.status !== "yes") return null;
  const gaps = cardGaps(verdict, rideDate, stateCode);
  const facts = unconfirmed.length > 0;
  return gaps.length > 0 || facts ? { gaps, facts } : null;
}

/**
 * Every card answers YES or NO. Only an allowed card with nothing held back is YES. Not allowed,
 * not an e-bike, can't confirm, questions still open, and an allowed card the bottom line can't
 * confirm are all NO, so uncertainty never reads as a YES or a maybe, and a card never says YES
 * under a bottom line that says NO because of that same card. The engine's status is not
 * changed, only how it reads.
 */
export function cardAnswer(verdict: Verdict, rideDate: string, stateCode: string, unconfirmed: readonly ReadField[] = []): "yes" | "no" {
  return verdict.status === "yes" && heldBack(verdict, rideDate, stateCode, unconfirmed) === null ? "yes" : "no";
}

type Lead = ((v: Verdict, lang: Lang, stateCode: string) => string) | null;

/**
 * The plain line under a NO when the card's own reason doesn't say what the NO means on its own.
 * Null for YES and for not allowed, whose own reason is that line, like "Riders under 16 can't
 * ride a Class 3 e-bike in Alabama." Only state law decides what is an e-bike, so a not-an-e-bike
 * card names the state's law, on a local card too.
 */
const LEAD: Record<Status, Lead> = {
  yes: null,
  no: null,
  not_ebike: (_v, lang, stateCode) => t(lang, "answerNotEbike", { law: stateLaw(stateCode, lang, "inline") }),
  cant_confirm: (v, lang) => t(lang, "answerCantConfirm", { where: cardWhere(v.scope, v.id, lang) }),
  need_info: (v, lang) => t(lang, "answerNeedInfo", { where: cardWhere(v.scope, v.id, lang) }),
};

/**
 * The line right under the YES or NO when the card needs one, for example "Not an e-bike under
 * Vermont state law." or "We can't confirm it's legal in South Carolina." An allowed card held
 * back says "We can't confirm it's legal in Texas." for a gap on the card, or that the read facts
 * must be checked first. The card's own reason comes next. Null when the card's own reason is the
 * line under the answer.
 */
export function answerLead(verdict: Verdict, lang: Lang, stateCode: string, held: HeldBack | null = null): string | null {
  if (held) {
    return held.gaps.length > 0 ? t(lang, "answerCantConfirm", { where: cardWhere(verdict.scope, verdict.id, lang) }) : t(lang, "blFactsSub");
  }
  const lead = LEAD[verdict.status];
  return lead ? lead(verdict, lang, stateCode) : null;
}

function safeHref(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function LineItem({ line, lang, state }: { line: Line; lang: Lang; state: string }) {
  return (
    <li>
      {keepWords(renderLine(line, lang, state))}
      {line.detail ? (
        <details className="line-details meta">
          <summary>{t(lang, "details")}</summary>
          <p lang="en" className="mt-1">
            {line.detail}
          </p>
        </details>
      ) : null}
    </li>
  );
}

function SourceItem({ source, lang }: { source: Source; lang: Lang }) {
  const kindKey = `source_${source.kind ?? "statute"}`;
  const kind = isUiKey(kindKey) ? t(lang, kindKey) : "";
  const href = safeHref(source.url);
  const label = source.citation ? citationText(source.citation) : (source.url ?? "");
  // The date sits on the same line as the kind of source, so it needs no brackets.
  const effective = source.effective && /^\d{4}-\d{2}-\d{2}$/.test(source.effective)
    ? capitalize(t(lang, "effective", { date: formatDate(source.effective, lang) }))
    : "";
  // Each source is its own block, and its link is a tap target at least 44 px tall.
  return (
    <li className="source">
      <span className="source-kind">{kind}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="source-link" lang="en">
          {label}
        </a>
      ) : (
        <span className="source-link" lang="en">
          {label}
        </span>
      )}
      {effective ? <span className="source-date">{effective}</span> : null}
    </li>
  );
}

function Section({ title, lines, lang, state }: { title: string; lines: Line[]; lang: Lang; state: string }) {
  const shown = uniqueRendered(lines, lang, state);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-2">
      <h5 className="eyebrow">{title}</h5>
      <ul className="list-disc space-y-2 pl-5">
        {shown.map((l, i) => (
          <LineItem key={`${l.code}-${i}`} line={l} lang={lang} state={state} />
        ))}
      </ul>
    </div>
  );
}

interface Props {
  verdict: Verdict;
  lang: Lang;
  stateCode: string;
  /** The ride date the bottom line uses, so a card past its state check answers NO with it. */
  rideDate: string;
  /** Facts read from a link or photo that the family has not checked yet. Any one holds a YES back. */
  unconfirmed?: readonly ReadField[];
  showLocalNotice?: boolean;
}

export function VerdictCard({ verdict, lang, stateCode, rideDate, unconfirmed = [], showLocalNotice }: Props) {
  const state = stateName(stateCode, lang);
  const title =
    verdict.scope === "state" ? stateLaw(stateCode, lang, "title") : placeName(verdict.id, lang);
  // Local cards say how completely the place's record was read in enacted text. State cards
  // say how the state's statutes were read, in words written for state law.
  const verifiedKey =
    verdict.scope === "state" ? `state_verified_${verdict.verified}` : verdict.level ? `level_${verdict.level}` : `verified_${verdict.verified}`;
  const verified = isUiKey(verifiedKey) ? t(lang, verifiedKey) : "";
  const held = heldBack(verdict, rideDate, stateCode, unconfirmed);
  const answer = cardAnswer(verdict, rideDate, stateCode, unconfirmed);
  const lead = answerLead(verdict, lang, stateCode, held);
  const reason = renderLine(verdict.reason, lang, state);
  // What holds an allowed card back, each sentence once. Read facts are named on the bottom line.
  const heldLines = held ? [...new Set(held.gaps.map((g) => renderLine(g.line, lang, state)))] : [];

  return (
    <article className="card place space-y-2" data-status={verdict.status} data-answer={answer} aria-label={title}>
      <header className="place-head">
        <h4 className="place-title">{title}</h4>
        <p className="badge" data-status={verdict.status} data-answer={answer}>
          <span aria-hidden="true">{answer === "yes" ? "✓" : "✕"}</span>
          <span>{t(lang, answer === "yes" ? "blYes" : "blNo")}</span>
        </p>
      </header>
      <p className="font-semibold leading-snug" data-answer-line="">
        {keepWords(lead ?? reason)}
      </p>
      {/* A card waiting on the questions says so in its lead. Its reason, that a label can't show the
          answers, would repeat the questions card's own line, so it is left out here. */}
      {held ? heldLines.map((l) => <p key={l}>{keepWords(l)}</p>) : lead && verdict.status !== "need_info" ? <p>{keepWords(reason)}</p> : null}
      {/* When a bike falls outside the state's e-bike law, what it takes to ride it under the state's
          other vehicle rules (a license, registration, insurance) is shown, not folded away. */}
      {verdict.status === "not_ebike" && verdict.reason.detail ? (
        <p lang={lang !== "en" ? "en" : undefined}>{verdict.reason.detail}</p>
      ) : null}

      {/* Everything else about this place opens on tap: the rules, the notes, the sources and the dates. */}
      <details className="more">
        <summary>{t(lang, "cardMore")}</summary>
        <div className="more-body">
          {held ? (
            <div className="space-y-2">
              <h5 className="eyebrow">{t(lang, "cardRuleSays")}</h5>
              <p>{keepWords(reason)}</p>
            </div>
          ) : null}
          {verdict.reason.detail && verdict.status !== "not_ebike" ? (
            <details className="line-details meta">
              <summary>{t(lang, "details")}</summary>
              <p lang="en" className="mt-1">
                {verdict.reason.detail}
              </p>
            </details>
          ) : null}

          <Section title={t(lang, "needs")} lines={verdict.requirements} lang={lang} state={state} />
          <Section title={t(lang, "watchOut")} lines={verdict.cautions} lang={lang} state={state} />
          <Section title={t(lang, "alsoKnow")} lines={verdict.notes} lang={lang} state={state} />

          {showLocalNotice ? <p>{t(lang, "localStricter")}</p> : null}

          {verdict.sources.length > 0 ? (
            <div className="space-y-2">
              <h5 className="eyebrow">{t(lang, "sources")}</h5>
              {/* role="list" keeps the list for VoiceOver, which drops it from a list with no bullets. */}
              <ul className="sources" role="list">
                {verdict.sources.map((s, i) => (
                  <SourceItem key={`${s.citation}-${i}`} source={s} lang={lang} />
                ))}
              </ul>
            </div>
          ) : null}

          <footer className="meta space-y-1 border-t border-line pt-3">
            <p>
              {verified} {t(lang, "lastChecked", { date: formatDate(verdict.lastChecked, lang) })}
            </p>
            <p>{t(lang, "notLegalAdvice")}</p>
          </footer>
        </div>
      </details>
    </article>
  );
}
