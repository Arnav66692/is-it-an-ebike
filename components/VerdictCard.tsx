"use client";

import type { Line, Source, Verdict } from "@/lib/rules/types";
import { formatDate, placeName, stateLaw, stateName, type Lang } from "@/lib/i18n/names";
import { t, isUiKey } from "@/lib/i18n/ui";
import { renderLine, STATUS_LABEL } from "@/lib/i18n/verdicts";

const STATUS_MARK: Record<Verdict["status"], string> = {
  yes: "✓",
  no: "✕",
  not_ebike: "✕",
  cant_confirm: "?",
  need_info: "…",
};

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
        <details className="mt-1 text-sm text-muted">
          <summary className="cursor-pointer">{t(lang, "details")}</summary>
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
  const label = source.citation ?? source.url ?? "";
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
  if (lines.length === 0) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <ul className="list-disc space-y-1 pl-5">
        {lines.map((l, i) => (
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
  // Local cards say how completely the place's record was read in enacted text.
  const verifiedKey = verdict.scope === "local" && verdict.level ? `level_${verdict.level}` : `verified_${verdict.verified}`;
  const verified = isUiKey(verifiedKey) ? t(lang, verifiedKey) : "";

  return (
    <article className="card verdict space-y-4" data-status={verdict.status} aria-label={title}>
      <header className="space-y-2">
        <h3 className="text-base font-bold">{title}</h3>
        <p className="badge" data-status={verdict.status}>
          <span aria-hidden="true">{STATUS_MARK[verdict.status]}</span>
          {STATUS_LABEL[lang][verdict.status]}
        </p>
        <p className="text-lg font-semibold leading-snug">{renderLine(verdict.reason, lang, state)}</p>
        {verdict.reason.detail ? (
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">{t(lang, "details")}</summary>
            <p lang="en" className="mt-1">
              {verdict.reason.detail}
            </p>
          </details>
        ) : null}
      </header>

      <Section title={t(lang, "needs")} lines={verdict.requirements} lang={lang} state={state} />
      <Section title={t(lang, "watchOut")} lines={verdict.cautions} lang={lang} state={state} />
      <Section title={t(lang, "alsoKnow")} lines={verdict.notes} lang={lang} state={state} />

      {showLocalNotice ? <p className="text-sm">{t(lang, "localStricter")}</p> : null}

      {verdict.sources.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">{t(lang, "sources")}</summary>
          <ul className="mt-2 space-y-1">
            {verdict.sources.map((s, i) => (
              <SourceItem key={`${s.citation}-${i}`} source={s} lang={lang} />
            ))}
          </ul>
        </details>
      ) : null}

      <footer className="space-y-1 border-t border-line pt-3 text-xs text-muted">
        <p>
          {verified} {t(lang, "lastChecked", { date: formatDate(verdict.lastChecked, lang) })}
        </p>
        <p>{t(lang, "notLegalAdvice")}</p>
      </footer>
    </article>
  );
}
