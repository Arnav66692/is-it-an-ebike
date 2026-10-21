"use client";

// The California mods check. The family picks the bike's class, ticks each change made to it and,
// where the law turns on what the change does, picks that. Each mod gets a YES or NO for riding
// it as an e-bike, with the reason, the penalties and the law, all from data/mods/ca-mods.json.

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatDate, type Lang } from "@/lib/i18n/names";
import { kindText, modsText } from "@/lib/i18n/mods";
import { t } from "@/lib/i18n/ui";
import { answerMod, modApplies, outcomesFor, overallYes, type ModAnswer, type ModChoice } from "@/lib/mods/answer";
import type { ModPenalty, ModRule, ModsData, ModView } from "@/lib/mods/types";
import { localToday } from "@/lib/rules/dates";
import type { ClassNum } from "@/lib/rules/types";
import { Card, Choice } from "./controls";
import { pageHref, SiteHeader, useLang } from "./SiteHeader";

/** The last ride date the page offers, the same as the checker's. */
export const MODS_LAST_DATE = "2029-12-31";

/** The class a link names, like /mods?class=2 from the checker's answer. */
export function linkedClass(search: string): ClassNum | null {
  const n = new URLSearchParams(search).get("class");
  return n === "1" || n === "2" || n === "3" ? (Number(n) as ClassNum) : null;
}

/** The first ride date the page checks: today, or the day the law was read if the device clock is behind. */
export function modsToday(deviceToday: string, readOn: string): string {
  return deviceToday > readOn ? deviceToday : readOn;
}

/** The ride date to answer for, or null when a picked date is outside today to the last date. */
export function modsRideDate(pickDate: boolean, dateText: string, today: string): string | null {
  if (!pickDate) return today;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && dateText >= today && dateText <= MODS_LAST_DATE ? dateText : null;
}

function DateLine({ rule, lang }: { rule: { effective: string | null; ends?: string | null }; lang: Lang }) {
  const parts = [
    rule.effective ? modsText(lang, "inEffect", { date: formatDate(rule.effective, lang) }) : null,
    rule.ends ? modsText(lang, "through", { date: formatDate(rule.ends, lang) }) : null,
  ].filter(Boolean);
  return parts.length > 0 ? <span className="source-date">{parts.join(". ")}</span> : null;
}

function RuleList({ title, rules, lang }: { title: string; rules: readonly ModRule[]; lang: Lang }) {
  if (rules.length === 0) return null;
  return (
    <div className="space-y-2">
      <h5 className="eyebrow">{title}</h5>
      <ul className="mod-rules" role="list">
        {rules.map((r, i) => (
          <li key={`${r.section}-${i}`} className="mod-rule">
            <a className="source-link" href={r.url} target="_blank" rel="noopener noreferrer" data-claim="" lang="en">
              {r.section}
            </a>
            <DateLine rule={r} lang={lang} />
            <p data-claim="" lang="en">
              {r.says}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** How many penalties show before the rest fold under "More penalties". */
export const PENALTIES_SHOWN = 3;

function PenaltyItem({ p, lang }: { p: ModPenalty; lang: Lang }) {
  return (
    <li className="mod-rule">
      <p className="font-semibold" data-claim="" lang="en">
        {p.for}
      </p>
      <p data-claim="" lang="en">
        {p.penaltyAsWritten}
      </p>
      <p className="source-date">
        {modsText(lang, "who")}{" "}
        <span data-claim="" lang="en">
          {p.who}
        </span>
      </p>
      <a className="source-link" href={p.url} target="_blank" rel="noopener noreferrer" data-claim="" lang="en">
        {p.section}
      </a>
    </li>
  );
}

/** Every penalty as the data gives it. The first few show, the rest fold under one tap. */
function PenaltyList({ penalties, lang }: { penalties: readonly ModPenalty[]; lang: Lang }) {
  if (penalties.length === 0) return null;
  const shown = penalties.slice(0, PENALTIES_SHOWN);
  const rest = penalties.slice(PENALTIES_SHOWN);
  return (
    <div className="space-y-2">
      <h5 className="eyebrow">{modsText(lang, "penalties")}</h5>
      <ul className="mod-rules" role="list">
        {shown.map((p, i) => (
          <PenaltyItem key={`${p.for}-${i}`} p={p} lang={lang} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="more">
          <summary>{rest.length === 1 ? modsText(lang, "morePenalty") : modsText(lang, "morePenalties", { n: rest.length })}</summary>
          <ul className="mod-rules more-body" role="list">
            {rest.map((p, i) => (
              <PenaltyItem key={`${p.for}-${i}`} p={p} lang={lang} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** The answer's first line, like "Still Class 2." or "No longer an e-bike." */
export function answerHead(answer: ModAnswer, lang: Lang): string {
  return kindText(lang, answer.kind, { n: answer.classAfter ?? "", section: answer.breaks?.section ?? "" });
}

/** One mod's answer card. */
export function ModAnswerCard({ mod, answer, lang }: { mod: ModView; answer: ModAnswer; lang: Lang }) {
  const word = answer.yes ? "yes" : "no";
  return (
    <article className="card place space-y-3" data-answer={word} data-kind={answer.kind} aria-label={mod.name[lang]}>
      <header className="place-head">
        <h4 className="place-title">{mod.name[lang]}</h4>
        <p className="badge" data-answer={word}>
          <span aria-hidden="true">{answer.yes ? "✓" : "✕"}</span>
          <span>{modsText(lang, answer.yes ? "yes" : "no")}</span>
        </p>
      </header>
      <p className="font-semibold leading-snug" data-answer-line="">
        {answerHead(answer, lang)}
      </p>
      {answer.reasons.map((r) => (
        <p key={r} data-claim="" lang="en">
          {r}
        </p>
      ))}
      {answer.breaks ? <RuleList title={modsText(lang, "law")} rules={[answer.breaks]} lang={lang} /> : null}
      <PenaltyList penalties={answer.penalties} lang={lang} />
      <details className="more">
        <summary>{modsText(lang, "more")}</summary>
        <div className="more-body">
          <RuleList title={modsText(lang, "law")} rules={answer.rules} lang={lang} />
          <RuleList title={modsText(lang, "sanDiego")} rules={answer.sanDiego} lang={lang} />
          <RuleList title={modsText(lang, "notEbike")} rules={answer.notEbike} lang={lang} />
          <RuleList title={modsText(lang, "from2027")} rules={answer.from2027} lang={lang} />
          {mod.selling ? (
            <div className="space-y-2">
              <h5 className="eyebrow">{modsText(lang, "selling")}</h5>
              <p data-claim="" lang="en">
                {mod.selling.summary}
              </p>
            </div>
          ) : null}
          <footer className="meta space-y-1 border-t border-line pt-3">
            <p>
              {modsText(lang, "confidence")},{" "}
              <span data-claim="" lang="en">
                {mod.confidence}
              </span>
              .{" "}
              <span data-claim="" lang="en">
                {mod.confidenceNote}
              </span>
            </p>
          </footer>
        </div>
      </details>
    </article>
  );
}

/** The whole answer: YES only when every ticked mod is YES. */
function Overall({ answers, lang, rideDate, city }: { answers: readonly ModAnswer[]; lang: Lang; rideDate: string; city: boolean }) {
  const headingId = useId();
  const yes = overallYes(answers) === true;
  const noCount = answers.filter((a) => !a.yes).length;
  const reason = yes
    ? modsText(lang, "overallYes")
    : modsText(lang, noCount === 1 ? "overallNoOne" : "overallNoMany", { n: noCount, total: answers.length });
  return (
    <section className="card bottom-line" data-kind={yes ? "yes" : "no_illegal"} aria-labelledby={headingId}>
      <header className="bl-top">
        <h3 id={headingId} className="eyebrow">
          {modsText(lang, "overallTitle")}
        </h3>
        <p className="bl-head" data-answer={yes ? "yes" : "no"}>
          <span className="bl-mark" aria-hidden="true">
            {yes ? "✓" : "✕"}
          </span>
          <span>{modsText(lang, yes ? "yes" : "no")}</span>
        </p>
        <p className="bl-reason" data-answer-line="">
          {reason}
        </p>
        <p>{modsText(lang, city ? "overallCity" : "overallDate", { date: formatDate(rideDate, lang) })}</p>
      </header>
      <div className="bl-body">
        <footer className="bl-foot meta">
          <p>{t(lang, "notLegalAdvice")}</p>
        </footer>
      </div>
    </section>
  );
}

function OutcomePicker({ mod, bikeClass, choice, lang, onChoose }: { mod: ModView; bikeClass: ClassNum; choice: ModChoice; lang: Lang; onChoose: (c: ModChoice) => void }) {
  const name = useId();
  const options: { value: ModChoice; label: string }[] = [
    ...outcomesFor(mod, bikeClass).map((o) => ({ value: o.index as ModChoice, label: o.if[lang] })),
    { value: "other", label: modsText(lang, "other") },
  ];
  return (
    <fieldset className="mod-outcomes">
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

export function ModsCheck({ data }: { data: ModsData }) {
  const [lang, switchLang] = useLang();
  const dateId = useId();
  const dateRef = useRef<HTMLInputElement>(null);
  const focusDate = useRef(false);
  const [bikeClass, setBikeClass] = useState<ClassNum | null>(() => linkedClass(window.location.search));
  const [today] = useState(() => modsToday(localToday(), data.readOn));
  const [pickDate, setPickDate] = useState(false);
  const [dateText, setDateText] = useState(today);
  const [city, setCity] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, ModChoice>>({});

  useEffect(() => {
    if (!pickDate || !focusDate.current) return;
    focusDate.current = false;
    dateRef.current?.focus();
  }, [pickDate]);

  const rideDate = modsRideDate(pickDate, dateText, today);
  const shownMods = bikeClass === null ? data.mods : data.mods.filter((m) => modApplies(m, bikeClass));
  const answers = useMemo(() => {
    if (bikeClass === null || rideDate === null) return [];
    return data.mods
      .filter((m) => ticked.includes(m.id) && modApplies(m, bikeClass))
      .map((m) => ({ mod: m, answer: answerMod(data, m, bikeClass, choices[m.id] ?? null, rideDate, city) }));
  }, [data, bikeClass, ticked, choices, rideDate, city]);

  function toggle(id: string, on: boolean) {
    setTicked((cur) => (on ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id)));
  }

  const classOptions = ([1, 2, 3] as ClassNum[]).map((n) => ({ value: String(n) as "1" | "2" | "3", label: modsText(lang, `class${n}`) }));

  return (
    <div className="page">
      <SiteHeader lang={lang} current="mods" title={modsText(lang, "title")} onSwitchLang={switchLang}>
        <p className="tagline">{modsText(lang, "tagline")}</p>
        <p className="tagline-note">{modsText(lang, "caOnly")}</p>
      </SiteHeader>

      <Card title={modsText(lang, "step1")} step={1}>
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
        <div className="space-y-2 border-t border-line pt-5">
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
                min={today}
                max={MODS_LAST_DATE}
                value={dateText}
                onChange={(e) => setDateText(e.target.value || today)}
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
                {modsText(lang, "dateToday")}, {formatDate(today, lang)}
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
        <label className="check border-t border-line pt-5">
          <input type="checkbox" checked={city} onChange={(e) => setCity(e.target.checked)} />
          <span>{modsText(lang, "sdCity")}</span>
        </label>
      </Card>

      <Card title={modsText(lang, "step2")} step={2}>
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
            3
          </span>
          {modsText(lang, "step3")}
        </h2>
        {bikeClass === null ? (
          <p className="note">{modsText(lang, "pickClass")}</p>
        ) : answers.length === 0 || rideDate === null ? (
          <p className="note">{modsText(lang, "pickMods")}</p>
        ) : (
          <>
            <Overall answers={answers.map((a) => a.answer)} lang={lang} rideDate={rideDate} city={city} />
            {answers.map(({ mod, answer }) => (
              <ModAnswerCard key={mod.id} mod={mod} answer={answer} lang={lang} />
            ))}
          </>
        )}
        <p role="status" className="sr-only">
          {answers.length > 0 && rideDate !== null
            ? `${modsText(lang, "overallTitle")} ${modsText(lang, overallYes(answers.map((a) => a.answer)) ? "yes" : "no")}.`
            : ""}
        </p>
      </div>

      <footer className="site-foot">
        {lang === "es" ? <p className="meta">{modsText(lang, "englishNote")}</p> : null}
        <p className="meta">{modsText(lang, "readOn", { date: formatDate(data.readOn, lang) })}</p>
        <p className="meta">
          {modsText(lang, "leftOut")}.{" "}
          {data.leftOut.map((l) => (
            <span key={l.mod} data-claim="" lang="en">
              {l.mod}.{" "}
            </span>
          ))}
        </p>
        <p className="meta">{t(lang, "notLegalAdvice")}</p>
      </footer>
    </div>
  );
}
