"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { checkerToday, focusGate, LAST_RIDE_DATE, msUntilNextDay, nextAsked, parseShareLink, readMayMoveFocus, rideDateFor, type AskedQuestions } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import type { Evidence as Ev, Extraction, FactKey } from "@/lib/extract/parse";
import { checkCounts, confirmOn, editOn, emptyChecked, fromRead, pedalCallOn, summaryFor, unconfirmedFields, type CheckedFacts } from "@/lib/provenance";
import { evaluate, MAX_AGE_INPUT, MIN_AGE_INPUT, STATE_CODES } from "@/lib/rules";
import { localToday } from "@/lib/rules/dates";
import { emptyFacts, type BikeFacts, type QuestionId, type ReadField } from "@/lib/rules/types";
import { formatDate, placeHint, placeName, stateLaw, stateName, stateOf, stateWhere, type Lang } from "@/lib/i18n/names";
import { readAnnouncement, t } from "@/lib/i18n/ui";
import { linkedWhere, pickLabels, SD_COUNTY_NAMES, type PickLabels } from "@/lib/places/linked";
import { addPick, campusPick, isCampusPick, removePick, rideWhere, uncheckedPicks, type PlacePicks } from "@/lib/places/picks";
import type { PlaceEntry } from "@/lib/places/types";
import { BikeIcon } from "./BikeIcon";
import { BikeInput } from "./BikeInput";
import { announcement, BottomLineCard } from "./BottomLineCard";
import { Card, LaterStep } from "./controls";
import { FactsCard } from "./FactsCard";
import { FollowUps } from "./FollowUps";
import { Coverage, TitleWords } from "./Hero";
import { PlaceSearch, resultDetail } from "./PlaceSearch";
import { pageHref, SiteNav } from "./SiteHeader";
import { VerdictCard } from "./VerdictCard";

type Stage = "input" | "facts" | "result";

function readStoredLang(): Lang | null {
  try {
    const v = window.localStorage.getItem("lang");
    return v === "es" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

interface Initial {
  lang: Lang;
  state: string;
  where: PlacePicks;
  labels: Record<string, PickLabels>;
  campus: boolean;
  today: string;
}

/** Reads the QR or shared-link settings once. This component only renders in the browser. */
function readInitial(): Initial {
  const link = parseShareLink(window.location.search);
  return {
    lang: link.lang ?? readStoredLang() ?? (navigator.language.startsWith("es") ? "es" : "en"),
    state: link.state,
    ...linkedWhere(link.state, link.places),
    today: checkerToday(localToday()),
  };
}

/**
 * A status line about the places: one added, removed or already there, or a move to another
 * state's law. A move to another state is shown on the page, not only read out, and so is the
 * SDUHSD campus choice it removes.
 */
export interface WhereNote {
  key: "whereAdded" | "whereRemoved" | "whereAlready" | "whereStartedOver" | "whereStateSwitched" | "whereAddedNewState" | "whereNewState";
  place?: PickLabels;
  from?: string;
  to?: string;
  /** The SDUHSD campus was ticked and the move to another state removed it. */
  campusRemoved?: boolean;
}

/**
 * The status line's words. States are named the way the answers name them, so Spanish says
 * "en el Distrito de Columbia" and "la ley del Distrito de Columbia", with the article.
 */
export function whereNoteText(note: WhereNote | null, lang: Lang): string {
  if (!note) return "";
  const from = note.from ?? "";
  const to = note.to ?? "";
  const main = t(lang, note.key, {
    place: note.place?.[lang].text ?? "",
    inTo: stateWhere(to, lang),
    placesFrom: lang === "es" ? stateOf(from, lang) : stateWhere(from, lang),
    lawTo: stateLaw(to, lang, "inline"),
  });
  return note.campusRemoved ? `${main} ${t(lang, "whereCampusRemoved")}` : main;
}

/** True when the note says the answer moved to another state's law, so it is shown, not only read out. */
export function whereNoteShown(note: WhereNote | null): boolean {
  return note !== null && (note.to !== undefined || note.campusRemoved === true);
}

/**
 * How the page scrolls to a step: smoothly, or at once when the device asks for reduced motion.
 * Browsers don't turn a script's smooth scroll off for that setting on their own.
 */
export function scrollBehavior(media: ((query: string) => { matches: boolean }) | undefined = typeof window === "undefined" ? undefined : window.matchMedia?.bind(window)): ScrollBehavior {
  try {
    return media?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "smooth";
  }
}

function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem("lang", lang);
  } catch {
    // Private windows can block storage. The page works without it.
  }
}

export function Checker() {
  const ageId = useId();
  const stateId = useId();
  const dateId = useId();
  const factsRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const ageRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const bikeRef = useRef<HTMLDivElement>(null);
  // Set when "Check a future date" swaps its button for the date box, so focus moves to the box.
  const focusDate = useRef(false);
  // Set by Start over, so focus moves to the bike step once the answer is gone.
  const focusBike = useRef(false);
  // The control the family used last in the answer step, so it keeps focus if the questions move.
  const answerFocus = useRef<Element | null>(null);

  const [initial] = useState(readInitial);
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [stateCode, setStateCode] = useState(initial.state);
  const [ageText, setAgeText] = useState("");
  const [ageError, setAgeError] = useState(false);
  const [today, setToday] = useState(initial.today);
  const [dateText, setDateText] = useState(initial.today);
  const [pickDate, setPickDate] = useState(false);
  // The places picked in the search, all in the state the answer uses, and their labels.
  const [where, setWhere] = useState<PlacePicks>(initial.where);
  const [labels, setLabels] = useState<Record<string, PickLabels>>(initial.labels);
  const [campus, setCampus] = useState(initial.campus);
  // Set once the family uses the campus box, so unticking it keeps it on the page. A move to another state clears it.
  const [campusKept, setCampusKept] = useState(false);
  const [whereNote, setWhereNote] = useState<WhereNote | null>(null);
  const campusId = useId();
  // The facts and where each came from change together. Nothing here is saved, so a reload or a
  // shared link starts with no facts and nothing checked.
  const [bike, setBike] = useState<CheckedFacts>(emptyChecked);
  const facts = bike.facts;
  const [evidence, setEvidence] = useState<Partial<Record<FactKey, Ev[]>>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [stage, setStage] = useState<Stage>("input");
  const [round, setRound] = useState(0);
  const [asked, setAsked] = useState<AskedQuestions>({ round: -1, ids: [] });
  // Goes up on Start over, so the bike input starts fresh on its first tab.
  const [starts, setStarts] = useState(0);
  // Only the newest label or link read may fill in the facts. The gate also notes the control
  // each read started from, so a read that lands late takes focus only from that control.
  const [readGate] = useState(() => focusGate(() => document.activeElement));
  // How many facts the last read gave, for the status line a screen reader hears. Null clears it.
  // It is cleared once the family edits or ticks a fact, or switches the language, so it is never
  // drawn again in the other language and read out long after it was true.
  const [readNote, setReadNote] = useState<number | null>(null);
  // Set by a read that gave facts, so focus moves to the new facts card once it is on the page.
  const focusFacts = useRef(false);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // After a read, keyboard and screen reader focus moves to the heading of the new facts card, so
  // the family lands on the marked facts instead of staying on the button they pressed. A family
  // who moved on to another control while the label or link was read keeps their place.
  useEffect(() => {
    if (!focusFacts.current) return;
    focusFacts.current = false;
    if (!readMayMoveFocus(document.activeElement, document.body, readGate.startedFrom())) return;
    factsRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [round, readGate]);

  // "Check a future date" is replaced by the date box, so focus goes to the box, not to the page.
  useEffect(() => {
    if (!pickDate || !focusDate.current) return;
    focusDate.current = false;
    dateRef.current?.focus();
  }, [pickDate]);

  // Start over removes the answer and the buttons under it, Start over among them. Focus goes to
  // the bike step's heading, where the next step is, instead of falling to the page.
  useEffect(() => {
    if (!focusBike.current) return;
    focusBike.current = false;
    bikeRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [starts]);

  // Phones keep a tab open for days. "Today" is read again at midnight and whenever the page
  // comes back into view, so an old tab never answers for yesterday.
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, msUntilNextDay(new Date()));
    };
    function refresh() {
      setToday(checkerToday(localToday()));
      arm();
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    arm();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  const age = /^\d{1,3}$/.test(ageText.trim()) ? Number(ageText.trim()) : null;
  const ageValid = age !== null && age >= MIN_AGE_INPUT && age <= MAX_AGE_INPUT;
  // A typed date can fall outside the picker's range, so only a date from today to the last
  // date is ever checked. Anything else shows an error and no answer.
  const date = rideDateFor(pickDate, dateText, today);

  const ride = useMemo(() => rideWhere(where, stateCode, campus, campusKept), [where, stateCode, campus, campusKept]);
  const result = useMemo(() => {
    if (stage !== "result" || !ageValid || age === null || date === null) return null;
    return evaluate({
      state: stateCode,
      riderAge: age,
      rideDate: date,
      facts,
      places: ride.places,
      otherPlaces: ride.otherPlaces,
    });
  }, [stage, ageValid, age, stateCode, date, facts, ride]);
  // The picks whose own city, county or campus rules were not checked, named on the bottom line.
  const notChecked = uncheckedPicks(where);
  const unchecked = notChecked.filter((p) => p.kind !== "district").map((p) => labels[p.id]?.[lang].name ?? p.name);
  const uncheckedDistricts = notChecked.filter((p) => p.kind === "district").map((p) => p.name);

  // Every fact read from a link or photo that the family hasn't checked keeps the answer from a YES.
  // Worked out on every draw from the checks on screen, so no list kept from an earlier draw can reach it.
  const summary = summaryFor(result, date, bike.checks);
  // The same unchecked facts hold every allowed place card back from a YES too.
  const unconfirmed = unconfirmedFields(bike.checks);

  const pending: QuestionId[] = result
    ? [...new Set([...result.state.questions, ...result.local.flatMap((v) => v.questions)])]
    : [];
  // A follow-up stays on screen once asked, so "not sure" or a wrong answer can be changed,
  // even after the state changes. The list starts over only with new bike facts.
  const shown = nextAsked(asked, round, pending);
  if (shown.round !== asked.round || shown.ids.length !== asked.ids.length) {
    setAsked(shown);
  }
  const questions = shown.ids;
  // Questions still open come before the answer. Once they are answered, the answer leads and the
  // questions move under the place cards, where they can still be changed.
  const questionsFirst = pending.length > 0;
  // React moves the questions card, not draws it again, so its state stays. A browser drops focus
  // from a moved element, so the control the family just used gets focus back.
  useLayoutEffect(() => {
    const el = answerFocus.current as HTMLElement | null;
    answerFocus.current = null;
    if (el && el !== document.activeElement && el.isConnected !== false) el.focus?.({ preventScroll: true });
  }, [questionsFirst]);

  const sortedStates = [...STATE_CODES].sort((a, b) => stateName(a, lang).localeCompare(stateName(b, lang), lang));

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }));
  }

  /**
   * A change the family makes by hand. A read fact they change or answer counts as checked. The
   * change was built from the facts on screen, so it is dropped if a link, label or photo call
   * replaced them first (editOn in lib/provenance.ts).
   */
  function editFacts(next: BikeFacts, answered?: readonly ReadField[]) {
    answerFocus.current = typeof document === "undefined" ? null : document.activeElement;
    setReadNote(null);
    setBike(editOn(facts, next, answered));
  }

  /** A tick on a read fact, dropped the same way if the facts on screen were replaced first. */
  function confirmFact(field: ReadField, confirmed: boolean) {
    setReadNote(null);
    setBike(confirmOn(facts, field, confirmed));
  }

  /**
   * Takes the family back to the facts card. Keyboard focus goes to the first read fact still to
   * be ticked, or to the card's heading, so a screen reader user lands where the next step is.
   */
  function goToFacts() {
    requestAnimationFrame(() => {
      const card = factsRef.current;
      if (!card) return;
      const box = card.querySelector<HTMLInputElement>('input[data-read-check="unchecked"]');
      const target = box ?? card.querySelector<HTMLElement>("h2");
      (box ?? card).scrollIntoView({ behavior: scrollBehavior(), block: box ? "center" : "start" });
      target?.focus({ preventScroll: true });
    });
  }

  function handleRead(extraction: Extraction) {
    // A new link, pasted text or label photo is a new bike. Every value it gives comes in not checked.
    const next = fromRead(factsFromExtraction(extraction, emptyFacts()), "text");
    setBike(next);
    setEvidence(extraction.evidence);
    setFlags(extraction.flags);
    setStage("facts");
    setRound((r) => r + 1);
    scrollTo(factsRef);
    // The status line lives here, outside the card, so it is already on the page when it changes
    // and a screen reader reads it out. It is cleared first, so a second read with the same count
    // is read out again.
    const total = checkCounts(next.checks).read;
    focusFacts.current = total > 0;
    setReadNote(null);
    if (total > 0) requestAnimationFrame(() => setReadNote(total));
  }

  function handleManual() {
    readGate.cancel();
    setReadNote(null);
    setBike(emptyChecked());
    setEvidence({});
    setFlags([]);
    setStage("facts");
    setRound((r) => r + 1);
  }

  function handleCheck() {
    const now = checkerToday(localToday());
    if (now !== today) setToday(now);
    if (!ageValid) {
      setAgeError(true);
      ageRef.current?.focus();
      return;
    }
    if (rideDateFor(pickDate, dateText, now) === null) {
      dateRef.current?.focus();
      return;
    }
    setAgeError(false);
    setStage("result");
    scrollTo(resultsRef);
  }

  /**
   * San Dieguito Union High School District picked in the search. It ticks the SDUHSD campus box,
   * the checked campus record, instead of adding a chip. From another state it starts over in California.
   */
  function pickCampus(entry: PlaceEntry, entryLabels: PickLabels) {
    const change = campusPick(where, entry);
    const moved = entry.state !== stateCode;
    if (!moved && campus) {
      setWhereNote({ key: "whereAlready", place: entryLabels });
      return;
    }
    setWhere(change.next);
    if (moved) setStateCode(entry.state);
    setCampus(true);
    setCampusKept(true);
    if (change.startedOver) setWhereNote({ key: "whereStartedOver", ...change.startedOver });
    else if (moved) setWhereNote({ key: "whereAddedNewState", place: entryLabels, to: entry.state });
    else setWhereNote({ key: "whereAdded", place: entryLabels });
  }

  /** A place picked in the search. A place in another state starts over in that state. */
  function pickPlace(entry: PlaceEntry, entryLabels: PickLabels) {
    if (isCampusPick(entry)) {
      pickCampus(entry, entryLabels);
      return;
    }
    const change = addPick(where, entry);
    setLabels((cur) => ({ ...cur, [entry.id]: entryLabels }));
    setWhere(change.next);
    if (change.next === where) {
      setWhereNote({ key: "whereAlready", place: entryLabels });
      return;
    }
    const moved = entry.state !== stateCode;
    const campusRemoved = moved && campus;
    if (moved) {
      setStateCode(entry.state);
      setCampus(false);
      setCampusKept(false);
    }
    if (change.startedOver) setWhereNote({ key: "whereStartedOver", ...change.startedOver, campusRemoved });
    else if (moved) setWhereNote({ key: "whereAddedNewState", place: entryLabels, to: entry.state, campusRemoved });
    else setWhereNote({ key: "whereAdded", place: entryLabels });
  }

  function removePlace(id: string) {
    setWhere(removePick(where, id));
    setWhereNote(labels[id] ? { key: "whereRemoved", place: labels[id] } : null);
  }

  /** The plain state picker. Another state starts over, since one answer covers one state. */
  function pickState(code: string) {
    if (code === stateCode) return;
    const had = where.picks.length > 0;
    const campusRemoved = campus;
    setStateCode(code);
    setCampus(false);
    setCampusKept(false);
    setWhere({ state: code, picks: [] });
    if (had) setWhereNote({ key: "whereStateSwitched", from: stateCode, to: code, campusRemoved });
    else setWhereNote(campusRemoved ? { key: "whereNewState", to: code, campusRemoved } : null);
  }

  function switchLang() {
    const next: Lang = lang === "en" ? "es" : "en";
    setLang(next);
    storeLang(next);
    setReadNote(null);
    setWhereNote(null);
  }

  return (
    <div className="page">
      <header className="app-head hero">
        <div className="app-bar">
          <span className="brand-mark" aria-hidden="true">
            <BikeIcon />
          </span>
          <SiteNav lang={lang} current="check" />
          <button type="button" className="lang-btn" onClick={switchLang} aria-label={t(lang, "switchLangLabel")} lang={lang === "en" ? "es" : "en"}>
            {t(lang, "switchLang")}
          </button>
        </div>
        <h1 className="app-title">
          <TitleWords text={t(lang, "appName")} />
        </h1>
        <p className="tagline">{t(lang, "tagline")}</p>
        <Coverage words={(k) => t(lang, k)} />
      </header>

      <Card title={t(lang, "step1")} step={1}>
        <PlaceSearch
          lang={lang}
          state={stateCode}
          picks={where.picks.map((p) => {
            const label = (labels[p.id] ?? pickLabels(SD_COUNTY_NAMES, p))[lang];
            return { id: p.id, label, detail: resultDetail(p, label, lang) };
          })}
          onPick={pickPlace}
          onRemove={removePlace}
        />
        <p role="status" className={whereNoteShown(whereNote) ? "note" : "sr-only"}>
          {whereNoteText(whereNote, lang)}
        </p>

        {ride.campusShown ? (
          <fieldset className="space-y-1">
            <legend className="field-label">{t(lang, "campusLegend")}</legend>
            <label className="check">
              <input
                id={campusId}
                type="checkbox"
                aria-label={placeName("sduhsd_campuses", lang)}
                aria-describedby={`${campusId}-hint`}
                checked={campus}
                onChange={(e) => {
                  setCampus(e.target.checked);
                  setCampusKept(true);
                }}
              />
              <span>
                {placeName("sduhsd_campuses", lang)}
                <span id={`${campusId}-hint`} className="block help">
                  {placeHint("sduhsd_campuses", lang)}
                </span>
              </span>
            </label>
          </fieldset>
        ) : null}

        <div className="space-y-2">
          <label htmlFor={stateId} className="field-label">
            {t(lang, "state")}
          </label>
          <p id={`${stateId}-help`} className="help">
            {t(lang, "stateHelp")}
          </p>
          <select id={stateId} aria-describedby={`${stateId}-help`} className="field w-full" value={stateCode} onChange={(e) => pickState(e.target.value)}>
            {sortedStates.map((c) => (
              <option key={c} value={c}>
                {stateName(c, lang)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={ageId} className="field-label">
              {t(lang, "age")}
            </label>
            <input
              id={ageId}
              ref={ageRef}
              name="age"
              // A text box with a number keypad, not type="number", which a mouse wheel, a trackpad or
              // an arrow key can change. The age decides answers at 12, 15 and 16, so only typing changes it.
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={ageText}
              onChange={(e) => setAgeText(e.target.value)}
              aria-invalid={ageError && !ageValid}
              aria-describedby={ageError && !ageValid ? `${ageId}-err` : undefined}
              className="field w-32"
            />
            {ageError && !ageValid ? (
              <p id={`${ageId}-err`} role="alert" className="field-error">
                {t(lang, "ageError")}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="field-label">{t(lang, "date")}</p>
            {pickDate ? (
              <div className="space-y-2">
                <label htmlFor={dateId} className="sr-only">
                  {t(lang, "date")}
                </label>
                <input
                  id={dateId}
                  ref={dateRef}
                  type="date"
                  min={today}
                  max={LAST_RIDE_DATE}
                  value={dateText}
                  onChange={(e) => setDateText(e.target.value || today)}
                  aria-invalid={date === null}
                  aria-describedby={date === null ? `${dateId}-err` : undefined}
                  className="field w-full"
                />
                {date === null ? (
                  <p id={`${dateId}-err`} role="alert" className="field-error">
                    {t(lang, "dateError", { last: formatDate(LAST_RIDE_DATE, lang) })}
                  </p>
                ) : null}
                <p className="meta">{t(lang, "dateHelp")}</p>
              </div>
            ) : (
              <div className="flex min-h-12 flex-wrap items-center gap-x-3">
                <span>
                  {t(lang, "dateToday")}, {formatDate(today, lang)}
                </span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setDateText(today);
                    focusDate.current = true;
                    setPickDate(true);
                  }}
                >
                  {t(lang, "dateOther")}
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div ref={bikeRef} className="bike-step scroll-mt-4">
        <BikeInput key={`input-${starts}`} lang={lang} onRead={handleRead} onManual={handleManual} gate={readGate} />
      </div>

      <p role="status" className="sr-only">
        {readNote !== null ? readAnnouncement(lang, readNote) : ""}
      </p>
      <div ref={factsRef} className="scroll-mt-4">
        {stage !== "input" ? (
          <FactsCard
            key={`facts-${round}`}
            lang={lang}
            facts={facts}
            checks={bike.checks}
            evidence={evidence}
            flags={flags}
            onChange={editFacts}
            onConfirm={confirmFact}
            onPedalCall={(call) => setBike(pedalCallOn(facts, call))}
            onCheck={handleCheck}
          />
        ) : (
          <LaterStep title={t(lang, "step3")} step={3} hint={t(lang, "stepLater3")} />
        )}
      </div>

      <div ref={resultsRef} className="scroll-mt-4 space-y-4">
        {result ? (
          <>
            <h2 className="step-head">
              <span aria-hidden="true" className="step">
                4
              </span>
              {t(lang, "results")}
            </h2>
            {/* One keyed list, so the questions card moves when the answer comes first and keeps its state. */}
            {(() => {
              const questionsCard = <FollowUps key={`q-${round}`} lang={lang} questions={questions} facts={facts} onChange={editFacts} />;
              const answer = [
                summary ? <BottomLineCard key="bottom-line" line={summary} lang={lang} stateCode={stateCode} uncheckedPlaces={unchecked} uncheckedDistricts={uncheckedDistricts} /> : null,
                <h3 key="by-place" className="section-label">
                  {t(lang, "byPlace")}
                </h3>,
                <VerdictCard key={`card-${result.state.id}`} verdict={result.state} lang={lang} stateCode={stateCode} rideDate={summary?.rideDate ?? today} unconfirmed={unconfirmed} showLocalNotice={result.localNotice} />,
                ...result.local.map((v) => (
                  <VerdictCard key={`card-${v.id}`} verdict={v} lang={lang} stateCode={stateCode} rideDate={summary?.rideDate ?? today} unconfirmed={unconfirmed} />
                )),
              ];
              return questionsFirst ? [questionsCard, ...answer] : [...answer, questionsCard];
            })()}
          </>
        ) : (
          <LaterStep title={t(lang, "results")} step={4} hint={t(lang, "stepLater4")} />
        )}
        {/* Always in the page. Screen readers hear one short sentence when the answer appears or
            changes, not the whole card on every edit. */}
        <p role="status" className="sr-only">
          {summary ? announcement(summary, lang, unchecked, uncheckedDistricts) : ""}
        </p>
        {result ? (
          <div className="actions no-print">
            <button type="button" className="btn btn-quiet" onClick={goToFacts}>
              {t(lang, checkCounts(bike.checks).read > 0 ? "editFacts" : "editFactsTyped")}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                readGate.cancel();
                setStage("input");
                setStarts((n) => n + 1);
                setBike(emptyChecked());
                setReadNote(null);
                setEvidence({});
                setFlags([]);
                focusBike.current = true;
                scrollTo(bikeRef);
              }}
            >
              {t(lang, "startOver")}
            </button>
            {stateCode === "CA" ? (
              <Link className="btn btn-quiet" href={pageHref("/mods", lang, facts.classes.length === 1 ? { class: String(facts.classes[0]) } : {})}>
                {t(lang, "checkMods")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="site-foot">
        <details className="more">
          <summary>{t(lang, "howTitle")}</summary>
          <p className="pb-2">{t(lang, "howBody")}</p>
        </details>
        <details className="more">
          <summary>{t(lang, "privacyTitle")}</summary>
          <p className="pb-2">{t(lang, "privacyBody")}</p>
        </details>
        <nav className="foot-links no-print">
          <Link href={lang === "es" ? "/accuracy/es" : "/accuracy"}>{t(lang, "accuracy")}</Link>
          <Link href={`/qr?lang=${lang}`}>{t(lang, "flyer")}</Link>
        </nav>
        <p className="meta">{t(lang, "dataNote")}</p>
        <p className="meta">{t(lang, "notLegalAdvice")}</p>
      </footer>
    </div>
  );
}
