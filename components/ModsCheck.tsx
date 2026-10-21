"use client";

// The mods check. The family picks where they ride, the rider's age and the ride date, the bike's
// class and rated watts, ticks each change made to it and, where it matters, says what the change
// does now. Each mod gets a YES or NO from the rules engine for that state and those places. In
// California the verified mod rules, penalties and dates in data/mods/ca-mods.json apply too.

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { checkerToday, keepAsked } from "@/lib/checkerState";
import { formatDate, stateWhere, type Lang } from "@/lib/i18n/names";
import { modsText } from "@/lib/i18n/mods";
import { t } from "@/lib/i18n/ui";
import { modApplies, outcomesFor, type ModChoice } from "@/lib/mods/answer";
import { baseFacts } from "@/lib/mods/facts";
import { answerRide, combinedRun, MODS_DATA_STATE, openQuestions, overallRideYes, runEngine, type ModRide } from "@/lib/mods/ride";
import type { ModsData, ModView } from "@/lib/mods/types";
import { SDUHSD_LEAID } from "@/lib/places/districts";
import { linkedPickIds, linkedWhere, pickLabels, SD_COUNTY_NAMES, type PickLabels } from "@/lib/places/linked";
import { loadSearchIndex } from "@/lib/places/load";
import { addPick, NO_PICKS, removePick, rideWhere, uncheckedPicks, type PlacePicks } from "@/lib/places/picks";
import type { PlaceEntry } from "@/lib/places/types";
import { getState, STATE_CODES } from "@/lib/rules/compile";
import { PLACE_IDS } from "@/lib/rules/local";
import { localToday } from "@/lib/rules/dates";
import { emptyFacts, type BikeFacts, type ClassNum, type PlaceId, type QuestionId } from "@/lib/rules/types";
import { uncheckedLine } from "./BottomLineCard";
import { Card, Choice, NumberField } from "./controls";
import { FollowUps } from "./FollowUps";
import { askId, ModAnswerCard, Overall } from "./ModsAnswer";
import { PlaceSearch, resultDetail } from "./PlaceSearch";
import { pageHref, SiteHeader, useLang } from "./SiteHeader";
import { whereNoteShown, whereNoteText, type WhereNote } from "./whereNote";

export { answerHead, askId, engineReasons, ModAnswerCard, notCheckedLine, overallReason, PENALTIES_SHOWN } from "./ModsAnswer";

/** The last ride date the page offers, the same as the checker's. */
export const MODS_LAST_DATE = "2029-12-31";
/** The rated watts a family can type. */
export const WATTS_MIN = 1;
export const WATTS_MAX = 10000;

/** The class a link names, like /mods?class=2 from the checker's answer. */
export function linkedClass(search: string): ClassNum | null {
  const n = new URLSearchParams(search).get("class");
  return n === "1" || n === "2" || n === "3" ? (Number(n) as ClassNum) : null;
}

/** The first ride date the page checks: today, or the day the law was read if the device clock is behind. */
export function modsToday(deviceToday: string, readOn: string): string {
  return deviceToday > readOn ? deviceToday : readOn;
}

/** The rider's age, null when the box is blank, or "bad" when it holds anything but a whole age from 3 to 100. */
export function modsAge(text: string): number | null | "bad" {
  const v = text.trim();
  if (v === "") return null;
  const n = /^\d{1,3}$/.test(v) ? Number(v) : NaN;
  return n >= 3 && n <= 100 ? n : "bad";
}

/** The age a link names, like /mods?class=1&age=14 from the checker's answer. */
export function linkedAge(search: string): string {
  const age = new URLSearchParams(search).get("age") ?? "";
  return /^\d{1,3}$/.test(age) ? age : "";
}

/** The ride date to answer for, or null when a picked date is outside today to the last date. */
export function modsRideDate(pickDate: boolean, dateText: string, today: string): string | null {
  if (!pickDate) return today;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && dateText >= today && dateText <= MODS_LAST_DATE ? dateText : null;
}

/** Where a link from the checker says the bike is ridden: its state, checked places and other picks. */
export interface LinkedRide {
  state: string | null;
  places: PlaceId[];
  /** Search picks to find once the place index loads: picks with no checked record, and SDUHSD. */
  pickIds: string[];
}

/**
 * Reads ?state=, ?place= and ?pick= from the checker's "Check its mods" link. SDUHSD's campus record
 * becomes the district's own pick, since this page has no campus box.
 */
export function linkedRide(search: string): LinkedRide {
  const params = new URLSearchParams(search);
  const code = params.get("state")?.toUpperCase() ?? "";
  if (!STATE_CODES.includes(code)) return { state: null, places: [], pickIds: [] };
  const places = [...new Set((params.get("place") ?? "").split(",").filter((p): p is PlaceId => PLACE_IDS.includes(p as PlaceId)))];
  const campus = places.includes("sduhsd_campuses") ? [`d-${SDUHSD_LEAID}`] : [];
  return { state: code, places, pickIds: [...linkedPickIds(search), ...campus] };
}

/** The picks once the index has the link's other picks. With no pick at all, the state itself is picked. */
export function withLinkedRide(current: PlacePicks, state: string, entries: readonly PlaceEntry[], stateEntry: PlaceEntry | undefined): PlacePicks {
  if (current.state !== null && current.state !== state) return current;
  const next = entries.filter((e) => e.state === state).reduce((cur, e) => addPick(cur, e).next, current);
  return next.picks.length === 0 && stateEntry ? addPick(next, stateEntry).next : next;
}

/** Each mod's outcome choices, or nothing for a mod with one outcome the page doesn't ask about. */
function OutcomePicker({ mod, bikeClass, choice, lang, onChoose }: { mod: ModView; bikeClass: ClassNum; choice: ModChoice; lang: Lang; onChoose: (c: ModChoice) => void }) {
  const name = useId();
  const options: { value: ModChoice; label: string }[] = [
    ...outcomesFor(mod, bikeClass).map((o) => ({ value: o.index as ModChoice, label: o.if[lang] })),
    { value: "other", label: modsText(lang, "other") },
  ];
  return (
    <fieldset className="mod-outcomes" id={askId(mod.id)} tabIndex={-1}>
      <legend className="field-label">{modsText(lang, "whatNow")}</legend>
      {options.map((o) => (
        <label key={String(o.value)} className="check">
          <input type="radio" name={name} checked={choice === o.value} onChange={() => onChoose(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

interface Initial {
  bikeClass: ClassNum | null;
  age: string;
  where: PlacePicks;
  labels: Record<string, PickLabels>;
  link: LinkedRide;
  today: string;
}

function readInitial(readOn: string): Initial {
  const search = window.location.search;
  const link = linkedRide(search);
  const linked = link.state ? linkedWhere(link.state, link.places) : null;
  return {
    bikeClass: linkedClass(search),
    age: linkedAge(search),
    where: linked?.where ?? NO_PICKS,
    labels: linked?.labels ?? {},
    link,
    today: modsToday(checkerToday(localToday()), readOn),
  };
}

export function ModsCheck({ data }: { data: ModsData }) {
  const [lang, switchLang] = useLang();
  const dateId = useId();
  const ageId = useId();
  const dateRef = useRef<HTMLInputElement>(null);
  const focusDate = useRef(false);
  const [initial] = useState(() => readInitial(data.readOn));
  const [where, setWhere] = useState<PlacePicks>(initial.where);
  const [labels, setLabels] = useState<Record<string, PickLabels>>(initial.labels);
  const [whereNote, setWhereNote] = useState<WhereNote | null>(null);
  const [bikeClass, setBikeClass] = useState<ClassNum | null>(initial.bikeClass);
  const [watts, setWatts] = useState<number | null>(null);
  const [followUps, setFollowUps] = useState<BikeFacts>(emptyFacts);
  const [asked, setAsked] = useState<QuestionId[]>([]);
  const [pickDate, setPickDate] = useState(false);
  const [dateText, setDateText] = useState(initial.today);
  const [ageText, setAgeText] = useState(initial.age);
  const [ageLeft, setAgeLeft] = useState(false);
  const age = modsAge(ageText);
  const [ticked, setTicked] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, ModChoice>>({});

  useEffect(() => {
    if (!pickDate || !focusDate.current) return;
    focusDate.current = false;
    dateRef.current?.focus();
  }, [pickDate]);

  // The checker's link names its state and places. Picks with no checked record, SDUHSD, or the
  // state alone become chips once the place index loads.
  useEffect(() => {
    const { state, pickIds } = initial.link;
    if (state === null || (pickIds.length === 0 && initial.where.picks.length > 0)) return;
    let live = true;
    loadSearchIndex()
      .then((index) => {
        if (!live) return;
        const entries = pickIds.map((id) => index.byId.get(id)).filter((e): e is PlaceEntry => e !== undefined);
        setLabels((cur) => ({ ...cur, ...Object.fromEntries([...entries, ...(index.byId.has(`s-${state}`) ? [index.byId.get(`s-${state}`) as PlaceEntry] : [])].map((e) => [e.id, pickLabels(index, e)])) }));
        setWhere((cur) => withLinkedRide(cur, state, entries, index.byId.get(`s-${state}`)));
      })
      .catch(() => {
        // The family can still pick the place in the search.
      });
    return () => {
      live = false;
    };
  }, [initial]);

  const rideDate = modsRideDate(pickDate, dateText, initial.today);
  const stateCode = where.state;
  const rideAt = useMemo(() => (stateCode ? rideWhere(where, stateCode, false) : null), [where, stateCode]);
  const riderAge = typeof age === "number" ? age : null;
  const ride: ModRide | null = stateCode && rideAt && riderAge !== null && rideDate !== null ? { state: stateCode, places: rideAt.places, otherPlaces: rideAt.otherPlaces, riderAge, rideDate } : null;
  const base = useMemo(() => (bikeClass === null ? null : baseFacts(bikeClass, watts, followUps)), [bikeClass, watts, followUps]);
  const shownMods = bikeClass === null ? data.mods : data.mods.filter((m) => modApplies(m, bikeClass));

  const result = useMemo(() => {
    if (!ride || !base || bikeClass === null) return null;
    const mods = data.mods.filter((m) => ticked.includes(m.id) && modApplies(m, bikeClass)).map((m) => ({ mod: m, choice: choices[m.id] ?? null }));
    const answers = mods.map(({ mod, choice }) => ({ mod, answer: answerRide(data, mod, bikeClass, choice, base, ride) }));
    const combined = mods.length > 0 ? combinedRun(mods, bikeClass, base, ride) : null;
    const plain = runEngine(ride, base);
    const list = answers.map((a) => a.answer);
    return { answers, combined, plain, yes: overallRideYes(list, combined) === true, pending: [...new Set([...plain.questions, ...openQuestions(list, combined)])] };
    // ride is rebuilt on every draw from the values below, so they are the dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, bikeClass, base, ticked, choices, stateCode, rideAt, riderAge, rideDate]);

  // A follow-up question stays on screen once asked, so "not sure" or a wrong answer can be changed.
  const questions = keepAsked(asked, result?.pending ?? []);
  if (questions.length !== asked.length) setAsked(questions);

  const notChecked = uncheckedPicks(where);
  const uncheckedNames = notChecked.filter((p) => p.kind !== "district").map((p) => labels[p.id]?.[lang].name ?? p.name);
  const uncheckedDistricts = notChecked.filter((p) => p.kind === "district").map((p) => p.name);
  const pickNames = where.picks.filter((p) => p.kind !== "state").map((p) => labels[p.id]?.[lang].name ?? p.name);

  function toggle(id: string, on: boolean) {
    setTicked((cur) => (on ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id)));
  }

  function pickPlace(entry: PlaceEntry, entryLabels: PickLabels) {
    setLabels((cur) => ({ ...cur, [entry.id]: entryLabels }));
    const change = addPick(where, entry);
    setWhere(change.next);
    if (change.next === where) setWhereNote({ key: "whereAlready", place: entryLabels });
    else if (change.startedOver) setWhereNote({ key: "whereStartedOver", ...change.startedOver });
    else setWhereNote({ key: "whereAdded", place: entryLabels });
  }

  const classOptions = ([1, 2, 3] as ClassNum[]).map((n) => ({ value: String(n) as "1" | "2" | "3", label: modsText(lang, `class${n}`) }));
  const waiting = stateCode === null ? "pickPlace" : age === null || age === "bad" ? "pickAge" : bikeClass === null ? "pickClass" : !result || result.answers.length === 0 ? "pickMods" : null;

  return (
    <div className="page">
      <SiteHeader lang={lang} current="mods" title={modsText(lang, "title")} onSwitchLang={switchLang}>
        <p className="tagline">{modsText(lang, "tagline")}</p>
      </SiteHeader>

      <Card title={modsText(lang, "step1")} step={1}>
        <PlaceSearch
          lang={lang}
          state={stateCode ?? ""}
          picks={where.picks.map((p) => {
            const label = (labels[p.id] ?? pickLabels(SD_COUNTY_NAMES, p))[lang];
            return { id: p.id, label, detail: resultDetail(p, label, lang) };
          })}
          onPick={pickPlace}
          onRemove={(id) => {
            setWhere((cur) => removePick(cur, id));
            setWhereNote(labels[id] ? { key: "whereRemoved", place: labels[id] } : null);
          }}
        />
        <p role="status" className={whereNoteShown(whereNote) ? "note" : "sr-only"}>
          {whereNoteText(whereNote, lang)}
        </p>
        <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={ageId} className="field-label">
              {modsText(lang, "age")}
            </label>
            <p id={`${ageId}-help`} className="help">
              {modsText(lang, "ageHelp")}
            </p>
            <input
              id={ageId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={ageText}
              onChange={(e) => setAgeText(e.target.value)}
              onBlur={() => setAgeLeft(true)}
              aria-invalid={ageLeft && age === "bad"}
              aria-describedby={ageLeft && age === "bad" ? `${ageId}-help ${ageId}-err` : `${ageId}-help`}
              className="field w-32"
            />
            {ageLeft && age === "bad" ? (
              <p id={`${ageId}-err`} role="alert" className="field-error">
                {modsText(lang, "ageError")}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="field-label">{modsText(lang, "date")}</p>
            {pickDate ? (
              <div className="space-y-2">
                <label htmlFor={dateId} className="sr-only">
                  {modsText(lang, "date")}
                </label>
                <input
                  id={dateId}
                  ref={dateRef}
                  type="date"
                  min={initial.today}
                  max={MODS_LAST_DATE}
                  value={dateText}
                  onChange={(e) => setDateText(e.target.value || initial.today)}
                  aria-invalid={rideDate === null}
                  aria-describedby={rideDate === null ? `${dateId}-err` : undefined}
                  className="field w-full"
                />
                {rideDate === null ? (
                  <p id={`${dateId}-err`} role="alert" className="field-error">
                    {modsText(lang, "dateError", { last: formatDate(MODS_LAST_DATE, lang) })}
                  </p>
                ) : null}
                <p className="meta">{modsText(lang, "dateHelp")}</p>
              </div>
            ) : (
              <div className="flex min-h-12 flex-wrap items-center gap-x-3">
                <span>
                  {modsText(lang, "dateToday")}, {formatDate(initial.today, lang)}
                </span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    focusDate.current = true;
                    setPickDate(true);
                  }}
                >
                  {modsText(lang, "dateOther")}
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title={modsText(lang, "step2")} step={2}>
        <Choice
          legend={modsText(lang, "classLegend")}
          options={classOptions}
          value={bikeClass === null ? null : (String(bikeClass) as "1" | "2" | "3")}
          onChange={(v) => setBikeClass(Number(v) as ClassNum)}
        />
        <p>
          <Link className="link-btn" href={pageHref("/", lang)}>
            {modsText(lang, "notSure")}
          </Link>
        </p>
        <div className="border-t border-line pt-5">
          <NumberField label={modsText(lang, "watts")} help={modsText(lang, "wattsHelp")} value={watts} onChange={setWatts} min={WATTS_MIN} max={WATTS_MAX} rangeError={modsText(lang, "wattsError")} />
        </div>
      </Card>
      {base && questions.length > 0 ? <FollowUps lang={lang} questions={questions} facts={base} onChange={setFollowUps} /> : null}

      <Card title={modsText(lang, "step3")} step={3}>
        <fieldset className="mod-list">
          <legend className="sr-only">{modsText(lang, "modsLegend")}</legend>
          {shownMods.map((m) => {
            const on = ticked.includes(m.id);
            return (
              <div key={m.id} className="mod-item" data-on={on ? "true" : "false"}>
                <label className="check">
                  <input type="checkbox" checked={on} onChange={(e) => toggle(m.id, e.target.checked)} />
                  <span>
                    {m.name[lang]}
                    <span className="block help">{m.examples[lang]}</span>
                  </span>
                </label>
                {on && m.ask && bikeClass !== null ? (
                  <OutcomePicker mod={m} bikeClass={bikeClass} choice={choices[m.id] ?? null} lang={lang} onChoose={(c) => setChoices((cur) => ({ ...cur, [m.id]: c }))} />
                ) : null}
              </div>
            );
          })}
        </fieldset>
      </Card>

      <div className="space-y-4">
        <h2 className="step-head">
          <span aria-hidden="true" className="step">
            4
          </span>
          {modsText(lang, "step4")}
        </h2>
        {waiting !== null || !result || !ride || stateCode === null ? (
          <p className="note">{modsText(lang, waiting ?? "pickMods")}</p>
        ) : (
          <>
            {lang === "es" && stateCode === MODS_DATA_STATE ? <p className="note">{modsText(lang, "englishNote")}</p> : null}
            <Overall
              answers={result.answers.map((a) => a.answer)}
              combined={result.combined}
              yes={result.yes}
              lang={lang}
              rideDate={ride.rideDate}
              stateCode={stateCode}
              where={pickNames}
              unchecked={uncheckedLine(result.plain.line, lang, uncheckedNames, uncheckedDistricts)}
            />
            {result.answers.map(({ mod, answer }) => (
              <ModAnswerCard key={mod.id} mod={mod} answer={answer} lang={lang} />
            ))}
          </>
        )}
        <p role="status" className="sr-only">
          {waiting === null && result ? `${modsText(lang, "overallTitle")} ${modsText(lang, result.yes ? "yes" : "no")}.` : ""}
        </p>
      </div>

      <footer className="site-foot">
        {stateCode ? <p className="meta">{modsText(lang, "stateChecked", { where: stateWhere(stateCode, lang), date: formatDate(getState(stateCode).lastChecked, lang) })}</p> : null}
        {stateCode === MODS_DATA_STATE ? (
          <>
            <p className="meta">{modsText(lang, "readOn", { date: formatDate(data.readOn, lang) })}</p>
            <div className="meta">
              <p>{modsText(lang, "leftOut")}</p>
              <ul className="list-disc pl-5">
                {data.leftOut.map((l) => (
                  <li key={l.mod} data-claim="" lang="en">
                    {l.mod}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
        <p className="meta">{t(lang, "notLegalAdvice")}</p>
      </footer>
    </div>
  );
}
