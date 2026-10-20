"use client";

import { useId } from "react";
import type { BottomLine, BottomLineItem, CardRef } from "@/lib/rules/bottomLine";
import { formatDate, joinList, placeName, placeNameInline, stateName, type Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { renderLine } from "@/lib/i18n/verdicts";

const MARK: Record<BottomLine["kind"], string> = {
  yes: "✓",
  no_illegal: "✕",
  no_unconfirmed: "?",
};

const SUBTITLE = {
  yes: "blYesSub",
  no_illegal: "blIllegalSub",
  no_unconfirmed: "blUnconfirmedSub",
} as const;

interface ItemListProps {
  title: string;
  items: BottomLineItem[];
  lang: Lang;
  state: string;
  label: (r: CardRef) => string;
}

function ItemList({ title, items, lang, state, label }: ItemListProps) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={`${item.line.code}-${i}`} className="bl-item">
            <span className="block text-sm font-semibold">{joinList(item.where.map(label), lang)}</span>
            <span className="block">{renderLine(item.line, lang, state)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  line: BottomLine;
  lang: Lang;
  stateCode: string;
}

/** The one-word answer for the whole ride, shown after every card. */
export function BottomLineCard({ line, lang, stateCode }: Props) {
  const headingId = useId();
  const state = stateName(stateCode, lang);
  const yes = line.kind === "yes";
  const label = (r: CardRef) => (r.scope === "state" ? t(lang, "stateCardTitle", { state }) : placeName(r.id, lang));
  const covers =
    line.covered.length === 1
      ? t(lang, "blCoversStateOnly", { state })
      : t(lang, "blCovers", {
          list: joinList(
            line.covered.map((r) => (r.scope === "state" ? t(lang, "blStateLaw", { state }) : placeNameInline(r.id, lang))),
            lang,
          ),
        });
  const unchecked = !line.citiesChecked ? t(lang, "blNoCity") : line.uncheckedPlaces ? t(lang, "blOtherPlaces") : null;

  return (
    <section className="card bottom-line space-y-4" data-kind={line.kind} aria-labelledby={headingId}>
      <header className="space-y-2">
        <h3 id={headingId} className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t(lang, "blTitle")}
        </h3>
        <p className="bl-head">
          <span className="bl-mark" aria-hidden="true">
            {MARK[line.kind]}
          </span>
          <span>{yes ? t(lang, "blYes") : t(lang, "blNo")}</span>
        </p>
        <p className="text-lg font-semibold leading-snug">{t(lang, SUBTITLE[line.kind])}</p>
        <p className="text-sm">
          {t(lang, "blRideDate", { date: formatDate(line.rideDate, lang) })} {covers}
        </p>
      </header>

      <ItemList title={t(lang, "blWhy")} items={line.blocked} lang={lang} state={state} label={label} />
      <ItemList title={t(lang, "blMissing")} items={line.missing} lang={lang} state={state} label={label} />

      {yes && line.requirements.length > 0 ? (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted">{t(lang, "blMustDo")}</h4>
          <ul className="list-disc space-y-1 pl-5">
            {line.requirements.map((l, i) => (
              <li key={`${l.code}-${i}`}>{renderLine(l, lang, state)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {yes ? <p className="text-sm">{t(lang, "blStreets")}</p> : null}
      {unchecked && line.kind !== "no_illegal" ? <p className="text-sm font-semibold">{unchecked}</p> : null}

      <footer className="border-t border-line pt-3 text-xs text-muted">
        <p>{t(lang, "notLegalAdvice")}</p>
      </footer>
    </section>
  );
}
