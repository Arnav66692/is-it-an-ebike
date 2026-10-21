// What counts as a plain YES or NO on a rendered place card, bottom line or screen reader
// sentence. Used by tests/matrix.ts, the golden tests and tests/definiteAnswers.test.ts. It reads
// the rendered HTML and text, not the code that made them, so a hedge that slips in anywhere
// shows up.

import type { Lang } from "@/lib/i18n/names";

export type Answer = "yes" | "no";

/** The only words a card, the bottom line or an announcement may give as the answer. */
export const ANSWER_WORD: Record<Lang, Record<Answer, string>> = {
  en: { yes: "YES", no: "NO" },
  es: { yes: "SÍ", no: "NO" },
};

/**
 * Hedges that must never stand in for the answer, in either language, the way the old status
 * labels did. A line may explain a NO in a full sentence, like "We can't confirm it's legal in
 * South Carolina.", but no line anywhere on a card may be one of these, or start with one as a
 * label, like "Not confirmed. ..." or "Can't confirm".
 */
const STATUS_HEDGES = [
  "can't confirm",
  "cannot confirm",
  "not confirmed",
  "not confirmed yet",
  "unconfirmed",
  "unsure",
  "not sure",
  "a few questions",
  "no se puede confirmar",
  "no confirmada",
  "todavía no confirmada",
  "sin confirmar",
  "no sé",
  "unas preguntas",
];

/**
 * More hedges that may not lead the answer itself: the headline, the reason line under it and
 * the screen reader sentence. Notes lower on a card may still say a side rule is unclear, like
 * riding on Del Mar beaches.
 */
const ANSWER_HEDGES = [...STATUS_HEDGES, "maybe", "unknown", "unclear", "it depends", "quizá", "quizás", "no está claro", "depende"];

/** A mark shown in place of ✓ or ✕, like the "?" a NO we could not confirm once showed. */
const HEDGE_MARKS = ["?", "…", "¿?"];

/** The visible text of rendered HTML, one line per element, with the entities React writes put back. */
export function visibleLines(html: string): string[] {
  return html
    .replace(/<[^>]+>/g, "\n")
    .replace(/\u2011/g, "-")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normal(text: string): string {
  return text.replace(/[‘’]/g, "'").toLowerCase().trim();
}

/**
 * "not sure" or "no sé" as words of their own. JavaScript's \b only knows ASCII letters, so it
 * can't find the edge after the é, and the edges are spelled out here instead.
 */
const NOT_SURE = /(^|[^\p{L}])(not sure|no sé)(?=$|[^\p{L}])/u;

/** Text with every quoted phrase taken out, so "You answered "not sure"" can name the input choice. */
function unquoted(text: string): string {
  return text.replace(/"[^"]*"/g, "").replace(/“[^”]*”/g, "");
}

/**
 * Every way these lines give a hedge as the answer: a line that is a hedge label or starts with
 * one, a hedge mark, the word "unsure" anywhere, or "not sure" or "no sé" outside quotes. Lines
 * that are the answer itself are held to the longer list.
 */
export function hedgeProblems(lines: readonly string[], answer = false): string[] {
  const labels = answer ? ANSWER_HEDGES : STATUS_HEDGES;
  const problems: string[] = [];
  for (const line of lines) {
    const l = normal(line);
    if (HEDGE_MARKS.includes(l)) problems.push(`hedge mark "${line}"`);
    for (const label of labels) {
      const rest = l.startsWith(label) ? l.slice(label.length) : null;
      if (rest !== null && (rest === "" || /^[.,:;!?)]/.test(rest))) problems.push(`hedge label "${line}"`);
    }
    if (/\bunsure\b/.test(l)) problems.push(`says unsure: "${line}"`);
    if (NOT_SURE.test(normal(unquoted(line)))) problems.push(`says not sure outside quotes: "${line}"`);
  }
  return problems;
}

/**
 * The headline of a rendered card: the one <p> marked data-answer must read exactly YES or NO in
 * the card's language, match the answer it is marked with, and match the answer expected. The ✓
 * or ✕ beside it is hidden from screen readers. The one line marked data-answer-line under it must
 * give a plain reason, never a hedge.
 */
export function headlineProblems(html: string, lang: Lang, expected: Answer): string[] {
  const heads = [...html.matchAll(/<p\b[^>]*\bdata-answer="(yes|no)"[^>]*>/g)];
  if (heads.length !== 1) return [`${heads.length} headlines`];
  const reasons = html.split('data-answer-line=""').length - 1;
  const { word, mark, line } = shownAnswer(html);
  const problems: string[] = [];
  if (heads[0][1] !== expected) problems.push(`marked ${heads[0][1]}, expected ${expected}`);
  if (word !== ANSWER_WORD[lang][expected]) problems.push(`headline "${word}", expected "${ANSWER_WORD[lang][expected]}"`);
  if (mark !== (expected === "yes" ? "✓" : "✕")) problems.push(`mark "${mark}"`);
  if (reasons !== 1) problems.push(`${reasons} reason lines under the headline`);
  if (line === "") problems.push("no reason under the headline");
  return [...problems, ...hedgeProblems(line ? [line] : [], true)];
}

/** The screen reader sentence: "Bottom line: YES." or "Bottom line: NO." first, then a plain reason. */
export function announcementProblems(sentence: string, lang: Lang, expected: Answer, title: string): string[] {
  const start = `${title}: ${ANSWER_WORD[lang][expected]}. `;
  const problems: string[] = [];
  if (!sentence.startsWith(start)) problems.push(`announcement starts "${sentence.slice(0, start.length + 10)}"`);
  // Each sentence after the answer is checked like a line on the card.
  const rest = sentence.slice(start.length).split(/(?<=\.)\s+/);
  return [...problems, ...hedgeProblems(rest, true)];
}

/** The YES or NO a rendered card shows, the mark beside it and the line under it, as a family reads them. */
export function shownAnswer(html: string): { word: string; mark: string; line: string } {
  const head = /<p\b[^>]*\bdata-answer="(?:yes|no)"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
  const hidden = /<span\b[^>]*\baria-hidden="true"[^>]*>([^<]*)<\/span>/g;
  const line = /<p\b[^>]*\bdata-answer-line=""[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
  return {
    word: visibleLines(head.replace(hidden, "")).join(" "),
    mark: [...head.matchAll(hidden)].map((m) => m[1]).join(""),
    line: visibleLines(line).join(" "),
  };
}
