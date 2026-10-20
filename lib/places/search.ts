// The search behind "Where do they ride?". It matches the start of a name or of any word in it,
// puts states first, then places with a checked San Diego record, then bigger places, and
// labels every result with its county and state so two places with one name can't be confused.

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

function matchTier(entry: PlaceEntry, variants: string[], allowCode: boolean): Tier | null {
  let best: Tier | null = null;
  for (const q of variants) {
    if (allowCode && entry.kind === "state" && q === entry.state.toLowerCase()) return EXACT;
    for (const key of entry.keys) {
      if (key === q) return EXACT;
      if (key.startsWith(q)) best = PREFIX;
      else if (best === null && q.length >= WORD_MATCH_MIN && key.includes(` ${q}`)) best = WORD;
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
 * The order groups. States that match the start of their name come first, then places with a
 * checked San Diego record, then other exact names, other name starts, and words inside names.
 * Within a group an exact name comes before a name that only starts that way.
 */
function groupOf(entry: PlaceEntry, tier: Tier): number {
  if (tier === WORD) return isChecked(entry) ? 4 : 5;
  if (entry.kind === "state") return 0;
  if (isChecked(entry)) return 1;
  return tier === EXACT ? 2 : 3;
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

/** The places that match what the family typed, best first, with no two results labeled the same. */
export function searchPlaces(index: PlaceIndex, text: string, limit: number = DEFAULT_RESULTS): PlaceEntry[] {
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
  const out: PlaceEntry[] = [];
  for (const { entry } of ordered) {
    const label = placeLabel(index, entry, "en").text;
    if (labels.has(label)) continue;
    labels.add(label);
    out.push(entry);
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

function countyText(index: PlaceIndex, entry: PlaceEntry, lang: Lang): string {
  const main = index.countyNames.get(entry.counties[0]) ?? entry.counties[0];
  const more = entry.counties.length - 1;
  if (more === 0) return main;
  if (lang === "es") return `${main} y ${more} ${more === 1 ? "condado" : "condados"} más`;
  return `${main} and ${more} other ${more === 1 ? "county" : "counties"}`;
}

/** The result's label, always with its county and state. */
export function placeLabel(index: PlaceIndex, entry: PlaceEntry, lang: Lang): PlaceLabel {
  if (entry.kind === "state") {
    const name = stateName(entry.state, lang);
    return { name, where: "", state: entry.state, text: name };
  }
  if (entry.kind === "county") return { name: entry.name, where: "", state: entry.state, text: `${entry.name}, ${entry.state}` };
  const county = countyText(index, entry, lang);
  const where = entry.kind === "neighborhood" ? `${placeName("city_of_san_diego", lang)}, ${county}` : county;
  return { name: entry.name, where, state: entry.state, text: `${entry.name}, ${where}, ${entry.state}` };
}
