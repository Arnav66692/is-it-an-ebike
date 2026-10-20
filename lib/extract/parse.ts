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

/** Two spaces: normalized text never has them, so they mark the edge of a blanked-out stretch. */
const SKIPPED_EDGE = "  ";

/** Keeps evidence short and readable, and always a true substring of the text. */
function snippet(text: string, index: number, length: number): Evidence {
  let start = Math.max(0, index - 14);
  let end = Math.min(text.length, index + length + 14);
  // Widen to whole words so the card never shows "OTOR WATTAGE".
  while (start > 0 && start > index - 30 && /\S/.test(text[start - 1])) start -= 1;
  while (end < text.length && end < index + length + 30 && /\S/.test(text[end])) end += 1;
  // Two spaces in a row only appear where text about other products was blanked out. Evidence
  // never reaches across one, so it stays a true substring of the text that was read.
  const gapBefore = text.lastIndexOf(SKIPPED_EDGE, index);
  if (gapBefore >= start) start = gapBefore + SKIPPED_EDGE.length;
  const gapAfter = text.indexOf(SKIPPED_EDGE, index + length);
  if (gapAfter >= 0 && gapAfter < end) end = gapAfter;
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

/** Letters and marks OCR often prints in place of a digit: l, I, i or | for 1, O or o for 0, S for 5, Z for 2, B for 8. */
const OCR_DIGIT = String.raw`[\dlIi|OoSZB]`;

/** A lone number, or a lone l or I that OCR prints for a 1, then one space: the "1 " of "1 500 W". */
const NUMBER_THEN_SPACE = /(?<![\w.,|])(?:\d{1,3}|[lI])\s$/;
/** A class word and its number, as in "Class 2 750W". That number is the class, not part of the figure. */
const CLASS_THEN_SPACE = new RegExp(
  String.raw`\b${CLASS_WORD}[\s:#\-]*${CLASS_TOKEN}(?:\s*(?:,|\/|&|\+|and|or|-|–|to)\s*${CLASS_TOKEN})*\s$`,
  "i",
);

/**
 * True when the figure at this index may be the end of a number split by a space: an OCR split
 * like "1 500W" or "2 8 MPH", or a thousands space like "1 200 W". Read from its last group it
 * would be far too low, so it is not read at all and the family checks it.
 */
function splitNumberBefore(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 40), index);
  return NUMBER_THEN_SPACE.test(before) && !CLASS_THEN_SPACE.test(before);
}

function flagSplit(out: Extraction): void {
  if (!out.flags.includes("number_split")) out.flags.push("number_split");
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
  // OCR reads "1500W" as "l500W". A number glued to a letter or a bar is never read from its
  // later digits, so a 1500 W motor can't pass as 500 W. The comma rule keeps "l,500W" out too.
  const re = new RegExp(String.raw`(?<![\w.|]|${OCR_DIGIT},)(\d{1,2}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(kw|w|watts?)(?![a-z])`, "gi");
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    const end = m.index + m[0].length;
    const ctx = slice(text, m.index - 25, end + 25);
    if (/\b(charger|charging|headlight|lumens?|inverter)\b/.test(ctx)) continue;
    if (splitNumberBefore(text, m.index)) {
      flagSplit(out);
      continue;
    }
    let value = Number(m[1].replace(/,/g, ""));
    if (m[2].toLowerCase() === "kw") value *= 1000;
    if (!Number.isFinite(value) || value < 100 || value > 20000) continue;
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

/** "No throttle", "without a throttle", "throttle-free" and "throttle: none" name no throttle mode. */
const NEGATED_THROTTLE = /\b(?:no|without)\s+(?:a\s+)?throttle\b|\bthrottle[- ]?free\b|\bthrottle\s*[:\-]\s*(?:no|none|n\/a)\b/g;

function withoutNegatedThrottle(lower: string): string {
  return lower.replace(NEGATED_THROTTLE, " ");
}

/**
 * The mode word closest before the number in the same clause decides, then a word right after it.
 * A negated throttle on either side is no throttle mode, so "20 mph, no throttle" is not a throttle speed.
 */
function speedRole(text: string, index: number, end: number): SpeedRole {
  const { start, stop } = clauseAround(text, index, end);
  const before = withoutNegatedThrottle(slice(text, start, index));
  const after = withoutNegatedThrottle(slice(text, end, Math.min(stop, end + 40))).slice(0, 15);
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
  // The number must start at a word edge, so "120 km/h" is never read from its last two digits,
  // and an OCR "Z8 MPH" (28) is never read as 8 mph.
  const re = /(?<![\w.|])(\d{1,3}(?:\.\d)?)\s?(mph|miles per hour|km\/h|kmh|kph)\b/gi;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    if (splitNumberBefore(text, m.index)) {
      flagSplit(out);
      continue;
    }
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

/** Words before "pedals" that make a "Pedals: No" about what ships, or about needing to pedal. */
const PEDALS_SHIPPED_BEFORE = String.raw`(?<!\b(?:includ(?:e|es|ed|ing)|comes? with|came with|ships? with|shipped with|supplied with|delivered with|need|needs|required?|requires)\s)`;
/** Words after a "no" that make it about what ships: "none included", "No (sold separately)". */
const PEDALS_SHIPPED_AFTER = String.raw`(?!\s*[(,]?\s*(?:included|incl\b|sold|available|in (?:the )?box|installed|attached|provided|shipped|optional|needed|required|necessary|extra|add-on))`;

/** Shipping words before "without pedals": "Ships without pedals" is about the box, not the bike. */
const SHIPPED_VERBS = String.raw`(?:comes?|came|coming|ships?|shipped|shipping|sold|sells|arrives?|arrived|delivered|supplied|packed|packaged|boxed|provided)`;
const SHIPPED_BEFORE_WITHOUT = String.raw`(?<!\b${SHIPPED_VERBS}\s)`;
/** The same for "Comes with no pedals". */
const SHIPPED_WITH_BEFORE = String.raw`(?<!\b${SHIPPED_VERBS} with\s)`;

/**
 * Text that says this bike has no pedals. Text about what ships in the box, like "Includes pedals:
 * No", "Comes with pedals: No", "Pedals: none included" or "Pedals: No (sold separately)", is left
 * to the user instead, like "pedals not included". So is "Do I need pedals? No".
 */
const PEDALS_NONE = new RegExp(
  String.raw`\b(${SHIPPED_WITH_BEFORE}no pedals${PEDALS_SHIPPED_AFTER}|${SHIPPED_BEFORE_WITHOUT}without (?:any )?pedals${PEDALS_SHIPPED_AFTER}|pedal-?less|pedalless|pedal[- ]free|${PEDALS_SHIPPED_BEFORE}pedals\s*[:\-?]\s*(?:none|no)\b${PEDALS_SHIPPED_AFTER}|(?:does|do|did)(?: not|n't) have (?:any )?pedals|has no pedals|instead of pedals|(?:does|do) (?:it|this(?: bike| model| e-?bike)?|the bike) have (?:any )?pedals\s*\?\s*(?:no|none)\b${PEDALS_SHIPPED_AFTER})\b`,
  "i",
);

/** "Pedals:", "Pedals?", "Pedals (" or "Pedals - ", where the words after are an answer. */
const PEDALS_LABEL = /\bpedals(?:\s+type)?\s*(?:[:?(]|\s-\s)/gi;
/** An answer after "Pedals:" that clearly means the bike has them. Anything else leaves it open. */
const PEDALS_ANSWER_YES =
  /^\s*(?:yes|yep|yeah|y\b|✓|✔|☑|included|standard|installed|attached|provided|equipped|alloy|alu\b|aluminum|aluminium|platform|flat|nylon|plastic|resin|composite|steel|metal|magnesium|folding|foldable|clipless|spd\b|caged?\b|wellgo|\d+\s?\/\s?\d+)/i;
/** Words that make an answer doubtful even after a yes: "Yes (sold separately)", "Alloy, not included". */
const PEDALS_ANSWER_DOUBT = /\b(?:no|not|none|nope|without|removed|taken off|separately|optional|extra|add-on|n\/a|na)\b/i;

/** Mentions that are not about bicycle pedals at all: "brake pedal", "foot pedal". */
const PEDALS_OTHER_BEFORE = /\b(brake|foot|gas|clutch)\s*$/;
/**
 * Words before a pedal mention that say the pedals may be missing or not needed. The text is read
 * with "n't" spelled out, so "doesn't come with" reads as "does not come with".
 */
const PEDALS_DOUBT_BEFORE =
  /\b(?:no need (?:to|for)|(?:will not|wont|do not|dont|does not|doesnt|did not|didnt|never) need(?: any| the| to use(?: the)?)?|removed?(?: the| its| all)?|took off(?: the| its)?|taken off|without the|optional|add-on|not (?:have|has|include|includes|come with|comes with|ship with|ships with|arrive with|arrives with)(?: any| the| its)?|not (?:be |been )?(?:sold|shipped|supplied|provided|delivered|packed|boxed|included) with(?: any| the| its)?)\s*$/;
/**
 * Words before the word "pedals" itself that say they may be gone or not supplied: "missing
 * pedals", "ships without pedals", "no longer has pedals", "Can I add pedals?". They are not
 * used for "pedal assist", so "ride without pedal assist" still says nothing about the pedals.
 */
const PEDALS_ONLY_DOUBT_BEFORE =
  /\b(?:without(?: any| the| its)?|missing(?: the| its| both| all)?|no longer (?:has|have|comes? with)(?: any| the| its)?|add(?:ing)?(?: on)?(?: the| some| any| optional)?)\s*$/;
/** Words before a pedal-assist or sensor mention that say only the assist is missing: "no pedal assist". */
const ASSIST_NEGATED_BEFORE = /\b(no|not|non|never|zero|without)\s*$/;
/** Words after a pedal mention that say the pedals may be missing, removed or not needed. */
const PEDALS_DOUBT_AFTER =
  /^\s*(?:(?:have|has|had) been|were|was|are|is|got|get)?\s*(?:removed|taken off|stripped|not (?:required|needed|necessary|available|working|functional|operable|included|installed|attached|provided|supplied|shipped|present|fitted|in (?:the )?box)|unavailable|optional|an option|extra|add[- ]?on|sold separately|available separately|(?:included|installed|provided|attached)?\s*[:\-?(]\s*(?:no|none|n\/a|nope)\b|(?:included|installed)?\s*[:\-(]?\s*(?:are |is )?(?:not included|not installed|sold separately|available separately|optional|an option|extra|add[- ]?on))/;
/**
 * Words after the word "pedals" itself that say they are gone, broken or not supplied: "Pedals
 * off", "Pedals missing", "Pedals can be added", "Pedals sold as an accessory". Not used for
 * "pedal assist", so "turn pedal assist off" still says nothing about the pedals.
 */
const PEDALS_ONLY_DOUBT_AFTER =
  /^\s*(?:(?:have|has|had) been|were|was|are|is|got|get)?\s*(?:off\b(?![- ]?road)|missing|gone|deleted|broken|damaged|bent|cracked|not (?:on|for|with|part of|in) (?:this|the)\b|(?:can|could|may) be (?:added|installed|fitted|attached|purchased|bought|ordered)|(?:must|need to|have to) be (?:purchased|bought|ordered)|(?:sold|purchased|bought|available|offered|ordered)\s+(?:as\s+(?:an?\s+)?(?:accessory|accessories|add[- ]?on|option|extra|upgrade)|separately|on their own))/;

/** Spells out "n't" so one pattern covers "doesn't", "does not" and "isn't". */
function expandNegations(lower: string): string {
  return lower.replace(/\bcan't\b/g, "cannot").replace(/\bwon't\b/g, "will not").replace(/n't\b/g, " not");
}

/** The words after a label, up to the end of its sentence or list item. */
function answerAfter(text: string, from: number): string {
  const rest = text.slice(from, from + 40);
  const stop = rest.search(/[.;|•!\n](?=\s|$)/);
  return stop >= 0 ? rest.slice(0, stop) : rest;
}

type PedalMention = "yes" | "skip" | "doubt";

/**
 * What one pedal mention says. "Brake pedal" and "no pedal assist" say nothing about the bike's
 * pedals. "Pedals removed", "optional pedals", "no need for pedals" and "Pedals not included" put
 * them in doubt.
 */
function pedalMention(text: string, index: number, end: number): PedalMention {
  const before = expandNegations(slice(text, index - 30, index));
  const after = expandNegations(slice(text, end, end + 40));
  const pedalsWord = /^pedals$/i.test(text.slice(index, end));
  if (PEDALS_OTHER_BEFORE.test(before)) return "skip";
  if (PEDALS_DOUBT_BEFORE.test(before) || PEDALS_DOUBT_AFTER.test(after)) return "doubt";
  if (pedalsWord && (PEDALS_ONLY_DOUBT_BEFORE.test(before) || PEDALS_ONLY_DOUBT_AFTER.test(after))) return "doubt";
  if (ASSIST_NEGATED_BEFORE.test(before)) return pedalsWord ? "doubt" : "skip";
  return "yes";
}

/**
 * Sets the pedals fact only when the text is clear. A "no pedals" text is a no. Any text that puts
 * the pedals in doubt, like "pedals removed", "Pedals: N.A." or "Pedals: -", leaves the answer to
 * the user, even when another line mentions pedal assist, since a bike without working pedals is
 * not an e-bike and a wrong yes could pass it.
 */
function parsePedals(text: string, out: Extraction): void {
  const none = firstMatch(text, PEDALS_NONE);
  if (none) {
    out.facts.hasPedals = false;
    push(out.evidence, "hasPedals", snippet(text, none.index, none[0].length));
    return;
  }
  const yes: Evidence[] = [];
  const doubt: Evidence[] = [];
  for (const m of text.matchAll(PEDALS_LABEL)) {
    if (m.index === undefined || PEDALS_OTHER_BEFORE.test(slice(text, m.index - 12, m.index))) continue;
    const answer = answerAfter(text, m.index + m[0].length);
    const clear = PEDALS_ANSWER_YES.test(answer) && !PEDALS_ANSWER_DOUBT.test(answer);
    (clear ? yes : doubt).push(snippet(text, m.index, m[0].length + answer.length));
  }
  const re = /\b(pedal[- ]assist(?:ance)?|pedals|pas level|cadence sensor|torque sensor|crankset|cranks)\b/gi;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    const kind = pedalMention(text, m.index, m.index + m[0].length);
    if (kind === "doubt") doubt.push(snippet(text, m.index, m[0].length));
    else if (kind === "yes") yes.push(snippet(text, m.index, m[0].length));
  }
  if (doubt.length > 0) {
    for (const ev of doubt) push(out.evidence, "hasPedals", ev);
    out.flags.push("pedals_unclear");
    return;
  }
  if (yes.length > 0) {
    out.facts.hasPedals = true;
    push(out.evidence, "hasPedals", yes[0]);
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

  // A trike word is shown to the family but never fills in the number of wheels. Store pages use
  // it in titles, tags and slogans like "the bike that replaces the trike", and a wrong 3 can turn
  // off a two-wheeler rule. Left blank, the number of wheels is asked wherever it matters.
  const head = source === "listing" ? text.slice(0, LISTING_HEAD) : text;
  const trike = firstMatch(head, /\b(tricycle|trike|three[- ]wheel(?:ed|er)?|3[- ]wheel(?:ed|er)?)\b/i);
  if (trike) {
    push(out.evidence, "wheelCount", snippet(text, trike.index, trike[0].length));
    out.flags.push("mentions_trike");
  }
}

/** Inch marks: straight and curly quotes, two apostrophes, the double prime, "inch" and "in". */
const INCH = String.raw`(?:"|”|''|″|-?\s?inch(?:es)?\b|-?\s?in\b\.?)`;
/** A wheel size in a sentence like this is about an upgrade, a kit or another model, not this bike. */
const OTHER_WHEEL_CONTEXT =
  /\b(upgrades?|kits?|fits?|compatible|accessor(?:y|ies)|sold separately|also (?:available|comes?|fits?)|available in|options?|optional|grows? with|swap|convert(?:s|ible)?|replacement|spare)\b/;
/** Inch figures for other parts or sizes, which are never wheel sizes. */
const NOT_A_WHEEL_BEFORE =
  /\b(height|length|width|wide|clearance|reach|stack|standover|seat|saddle|handlebars?|stem|frame|display|screen|lcd|tft|cranks?)\b[^.]{0,12}$/;
const NOT_A_WHEEL_AFTER = /^\s?(frame|seat|saddle|screen|display|lcd|tft|handlebars?|stem|cranks?|wide|long|tall|high|deep|step)/;

/**
 * Reads the wheel size. A size stated for this bike's wheels is "sure". A bare inch figure, or a
 * size in a sentence about an upgrade kit or another model, is only "maybe". A maybe can never set
 * the size, but when it differs from a sure size the listing is asked about instead of guessed.
 */
function parseWheels(text: string, out: Extraction, source: TextSource): void {
  const sure: number[] = [];
  const maybe: number[] = [];
  const add = (size: number, index: number, length: number, stated: boolean) => {
    if (size < 10 || size > 29) return;
    const { start, stop } = clauseAround(text, index, index + length);
    const other = source === "listing" && OTHER_WHEEL_CONTEXT.test(slice(text, start, stop));
    (stated && !other ? sure : maybe).push(size);
    push(out.evidence, "wheelSize", snippet(text, index, length));
  };
  const each = (re: RegExp, stated: boolean, keep: (index: number, end: number) => boolean = () => true) => {
    for (const m of text.matchAll(re)) {
      if (m.index !== undefined && keep(m.index, m.index + m[0].length)) add(Number(m[1]), m.index, m[0].length, stated);
    }
  };
  // "20 x 4.0" or 26" x 2.25" tire sizes. The width is 1 to 5 inches, which skips "15x100mm"
  // axles and "9/16 x 20 TPI" threads. A period after the width can end the sentence.
  each(new RegExp(String.raw`(?<![\/\d.])\b([12][0-9])(?:\.\d)?\s?${INCH}?\s?x\s?[1-5](?:\.\d{1,3})?(?:"|”|''|″)?(?!\d|\.\d)`, "gi"), true);
  // "20-inch wheels", 16" tires, 12″ wheels.
  each(new RegExp(String.raw`(?<![\/\d.])\b([12][0-9])(?:\.\d)?\s?${INCH}\s?(?:fat\s)?(?:tires?|tyres?|wheels?|rims?)\b`, "gi"), true);
  // "Wheel size: 12 in", "Tires: 20 inch", "Wheel diameter 16".
  each(new RegExp(String.raw`\b(?:wheels?|tires?|tyres?|rims?)(?:\s+(?:size|diameter))?\s*[:\-]?\s*([12][0-9])(?:\.\d)?\s?${INCH}`, "gi"), true);
  each(/\b(?:wheel|tire|tyre|rim)\s+(?:size|diameter)\s*[:\-]?\s*([12][0-9])(?:\.\d)?(?!\d|\.\d|\s?(?:mm|cm|x\b))/gi, true);
  // A bare 16" or 16-inch, which might be the wheels or might not.
  each(
    new RegExp(String.raw`(?<![\/\d.'])\b([12][0-9])(?:\.\d)?\s?${INCH}`, "gi"),
    false,
    (index, end) => !NOT_A_WHEEL_BEFORE.test(slice(text, index - 30, index)) && !NOT_A_WHEEL_AFTER.test(slice(text, end, end + 12)),
  );
  const c700 = firstMatch(text, /\b700\s?c\b/i);
  if (c700) add(28, c700.index, c700[0].length, true);

  const all = new Set([...sure, ...maybe]);
  if (all.size === 0) return;
  if (sure.length === 0) {
    out.flags.push("wheel_size_unclear");
    return;
  }
  if (all.size > 1) {
    // A store page can name other products' wheels, so mixed sizes in a listing are asked, not guessed.
    if (source === "listing") {
      out.flags.push("wheel_sizes_differ");
      return;
    }
    out.flags.push("several_wheel_sizes");
  }
  out.facts.wheelFrontIn = Math.max(...sure);
  out.facts.wheelRearIn = Math.min(...sure);
}

/**
 * A weight named for a part, the box or a load, not the whole bike: "battery weight",
 * "shipping weight", "max rider weight".
 */
const PART_BEFORE_WEIGHT =
  /\b(?:battery|batteries|pack|motor|frame|fork|package|packaging|packed|shipping|shipped|box|carton|gross|basket|rack|seat|wheels?|tires?|kit|charger|riders?|user|passengers?|load|payload|cargo|capacity|max|maximum)\s*$/;
/**
 * A bike weight without its battery understates what it weighs on the road. The exclusion can come
 * before the battery ("without battery", "excl. batt") or after it ("battery not included",
 * "(battery excluded)").
 */
const WITHOUT_BATTERY =
  /\b(?:without|w\/o|excl(?:uding|udes|\.)?|ex\.?|minus|less|no)\s+(?:the\s+)?batt(?:ery|eries|\.)?(?![a-z])|\bbatt(?:ery|eries|\.)?(?![a-z])\s*(?:is\s+|are\s+)?(?:not\s+incl(?:uded|\.)?|excluded|sold separately|not installed|extra|separate)/;
/** The whole page says the battery doesn't come with the bike, so a listed weight may leave it out. */
const BATTERY_NOT_INCLUDED =
  /\bbatt(?:ery|eries)\s*(?:is\s+|are\s+)?(?:not\s+included|excluded|sold separately)|\b(?:no|without)\s+battery\s+included\b/;
/** Two figures this close are one weight in two units, like "27 kg (60 lbs)". */
const SAME_WEIGHT_LB = 1.5;

/** True when the closest weight word before the number names a part, as in "battery weight: 12 lbs". */
function weightIsForPart(text: string, index: number, clauseStart: number): boolean {
  const before = slice(text, Math.max(clauseStart, index - 40), index);
  let at = -1;
  for (const m of before.matchAll(/\b(?:weight|weighs|weighing|wt)\b/g)) if (m.index !== undefined) at = m.index;
  return at >= 0 && PART_BEFORE_WEIGHT.test(before.slice(0, at));
}

/**
 * The bike's own weight. Figures for a part, the box, a payload or the bike without its battery
 * are skipped. If the text still gives different weights, none is used, so the family is asked.
 */
function parseWeight(text: string, out: Extraction): void {
  const found: { lb: number; ev: Evidence }[] = [];
  if (BATTERY_NOT_INCLUDED.test(text.toLowerCase())) return;
  for (const m of text.matchAll(/(?<![\w.|])(\d{2,3}(?:\.\d)?)\s?(lbs?|pounds|kg)\b\.?/gi)) {
    if (m.index === undefined) continue;
    const end = m.index + m[0].length;
    // Only words in the same sentence or list item describe this figure. A period after "lbs"
    // ends the sentence unless a lowercase word follows, as in "this 180 lb. machine".
    const sentenceEnd = m[0].endsWith(".") && !/^\s[a-z]/.test(text.slice(end, end + 2));
    const { start, stop } = clauseAround(text, m.index, sentenceEnd ? end - 1 : end);
    const from = (n: number) => Math.max(start, m.index - n);
    const to = (n: number) => Math.min(stop, end + n);
    const before = slice(text, from(22), m.index);
    const after = slice(text, end, to(16));
    const adjacent = slice(text, from(12), m.index) + " " + slice(text, end, to(12));
    if (/(payload|load|capacity|rider|carry|max|maximum|up to|supports?|rack|limit)/.test(adjacent)) continue;
    if (!/(weight|weighs|weighing|this\s*$)/.test(before) && !/^\s*(machine|bike|e-?bike)/.test(after)) continue;
    if (weightIsForPart(text, m.index, start)) continue;
    // Not cut at the sentence: "batt. not incl." has periods of its own, and skipping is the safe side.
    if (WITHOUT_BATTERY.test(slice(text, m.index - 30, end + 30))) continue;
    if (splitNumberBefore(text, m.index)) {
      flagSplit(out);
      continue;
    }
    let lb = Number(m[1]);
    if (/kg/i.test(m[2])) lb = roundUpTenth(lb * KG_TO_LB);
    found.push({ lb, ev: snippet(text, m.index, m[0].length) });
  }
  if (found.length === 0) return;
  for (const f of found) push(out.evidence, "weightLb", f.ev);
  const values = found.map((f) => f.lb);
  const heaviest = Math.max(...values);
  if (heaviest - Math.min(...values) > SAME_WEIGHT_LB) {
    out.flags.push("several_weights");
    return;
  }
  out.facts.weightLb = heaviest;
}

/** Normalizes spaces, dashes and curly apostrophes so patterns match, without changing word order. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/[   ]/g, " ")
    .replace(/[‐‑‒—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Store pages list other products under headings like these. The text after one is about other products. */
const OTHER_PRODUCTS =
  /\b(you (?:may|might|will|'ll) also like|related (?:products|items|bikes)|customers (?:also|who) (?:bought|viewed|liked)|people also (?:bought|viewed)|frequently bought together|similar (?:products|items)|recently viewed|compare (?:with )?similar|more from this collection|shop similar|recommended for you|recommended products)\b/i;
/**
 * Headings that start this bike's own details again. Store pages often put "Frequently bought
 * together" between the top bullets and the bike's own spec table, and that table must be read.
 */
const OWN_DETAILS =
  /\b(product information|product details|product description|product specifications|product overview|technical details|technical specifications|tech specs|specifications|specs|spec sheet|item details|additional information|about this item|from the manufacturer)\b/i;

/**
 * The listing with each stretch about other products blanked out. A stretch starts at a heading
 * like "You may also like" and runs to the next heading for this bike's own details, or to the
 * end. Blanking keeps every position, so evidence still points into the text. A period in the
 * middle of the blank ends the clause before it.
 */
function withoutOtherProducts(text: string): { own: string; skipped: boolean } {
  let own = text;
  let from = 0;
  let skipped = false;
  for (;;) {
    const other = OTHER_PRODUCTS.exec(own.slice(from));
    if (!other) break;
    skipped = true;
    const start = from + other.index;
    const afterHeading = start + other[0].length;
    const resume = OWN_DETAILS.exec(own.slice(afterHeading));
    const stop = resume ? afterHeading + resume.index : own.length;
    own = own.slice(0, start) + blank(stop - start) + own.slice(stop);
    if (!resume) break;
    from = stop;
  }
  return { own, skipped };
}

/** Spaces with a period in the middle, the same length as the text it replaces. */
function blank(length: number): string {
  const half = Math.floor((length - 1) / 2);
  return length < 5 ? " ".repeat(length) : `${" ".repeat(half)}.${" ".repeat(length - 1 - half)}`;
}

export function parseSpecText(raw: string, source: TextSource): Extraction {
  const text = normalizeText(raw);
  const out: Extraction = { text, facts: {}, evidence: {}, flags: [] };
  if (text.length === 0) return out;
  // A watt figure or a wheel size from another product must never stand in for this bike's, and
  // this bike's own spec table must still be read when it comes after a list of other products.
  const { own, skipped } = source === "listing" ? withoutOtherProducts(text) : { own: text, skipped: false };
  if (skipped) out.flags.push("other_products_skipped");
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
