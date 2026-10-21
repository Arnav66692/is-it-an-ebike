// The search behind "Where do they ride?". It matches the start of a name or of any word in it,
// puts states first, then exact names before names that only start that way, with a checked San
// Diego record first within each, then bigger places. It labels every result with its county and
// state so two places with one name can't be confused.

import { capitalize, placeName, stateName, type Lang } from "@/lib/i18n/names";
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

function statesOf(index: PlaceIndex): PlaceEntry[] {
  let states = stateEntries.get(index);
  if (!states) {
    states = index.entries.filter((e) => e.kind === "state");
    stateEntries.set(index, states);
  }
  return states;
}

/** The state a query's qualifier names: a postal code, or an English or Spanish state name. */
function stateFor(index: PlaceIndex, key: string): string | null {
  const found = statesOf(index).find((s) => s.state.toLowerCase() === key || s.keys.includes(key));
  return found ? found.state : null;
}

/** A state name still being typed after a place name, with no comma, needs this many letters, like "Tex". */
const HALF_STATE_MIN = 2;

/**
 * The states a qualifier can mean: the one it names in full, or else every state whose name starts
 * with it, since the search runs on every key and "Encinitas, Cali" is on its way to "California".
 */
function statesFor(index: PlaceIndex, key: string, minPrefix: number): string[] {
  const exact = stateFor(index, key);
  if (exact) return [exact];
  if (key.length < minPrefix) return [];
  return statesOf(index)
    .filter((s) => s.keys.some((k) => k.startsWith(key)))
    .map((s) => s.state);
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
      const exact = stateFor(index, qualifier);
      if (exact) return [...forms, { variants: name, state: exact, county: null }];
      forms.push({ variants: name, state: null, county: qualifier });
      for (const state of statesFor(index, qualifier, 1)) forms.push({ variants: name, state, county: null });
    }
    return forms;
  }
  const words = whole[0].trim().split(" ");
  for (let n = 1; n <= Math.min(STATE_NAME_WORDS, words.length - 1); n++) {
    for (const state of statesFor(index, words.slice(-n).join(" "), HALF_STATE_MIN)) {
      forms.push({ variants: [words.slice(0, -n).join(" ")], state, county: null });
    }
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
 * is exactly what was typed, and only when it is in `state`, the state the answer uses now. Null
 * when more than one could be meant, like "Hillcrest" or "Carmel", or when the one match is in
 * another state, like "Miramar" in Florida for a family in San Diego. Enter then highlights the
 * first result, so a place is never picked without being seen, and one key press never starts
 * over in another state.
 */
export function enterChoice(results: readonly SearchResult[], state: string): number | null {
  const exact = results.flatMap((r, i) => (r.exact ? [i] : []));
  const only = results.length === 1 ? 0 : exact.length === 1 ? exact[0] : null;
  return only !== null && results[only].entry.state === state ? only : null;
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
    // Two districts can share a name, office city and county, like the two Excel Academy Charter
    // Districts in Irvine. Each is its own NCES district, so neither hides the other.
    const label = entry.kind === "district" ? entry.id : placeLabel(index, entry, "en").text;
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

/**
 * Census county names in Spanish, by the word the name ends in, so a Spanish line reads
 * "condado de San Diego", the way the answers name it, not "San Diego County". The longest
 * ending comes first, so "City and Borough" is not read as "Borough".
 */
const COUNTY_WORDS_ES: readonly [string, string][] = [
  [" City and Borough", "ciudad y distrito de"],
  [" Census Area", "área censal de"],
  [" Planning Region", "región de planificación de"],
  [" Municipality", "municipio de"],
  [" County", "condado de"],
  [" Parish", "parroquia de"],
  [" Borough", "distrito de"],
  [" city", "ciudad de"],
];

/** "San Diego County" as "condado de San Diego", in the middle of a line. A name with no county word stays as it is. */
export function countyNameEs(name: string): string {
  if (name === "District of Columbia") return "Distrito de Columbia";
  const found = COUNTY_WORDS_ES.find(([word]) => name.endsWith(word) && name.length > word.length);
  return found ? `${found[1]} ${name.slice(0, -found[0].length)}` : name;
}

function countyText(index: CountyNames, entry: PlaceEntry, lang: Lang): string {
  const census = index.countyNames.get(entry.counties[0]) ?? entry.counties[0];
  const main = lang === "es" ? countyNameEs(census) : census;
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
  if (entry.kind === "county") {
    const name = lang === "es" ? capitalize(countyNameEs(entry.name)) : entry.name;
    return { name, where: "", state: entry.state, text: `${name}, ${entry.state}` };
  }
  if (entry.kind === "district") {
    // A district's office city, then its county. The county is blank for a district new since the NCES geocodes.
    const county = entry.counties.length > 0 ? countyText(index, entry, lang) : "";
    const where = [entry.city ?? "", county].filter(Boolean).join(", ");
    return { name: entry.name, where, state: entry.state, text: [entry.name, where, entry.state].filter(Boolean).join(", ") };
  }
  const county = countyText(index, entry, lang);
  const where = entry.kind === "neighborhood" ? `${placeName("city_of_san_diego", lang)}, ${county}` : county;
  return { name: entry.name, where, state: entry.state, text: `${entry.name}, ${where}, ${entry.state}` };
}
