"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { checkerToday, LAST_RIDE_DATE, msUntilNextDay, nextAsked, parseShareLink, requestGate, rideDateFor, type AskedQuestions } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import type { Evidence as Ev, Extraction, FactKey } from "@/lib/extract/parse";
import { checkCounts, confirmOn, editOn, emptyChecked, fromRead, pedalCallOn, summaryFor, type CheckedFacts } from "@/lib/provenance";
import { evaluate, MAX_AGE_INPUT, MIN_AGE_INPUT, STATE_CODES } from "@/lib/rules";
import { localToday } from "@/lib/rules/dates";
import { emptyFacts, type BikeFacts, type PlaceId, type QuestionId, type ReadField } from "@/lib/rules/types";
import { formatDate, stateName, type Lang } from "@/lib/i18n/names";
import { readAnnouncement, t } from "@/lib/i18n/ui";
import { BikeInput } from "./BikeInput";
import { announcement, BottomLineCard } from "./BottomLineCard";
import { Card } from "./controls";
import { FactsCard } from "./FactsCard";
import { FollowUps } from "./FollowUps";
import { PlacePicker } from "./PlacePicker";
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
  places: PlaceId[];
  today: string;
}

/** Reads the QR or shared-link settings once. This component only renders in the browser. */
function readInitial(): Initial {
  const link = parseShareLink(window.location.search);
  return {
    lang: link.lang ?? readStoredLang() ?? (navigator.language.startsWith("es") ? "es" : "en"),
    state: link.state,
    places: link.places,
    today: checkerToday(localToday()),
  };
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

  const [initial] = useState(readInitial);
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [stateCode, setStateCode] = useState(initial.state);
  const [ageText, setAgeText] = useState("");
  const [ageError, setAgeError] = useState(false);
  const [today, setToday] = useState(initial.today);
  const [dateText, setDateText] = useState(initial.today);
  const [pickDate, setPickDate] = useState(false);
  const [places, setPlaces] = useState<PlaceId[]>(initial.places);
  const [otherPlaces, setOtherPlaces] = useState(false);
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
  // Only the newest label or link read may fill in the facts.
  const [readGate] = useState(requestGate);
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
  // the family lands on the marked facts instead of staying on the button they pressed.
  useEffect(() => {
    if (!focusFacts.current) return;
    focusFacts.current = false;
    factsRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [round]);

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

  const result = useMemo(() => {
    if (stage !== "result" || !ageValid || age === null || date === null) return null;
    return evaluate({
      state: stateCode,
      riderAge: age,
      rideDate: date,
      facts,
      places: stateCode === "CA" ? places : [],
      otherPlaces,
    });
  }, [stage, ageValid, age, stateCode, date, facts, places, otherPlaces]);

  // Every fact read from a link or photo that the family hasn't checked keeps the answer from a YES.
  // Worked out on every draw from the checks on screen, so no list kept from an earlier draw can reach it.
  const summary = summaryFor(result, date, bike.checks);

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

  const sortedStates = [...STATE_CODES].sort((a, b) => stateName(a, lang).localeCompare(stateName(b, lang), lang));

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  /**
   * A change the family makes by hand. A read fact they change or answer counts as checked. The
   * change was built from the facts on screen, so it is dropped if a link, label or photo call
   * replaced them first (editOn in lib/provenance.ts).
   */
  function editFacts(next: BikeFacts, answered?: readonly ReadField[]) {
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
      (box ?? card).scrollIntoView({ behavior: "smooth", block: box ? "center" : "start" });
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

  function togglePlace(p: PlaceId) {
    setPlaces((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  function switchLang() {
    const next: Lang = lang === "en" ? "es" : "en";
    setLang(next);
    storeLang(next);
    setReadNote(null);
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t(lang, "appName")}</h1>
          <p className="text-muted">{t(lang, "tagline")}</p>
        </div>
        <button type="button" className="btn btn-quiet shrink-0" onClick={switchLang} aria-label={t(lang, "switchLangLabel")} lang={lang === "en" ? "es" : "en"}>
          {t(lang, "switchLang")}
        </button>
      </header>

      <Card title={t(lang, "step1")} step={1}>
        <div className="space-y-1">
          <label htmlFor={stateId} className="block text-sm font-semibold">
            {t(lang, "state")}
          </label>
          <select id={stateId} className="field w-full" value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
            {sortedStates.map((c) => (
              <option key={c} value={c}>
                {stateName(c, lang)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={ageId} className="block text-sm font-semibold">
            {t(lang, "age")}
          </label>
          <input
            id={ageId}
            ref={ageRef}
            type="number"
            inputMode="numeric"
            min={MIN_AGE_INPUT}
            max={MAX_AGE_INPUT}
            value={ageText}
            onChange={(e) => setAgeText(e.target.value)}
            aria-invalid={ageError && !ageValid}
            aria-describedby={ageError && !ageValid ? `${ageId}-err` : undefined}
            className="field w-28"
          />
          {ageError && !ageValid ? (
            <p id={`${ageId}-err`} role="alert" className="text-sm font-semibold">
              {t(lang, "ageError")}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">{t(lang, "date")}</p>
          {pickDate ? (
            <div className="space-y-1">
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
                className="field"
              />
              {date === null ? (
                <p id={`${dateId}-err`} role="alert" className="text-sm font-semibold">
                  {t(lang, "dateError", { last: formatDate(LAST_RIDE_DATE, lang) })}
                </p>
              ) : null}
              <p className="text-sm text-muted">{t(lang, "dateHelp")}</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {t(lang, "dateToday")}, {formatDate(today, lang)}
              </span>
              <button
                type="button"
                className="text-sm underline"
                onClick={() => {
                  setDateText(today);
                  setPickDate(true);
                }}
              >
                {t(lang, "dateOther")}
              </button>
            </div>
          )}
        </div>

        {stateCode === "CA" ? (
          <PlacePicker lang={lang} places={places} otherPlaces={otherPlaces} onTogglePlace={togglePlace} onOtherPlaces={setOtherPlaces} />
        ) : null}
      </Card>

      <BikeInput key={`input-${starts}`} lang={lang} onRead={handleRead} onManual={handleManual} gate={readGate} />

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
        ) : null}
      </div>

      <div ref={resultsRef} className="scroll-mt-4 space-y-4">
        {result ? (
          <>
            <FollowUps key={`q-${round}`} lang={lang} questions={questions} facts={facts} onChange={editFacts} />
            <h2 className="text-xl font-bold">{t(lang, "results")}</h2>
            <VerdictCard verdict={result.state} lang={lang} stateCode={stateCode} showLocalNotice={result.localNotice} />
            {result.local.map((v) => (
              <VerdictCard key={v.id} verdict={v} lang={lang} stateCode={stateCode} />
            ))}
          </>
        ) : null}
        {summary ? <BottomLineCard line={summary} lang={lang} stateCode={stateCode} /> : null}
        {/* Always in the page. Screen readers hear one short sentence when the answer appears or
            changes, not the whole card on every edit. */}
        <p role="status" className="sr-only">
          {summary ? announcement(summary, lang) : ""}
        </p>
        {result ? (
          <>
            <div className="no-print flex flex-wrap gap-3">
              <button type="button" className="btn btn-quiet" onClick={goToFacts}>
                {t(lang, "editFacts")}
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
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {t(lang, "startOver")}
              </button>
            </div>
          </>
        ) : null}
      </div>

      <footer className="space-y-4 border-t border-line pt-6 text-sm">
        <section className="space-y-1">
          <h2 className="font-bold">{t(lang, "howTitle")}</h2>
          <p>{t(lang, "howBody")}</p>
        </section>
        <section className="space-y-1">
          <h2 className="font-bold">{t(lang, "privacyTitle")}</h2>
          <p>{t(lang, "privacyBody")}</p>
        </section>
        <nav className="no-print flex flex-wrap gap-x-5 gap-y-2">
          <Link href={lang === "es" ? "/accuracy/es" : "/accuracy"} className="underline">
            {t(lang, "accuracy")}
          </Link>
          <Link href={`/qr?lang=${lang}`} className="underline">
            {t(lang, "flyer")}
          </Link>
        </nav>
        <p className="text-muted">{t(lang, "dataNote")}</p>
        <p className="text-muted">{t(lang, "notLegalAdvice")}</p>
      </footer>
    </div>
  );
}
