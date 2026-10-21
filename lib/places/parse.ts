// Turns the place index file into entries the search can use. Pure, so tests can run it on the
// committed file. A file that doesn't parse throws, and the page falls back to the state picker.

import { stateName } from "@/lib/i18n/names";
import { STATE_CODES } from "@/lib/rules/compile";
import { normalizeName } from "./normalize";
import { SD_COUNTY_ALSO_KNOWN_AS, SD_COUNTY_FIPS, SD_STATE } from "./sanDiego";
import { neighborhoodId, SD_CITY_NEIGHBORHOODS, SD_NEIGHBORHOODS } from "./sdNeighborhoods";
import { KIND_LETTERS, type PlaceEntry, type PlaceIndex, type PlaceIndexFile } from "./types";

/** The City of San Diego's Census place GEOID. Its neighborhoods share its rank. */
const SAN_DIEGO_CITY_ID = "p-0666000";

/** Other names a state goes by, beyond its English and Spanish names and its postal code. */
const STATE_ALIASES: Record<string, string[]> = {
  DC: ["District of Columbia", "Washington DC"],
};

const CODE = /^\d{5}$/;

function unique(keys: string[]): string[] {
  return [...new Set(keys.filter((k) => k !== ""))];
}

function stateEntries(states: [string, string][]): PlaceEntry[] {
  return states.map(([code], i) => ({
    id: `s-${code}`,
    name: stateName(code, "en"),
    kind: "state",
    source: "state",
    state: code,
    counties: [],
    geoid: null,
    // States sort before every row, most people first.
    rank: i - states.length,
    keys: unique([stateName(code, "en"), stateName(code, "es"), ...(STATE_ALIASES[code] ?? [])].map(normalizeName)),
  }));
}

function rowEntry(row: string, rank: number, file: PlaceIndexFile, fipsToState: Map<string, string>): PlaceEntry {
  const parts = row.split("|");
  if (parts.length !== 4) throw new Error(`Place row ${rank} has ${parts.length} fields`);
  const [letter, countyText, name, code] = parts;
  const kind = KIND_LETTERS[letter];
  if (!kind) throw new Error(`Place row ${rank} has an unknown kind "${letter}"`);
  if (name.trim() === "") throw new Error(`Place row ${rank} has no name`);
  const counties = countyText.split(".").map((n) => {
    const county = file.counties[Number(n)];
    if (!/^\d+$/.test(n) || !county) throw new Error(`Place row ${rank} names county ${n}, which the file doesn't list`);
    return county[0];
  });
  const state = fipsToState.get(counties[0].slice(0, 2));
  if (!state || counties.some((c) => fipsToState.get(c.slice(0, 2)) !== state)) throw new Error(`Place row ${rank} has counties in more than one state or none`);
  if (kind.source === "county" ? code !== "" : !CODE.test(code)) throw new Error(`Place row ${rank} has a bad code "${code}"`);

  const geoid = kind.source === "county" ? counties[0] : kind.source === "place" ? `${counties[0].slice(0, 2)}${code}` : `${counties[0]}${code}`;
  const prefix = kind.source === "county" ? "c" : kind.source === "place" ? "p" : "m";
  return { id: `${prefix}-${geoid}`, name, kind: kind.kind, source: kind.source, state, counties, geoid, rank, keys: [normalizeName(name)] };
}

function neighborhoodEntries(rank: number): PlaceEntry[] {
  return [...SD_NEIGHBORHOODS, ...SD_CITY_NEIGHBORHOODS].map((n) => ({
    id: neighborhoodId(n.slug),
    name: n.name,
    kind: "neighborhood",
    source: "neighborhood",
    state: SD_STATE,
    counties: [SD_COUNTY_FIPS],
    geoid: null,
    rank,
    keys: unique([n.name, ...(n.alsoKnownAs ?? [])].map(normalizeName)),
  }));
}

/** The loaded index. Throws when the file is not a place index this code can read. */
export function parsePlaceIndex(file: PlaceIndexFile): PlaceIndex {
  if (!file || file.format !== 1 || !Array.isArray(file.rows) || !Array.isArray(file.counties) || !Array.isArray(file.states)) {
    throw new Error("Not a place index in format 1");
  }
  const codes = file.states.map(([code]) => code);
  if ([...codes].sort().join() !== [...STATE_CODES].sort().join()) throw new Error("The place index states don't match the rules table");
  const fipsToState = new Map(file.states.map(([code, fips]) => [fips, code]));

  const aliases: Record<string, readonly string[]> = { ...(file.aliases ?? {}), [`c-${SD_COUNTY_FIPS}`]: [...(file.aliases?.[`c-${SD_COUNTY_FIPS}`] ?? []), ...SD_COUNTY_ALSO_KNOWN_AS] };
  const rows = file.rows.map((row, i) => {
    const e = rowEntry(row, i, file, fipsToState);
    const more = aliases[e.id];
    return more ? { ...e, keys: unique([...e.keys, ...more.map(normalizeName)]) } : e;
  });
  const sanDiego = rows.find((e) => e.id === SAN_DIEGO_CITY_ID);
  if (!sanDiego) throw new Error("The place index has no City of San Diego");
  const entries = [...stateEntries(file.states), ...rows, ...neighborhoodEntries(sanDiego.rank)];

  const byId = new Map<string, PlaceEntry>();
  for (const e of entries) {
    if (byId.has(e.id)) throw new Error(`The place index has two entries with id ${e.id}`);
    byId.set(e.id, e);
  }
  return { built: file.built, sources: file.sources, entries, byId, countyNames: new Map(file.counties) };
}
