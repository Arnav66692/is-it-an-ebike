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
/** Speeds above this are not read. An e-moto's 70 or 110 mph must still be read, since it blocks a yes. */
export const MAX_READ_MPH = 150;
const KG_TO_LB = 2.20462;

/**
 * Rounds a converted value up to one decimal. Speed and weight limits are upper limits, so a
 * value just over the line (32.2 km/h is 20.008 mph) must never round down onto it.
 */
function roundUpTenth(value: number): number {
  return Math.ceil(value * 10 - 1e-9) / 10;
}

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
  let start = Math.max(0, index - 14);
  let end = Math.min(text.length, index + length + 14);
  // Widen to whole words so the card never shows "OTOR WATTAGE".
  while (start > 0 && start > index - 30 && /\S/.test(text[start - 1])) start -= 1;
  while (end < text.length && end < index + length + 30 && /\S/.test(text[end])) end += 1;
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

/** "World-class", "first-class" and "high-class" are not a bike class. */
const CLASS_AS_ADJECTIVE = /[-‐]$/;
/** "Class 2-year warranty" counts years, and "Class I bike path" or "Class II bike lane" is a bikeway type. */
const NOT_A_BIKE_CLASS_AFTER =
  /^\s*(?:-\s*)?(?:(?:years?|yrs?|months?|days?|weeks?|hours?|miles?|stars?|seats?|persons?|pieces?|packs?)\b|(?:bike|bicycle|cycle)?\s*(?:paths?|lanes?|ways?|routes?|trails?|tracks?)\b|bikeways?\b)/i;

function parseClasses(text: string, out: Extraction): void {
  const found = new Set<ClassNum>();
  const listRe = new RegExp(
    String.raw`\b${CLASS_WORD}[\s:#\-]*(${CLASS_TOKEN}(?:\s*(?:,|\/|&|\+|and|or|-|–|to)\s*${CLASS_TOKEN})*)\b`,
    "gi",
  );
  for (const m of text.matchAll(listRe)) {
    if (m.index === undefined) continue;
    if (CLASS_AS_ADJECTIVE.test(text.slice(Math.max(0, m.index - 1), m.index))) continue;
    if (NOT_A_BIKE_CLASS_AFTER.test(text.slice(m.index + m[0].length, m.index + m[0].length + 20))) continue;
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

const RATED_WORDS = /\b(nominal|rated|continuous|sustained)\b/g;
const PEAK_WORDS = /\b(peak|burst|max(?:imum)?|up to)\b/g;

/** The qualifier word closest to the number decides, so "500W (sustained), 864W (peak)" reads right. */
function wattKind(text: string, index: number, end: number): "rated" | "peak" | "plain" {
  const from = Math.max(0, index - 18);
  const window = slice(text, from, end + 18);
  const start = index - from;
  const stop = end - from;
  const closest = (re: RegExp): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const m of window.matchAll(re)) {
      if (m.index === undefined) continue;
      const d = m.index >= stop ? m.index - stop : start - (m.index + m[0].length);
      best = Math.min(best, Math.max(0, d));
    }
    return best;
  };
  const rated = closest(RATED_WORDS);
  const peak = closest(PEAK_WORDS);
  if (!Number.isFinite(rated) && !Number.isFinite(peak)) return "plain";
  return rated <= peak ? "rated" : "peak";
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
    const kind = wattKind(text, m.index, end);
    if (kind === "rated") {
      rated.push(value);
      push(out.evidence, "ratedWatts", ev);
    } else if (kind === "peak") {
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
  // The number must start at a word edge, so "120 km/h" is never read from its last two digits.
  const re = /(?<![\d.])(\d{1,3}(?:\.\d)?)\s?(mph|miles per hour|km\/h|kmh|kph)\b/gi;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    let mph = Number(m[1]);
    if (/^k/i.test(m[2])) mph = roundUpTenth(mph * KMH_TO_MPH);
    if (!Number.isFinite(mph) || mph < 3 || mph > MAX_READ_MPH) continue;
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

const THROTTLE_NONE = /\b(no throttle|without (?:a )?throttle|throttle[- ]?free|pedal[- ]assist only|throttle\s*[:\-]\s*(?:no|none|n\/a))\b/gi;
const THROTTLE_YES = /\b((?:thumb|twist|half[- ]twist|trigger)[- ]?throttle|throttle)\b/gi;

/** True when this mention of a throttle is itself negated, as in "no throttle" or "Throttle: none". */
function throttleNegated(text: string, index: number, end: number): boolean {
  const before = slice(text, index - 12, index);
  const after = slice(text, end, end + 10);
  return /\b(no|without(?: a)?|not)\s*$/.test(before) || /^[- ]?free\b/.test(after) || /^\s*[:\-]\s*(no|none|n\/a)\b/.test(after);
}

/**
 * A listing can say "no throttle" in one place and "thumb throttle" in another, for example
 * "ride with no throttle for a workout" or a variant list "No throttle, Thumb throttle". Then the
 * answer is left blank for the user, since a throttle bike read as throttle-free could get a YES.
 */
function parseThrottle(text: string, out: Extraction): void {
  const none = [...text.matchAll(THROTTLE_NONE)];
  const yes = [...text.matchAll(THROTTLE_YES)].filter((m) => m.index !== undefined && !throttleNegated(text, m.index, m.index + m[0].length));
  for (const m of [...none, ...yes]) {
    if (m.index !== undefined) push(out.evidence, "hasThrottle", snippet(text, m.index, m[0].length));
  }
  if (none.length > 0 && yes.length > 0) {
    out.flags.push("throttle_unclear");
    return;
  }
  if (none.length > 0) out.facts.hasThrottle = false;
  else if (yes.length > 0) out.facts.hasThrottle = true;
}

const PEDALS_NONE =
  /\b(no pedals|without (?:any )?pedals|pedal-?less|pedalless|pedal[- ]free|pedals\s*[:\-]\s*(?:none|no)|(?:does|do|did)(?: not|n't) have (?:any )?pedals|has no pedals|instead of pedals)\b/i;

/**
 * True when this mention doesn't show bicycle pedals: "brake pedal", "no need to pedal", "no
 * pedal assist", "Pedals: N/A" or "pedals not included". Those leave the answer to the user.
 */
function pedalNegated(text: string, index: number, end: number): boolean {
  const before = slice(text, index - 20, index);
  const after = slice(text, end, end + 20);
  return (
    /\b(brake|foot|no need to|without|no|not|non|never|zero|instead of|(?:not|n't) (?:have|include|come with)(?: any)?)\s*$/.test(before) ||
    /^\s*(?:[:\-]\s*(?:no|none|n\/a)\b|[:\-]?\s*(?:are |is )?(?:not included|sold separately))/.test(after)
  );
}

function parsePedals(text: string, out: Extraction): void {
  const none = firstMatch(text, PEDALS_NONE);
  if (none) {
    out.facts.hasPedals = false;
    push(out.evidence, "hasPedals", snippet(text, none.index, none[0].length));
    return;
  }
  const re = /\b(pedal[- ]assist(?:ance)?|pedals|pas level|cadence sensor|torque sensor|crankset|cranks)\b/gi;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    if (pedalNegated(text, m.index, m.index + m[0].length)) continue;
    out.facts.hasPedals = true;
    push(out.evidence, "hasPedals", snippet(text, m.index, m[0].length));
    return;
  }
}

/** Store pages list other products in menus, so a listing's shape words only count near the top. */
const LISTING_HEAD = 400;

function parseModesAndShape(text: string, out: Extraction, source: TextSource): void {
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

  const head = source === "listing" ? text.slice(0, LISTING_HEAD) : text;
  const trike = firstMatch(head, /\b(tricycle|trike|three[- ]wheel(?:ed|er)?|3[- ]wheel(?:ed|er)?)\b/i);
  if (trike) {
    out.facts.wheelCount = 3;
    push(out.evidence, "wheelCount", snippet(text, trike.index, trike[0].length));
  }
}

function parseWheels(text: string, out: Extraction, source: TextSource): void {
  const sizes: number[] = [];
  const add = (size: number, index: number, length: number) => {
    if (size < 10 || size > 29) return;
    sizes.push(size);
    push(out.evidence, "wheelSize", snippet(text, index, length));
  };
  // "20 x 4.0" or 26" x 2.25" tire sizes. The width is 1 to 5 inches, which skips "15x100mm"
  // axles and "9/16 x 20 TPI" threads.
  for (const m of text.matchAll(/(?<![\/\d.])\b([12][0-9])(?:\.\d)?\s?(?:"|”|'')?\s?x\s?[1-5](?:\.\d{1,3})?(?:"|”|'')?(?![\d.])/gi)) {
    if (m.index !== undefined) add(Number(m[1]), m.index, m[0].length);
  }
  // "20-inch wheels", 16" tires.
  for (const m of text.matchAll(/(?<![\/\d.])\b([12][0-9])(?:\.\d)?\s?(?:"|”|''|-?\s?inch(?:es)?)\s?(?:fat\s)?(?:tires?|tyres?|wheels?)\b/gi)) {
    if (m.index !== undefined) add(Number(m[1]), m.index, m[0].length);
  }
  const c700 = firstMatch(text, /\b700\s?c\b/i);
  if (c700) add(28, c700.index, c700[0].length);
  if (sizes.length === 0) return;
  if (new Set(sizes).size > 1) {
    // A store page can name other products' wheels, so mixed sizes in a listing are asked, not guessed.
    if (source === "listing") {
      out.flags.push("wheel_sizes_differ");
      return;
    }
    out.flags.push("several_wheel_sizes");
  }
  out.facts.wheelFrontIn = Math.max(...sizes);
  out.facts.wheelRearIn = Math.min(...sizes);
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
    if (/kg/i.test(m[2])) lb = roundUpTenth(lb * KG_TO_LB);
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

/** Store pages list other products under headings like these. Nothing after one is about this bike. */
const OTHER_PRODUCTS =
  /\b(you (?:may|might|will|'ll) also like|related (?:products|items|bikes)|customers (?:also|who) (?:bought|viewed|liked)|people also (?:bought|viewed)|frequently bought together|similar (?:products|items)|recently viewed|compare (?:with )?similar|more from this collection|shop similar|recommended for you|recommended products)\b/i;

export function parseSpecText(raw: string, source: TextSource): Extraction {
  const text = normalizeText(raw);
  const out: Extraction = { text, facts: {}, evidence: {}, flags: [] };
  if (text.length === 0) return out;
  // A listing's own specs come before its "You may also like" list. A watt figure or a wheel
  // size from another product must never stand in for this bike's.
  const other = source === "listing" ? OTHER_PRODUCTS.exec(text) : null;
  const own = other ? text.slice(0, other.index) : text;
  if (other) out.flags.push("other_products_skipped");
  parseClasses(own, out);
  parseWatts(own, out, source);
  parseSpeeds(own, out);
  parseThrottle(own, out);
  parsePedals(own, out);
  parseModesAndShape(own, out, source);
  parseWheels(own, out, source);
  parseWeight(own, out);
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
