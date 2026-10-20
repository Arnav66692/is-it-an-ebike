// Builds public/places/us-places.json, the place index the search box loads on demand. It reads
// the Census files in place, from one folder, and needs no packages beyond Node and tsx.
//
// Usage: npx tsx scripts/build-places.ts <folder with the Census files> [--built YYYY-MM-DD]
//
// docs/PLACES_DATA.md lists the files, where to get them and what each one is used for.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeName } from "../lib/places/normalize";
import { CHECKED_CITIES, NOT_COUNTY_LAND, SD_COUNTY_FIPS, SD_STATE } from "../lib/places/sanDiego";
import type { PlaceDataSource, PlaceIndexFile } from "../lib/places/types";
import { STATE_CODES } from "../lib/rules/compile";
import { readAcsPopulation, readTable, readZipEntry, type AcsPopulation } from "./places/census";
import { measureNotCountyLand } from "./places/sdLand";
import { featuresAt, readShapefile } from "./places/shapes";

const OUT = join(__dirname, "..", "public", "places", "us-places.json");

const GAZ = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer";
const SOURCES: PlaceDataSource[] = [
  { name: "Gazetteer, counties", file: "2026_Gaz_counties_national.zip", url: `${GAZ}/2026_Gaz_counties_national.zip`, vintage: "2026 Gazetteer Files", use: "Every county and county equivalent, with its name and state." },
  { name: "Gazetteer, places", file: "2026_Gaz_place_national.zip", url: `${GAZ}/2026_Gaz_place_national.zip`, vintage: "2026 Gazetteer Files", use: "Every city, town, village, borough and census designated place (CDP), with its kind and internal point." },
  { name: "Gazetteer, county subdivisions", file: "2026_Gaz_cousubs_national.zip", url: `${GAZ}/2026_Gaz_cousubs_national.zip`, vintage: "2026 Gazetteer Files", use: "Active towns, townships and plantations in the 12 states where they are general-purpose local governments." },
  { name: "American Community Survey, table B01003 Total Population", file: "acsdt5y2024-b01003.dat", url: "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b01003.dat", vintage: "2020-2024 ACS 5-year estimates", use: "Population, to put bigger places first, and the counties each place lies in." },
  { name: "Cartographic boundary file, counties, 1:500,000", file: "cb_2025_us_county_500k.zip", url: "https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip", vintage: "2025 cartographic boundary files", use: "The county of a place the ACS table doesn't place, from the place's internal point." },
  { name: "Cartographic boundary file, California places, 1:500,000", file: "cb_2025_06_place_500k.zip", url: "https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_06_place_500k.zip", vintage: "2025 cartographic boundary files", use: "The shape of each San Diego County community, to measure base and reservation land." },
  { name: "Cartographic boundary file, American Indian, Alaska Native and Native Hawaiian areas, 1:500,000", file: "cb_2025_us_aiannh_500k.zip", url: "https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_aiannh_500k.zip", vintage: "2025 cartographic boundary files", use: "Reservation land in San Diego County communities." },
  { name: "TIGER/Line Shapefile, military installations", file: "tl_2025_us_mil.zip", url: "https://www2.census.gov/geo/tiger/TIGER2025/MIL/tl_2025_us_mil.zip", vintage: "2025 TIGER/Line Shapefiles", use: "Military base land in San Diego County communities." },
];

/**
 * The 12 states whose towns and townships are general-purpose local governments, per the Census
 * glossary entry for county subdivisions, https://www.census.gov/programs-surveys/geography/about/glossary.html.
 */
const TOWN_STATES = new Set(["CT", "ME", "MA", "MI", "MN", "NH", "NJ", "NY", "PA", "RI", "VT", "WI"]);

/** Puerto Rico is in the Census files but not in the rules table. */
const LEFT_OUT_STATES = new Set(["PR"]);

/** Place LSAD codes, the kind letter they get and the suffix their Census name ends with. */
const PLACE_KINDS: Record<string, { letter: string; suffix: string[] }> = {
  "25": { letter: "c", suffix: [" city"] },
  "53": { letter: "c", suffix: [" city and borough"] },
  "43": { letter: "t", suffix: [" town"] },
  "47": { letter: "v", suffix: [" village"] },
  "21": { letter: "b", suffix: [" borough"] },
  "37": { letter: "m", suffix: [" municipality"] },
  "57": { letter: "d", suffix: [" CDP"] },
  CN: { letter: "c", suffix: [" corporation"] },
  UG: { letter: "c", suffix: [" unified government"] },
  CG: { letter: "c", suffix: [" consolidated government"] },
  UC: { letter: "c", suffix: [" urban county"] },
  MG: { letter: "c", suffix: [" metropolitan government"] },
  // Consolidated cities and their balances, like "Indianapolis city (balance)" or "Carson City".
  "00": { letter: "c", suffix: [" city", " unified government", " consolidated government", " metropolitan government", " metro government", ""] },
};

/** County subdivision name endings kept for TOWN_STATES, longest first, and their kind letters. */
const TOWN_KINDS: [string, string][] = [
  [" charter township", "S"],
  [" township", "S"],
  [" plantation", "P"],
  [" town", "T"],
];

interface Row {
  letter: string;
  counties: string[];
  name: string;
  code: string;
  population: number;
  geoid: string;
  /** Another name people type, like "Louisville" for "Louisville/Jefferson County". */
  alias?: string;
}

/** LSAD codes of consolidated city-county governments, whose names join the city and the county. */
const CONSOLIDATED = new Set(["00", "UG", "CG", "UC", "MG"]);

/** The city part of a consolidated name, like "Nashville" in "Nashville-Davidson", or undefined. */
function cityPart(lsad: string, name: string): string | undefined {
  if (!CONSOLIDATED.has(lsad)) return undefined;
  const part = name.split(/\/|-|, /)[0].trim();
  return part !== "" && part !== name ? part : undefined;
}

function args(): { dir: string; built: string } {
  const [dir, ...rest] = process.argv.slice(2);
  if (!dir) throw new Error("Usage: npx tsx scripts/build-places.ts <folder with the Census files> [--built YYYY-MM-DD]");
  const at = rest.indexOf("--built");
  const built = at >= 0 ? rest[at + 1] : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(built ?? "")) throw new Error(`--built must look like 2026-10-20, not ${built}`);
  return { dir, built };
}

function gazetteer(dir: string, file: string): Record<string, string>[] {
  const zip = readFileSync(join(dir, file));
  return readTable(readZipEntry(zip, file.replace(/\.zip$/, ".txt")).toString("utf8"));
}

function shapes(dir: string, file: string) {
  return readShapefile(readFileSync(join(dir, file)), file.replace(/\.zip$/, ""));
}

function stripSuffix(name: string, suffixes: string[]): string | null {
  const base = name.replace(/ \(balance\)$/, "");
  for (const s of suffixes) if (s === "" || base.endsWith(s)) return base.slice(0, base.length - s.length);
  return null;
}

function checkName(name: string, what: string): string {
  if (name.trim() === "" || name.includes("|")) throw new Error(`${what} has a name the index can't hold: "${name}"`);
  return name;
}

/** The counties a place lies in, most people first, from the ACS table or else its internal point. */
function placeCounties(p: Record<string, string>, acs: AcsPopulation, countyShapes: ReturnType<typeof shapes>): { counties: string[]; byPoint: boolean } {
  const parts = acs.placeCounty.get(p.GEOID);
  if (parts && parts.length > 0) {
    const sorted = [...parts].sort((a, b) => b.population - a.population || a.county.localeCompare(b.county));
    return { counties: sorted.map((c) => c.county), byPoint: false };
  }
  const hits = featuresAt(countyShapes, Number(p.INTPTLONG), Number(p.INTPTLAT)).filter((f) => f.props.STATEFP === p.GEOID.slice(0, 2));
  if (hits.length !== 1) throw new Error(`${p.NAME}, ${p.USPS} (${p.GEOID}) is in ${hits.length} counties by its internal point`);
  return { counties: [hits[0].props.GEOID], byPoint: true };
}

function placeRows(dir: string, acs: AcsPopulation, countyCodes: Set<string>) {
  const countyShapes = shapes(dir, "cb_2025_us_county_500k.zip");
  const rows: Row[] = [];
  let byPoint = 0;
  let leftOut = 0;
  for (const p of gazetteer(dir, "2026_Gaz_place_national.zip")) {
    if (LEFT_OUT_STATES.has(p.USPS)) {
      leftOut += 1;
      continue;
    }
    const kind = PLACE_KINDS[p.LSAD];
    if (!kind) throw new Error(`${p.NAME}, ${p.USPS} has LSAD ${p.LSAD}, which the build doesn't know`);
    const name = stripSuffix(p.NAME, kind.suffix);
    if (name === null) throw new Error(`${p.NAME}, ${p.USPS} doesn't end with ${kind.suffix.join(" or ")}`);
    const where = placeCounties(p, acs, countyShapes);
    if (where.byPoint) byPoint += 1;
    for (const c of where.counties) if (!countyCodes.has(c)) throw new Error(`${p.NAME}, ${p.USPS} lies in county ${c}, which the Gazetteer doesn't list`);
    rows.push({
      letter: kind.letter,
      counties: where.counties,
      name: checkName(name, p.GEOID),
      code: p.GEOID.slice(2),
      population: acs.place.get(p.GEOID) ?? 0,
      geoid: p.GEOID,
      alias: cityPart(p.LSAD, name),
    });
  }
  return { rows, byPoint, leftOut };
}

/** Active towns and townships in TOWN_STATES, without the ones a place of the same name in the same county already covers. */
function townRows(dir: string, acs: AcsPopulation, places: Row[], countyCodes: Set<string>) {
  const placeKeys = new Set(places.flatMap((p) => p.counties.map((c) => `${c}|${normalizeName(p.name)}`)));
  const rows: Row[] = [];
  let sameAsPlace = 0;
  for (const s of gazetteer(dir, "2026_Gaz_cousubs_national.zip")) {
    if (!TOWN_STATES.has(s.USPS) || s.FUNCSTAT !== "A") continue;
    const kind = TOWN_KINDS.find(([suffix]) => s.NAME.endsWith(suffix));
    if (!kind) continue;
    const county = s.GEOID.slice(0, 5);
    if (!countyCodes.has(county)) throw new Error(`${s.NAME}, ${s.USPS} lies in county ${county}, which the Gazetteer doesn't list`);
    const name = checkName(s.NAME.slice(0, s.NAME.length - kind[0].length), s.GEOID);
    if (placeKeys.has(`${county}|${normalizeName(name)}`)) {
      sameAsPlace += 1;
      continue;
    }
    rows.push({ letter: kind[1], counties: [county], name, code: s.GEOID.slice(5), population: acs.cousub.get(s.GEOID) ?? 0, geoid: s.GEOID });
  }
  return { rows, sameAsPlace };
}

/** Stops the build when a checked city's Census GEOID no longer names that city in San Diego County. */
function checkSanDiego(places: Row[]): void {
  for (const city of CHECKED_CITIES) {
    const row = places.find((p) => p.geoid === city.geoid);
    if (!row || row.name !== city.name || row.letter !== "c" || row.counties.join() !== SD_COUNTY_FIPS || !row.geoid.startsWith("06")) {
      throw new Error(`Checked city ${city.name} (${city.geoid}) is not a city in San Diego County, ${SD_STATE}, in these files`);
    }
  }
}

function checkNotCountyLand(dir: string, places: Row[]) {
  const sdCommunities = new Set(places.filter((p) => p.letter === "d" && p.counties.join() === SD_COUNTY_FIPS).map((p) => p.geoid));
  const measured = measureNotCountyLand(shapes(dir, "cb_2025_06_place_500k.zip"), shapes(dir, "tl_2025_us_mil.zip"), shapes(dir, "cb_2025_us_aiannh_500k.zip"), sdCommunities);
  const listed = [...NOT_COUNTY_LAND].sort((a, b) => a.geoid.localeCompare(b.geoid));
  const same =
    measured.length === listed.length &&
    measured.every((m, i) => m.geoid === listed[i].geoid && m.reason === listed[i].reason && m.share === listed[i].share && m.area === listed[i].area);
  if (!same) {
    throw new Error(`NOT_COUNTY_LAND in lib/places/sanDiego.ts no longer matches the measure. Measured: ${JSON.stringify(measured)}`);
  }
  return measured;
}

function main(): void {
  const { dir, built } = args();
  const acs = readAcsPopulation(readFileSync(join(dir, "acsdt5y2024-b01003.dat"), "utf8"));
  const countyTable = gazetteer(dir, "2026_Gaz_counties_national.zip").filter((c) => !LEFT_OUT_STATES.has(c.USPS));
  const counties: [string, string][] = countyTable.map((c) => [c.GEOID, checkName(c.NAME, c.GEOID)] as [string, string]).sort((a, b) => a[0].localeCompare(b[0]));
  const countyCodes = new Set(counties.map((c) => c[0]));

  const stateFips = new Map<string, string>();
  for (const c of countyTable) stateFips.set(c.USPS, c.GEOID.slice(0, 2));
  const codes = [...stateFips.keys()].sort();
  if (codes.join() !== [...STATE_CODES].sort().join()) throw new Error(`The Census states ${codes.join()} don't match the rules table`);
  const states = [...stateFips.entries()].sort((a, b) => (acs.state.get(b[1]) ?? 0) - (acs.state.get(a[1]) ?? 0) || a[0].localeCompare(b[0]));

  const place = placeRows(dir, acs, countyCodes);
  checkSanDiego(place.rows);
  const notCountyLand = checkNotCountyLand(dir, place.rows);
  const towns = townRows(dir, acs, place.rows, countyCodes);
  const countyRows: Row[] = counties.map(([geoid, name]) => ({ letter: "C", counties: [geoid], name, code: "", population: acs.county.get(geoid) ?? 0, geoid }));

  const all = [...countyRows, ...place.rows, ...towns.rows].sort(
    (a, b) => b.population - a.population || a.name.localeCompare(b.name) || a.geoid.localeCompare(b.geoid),
  );
  const countyIndex = new Map(counties.map((c, i) => [c[0], i]));
  const rows = all.map((r) => `${r.letter}|${r.counties.map((c) => countyIndex.get(c)).join(".")}|${r.name}|${r.code}`);
  const aliases: Record<string, string[]> = {};
  for (const r of place.rows) if (r.alias) aliases[`p-${r.geoid}`] = [r.alias];

  const counts: Record<string, number> = {
    rows: rows.length,
    counties: countyRows.length,
    places: place.rows.length,
    towns_and_townships: towns.rows.length,
    places_placed_by_internal_point: place.byPoint,
    towns_left_out_as_same_as_a_place: towns.sameAsPlace,
    puerto_rico_places_left_out: place.leftOut,
  };
  for (const r of all) counts[`kind_${r.letter}`] = (counts[`kind_${r.letter}`] ?? 0) + 1;

  const file: PlaceIndexFile = {
    format: 1,
    built,
    about: "Every US state, county, city, town and census designated place, for the place search. Built by scripts/build-places.ts from the Census files in sources. See docs/PLACES_DATA.md.",
    sources: SOURCES,
    counts,
    states,
    counties,
    notCountyLand,
    aliases,
    rows,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, serialize(file));
  process.stdout.write(`${OUT}: ${rows.length} rows, ${JSON.stringify(counts)}\n`);
}

/** One row per line, so a rebuild's diff shows which places changed. */
function serialize(file: PlaceIndexFile): string {
  const { rows, counties, ...head } = file;
  const lines = (items: unknown[]) => items.map((x) => `  ${JSON.stringify(x)}`).join(",\n");
  const top = JSON.stringify(head, null, 1).replace(/\n}$/, "");
  return `${top},\n"counties": [\n${lines(counties)}\n],\n"rows": [\n${lines(rows)}\n]\n}\n`;
}

main();
