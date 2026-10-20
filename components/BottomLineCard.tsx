"use client";

import { useId } from "react";
import type { BottomLine, BottomLineItem, CardRef } from "@/lib/rules/bottomLine";
import { capitalize, formatDate, joinList, placeNameInList, placeNameInline, stateLaw, stateName, type Lang } from "@/lib/i18n/names";
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

/**
 * The line under YES or NO. When the only "no" is that the bike is not an e-bike, it says that,
 * not that a rule bars the ride, since the bike may be legal as another vehicle, like Vermont's
 * motor-assisted bicycle. When the only thing missing is checking the facts read from a link or
 * photo, it says that, so the family knows the next step is on the facts card.
 */
export function subtitleKey(line: BottomLine): (typeof SUBTITLE)[BottomLine["kind"]] | "blNotEbikeSub" | "blFactsSub" {
  if (line.kind === "no_illegal" && line.notEbikeOnly) return "blNotEbikeSub";
  if (line.kind === "no_unconfirmed" && line.missing.every((m) => m.kind === "facts")) return "blFactsSub";
  return SUBTITLE[line.kind];
}

/**
 * The places one item applies to, as a label: "City of San Diego and an SDUHSD campus".
 * Each place uses its list form, and only the first word is capitalized. An item about the bike's
 * facts names no place, since every card rests on them.
 */
export function whereLabel(where: CardRef[], lang: Lang, stateCode: string): string {
  if (where.length === 0) return t(lang, "blFactsWhere");
  const names = where.map((r) => (r.scope === "state" ? stateLaw(stateCode, lang, "list") : placeNameInList(r.id, lang)));
  return capitalize(joinList(names, lang));
}

/** "This covers California state law and the City of San Diego." */
export function coversSentence(line: BottomLine, lang: Lang, stateCode: string): string {
  if (line.covered.length === 1) return t(lang, "blCoversStateOnly", { law: stateLaw(stateCode, lang, "inline") });
  const names = line.covered.map((r) => (r.scope === "state" ? stateLaw(stateCode, lang, "inline") : placeNameInline(r.id, lang)));
  return t(lang, "blCovers", { list: joinList(names, lang) });
}

/**
 * The one short sentence screen readers announce when the bottom line appears or changes,
 * for example "Bottom line: NO. Not allowed. At least one rule we checked says no."
 * The full card stays out of the live region, so it is never read again on every edit.
 */
export function announcement(line: BottomLine, lang: Lang): string {
  const word = line.kind === "yes" ? t(lang, "blYes") : t(lang, "blNo");
  return `${t(lang, "blTitle")}: ${word}. ${t(lang, subtitleKey(line))}`;
}

/**
 * Items that render to the same sentence become one item naming every place, in the order they
 * first appear, so What's missing never repeats a paragraph word for word.
 */
export function mergeRendered(items: BottomLineItem[], lang: Lang, state: string): BottomLineItem[] {
  const out: BottomLineItem[] = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const key = renderLine(item.line, lang, state);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ ...item, where: [...item.where] });
    } else {
      const known = out[at].where;
      const added = item.where.filter((w) => !known.some((k) => k.scope === w.scope && k.id === w.id));
      out[at] = { ...out[at], where: [...known, ...added] };
    }
  }
  return out;
}

interface ItemListProps {
  title: string;
  items: BottomLineItem[];
  lang: Lang;
  state: string;
  stateCode: string;
}

function ItemList({ title, items, lang, state, stateCode }: ItemListProps) {
  const shown = mergeRendered(items, lang, state);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <ul className="space-y-2">
        {shown.map((item, i) => (
          <li key={`${item.line.code}-${i}`} className="bl-item">
            <span className="block text-sm font-semibold">{whereLabel(item.where, lang, stateCode)}</span>
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
        <p className="text-lg font-semibold leading-snug">{t(lang, subtitleKey(line))}</p>
        <p className="text-sm">
          {t(lang, "blRideDate", { date: formatDate(line.rideDate, lang) })} {coversSentence(line, lang, stateCode)}
        </p>
      </header>

      <ItemList title={t(lang, "blWhy")} items={line.blocked} lang={lang} state={state} stateCode={stateCode} />
      <ItemList title={t(lang, "blMissing")} items={line.missing} lang={lang} state={state} stateCode={stateCode} />

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

      {yes ? <p className="text-sm">{t(lang, line.roadLimit ? "blStreetsLimited" : "blStreets")}</p> : null}
      {unchecked && line.kind !== "no_illegal" ? (
        <p className="text-sm font-semibold" data-unchecked="">
          {unchecked}
        </p>
      ) : null}

      <footer className="border-t border-line pt-3 text-xs text-muted">
        <p>{t(lang, "notLegalAdvice")}</p>
      </footer>
    </section>
  );
}
