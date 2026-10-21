// The California mods check data: data/mods/ca-mods.json, the verified research with its sources,
// and data/mods/ca-mods.answers.json, which says how the app reads each mod outcome. This turns
// both into the small view the page needs. Every reason, rule and penalty the page shows is a
// string from ca-mods.json, word for word. tests/mods.test.ts checks that.

import answersFile from "@/data/mods/ca-mods.answers.json";
import modsFile from "@/data/mods/ca-mods.json";
import type { ClassNum } from "@/lib/rules/types";
import { MOD_RESULTS, RESULT_FROM_EFFECT, type ModPenalty, type ModResult, type ModRule, type ModsData, type ModView, type OutcomeView } from "./types";

export * from "./types";

interface RawRule {
  section: string;
  url: string;
  says: string;
  effective?: string | null;
  ends?: string | null;
}

interface RawPenalty {
  who: string;
  for: string;
  section: string;
  url: string;
  penalty_as_written: string;
  effective?: string | null;
}

interface RawOutcome {
  if: string;
  legal_effect: string;
  why: string;
}

interface RawMod {
  mod_id: string;
  name: string;
  examples: string;
  applies_to: string[];
  plain_summary: string;
  outcomes: RawOutcome[];
  rules: RawRule[];
  san_diego?: RawRule[];
  if_no_longer_an_ebike?: RawRule[];
  from_2027?: RawRule[];
  selling_rule?: { summary: string; rules: RawRule[]; penalties: RawPenalty[] };
  penalties: RawPenalty[];
  confidence: string;
  confidence_note: string;
}

export interface RawModsFile {
  title: string;
  read_on: string;
  how_sources_were_read: string;
  legal_effect_values: Record<string, string>;
  mods_left_out: { mod: string; why: string }[];
  shared: { if_no_longer_an_ebike_penalties: RawPenalty[] };
  mods: RawMod[];
}

interface AnswerOutcome {
  result: string;
  es_if: string;
  breaks?: string;
  only_for?: number[];
  san_diego?: string;
}

export interface AnswersFile {
  /** Sections whose source ends date is the repeal date, so the last day in effect is the day before. */
  ends_is_repeal_date?: { sections: string[] };
  mods: Record<string, { es: { name: string; examples: string }; ask?: boolean; outcomes: AnswerOutcome[] }>;
}

const CLASS_IDS: Record<string, ClassNum> = { class_1: 1, class_2: 2, class_3: 3 };

const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

/** The day before an ISO date. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The last day a rule is in effect, from "Until Dec 31, 2026, ..." in its own words, or null. */
export function untilDate(says: string): string | null {
  const m = says.match(/^Until (\w{3}) (\d{1,2}), (\d{4}),/);
  return m && MONTHS[m[1]] ? `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2, "0")}` : null;
}

/**
 * One rule as the page shows it. Its end is always the last day it is in effect. A repeal date in
 * the source becomes the day before, and a rule that says "Until Dec 31, 2026" ends that day.
 */
function rule(r: RawRule, repeal: ReadonlySet<string>): ModRule {
  const ends = r.ends ? (repeal.has(r.section) ? dayBefore(r.ends) : r.ends) : untilDate(r.says);
  return { section: r.section, url: r.url, says: r.says, effective: r.effective ?? null, ends };
}

function penalty(p: RawPenalty): ModPenalty {
  return { who: p.who, for: p.for, section: p.section, url: p.url, penaltyAsWritten: p.penalty_as_written, effective: p.effective ?? null };
}

function isResult(value: string): value is ModResult {
  return (MOD_RESULTS as readonly string[]).includes(value);
}

function outcomeView(mod: RawMod, raw: RawOutcome, note: AnswerOutcome | undefined, index: number, repeal: ReadonlySet<string>): OutcomeView {
  if (!note) throw new Error(`${mod.mod_id} outcome ${index} has no answer note`);
  if (!isResult(note.result)) throw new Error(`${mod.mod_id} outcome ${index} has result "${note.result}"`);
  if (!(RESULT_FROM_EFFECT[raw.legal_effect] ?? []).includes(note.result)) {
    throw new Error(`${mod.mod_id} outcome ${index} reads ${raw.legal_effect} as ${note.result}`);
  }
  const breaks = note.breaks ? mod.rules.find((r) => r.section === note.breaks) : undefined;
  if ((note.result === "breaks_rule") !== Boolean(breaks)) throw new Error(`${mod.mod_id} outcome ${index} breaks "${note.breaks}", which is not one of its rules`);
  const onlyFor = note.only_for ? note.only_for.map((n) => n as ClassNum) : null;
  if (note.san_diego && (mod.san_diego ?? []).length === 0) throw new Error(`${mod.mod_id} has a San Diego note but no San Diego rule`);
  const sanDiego = note.san_diego === "breaks" || note.san_diego === "unresolved" ? note.san_diego : null;
  return { index, if: { en: raw.if, es: note.es_if }, why: raw.why, result: note.result, breaks: breaks ? rule(breaks, repeal) : null, onlyFor, sanDiego };
}

function modView(mod: RawMod, answers: AnswersFile): ModView {
  const repeal: ReadonlySet<string> = new Set(answers.ends_is_repeal_date?.sections ?? []);
  const toRule = (r: RawRule) => rule(r, repeal);
  const notes = answers.mods[mod.mod_id];
  if (!notes) throw new Error(`${mod.mod_id} has no answer notes`);
  if (notes.outcomes.length !== mod.outcomes.length) throw new Error(`${mod.mod_id} has ${mod.outcomes.length} outcomes and ${notes.outcomes.length} notes`);
  const outcomes = mod.outcomes.map((o, i) => outcomeView(mod, o, notes.outcomes[i], i, repeal));
  return {
    id: mod.mod_id,
    name: { en: mod.name, es: notes.es.name },
    examples: { en: mod.examples, es: notes.es.examples },
    appliesTo: mod.applies_to.map((c) => {
      const n = CLASS_IDS[c];
      if (!n) throw new Error(`${mod.mod_id} applies to "${c}"`);
      return n;
    }),
    summary: mod.plain_summary,
    ask: notes.ask === true || outcomes.length > 1,
    outcomes,
    rules: mod.rules.map(toRule),
    sanDiego: (mod.san_diego ?? []).map(toRule),
    notEbike: (mod.if_no_longer_an_ebike ?? []).map(toRule),
    from2027: (mod.from_2027 ?? []).map(toRule),
    penalties: mod.penalties.map(penalty),
    selling: mod.selling_rule ? { summary: mod.selling_rule.summary, rules: mod.selling_rule.rules.map(toRule), penalties: mod.selling_rule.penalties.map(penalty) } : null,
    confidence: mod.confidence,
    confidenceNote: mod.confidence_note,
  };
}

/** The view of the mods data. Throws when the answer notes don't match the source. */
export function buildModsData(file: RawModsFile, answers: AnswersFile): ModsData {
  const ids = new Set(file.mods.map((m) => m.mod_id));
  for (const id of Object.keys(answers.mods)) if (!ids.has(id)) throw new Error(`The answer notes name ${id}, which the source doesn't have`);
  const ended = new Set(file.mods.flatMap((m) => [...m.rules, ...(m.san_diego ?? []), ...(m.if_no_longer_an_ebike ?? []), ...(m.from_2027 ?? [])]).filter((r) => r.ends).map((r) => r.section));
  for (const section of answers.ends_is_repeal_date?.sections ?? []) if (!ended.has(section)) throw new Error(`The answer notes call ${section}'s end a repeal date, but the source gives it none`);
  return {
    title: file.title,
    readOn: file.read_on,
    howRead: file.how_sources_were_read,
    effectWords: file.legal_effect_values,
    leftOut: file.mods_left_out,
    notEbikePenaltyFors: file.shared.if_no_longer_an_ebike_penalties.map((p) => p.for),
    mods: file.mods.map((m) => modView(m, answers)),
  };
}

export const MODS_SOURCE = modsFile as unknown as RawModsFile;
export const MODS_ANSWERS = answersFile as unknown as AnswersFile;

/** The mods data, built once. Only the server imports this, so the page gets the view, not the whole file. */
export const MODS_DATA: ModsData = buildModsData(MODS_SOURCE, MODS_ANSWERS);
