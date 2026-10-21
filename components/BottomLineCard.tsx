"use client";

import { useId } from "react";
import type { BottomLine, BottomLineItem, CardRef } from "@/lib/rules/bottomLine";
import { capitalize, cardWhere, formatDate, joinList, placeNameCovered, placeNameInList, stateLaw, stateName, type Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { keepWords } from "@/lib/i18n/keep";
import { renderLine, renderShortLine } from "@/lib/i18n/verdicts";

/** YES or NO, never a maybe. A ride we can't confirm is legal is a NO, with the reason under it. */
const MARK: Record<BottomLine["kind"], string> = {
  yes: "✓",
  no_illegal: "✕",
  no_unconfirmed: "✕",
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
 * The one card a NO rests on when every gap it names, apart from the read facts, is about that
 * card. Null when the gaps are about more than one card, or only about the facts.
 */
function onlyOpenCard(line: BottomLine): CardRef | null {
  const refs = line.missing.flatMap((m) => m.where);
  const first = refs[0];
  if (!first) return null;
  return refs.every((r) => r.scope === first.scope && r.id === first.id) ? first : null;
}

/**
 * The plain reason under YES or NO. A NO we can't confirm names the one place it rests on when
 * there is one, like "We can't confirm it's legal in South Carolina.", and says every place we
 * checked when there are more. It is never a hedge like "not confirmed" in place of the answer.
 */
export function subtitle(line: BottomLine, lang: Lang): string {
  const key = subtitleKey(line);
  const only = key === "blUnconfirmedSub" ? onlyOpenCard(line) : null;
  return only ? t(lang, "answerCantConfirm", { where: cardWhere(only.scope, only.id, lang) }) : t(lang, key);
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
  const names = line.covered.map((r) => (r.scope === "state" ? stateLaw(stateCode, lang, "inline") : placeNameCovered(r.id, lang)));
  return t(lang, "blCovers", { list: joinList(names, lang) });
}

/**
 * The one short sentence screen readers announce when the bottom line appears or changes,
 * for example "Bottom line: NO. Not allowed. At least one rule we checked says no." or "Bottom
 * line: NO. We can't confirm it's legal in South Carolina." It always says YES or NO first.
 * A YES also says which city or county rules were not checked, like "City and county rules for
 * Austin were not checked.", as the card does, so a YES under state law alone is never heard as
 * more than that. A NO, not allowed that still rests on unchecked read facts adds
 * that it could change once they are checked. The full card stays out of the live region, so it
 * is never read again on every edit.
 */
export function announcement(line: BottomLine, lang: Lang, uncheckedPlaces: readonly string[] = [], uncheckedDistricts: readonly string[] = []): string {
  const word = line.kind === "yes" ? t(lang, "blYes") : t(lang, "blNo");
  const head = `${t(lang, "blTitle")}: ${word}. ${subtitle(line, lang)}`;
  // A YES covers only what was checked, so it says which city or county rules were not. A NO stays one short sentence.
  const unchecked = line.kind === "yes" ? uncheckedLine(line, lang, uncheckedPlaces, uncheckedDistricts) : null;
  return [head, unchecked, line.factsNote ? t(lang, "blFactsCouldChange") : null].filter(Boolean).join(" ");
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

/**
 * Each item is one short line under the places it names, like "Tick the 7 facts we read, in step
 * 3.", so the card reads as one compact answer. When the full sentence says more, it is folded
 * under the line and opens on tap, so nothing it says is lost.
 */
function ItemList({ title, items, lang, state, stateCode }: ItemListProps) {
  const shown = mergeRendered(items, lang, state);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="eyebrow">{title}</h4>
      <ul className="bl-list" role="list">
        {shown.map((item, i) => {
          const full = renderLine(item.line, lang, state);
          const short = renderShortLine(item.line, lang, state);
          return (
            <li key={`${item.line.code}-${i}`} className="bl-item">
              <span className="bl-where">{whereLabel(item.where, lang, stateCode)}</span>
              <span className="bl-short">{keepWords(short ?? full)}</span>
              {short ? (
                <details className="line-details bl-more">
                  <summary>{t(lang, "blMore")}</summary>
                  <p className="mt-1">{keepWords(full)}</p>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface Props {
  line: BottomLine;
  lang: Lang;
  stateCode: string;
  /** Picked places whose own city and county rules were not checked, like "Austin". */
  uncheckedPlaces?: readonly string[];
  /** Picked school districts whose campus rules were not checked, like "Poway Unified". */
  uncheckedDistricts?: readonly string[];
}

/**
 * The line that says which local rules were not checked. It names the picked places when there are
 * any, like "City and county rules for Austin were not checked.", and each picked school district,
 * like "Campus rules for Poway Unified were not checked." Null when every place was checked.
 */
export function uncheckedLine(line: BottomLine, lang: Lang, names: readonly string[] = [], districts: readonly string[] = []): string | null {
  if (line.citiesChecked && !line.uncheckedPlaces) return null;
  const districtLine = districts.length > 0 ? t(lang, "blDistrictUnchecked", { list: joinList([...districts], lang) }) : null;
  const placeLine =
    names.length > 0
      ? t(lang, "blLocalUnchecked", { list: joinList([...names], lang) })
      : !line.citiesChecked
        ? t(lang, "blNoCity")
        : districtLine
          ? null
          : t(lang, "blOtherPlaces");
  return [placeLine, districtLine].filter(Boolean).join(" ");
}

/** The one-word answer for the whole ride, shown after every card. */
export function BottomLineCard({ line, lang, stateCode, uncheckedPlaces = [], uncheckedDistricts = [] }: Props) {
  const headingId = useId();
  const state = stateName(stateCode, lang);
  const yes = line.kind === "yes";
  const unchecked = uncheckedLine(line, lang, uncheckedPlaces, uncheckedDistricts);
  // A NO, not allowed names the read facts still unchecked right under its reasons.
  const toCheck: BottomLineItem[] = line.factsNote ? [{ where: [], line: line.factsNote }] : [];

  return (
    <section className="card bottom-line" data-kind={line.kind} aria-labelledby={headingId}>
      <header className="bl-top">
        <h3 id={headingId} className="eyebrow">
          {t(lang, "blTitle")}
        </h3>
        <p className="bl-head" data-answer={yes ? "yes" : "no"}>
          <span className="bl-mark" aria-hidden="true">
            {MARK[line.kind]}
          </span>
          <span>{yes ? t(lang, "blYes") : t(lang, "blNo")}</span>
        </p>
        <p className="bl-reason" data-answer-line="">
          {keepWords(subtitle(line, lang))}
        </p>
        <p>
          {t(lang, "blRideDate", { date: formatDate(line.rideDate, lang) })} {coversSentence(line, lang, stateCode)}
        </p>
        {unchecked && line.kind !== "no_illegal" ? (
          <p className="font-semibold" data-unchecked="">
            {unchecked}
          </p>
        ) : null}
      </header>

      <div className="bl-body">
        <ItemList title={t(lang, "blWhy")} items={line.blocked} lang={lang} state={state} stateCode={stateCode} />
        {/* The reason under a not-an-e-bike NO is one short line. What that means for other vehicles is here. */}
        {line.kind === "no_illegal" && line.notEbikeOnly ? <p>{keepWords(t(lang, "blNotEbikeNote"))}</p> : null}
        <ItemList title={t(lang, "blToCheck")} items={toCheck} lang={lang} state={state} stateCode={stateCode} />
        <ItemList title={t(lang, "blMissing")} items={line.missing} lang={lang} state={state} stateCode={stateCode} />

        {yes && line.requirements.length > 0 ? (
          <div className="space-y-2">
            <h4 className="eyebrow">{t(lang, "blMustDo")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              {line.requirements.map((l, i) => (
                <li key={`${l.code}-${i}`}>{keepWords(renderLine(l, lang, state))}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {yes ? <p>{t(lang, line.roadLimit ? "blStreetsLimited" : "blStreets")}</p> : null}

        <footer className="bl-foot meta">
          <p>{t(lang, "notLegalAdvice")}</p>
        </footer>
      </div>
    </section>
  );
}
