"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { keepAsked, parseShareLink } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import type { Evidence as Ev, Extraction, FactKey } from "@/lib/extract/parse";
import { bottomLine, evaluate, MAX_AGE_INPUT, MIN_AGE_INPUT, PLACE_IDS, STATE_CODES } from "@/lib/rules";
import { localToday } from "@/lib/rules/dates";
import { emptyFacts, type BikeFacts, type PlaceId, type QuestionId } from "@/lib/rules/types";
import { formatDate, placeHint, placeName, stateName, type Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { BikeInput } from "./BikeInput";
import { announcement, BottomLineCard } from "./BottomLineCard";
import { Card } from "./controls";
import { FactsCard } from "./FactsCard";
import { FollowUps } from "./FollowUps";
import { VerdictCard } from "./VerdictCard";

type Stage = "input" | "facts" | "result";
const LAST_DATE = "2029-12-31";

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
    today: localToday(),
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

  const [initial] = useState(readInitial);
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [stateCode, setStateCode] = useState(initial.state);
  const [ageText, setAgeText] = useState("");
  const [ageError, setAgeError] = useState(false);
  const today = initial.today;
  const [date, setDate] = useState(initial.today);
  const [pickDate, setPickDate] = useState(false);
  const [places, setPlaces] = useState<PlaceId[]>(initial.places);
  const [otherPlaces, setOtherPlaces] = useState(false);
  const [facts, setFacts] = useState<BikeFacts>(emptyFacts());
  const [evidence, setEvidence] = useState<Partial<Record<FactKey, Ev[]>>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [stage, setStage] = useState<Stage>("input");
  const [round, setRound] = useState(0);
  const [asked, setAsked] = useState<{ key: string; ids: QuestionId[] }>({ key: "", ids: [] });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const age = /^\d{1,3}$/.test(ageText.trim()) ? Number(ageText.trim()) : null;
  const ageValid = age !== null && age >= MIN_AGE_INPUT && age <= MAX_AGE_INPUT;

  const result = useMemo(() => {
    if (stage !== "result" || !ageValid || age === null) return null;
    return evaluate({
      state: stateCode,
      riderAge: age,
      rideDate: date,
      facts,
      places: stateCode === "CA" ? places : [],
      otherPlaces,
    });
  }, [stage, ageValid, age, stateCode, date, facts, places, otherPlaces]);

  const summary = useMemo(() => (result ? bottomLine(result, date) : null), [result, date]);

  const pending: QuestionId[] = result
    ? [...new Set([...result.state.questions, ...result.local.flatMap((v) => v.questions)])]
    : [];
  // A follow-up stays on screen once asked, so "not sure" or a wrong answer can be changed.
  // The list starts over with new bike facts or a different state.
  const askKey = `${round}|${stateCode}`;
  const askedBefore = asked.key === askKey ? asked.ids : [];
  const questions = keepAsked(askedBefore, pending);
  if (asked.key !== askKey || questions.length !== askedBefore.length) {
    setAsked({ key: askKey, ids: questions });
  }

  const sortedStates = [...STATE_CODES].sort((a, b) => stateName(a, lang).localeCompare(stateName(b, lang), lang));

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function handleRead(extraction: Extraction) {
    setFacts(factsFromExtraction(extraction, emptyFacts()));
    setEvidence(extraction.evidence);
    setFlags(extraction.flags);
    setStage("facts");
    setRound((r) => r + 1);
    scrollTo(factsRef);
  }

  function handleManual() {
    setFacts(emptyFacts());
    setEvidence({});
    setFlags([]);
    setStage("facts");
    setRound((r) => r + 1);
  }

  function handleCheck() {
    if (!ageValid) {
      setAgeError(true);
      ageRef.current?.focus();
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
              <input id={dateId} type="date" min={today} max={LAST_DATE} value={date} onChange={(e) => setDate(e.target.value || today)} className="field" />
              <p className="text-sm text-muted">{t(lang, "dateHelp")}</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {t(lang, "dateToday")}, {formatDate(today, lang)}
              </span>
              <button type="button" className="text-sm underline" onClick={() => setPickDate(true)}>
                {t(lang, "dateOther")}
              </button>
            </div>
          )}
        </div>

        {stateCode === "CA" ? (
          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold">{t(lang, "whereSD")}</legend>
            <p className="text-sm text-muted">{t(lang, "whereSDHelp")}</p>
            {PLACE_IDS.map((p) => (
              <label key={p} className="check">
                <input type="checkbox" aria-label={placeName(p, lang)} checked={places.includes(p)} onChange={() => togglePlace(p)} />
                <span>
                  {placeName(p, lang)}
                  {placeHint(p, lang) ? <span className="block text-sm text-muted">{placeHint(p, lang)}</span> : null}
                </span>
              </label>
            ))}
            <label className="check">
              <input type="checkbox" aria-label={t(lang, "otherPlaces")} checked={otherPlaces} onChange={(e) => setOtherPlaces(e.target.checked)} />
              <span>{t(lang, "otherPlaces")}</span>
            </label>
          </fieldset>
        ) : null}
      </Card>

      <BikeInput lang={lang} onRead={handleRead} onManual={handleManual} />

      <div ref={factsRef} className="scroll-mt-4">
        {stage !== "input" ? (
          <FactsCard key={`facts-${round}`} lang={lang} facts={facts} evidence={evidence} flags={flags} onChange={setFacts} onCheck={handleCheck} />
        ) : null}
      </div>

      <div ref={resultsRef} className="scroll-mt-4 space-y-4">
        {result ? (
          <>
            <FollowUps key={`q-${round}`} lang={lang} questions={questions} facts={facts} onChange={setFacts} />
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
              <button type="button" className="btn btn-quiet" onClick={() => scrollTo(factsRef)}>
                {t(lang, "editFacts")}
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setStage("input");
                  setFacts(emptyFacts());
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
