// The search behind "Where do they ride?". It matches the start of a name or of any word in it,
// puts states first, then exact names before names that only start that way, with a checked San
// Diego record first within each, then bigger places. It labels every result with its county and
// state so two places with one name can't be confused.

import { placeName, stateName, type Lang } from "@/lib/i18n/names";
import { normalizeName, queryVariants } from "./normalize";
import { resolvePlace } from "./resolve";
import type { PlaceEntry, PlaceIndex } from "./types";

export const DEFAULT_RESULTS = 8;

/** Matching the middle of a name starts at this many typed characters, so one letter doesn't match half the country. */
const WORD_MATCH_MIN = 2;

/** How a query names a state at its end, as in "Austin, TX" or "Portland Oregon". Up to three words. */
const STATE_NAME_WORDS = 3;

type Tier = 0 | 1 | 2;
const EXACT: Tier = 0;
const PREFIX: Tier = 1;
const WORD: Tier = 2;

interface Form {
  variants: string[];
  /** Only places in this state. */
  state: string | null;
  /** Only places in a county whose name starts with this key. */
  county: string | null;
}

/**
 * Small joining words. A query that starts with one, like "Del Sur", is the start of a name of its
 * own, so it never matches in the middle of another name, like the "del sur" in "Carolina del Sur".
 */
const JOINING_WORDS = new Set(["de", "del", "la", "las", "los", "el", "of", "the", "and", "y"]);

function startsWithJoiningWord(q: string): boolean {
  return JOINING_WORDS.has(q.split(" ")[0]);
}

function matchTier(entry: PlaceEntry, variants: string[], allowCode: boolean): Tier | null {
  let best: Tier | null = null;
  for (const q of variants) {
    if (allowCode && entry.kind === "state" && q === entry.state.toLowerCase()) return EXACT;
    const inWords = q.length >= WORD_MATCH_MIN && !startsWithJoiningWord(q);
    for (const key of entry.keys) {
      if (key === q) return EXACT;
      if (key.startsWith(q)) best = PREFIX;
      else if (best === null && inWords && key.includes(` ${q}`)) best = WORD;
    }
  }
  return best;
}

/** The state entries of each index, found once. */
const stateEntries = new WeakMap<PlaceIndex, PlaceEntry[]>();

/** The state a query's qualifier names: a postal code, or an English or Spanish state name. */
function stateFor(index: PlaceIndex, key: string): string | null {
  let states = stateEntries.get(index);
  if (!states) {
    states = index.entries.filter((e) => e.kind === "state");
    stateEntries.set(index, states);
  }
  const found = states.find((s) => s.state.toLowerCase() === key || s.keys.includes(key));
  return found ? found.state : null;
}

/** The ways to read a query: as typed, and with a trailing state or county split off. */
function formsOf(index: PlaceIndex, text: string): Form[] {
  const whole = queryVariants(text);
  if (whole.length === 0) return [];
  const forms: Form[] = [{ variants: whole, state: null, county: null }];
  const comma = text.lastIndexOf(",");
  if (comma > 0) {
    const name = queryVariants(text.slice(0, comma));
    const qualifier = normalizeName(text.slice(comma + 1));
    if (name.length > 0 && qualifier !== "") {
      const state = stateFor(index, qualifier);
      forms.push(state ? { variants: name, state, county: null } : { variants: name, state: null, county: qualifier });
    }
    return forms;
  }
  const words = whole[0].split(" ");
  for (let n = 1; n <= Math.min(STATE_NAME_WORDS, words.length - 1); n++) {
    const state = stateFor(index, words.slice(-n).join(" "));
    if (state) forms.push({ variants: [words.slice(0, -n).join(" ")], state, county: null });
  }
  return forms;
}

/** County FIPS to its name key, made once per index. */
const countyKeys = new WeakMap<PlaceIndex, Map<string, string>>();

function inCounty(index: PlaceIndex, entry: PlaceEntry, county: string): boolean {
  let keys = countyKeys.get(index);
  if (!keys) {
    keys = new Map([...index.countyNames].map(([fips, name]) => [fips, normalizeName(name)]));
    countyKeys.set(index, keys);
  }
  const names = keys;
  return entry.counties.some((c) => (names.get(c) ?? "").startsWith(county));
}

/**
 * The order groups. Every exact name comes first, then every name that only starts that way, then
 * words inside names. In each, a state comes first, then places with a checked San Diego record,
 * then the rest. So "Texas" lists the state first and "Cal" lists California first, but "Boston"
 * lists Boston, Massachusetts before Bostonia in San Diego County, "Kent" lists Kent, Washington
 * before Kentucky, and "Carmel" lists every place named Carmel before Carmel Valley.
 */
function groupOf(entry: PlaceEntry, tier: Tier): number {
  const within = entry.kind === "state" ? 0 : isChecked(entry) ? 1 : 2;
  return 3 * tier + within;
}

const checkedCache = new WeakMap<PlaceEntry, boolean>();

function isChecked(entry: PlaceEntry): boolean {
  let checked = checkedCache.get(entry);
  if (checked === undefined) {
    checked = resolvePlace(entry).checked;
    checkedCache.set(entry, checked);
  }
  return checked;
}

/** One search result, and whether its name is exactly what the family typed. */
export interface SearchResult {
  entry: PlaceEntry;
  exact: boolean;
}

/** The places that match what the family typed, best first, with no two results labeled the same. */
export function searchPlaces(index: PlaceIndex, text: string, limit: number = DEFAULT_RESULTS): PlaceEntry[] {
  return searchResults(index, text, limit).map((r) => r.entry);
}

/**
 * The place Enter picks when no result is highlighted: the only result, or the only one whose name
 * is exactly what was typed. Null when more than one could be meant, like "Hillcrest" or "Carmel",
 * so Enter highlights the first result and a place is never picked without being seen.
 */
export function enterChoice(results: readonly SearchResult[]): number | null {
  if (results.length === 1) return 0;
  const exact = results.flatMap((r, i) => (r.exact ? [i] : []));
  return exact.length === 1 ? exact[0] : null;
}

/** The same as searchPlaces, with whether each name is an exact match. */
export function searchResults(index: PlaceIndex, text: string, limit: number = DEFAULT_RESULTS): SearchResult[] {
  const forms = formsOf(index, text);
  if (forms.length === 0 || limit <= 0) return [];
  const best = new Map<string, { entry: PlaceEntry; group: number; tier: Tier }>();
  for (const form of forms) {
    for (const entry of index.entries) {
      if (form.state && entry.state !== form.state) continue;
      if (form.county && !inCounty(index, entry, form.county)) continue;
      const tier = matchTier(entry, form.variants, form.state === null && form.county === null);
      if (tier === null) continue;
      const group = groupOf(entry, tier);
      const seen = best.get(entry.id);
      if (!seen || group < seen.group || (group === seen.group && tier < seen.tier)) best.set(entry.id, { entry, group, tier });
    }
  }
  const ordered = [...best.values()].sort(
    (a, b) =>
      a.group - b.group || a.tier - b.tier || a.entry.rank - b.entry.rank || a.entry.name.localeCompare(b.entry.name) || a.entry.id.localeCompare(b.entry.id),
  );
  const labels = new Set<string>();
  const out: SearchResult[] = [];
  for (const { entry, tier } of ordered) {
    const label = placeLabel(index, entry, "en").text;
    if (labels.has(label)) continue;
    labels.add(label);
    out.push({ entry, exact: tier === EXACT });
    if (out.length === limit) break;
  }
  return out;
}

export interface PlaceLabel {
  /** The place's own name, like "Carmel Valley". */
  name: string;
  /** Where it is, like "City of San Diego, San Diego County". Empty for a state or county. */
  where: string;
  /** The postal code of its state, like "CA". */
  state: string;
  /** All of it on one line, like "Carmel Valley, City of San Diego, San Diego County, CA". */
  text: string;
}

function countyText(index: CountyNames, entry: PlaceEntry, lang: Lang): string {
  const main = index.countyNames.get(entry.counties[0]) ?? entry.counties[0];
  const more = entry.counties.length - 1;
  if (more === 0) return main;
  if (lang === "es") return `${main} y ${more} ${more === 1 ? "condado" : "condados"} más`;
  return `${main} and ${more} other ${more === 1 ? "county" : "counties"}`;
}

/** The part of the index a label needs, so a pick from an old share link can be labeled before the index loads. */
export type CountyNames = Pick<PlaceIndex, "countyNames">;

/** The result's label, always with its county and state. */
export function placeLabel(index: CountyNames, entry: PlaceEntry, lang: Lang): PlaceLabel {
  if (entry.kind === "state") {
    const name = stateName(entry.state, lang);
    return { name, where: "", state: entry.state, text: name };
  }
  if (entry.kind === "county") return { name: entry.name, where: "", state: entry.state, text: `${entry.name}, ${entry.state}` };
  const county = countyText(index, entry, lang);
  const where = entry.kind === "neighborhood" ? `${placeName("city_of_san_diego", lang)}, ${county}` : county;
  return { name: entry.name, where, state: entry.state, text: `${entry.name}, ${where}, ${entry.state}` };
}
