// Reads e-bike facts out of text: OCR output from a class label, or a product listing.
// Fixed rules, no model. It only reports a value it finds written in the text, and every
// value carries the exact words it came from, so the "what I read" card can show them.

import type { BikeFacts, ClassNum } from "@/lib/rules/types";

export type TextSource = "label" | "listing";

export type FactKey =
  | "hasPedals"
  | "classes"
  | "ratedWatts"
  | "peakWatts"
  | "wattsUpTo"
  | "hasThrottle"
  | "throttleMph"
  | "assistMph"
  | "topSpeedMph"
  | "switchable"
  | "hasFootPegs"
  | "wheelSize"
  | "wheelCount"
  | "weightLb";

export interface Evidence {
  /** Exact text from the input. Always a substring of what was parsed. */
  text: string;
  index: number;
}

export interface Extraction {
  /** The normalized text the evidence points into. */
  text: string;
  facts: Partial<BikeFacts>;
  evidence: Partial<Record<FactKey, Evidence[]>>;
  /** Short codes for things the user should double-check, shown on the card. */
  flags: string[];
}

const KMH_TO_MPH = 0.621371;
const KG_TO_LB = 2.20462;

/** OCR often turns "l" into "1", "I" or "|", so "C1ass" and "CIass" still count as "class". */
const CLASS_WORD = String.raw`c[l1i|]ass(?:es)?`;
const CLASS_TOKEN = String.raw`(?:[123]|iii|ii|i|one|two|three)`;
const ROMAN: Record<string, ClassNum> = { i: 1, ii: 2, iii: 3 };
const WORDS: Record<string, ClassNum> = { one: 1, two: 2, three: 3 };

function toClass(token: string): ClassNum | null {
  const t = token.trim().toLowerCase();
  if (t === "1" || t === "2" || t === "3") return Number(t) as ClassNum;
  return ROMAN[t] ?? WORDS[t] ?? null;
}

function slice(text: string, from: number, to: number): string {
  return text.slice(Math.max(0, from), Math.min(text.length, to)).toLowerCase();
}

/** Keeps evidence short and readable, and always a true substring of the text. */
function snippet(text: string, index: number, length: number): Evidence {
  const start = Math.max(0, index - 14);
  const end = Math.min(text.length, index + length + 14);
  return { text: text.slice(start, end).trim(), index: start };
}

function push(map: Extraction["evidence"], key: FactKey, ev: Evidence): void {
  const list = map[key] ?? [];
  if (!list.some((e) => e.text === ev.text)) list.push(ev);
  map[key] = list;
}

function firstMatch(text: string, re: RegExp): RegExpExecArray | null {
  re.lastIndex = 0;
  return re.exec(text);
}

function parseClasses(text: string, out: Extraction): void {
  const found = new Set<ClassNum>();
  const listRe = new RegExp(
    String.raw`\b${CLASS_WORD}[\s:#\-]*(${CLASS_TOKEN}(?:\s*(?:,|\/|&|\+|and|or|-|–|to)\s*${CLASS_TOKEN})*)\b`,
    "gi",
  );
  for (const m of text.matchAll(listRe)) {
    if (m.index === undefined) continue;
    for (const part of m[1].split(/\s*(?:,|\/|&|\+|\band\b|\bor\b)\s*/i)) {
      const range = /^([123])\s*(?:-|–|to)\s*([123])$/i.exec(part.trim());
      if (range) {
        for (let c = Number(range[1]); c <= Number(range[2]); c += 1) found.add(c as ClassNum);
        continue;
      }
      const cls = toClass(part);
      if (cls) found.add(cls);
    }
    push(out.evidence, "classes", snippet(text, m.index, m[0].length));
  }
  if (found.size > 0) {
    out.facts.classes = [...found].sort() as ClassNum[];
    if (found.size > 1) out.flags.push("several_classes");
  }
}

function parseWatts(text: string, out: Extraction, source: TextSource): void {
  const rated: number[] = [];
  const unqualified: number[] = [];
  const peak: number[] = [];
  const re = /(\d{1,2}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(kw|w|watts?)(?![a-z])/gi;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    let value = Number(m[1].replace(/,/g, ""));
    if (m[2].toLowerCase() === "kw") value *= 1000;
    if (!Number.isFinite(value) || value < 100 || value > 20000) continue;
    const end = m.index + m[0].length;
    const ctx = slice(text, m.index - 25, end + 25);
    if (/\b(charger|charging|headlight|lumens?|inverter)\b/.test(ctx)) continue;
    const ev = snippet(text, m.index, m[0].length);
    const near = slice(text, m.index - 18, end + 18);
    if (/\b(nominal|rated|continuous|sustained)\b/.test(near)) {
      rated.push(value);
      push(out.evidence, "ratedWatts", ev);
    } else if (/\b(peak|burst|max(?:imum)?|up to)\b/.test(near)) {
      peak.push(value);
      push(out.evidence, "peakWatts", ev);
    } else {
      unqualified.push(value);
      push(out.evidence, source === "label" ? "ratedWatts" : "wattsUpTo", ev);
    }
  }
  const largest = (values: number[], flag: string): number | null => {
    const distinct = [...new Set(values)];
    if (distinct.length === 0) return null;
    if (distinct.length > 1) out.flags.push(flag);
    return Math.max(...distinct);
  };
  const ratedValue = largest(rated, "several_rated_watts");
  if (ratedValue !== null) out.facts.ratedWatts = ratedValue;
  const peakValue = largest(peak, "several_peak_watts");
  if (peakValue !== null) out.facts.peakWatts = peakValue;
  const plain = largest(unqualified, "several_watt_figures");
  if (plain !== null) {
    // On a class label the printed wattage is the rated figure. In a listing it might be
    // either, so it only caps the rated figure from above.
    if (source === "label" && out.facts.ratedWatts === undefined) out.facts.ratedWatts = plain;
    if (source === "listing") out.facts.wattsUpTo = plain;
  }
}

/** Start and end of the sentence or list item around a position. Commas don't split it. */
function clauseAround(text: string, index: number, end: number): { start: number; stop: number } {
  const delim = /[.;|•!?\n](?=\s|$)/g;
  let start = 0;
  let stop = text.length;
  for (const m of text.matchAll(delim)) {
    if (m.index === undefined) continue;
    if (m.index < index) start = m.index + 1;
    else if (m.index >= end) {
      stop = m.index;
      break;
    }
  }
  return { start, stop };
}

function lastKeyword(before: string, words: string[]): number {
  return Math.max(...words.map((w) => before.lastIndexOf(w)));
}

type SpeedRole = "throttle" | "assist" | "top";

/** The mode word closest before the number in the same clause decides, then a word right after it. */
function speedRole(text: string, index: number, end: number): SpeedRole {
  const { start, stop } = clauseAround(text, index, end);
  const before = slice(text, start, index).replace(/\b(no|without)\s+(a\s+)?throttle/g, "");
  const after = slice(text, end, Math.min(stop, end + 15));
  const t = lastKeyword(before, ["throttle"]);
  const a = lastKeyword(before, ["assist", "pedal", "pas ", "pedelec"]);
  if (t >= 0 || a >= 0) return t > a ? "throttle" : "assist";
  if (after.includes("throttle")) return "throttle";
  if (/assist|pedal|pedelec/.test(after)) return "assist";
  return "top";
}

function parseSpeeds(text: string, out: Extraction): void {
  const throttle: number[] = [];
  const assist: number[] = [];
  const top: number[] = [];
  const re = /(\d{1,2}(?:\.\d)?)\s?(mph|miles per hour|km\/h|kmh|kph)\b/gi;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    let mph = Number(m[1]);
    if (/^k/i.test(m[2])) mph = Math.round(mph * KMH_TO_MPH * 10) / 10;
    if (!Number.isFinite(mph) || mph < 3 || mph > 99) continue;
    const end = m.index + m[0].length;
    if (/\bwalk/.test(slice(text, m.index - 25, end + 10)) && mph <= 6) continue;
    const ev = snippet(text, m.index, m[0].length);
    const role = speedRole(text, m.index, end);
    if (role === "throttle") {
      throttle.push(mph);
      push(out.evidence, "throttleMph", ev);
    } else if (role === "assist") {
      assist.push(mph);
      push(out.evidence, "assistMph", ev);
    } else {
      top.push(mph);
      push(out.evidence, "topSpeedMph", ev);
    }
  }
  if (throttle.length > 0) out.facts.throttleMph = Math.max(...throttle);
  if (assist.length > 0) out.facts.assistMph = Math.max(...assist);
  if (top.length > 0) out.facts.topSpeedMph = Math.max(...top);
}

function parseThrottle(text: string, out: Extraction): void {
  const none = firstMatch(
    text,
    /\b(no throttle|without (?:a )?throttle|throttle[- ]?free|pedal[- ]assist only|throttle\s*[:\-]\s*(?:no|none|n\/a))\b/i,
  );
  if (none) {
    out.facts.hasThrottle = false;
    push(out.evidence, "hasThrottle", snippet(text, none.index, none[0].length));
    return;
  }
  const yes = firstMatch(text, /\b((?:thumb|twist|half[- ]twist|trigger)[- ]?throttle|throttle)\b/i);
  if (yes) {
    out.facts.hasThrottle = true;
    push(out.evidence, "hasThrottle", snippet(text, yes.index, yes[0].length));
  }
}

function parsePedals(text: string, out: Extraction): void {
  const none = firstMatch(text, /\b(no pedals|without pedals|pedal-?less|pedalless|pedal[- ]free)\b/i);
  if (none) {
    out.facts.hasPedals = false;
    push(out.evidence, "hasPedals", snippet(text, none.index, none[0].length));
    return;
  }
  // "Brake pedal" and "no need to pedal" don't mean the bike has bicycle pedals.
  const re = /\b(pedal[- ]assist(?:ance)?|pedals|pas level|cadence sensor|torque sensor|crankset|cranks)\b/gi;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    const before = slice(text, m.index - 14, m.index);
    if (/\b(brake|foot|no need to|without)\s*$/.test(before)) continue;
    out.facts.hasPedals = true;
    push(out.evidence, "hasPedals", snippet(text, m.index, m[0].length));
    return;
  }
}

function parseModesAndShape(text: string, out: Extraction): void {
  const pegs = firstMatch(text, /\b(foot ?pegs?|footrests?|foot rests?)\b/i);
  if (pegs) {
    out.facts.hasFootPegs = true;
    push(out.evidence, "hasFootPegs", snippet(text, pegs.index, pegs[0].length));
    out.flags.push("mentions_foot_pegs");
  }

  const unlock = firstMatch(
    text,
    /\b(off[- ]road mode|unlimited mode|race mode|unrestricted(?: mode)?|derestrict(?:ed|ion)?|speed limiter (?:can be |is )?(?:removed|disabled)|private[- ]property (?:use|mode|only|top speed)|unlock(?:ed|able)? (?:to|for) (?:higher|top|off[- ]road|\d{2}\s?mph))/i,
  );
  if (unlock) {
    out.facts.switchable = true;
    push(out.evidence, "switchable", snippet(text, unlock.index, unlock[0].length));
  }

  if (firstMatch(text, /\b(electric dirt bike|e-?moto(?:rcycle)?|electric motorcycle|electric motorbike|pit bike)\b/i)) {
    out.flags.push("sold_as_motorbike");
  }

  const trike = firstMatch(text, /\b(tricycle|trike|three[- ]wheel(?:ed|er)?|3[- ]wheel(?:ed|er)?)\b/i);
  if (trike) {
    out.facts.wheelCount = 3;
    push(out.evidence, "wheelCount", snippet(text, trike.index, trike[0].length));
  }
}

function parseWheels(text: string, out: Extraction): void {
  const sizes: number[] = [];
  const add = (size: number, index: number, length: number) => {
    if (size < 10 || size > 29) return;
    sizes.push(size);
    push(out.evidence, "wheelSize", snippet(text, index, length));
  };
  // "20 x 4.0" or 26" x 2.25" tire sizes.
  for (const m of text.matchAll(/\b([12][0-9])(?:\.\d)?\s?(?:"|”|'')?\s?x\s?\d(?:\.\d{1,2})?/gi)) {
    if (m.index !== undefined) add(Number(m[1]), m.index, m[0].length);
  }
  // "20-inch wheels", 16" tires.
  for (const m of text.matchAll(/\b([12][0-9])(?:\.\d)?\s?(?:"|”|''|-?\s?inch(?:es)?)\s?(?:fat\s)?(?:tires?|tyres?|wheels?)\b/gi)) {
    if (m.index !== undefined) add(Number(m[1]), m.index, m[0].length);
  }
  const c700 = firstMatch(text, /\b700\s?c\b/i);
  if (c700) add(28, c700.index, c700[0].length);
  if (sizes.length === 0) return;
  out.facts.wheelFrontIn = Math.max(...sizes);
  out.facts.wheelRearIn = Math.min(...sizes);
  if (new Set(sizes).size > 1) out.flags.push("several_wheel_sizes");
}

function parseWeight(text: string, out: Extraction): void {
  for (const m of text.matchAll(/(\d{2,3}(?:\.\d)?)\s?(lbs?|pounds|kg)\b\.?/gi)) {
    if (m.index === undefined) continue;
    const end = m.index + m[0].length;
    const before = slice(text, m.index - 22, m.index);
    const after = slice(text, end, end + 16);
    const adjacent = slice(text, m.index - 12, m.index) + " " + slice(text, end, end + 12);
    if (/(payload|load|capacity|rider|carry|max|maximum|up to|supports?|rack|limit)/.test(adjacent)) continue;
    if (!/(weight|weighs|weighing|this\s*$)/.test(before) && !/^\s*(machine|bike|e-?bike|frame)/.test(after)) continue;
    let lb = Number(m[1]);
    if (/kg/i.test(m[2])) lb = Math.round(lb * KG_TO_LB);
    out.facts.weightLb = lb;
    push(out.evidence, "weightLb", snippet(text, m.index, m[0].length));
    return;
  }
}

/** Normalizes spaces and dashes so patterns match, without changing word order. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/[   ]/g, " ")
    .replace(/[‐‑‒—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSpecText(raw: string, source: TextSource): Extraction {
  const text = normalizeText(raw);
  const out: Extraction = { text, facts: {}, evidence: {}, flags: [] };
  if (text.length === 0) return out;
  parseClasses(text, out);
  parseWatts(text, out, source);
  parseSpeeds(text, out);
  parseThrottle(text, out);
  parsePedals(text, out);
  parseModesAndShape(text, out);
  parseWheels(text, out);
  parseWeight(text, out);
  return out;
}

/** True when the text gave at least one class, watt or speed value. */
export function hasLegalFacts(e: Extraction): boolean {
  const f = e.facts;
  return (
    (f.classes?.length ?? 0) > 0 ||
    f.ratedWatts !== undefined ||
    f.peakWatts !== undefined ||
    f.wattsUpTo !== undefined ||
    f.assistMph !== undefined ||
    f.throttleMph !== undefined ||
    f.topSpeedMph !== undefined
  );
}
