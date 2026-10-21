"use client";

// The answer cards of the mods check: one per ticked mod, and the whole answer above them. Every
// state's answer comes from the rules engine on the bike after the mod. In California each card also
// shows the verified mod rules, penalties and dates from data/mods/ca-mods.json, word for word.

import { useId } from "react";
import { formatDate, joinList, stateName, stateWhere, type Lang } from "@/lib/i18n/names";
import { kindText, modsText, whoText } from "@/lib/i18n/mods";
import { t } from "@/lib/i18n/ui";
import { renderLine } from "@/lib/i18n/verdicts";
import { overallCounts, overallYes, type ModAnswer } from "@/lib/mods/answer";
import { MODS_DATA_STATE, type EngineRun, type RideAnswer } from "@/lib/mods/ride";
import type { ModPenalty, ModRule, ModView } from "@/lib/mods/types";
import type { BottomLine } from "@/lib/rules/bottomLine";

/** A card's answer: California's alone, as the tests draw it, or the full answer for a ride. */
export type CardAnswer = ModAnswer & Partial<Pick<RideAnswer, "state" | "ca" | "engine">>;

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
        {modsText(lang, "who")} {whoText(lang, p.who)}
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

/** The answer's first line, like "Still Class 2." or "Not allowed as an e-bike." */
export function answerHead(answer: ModAnswer, lang: Lang): string {
  return kindText(lang, answer.kind, { n: answer.classAfter ?? "", section: answer.breaks?.section ?? "" });
}

/** The id of a mod's "What does it do now?" question, so an unanswered card can link to it. */
export function askId(modId: string): string {
  return `ask-${modId}`;
}

/** The engine's reasons under a NO, at most three, each once. An open question points to step 2. */
export function engineReasons(line: BottomLine, lang: Lang, stateCode: string): string[] {
  if (line.kind === "yes") return [];
  const state = stateName(stateCode, lang);
  const lines =
    line.kind === "no_illegal"
      ? line.blocked.map((b) => renderLine(b.line, lang, state))
      : line.missing.map((g) => (g.kind === "unanswered" ? modsText(lang, "answerQuestions") : renderLine(g.line, lang, state)));
  return [...new Set(lines)].slice(0, 3);
}

/** The one line outside California: that state's own rules for this mod and their penalties were not checked. */
export function notCheckedLine(stateCode: string, lang: Lang): string {
  return modsText(lang, "notChecked", { where: stateWhere(stateCode, lang) });
}

/** The overall line: how many mods break the law, can't be confirmed, or still need an answer. */
export function overallReason(answers: readonly ModAnswer[], lang: Lang): string {
  const total = answers.length;
  if (overallYes(answers)) {
    const age = answers.some((a) => a.effects.includes("class_3_age")) ? ` ${modsText(lang, "effect_class_3_age")}` : "";
    return `${modsText(lang, "overallYes")}${age}`;
  }
  const { breaks, unsure, ask } = overallCounts(answers);
  const part = (n: number, one: Parameters<typeof modsText>[1], many: Parameters<typeof modsText>[1]) => (n === 0 ? null : modsText(lang, n === 1 ? one : many, { n, total }));
  return [part(breaks, "overallBreaksOne", "overallBreaksMany"), part(unsure, "overallUnsureOne", "overallUnsureMany"), part(ask, "overallAskOne", "overallAskMany")]
    .filter(Boolean)
    .join(" ");
}

/** California's law, penalties and dates for the mod, folded under one tap. Only California has them. */
function CaliforniaMore({ mod, answer, lang }: { mod: ModView; answer: ModAnswer; lang: Lang }) {
  return (
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
  );
}

/** One mod's answer card. */
export function ModAnswerCard({ mod, answer, lang }: { mod: ModView; answer: CardAnswer; lang: Lang }) {
  const word = answer.yes ? "yes" : "no";
  const california = answer.state === undefined || answer.state === MODS_DATA_STATE;
  // The engine's reasons show when its NO is the answer, not under California's own NO.
  const engine = answer.engine && answer.kind.startsWith("engine_") ? engineReasons(answer.engine.line, lang, answer.state ?? MODS_DATA_STATE) : [];
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
      {answer.kind === "unanswered" ? (
        <p>
          <a className="link-btn" href={`#${askId(mod.id)}`}>
            {modsText(lang, "answerAbove")}
          </a>
        </p>
      ) : null}
      {engine.map((r) => (
        <p key={r} data-engine-reason="">
          {r}
        </p>
      ))}
      {answer.reasons.map((r) => (
        <p key={r} data-claim="" lang="en">
          {r}
        </p>
      ))}
      {answer.effects.map((e) => (
        <p key={e}>{modsText(lang, `effect_${e}`)}</p>
      ))}
      {answer.breaks ? <RuleList title={modsText(lang, "law")} rules={[answer.breaks]} lang={lang} /> : null}
      <PenaltyList penalties={answer.penalties} lang={lang} />
      {california ? <CaliforniaMore mod={mod} answer={answer} lang={lang} /> : <p className="meta">{notCheckedLine(answer.state ?? "", lang)}</p>}
    </article>
  );
}

interface OverallProps {
  answers: readonly RideAnswer[];
  /** The engine on every ticked mod at once. */
  combined: EngineRun | null;
  yes: boolean;
  lang: Lang;
  rideDate: string;
  stateCode: string;
  /** The picked places by name, or empty for the state alone. */
  where: readonly string[];
  /** The line naming places whose own rules were not checked, or null. */
  unchecked: string | null;
}

/** The whole answer: YES only when every ticked mod is YES, and all of them together too. */
export function Overall({ answers, combined, yes, lang, rideDate, stateCode, where, unchecked }: OverallProps) {
  const headingId = useId();
  const eachYes = overallYes(answers) === true;
  const together = eachYes && !yes && combined !== null && combined.line.kind !== "yes" ? combined.line : null;
  const reasons = together ? [modsText(lang, together.kind === "no_illegal" ? "overallTogether_no_illegal" : "overallTogether_no_unconfirmed"), ...engineReasons(together, lang, stateCode)] : [overallReason(answers, lang)];
  const whereText = where.length > 0 ? joinList([...where], lang) : stateName(stateCode, lang);
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
        {reasons.map((r, i) => (
          <p key={r} className={i === 0 ? "bl-reason" : undefined} data-answer-line={i === 0 ? "" : undefined}>
            {r}
          </p>
        ))}
        <p>{modsText(lang, "overallWhere", { date: formatDate(rideDate, lang), where: whereText })}</p>
        {unchecked ? <p>{unchecked}</p> : null}
      </header>
      <div className="bl-body">
        <footer className="bl-foot meta">
          <p>{t(lang, "notLegalAdvice")}</p>
        </footer>
      </div>
    </section>
  );
}
