"use client";

import type { Line, Source, Status, Verdict } from "@/lib/rules/types";
import { cardWhere, citationText, formatDate, placeName, stateLaw, stateName, type Lang } from "@/lib/i18n/names";
import { t, isUiKey } from "@/lib/i18n/ui";
import { renderLine, uniqueRendered } from "@/lib/i18n/verdicts";

/**
 * Every card answers YES or NO. Only an allowed card is YES. Not allowed, not an e-bike, can't
 * confirm and questions still open are all NO, so uncertainty never reads as a YES or a maybe.
 * The engine's status is not changed, only how it reads.
 */
export function cardAnswer(status: Status): "yes" | "no" {
  return status === "yes" ? "yes" : "no";
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
 * Vermont state law." or "We can't confirm it's legal in South Carolina." The card's own reason
 * comes next. Null when the card's own reason is the line under the answer.
 */
export function answerLead(verdict: Verdict, lang: Lang, stateCode: string): string | null {
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
      {renderLine(line, lang, state)}
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
  const effective = source.effective && /^\d{4}-\d{2}-\d{2}$/.test(source.effective)
    ? ` (${t(lang, "effective", { date: formatDate(source.effective, lang) })})`
    : "";
  return (
    <li className="break-words">
      <span className="font-semibold">{kind}.</span>{" "}
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline" lang="en">
          {label}
        </a>
      ) : (
        <span lang="en">{label}</span>
      )}
      {effective}
    </li>
  );
}

function Section({ title, lines, lang, state }: { title: string; lines: Line[]; lang: Lang; state: string }) {
  const shown = uniqueRendered(lines, lang, state);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="eyebrow text-muted">{title}</h4>
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
  showLocalNotice?: boolean;
}

export function VerdictCard({ verdict, lang, stateCode, showLocalNotice }: Props) {
  const state = stateName(stateCode, lang);
  const title =
    verdict.scope === "state" ? stateLaw(stateCode, lang, "title") : placeName(verdict.id, lang);
  // Local cards say how completely the place's record was read in enacted text. State cards
  // say how the state's statutes were read, in words written for state law.
  const verifiedKey =
    verdict.scope === "state" ? `state_verified_${verdict.verified}` : verdict.level ? `level_${verdict.level}` : `verified_${verdict.verified}`;
  const verified = isUiKey(verifiedKey) ? t(lang, verifiedKey) : "";
  const answer = cardAnswer(verdict.status);
  const lead = answerLead(verdict, lang, stateCode);
  const reason = renderLine(verdict.reason, lang, state);

  return (
    <article className="card place space-y-2" data-status={verdict.status} data-answer={answer} aria-label={title}>
      <header className="place-head">
        <h3 className="place-title">{title}</h3>
        <p className="badge" data-status={verdict.status} data-answer={answer}>
          <span aria-hidden="true">{answer === "yes" ? "✓" : "✕"}</span>
          <span>{t(lang, answer === "yes" ? "blYes" : "blNo")}</span>
        </p>
      </header>
      <p className="font-semibold leading-snug" data-answer-line="">
        {lead ?? reason}
      </p>
      {lead ? <p>{reason}</p> : null}

      {/* Everything else about this place opens on tap: the rules, the notes, the sources and the dates. */}
      <details className="more">
        <summary>{t(lang, "cardMore")}</summary>
        <div className="more-body">
          {verdict.reason.detail ? (
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
              <h4 className="eyebrow text-muted">{t(lang, "sources")}</h4>
              <ul className="space-y-2 text-[0.95rem]">
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
