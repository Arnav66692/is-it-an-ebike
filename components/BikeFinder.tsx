"use client";

// The bike finder. A short quiz about the rider, where they ride and what the bike is for, then
// the catalog bikes in the budget, best fit first. Each one gets a YES or NO from the rules engine
// for this rider in these places, read from the maker's stated specs only. "Check this bike" opens
// the checker with those facts as read facts, so the family still checks each one there.

import { useId, useMemo, useState } from "react";
import { findBikes, BUDGETS, COLOR_FAMILIES, USES, type Budget, type ColorFamily, type FinderResult, type FitReason, type Use } from "@/lib/bikes/finder";
import type { CatalogBike } from "@/lib/bikes/facts";
import type { CatalogMeta } from "@/lib/bikes/catalog";
import { photoFor, storeName } from "@/lib/bikes/photos";
import { budgetText, colorText, feetInches, finderText, topicText, purposeText } from "@/lib/i18n/finder";
import { formatDate, joinList, stateName, type Lang } from "@/lib/i18n/names";
import { keepWords } from "@/lib/i18n/keep";
import { t } from "@/lib/i18n/ui";
import { renderLine } from "@/lib/i18n/verdicts";
import type { PickLabels } from "@/lib/places/linked";
import { addPick, removePick, rideWhere, uncheckedPicks, type PlacePicks, NO_PICKS } from "@/lib/places/picks";
import type { PlaceEntry } from "@/lib/places/types";
import { MAX_AGE_INPUT, MIN_AGE_INPUT } from "@/lib/rules";
import type { BottomLine } from "@/lib/rules/bottomLine";
import { localToday } from "@/lib/rules/dates";
import { isQuestionId, type PlaceId } from "@/lib/rules/types";
import { uncheckedLine } from "./BottomLineCard";
import { Card, Choice } from "./controls";
import { PlaceSearch, resultDetail } from "./PlaceSearch";
import { pageHref, SiteHeader, useLang } from "./SiteHeader";
import { whereNoteShown, whereNoteText, type WhereNote } from "./whereNote";

/** Heights the quiz offers, 4'0" to 6'6", in inches. */
export const HEIGHTS: readonly number[] = Array.from({ length: 31 }, (_, i) => 48 + i);

/** The rider's age, or null when the box holds anything else. */
export function finderAge(text: string): number | null {
  const n = /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null;
  return n !== null && n >= MIN_AGE_INPUT && n <= MAX_AGE_INPUT ? n : null;
}

/**
 * The checker link for a bike: its facts, the state, the checked places, the picks with no checked
 * record, like a school district, and the rider's age. The checker names those picks as not checked,
 * the same as the finder's card.
 */
export function checkHref(bike: CatalogBike, lang: Lang, state: string, places: readonly PlaceId[], age: number, uncheckedIds: readonly string[] = []): string {
  const params: Record<string, string> = { bike: bike.id, state, age: String(age) };
  if (places.length > 0) params.place = places.join(",");
  if (uncheckedIds.length > 0) params.pick = uncheckedIds.join(",");
  return pageHref("/", lang, params);
}

/** Where the answer covers, like "Encinitas and San Dieguito Union High" or "Texas". */
function whereWords(picks: readonly PlaceEntry[], labels: Record<string, PickLabels>, lang: Lang, state: string): string {
  const names = picks.map((p) => labels[p.id]?.[lang].name ?? p.name);
  return names.length > 0 ? joinList(names, lang) : stateName(state, lang);
}

/** The reasons under a NO, at most two, each once. */
export function noReasons(line: BottomLine, lang: Lang, stateCode: string): string[] {
  const state = stateName(stateCode, lang);
  const lines =
    line.kind === "no_illegal"
      ? line.blocked.map((b) => renderLine(b.line, lang, state))
      : line.missing.map((g) => {
          if (g.kind !== "unanswered") return renderLine(g.line, lang, state);
          const topics = String(g.line.params?.questions ?? "")
            .split(",")
            .filter(isQuestionId)
            .map((q) => topicText(lang, q));
          return finderText(lang, "makerSilent", { topic: joinList(topics, lang) });
        });
  return [...new Set(lines)].slice(0, 2);
}

function fitText(reason: FitReason, lang: Lang): string {
  switch (reason.kind) {
    case "use":
      return finderText(lang, `fit_${reason.use}`);
    case "color":
      return finderText(lang, "fit_color", { names: joinList(reason.names, lang) });
    case "height_fits":
      return finderText(lang, "fit_height");
    case "too_short":
      return finderText(lang, "fit_too_short", { height: feetInches(reason.min) });
    case "too_tall":
      return finderText(lang, "fit_too_tall", { height: feetInches(reason.max) });
    case "maker_age":
      return finderText(lang, "fit_maker_age", { text: reason.text });
  }
}

function money(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
}

function motorText(bike: CatalogBike, lang: Lang): string {
  const rated = bike.motor_rated_w;
  const peak = bike.motor_peak_w;
  if (rated !== null && peak !== null) return finderText(lang, "wattsPeak", { rated, peak });
  if (rated !== null) return finderText(lang, "watts", { rated });
  if (peak !== null) return finderText(lang, "peakOnly", { peak });
  return finderText(lang, "spec_none");
}

/** One spec. A maker's own words are marked English, so a Spanish screen reader reads them right. */
function SpecRow({ label, value, lang, makerWords = false }: { label: string; value: string | null; lang: Lang; makerWords?: boolean }) {
  return (
    <div className="spec">
      <dt>{label}</dt>
      <dd lang={value !== null && makerWords && lang !== "en" ? "en" : undefined}>{value ?? finderText(lang, "spec_none")}</dd>
    </div>
  );
}

/** A speed the maker's page states, like "28 mph", or null. The catalog's computed speeds are never shown as the maker's. */
export function mphText(value: number | null): string | null {
  return value === null ? null : `${value} mph`;
}

interface ResultProps {
  result: FinderResult;
  lang: Lang;
  age: number;
  state: string;
  where: string;
  places: readonly PlaceId[];
  /** The search ids of the picks with no checked record, for the checker link. */
  uncheckedIds?: readonly string[];
  unchecked: string | null;
  readDate: string;
}

export function FinderResultCard({ result, lang, age, state, where, places, uncheckedIds = [], unchecked, readDate }: ResultProps) {
  const { bike, line, yes } = result;
  const word = yes ? "yes" : "no";
  const stateLabel = stateName(state, lang);
  const reasons = yes ? [] : noReasons(line, lang, state);
  const must = yes ? [...new Set(line.requirements.map((l) => renderLine(l, lang, stateLabel)))].slice(0, 3) : [];
  return (
    <article className="card place finder-card space-y-3" data-answer={word} aria-label={`${bike.maker} ${bike.model}`}>
      <header className="place-head">
        <h3 className="place-title">
          <span className="finder-maker">{bike.maker}</span> {bike.model}
        </h3>
        <p className="badge" data-answer={word}>
          <span aria-hidden="true">{yes ? "✓" : "✕"}</span>
          <span>{t(lang, yes ? "blYes" : "blNo")}</span>
        </p>
      </header>
      <p className="font-semibold leading-snug" data-answer-line="">
        {keepWords(finderText(lang, yes ? "yesLine" : "noLine", { age, where }))}
      </p>
      {reasons.map((r) => (
        <p key={r}>{r}</p>
      ))}
      {must.length > 0 ? (
        <div className="space-y-1">
          <h4 className="eyebrow">{finderText(lang, "mustDo")}</h4>
          <ul className="list-disc space-y-1 pl-5">
            {must.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {yes && unchecked ? <p className="font-semibold">{unchecked}</p> : null}

      <p className="finder-price">
        {bike.price_usd !== null
          ? finderText(lang, "price", { price: money(bike.price_usd, lang), date: formatDate(readDate, lang) })
          : finderText(lang, "priceUnknown", { date: formatDate(readDate, lang) })}
      </p>

      {result.fits.length > 0 ? (
        <div className="space-y-1">
          <h4 className="eyebrow">{finderText(lang, "whyFits")}</h4>
          <ul className="list-disc space-y-1 pl-5">
            {result.fits.map((f, i) => (
              <li key={i}>{fitText(f, lang)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.misfits.length > 0 ? (
        <div className="space-y-1">
          <h4 className="eyebrow">{finderText(lang, "whyNot")}</h4>
          <ul className="list-disc space-y-1 pl-5">
            {result.misfits.map((f, i) => (
              <li key={i}>{fitText(f, lang)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p>
        <span className="eyebrow">{finderText(lang, "colors")}</span>{" "}
        {bike.colors.length > 0 ? <span lang={lang !== "en" ? "en" : undefined}>{bike.colors.join(", ")}</span> : finderText(lang, "spec_none")}
      </p>

      <BikePhoto bike={bike} lang={lang} />

      <details className="more">
        <summary>{finderText(lang, "specs")}</summary>
        <div className="more-body">
          <dl className="specs">
            <SpecRow label={finderText(lang, "spec_class")} value={bike.class_as_stated} lang={lang} makerWords />
            <SpecRow label={finderText(lang, "spec_motor")} value={motorText(bike, lang)} lang={lang} />
            <SpecRow label={finderText(lang, "spec_speed")} value={mphText(bike.top_speed_stated_mph)} lang={lang} />
            <SpecRow label={finderText(lang, "spec_assist")} value={mphText(bike.assisted_top_speed_mph)} lang={lang} />
            <SpecRow label={finderText(lang, "spec_throttle")} value={mphText(bike.throttle_top_speed_mph)} lang={lang} />
            <SpecRow label={finderText(lang, "spec_battery")} value={bike.battery_wh !== null ? `${bike.battery_wh} Wh` : null} lang={lang} />
            <SpecRow label={finderText(lang, "spec_weight")} value={bike.weight_lb !== null ? `${bike.weight_lb} lb` : null} lang={lang} />
            <SpecRow label={finderText(lang, "spec_wheels")} value={bike.wheel_size} lang={lang} makerWords />
            <SpecRow label={finderText(lang, "spec_fit")} value={bike.rider_fit} lang={lang} makerWords />
            {bike.price_note ? <SpecRow label={finderText(lang, "priceNote")} value={bike.price_note} lang={lang} makerWords /> : null}
          </dl>
          {bike.speed_note ? (
            <p className="meta" lang={lang !== "en" ? "en" : undefined}>
              {bike.speed_note}
            </p>
          ) : null}
        </div>
      </details>

      <div className="actions">
        <a className="btn btn-go" href={checkHref(bike, lang, state, places, age, uncheckedIds)}>
          {finderText(lang, "checkBike")}
        </a>
        <a className="btn btn-quiet" href={bike.maker_url} target="_blank" rel="noopener noreferrer">
          {finderText(lang, "makerPage", { site: storeName(bike.maker_url) })}
        </a>
      </div>
    </article>
  );
}

/**
 * The maker's photo of the bike, in a drawer. The image loads from the maker's site only once the
 * drawer is opened, so a closed list sends no request anywhere.
 */
export function BikePhoto({ bike, lang }: { bike: CatalogBike; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const url = photoFor(bike.id);
  if (!url) return null;
  const name = `${bike.maker} ${bike.model}`;
  return (
    <details className="more finder-photo" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{finderText(lang, "photo")}</summary>
      <div className="more-body">
        {open ? (
          // A plain img, so the photo comes straight from the maker and is never copied or cached here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={finderText(lang, "photoAlt", { name })} loading="lazy" referrerPolicy="no-referrer" className="finder-photo-img" />
        ) : null}
      </div>
    </details>
  );
}

export function BikeFinder({ catalog, meta }: { catalog: readonly CatalogBike[]; meta: CatalogMeta }) {
  const [lang, switchLang] = useLang();
  const ageId = useId();
  const heightId = useId();
  const [ageText, setAgeText] = useState("");
  const [ageLeft, setAgeLeft] = useState(false);
  const [height, setHeight] = useState<number | null>(null);
  const [where, setWhere] = useState<PlacePicks>(NO_PICKS);
  const [labels, setLabels] = useState<Record<string, PickLabels>>({});
  const [whereNote, setWhereNote] = useState<WhereNote | null>(null);
  const [uses, setUses] = useState<Use[]>([]);
  const [budget, setBudget] = useState<Budget>("any");
  const [colors, setColors] = useState<ColorFamily[]>([]);
  const [today] = useState(() => localToday());

  const age = finderAge(ageText);
  const state = where.state;
  const ride = useMemo(() => (state ? rideWhere(where, state, false) : null), [where, state]);
  const results = useMemo(() => {
    if (age === null || state === null || ride === null || where.picks.length === 0) return null;
    return findBikes(catalog, { age, height, uses, budget, colors, state, places: ride.places, otherPlaces: ride.otherPlaces, rideDate: today });
  }, [catalog, age, height, uses, budget, colors, state, ride, where.picks.length, today]);


  const notChecked = uncheckedPicks(where);
  const uncheckedNames = notChecked.filter((p) => p.kind !== "district").map((p) => labels[p.id]?.[lang].name ?? p.name);
  const uncheckedDistricts = notChecked.filter((p) => p.kind === "district").map((p) => p.name);
  const whereText = state ? whereWords(where.picks, labels, lang, state) : "";
  const makers = new Set(catalog.map((b) => b.maker)).size;
  const yesCount = results?.filter((r) => r.yes).length ?? 0;

  const noResults = results?.filter((r) => !r.yes) ?? [];
  function card(r: FinderResult) {
    const unchecked = uncheckedLine(r.line, lang, uncheckedNames, uncheckedDistricts);
    return (
      <FinderResultCard
        key={r.bike.id}
        result={r}
        lang={lang}
        age={age ?? 0}
        state={state ?? ""}
        where={whereText}
        places={ride?.places ?? []}
        uncheckedIds={notChecked.map((p) => p.id)}
        unchecked={unchecked}
        readDate={meta.readDate}
      />
    );
  }

  function toggleIn<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  return (
    <div className="page">
      <SiteHeader lang={lang} current="find" title={finderText(lang, "title")} onSwitchLang={switchLang}>
        <p className="tagline">{finderText(lang, "tagline")}</p>
      </SiteHeader>

      <Card title={finderText(lang, "step1")} step={1}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={ageId} className="field-label">
              {finderText(lang, "age")}
            </label>
            <input
              id={ageId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={ageText}
              onChange={(e) => setAgeText(e.target.value)}
              onBlur={() => setAgeLeft(true)}
              aria-invalid={ageLeft && ageText !== "" && age === null}
              aria-describedby={ageLeft && ageText !== "" && age === null ? `${ageId}-err` : undefined}
              className="field w-32"
            />
            {ageLeft && ageText !== "" && age === null ? (
              <p id={`${ageId}-err`} role="alert" className="field-error">
                {finderText(lang, "ageError")}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label htmlFor={heightId} className="field-label">
              {finderText(lang, "height")}
            </label>
            <select id={heightId} className="field w-full" value={height === null ? "" : String(height)} onChange={(e) => setHeight(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">{finderText(lang, "heightSkip")}</option>
              {HEIGHTS.map((h) => (
                <option key={h} value={h}>
                  {feetInches(h)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card title={finderText(lang, "step2")} step={2}>
        <PlaceSearch
          lang={lang}
          state={state ?? "CA"}
          picks={where.picks.map((p) => {
            const label = labels[p.id]?.[lang] ?? { name: p.name, where: "", state: p.state, text: p.name };
            return { id: p.id, label, detail: resultDetail(p, label, lang) };
          })}
          onPick={(entry, entryLabels) => {
            setLabels((cur) => ({ ...cur, [entry.id]: entryLabels }));
            const change = addPick(where, entry);
            setWhere(change.next);
            if (change.next === where) setWhereNote({ key: "whereAlready", place: entryLabels });
            else if (change.startedOver) setWhereNote({ key: "whereStartedOver", ...change.startedOver });
            else setWhereNote({ key: "whereAdded", place: entryLabels });
          }}
          onRemove={(id) => {
            setWhere((cur) => removePick(cur, id));
            setWhereNote(labels[id] ? { key: "whereRemoved", place: labels[id] } : null);
          }}
        />
        <p role="status" className={whereNoteShown(whereNote) ? "note" : "sr-only"}>
          {whereNoteText(whereNote, lang)}
        </p>
      </Card>

      <Card title={finderText(lang, "step3")} step={3}>
        <fieldset className="space-y-1">
          <legend className="field-label">{finderText(lang, "usesLegend")}</legend>
          {USES.map((u) => (
            <label key={u} className="check">
              <input type="checkbox" checked={uses.includes(u)} onChange={() => setUses((cur) => toggleIn(cur, u))} />
              <span>{purposeText(lang, u)}</span>
            </label>
          ))}
        </fieldset>
        <Choice legend={finderText(lang, "budgetLegend")} options={BUDGETS.map((b) => ({ value: b, label: budgetText(lang, b) }))} value={budget} onChange={setBudget} />
        <fieldset className="space-y-1">
          <legend className="field-label">{finderText(lang, "colorsLegend")}</legend>
          <div className="grid grid-cols-2 gap-x-4">
            {COLOR_FAMILIES.map((c) => (
              <label key={c} className="check">
                <input type="checkbox" checked={colors.includes(c)} onChange={() => setColors((cur) => toggleIn(cur, c))} />
                <span>{colorText(lang, c)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <div className="space-y-4">
        <h2 className="step-head">
          <span aria-hidden="true" className="step">
            4
          </span>
          {finderText(lang, "step4")}
        </h2>
        <p role="status" className={results === null || results.length === 0 ? "note" : "help finder-count"}>
          {results === null
            ? finderText(lang, "needInput")
            : results.length === 0
              ? finderText(lang, "none")
              : finderText(lang, results.length === 1 ? "countOne" : "countMany", { n: results.length, yes: yesCount })}
        </p>
        {results && state ? (
          <>
            {results.filter((r) => r.yes).map(card)}
            {noResults.length > 0 ? (
              <details className="more finder-more">
                <summary>{noResults.length === 1 ? finderText(lang, "moreNoOne") : finderText(lang, "moreNoMany", { n: noResults.length })}</summary>
                <div className="more-body space-y-4">{noResults.map(card)}</div>
              </details>
            ) : null}
          </>
        ) : null}
      </div>

      <footer className="site-foot">
        <details className="more">
          <summary>{finderText(lang, "aboutTitle")}</summary>
          <div className="space-y-2 pb-2">
            <p>{finderText(lang, "about1", { n: catalog.length, makers, date: formatDate(meta.readDate, lang) })}</p>
            <p>{finderText(lang, "about2")}</p>
            <p>{finderText(lang, "about3")}</p>
            <p>{finderText(lang, "about4")}</p>
          </div>
        </details>
        <p className="meta">{t(lang, "notLegalAdvice")}</p>
      </footer>
    </div>
  );
}
