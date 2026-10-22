// Builds public/places/us-zips.json, every US ZIP code (Census ZCTA) for the "Where do they
// ride?" search. It reads the two Census 2020 relationship files from one folder and checks every
// county and place against the app's place index. It needs no packages beyond Node and tsx.
//
// Usage: npx tsx scripts/build-zips.ts <folder with the Census files> [--built YYYY-MM-DD]
//
// docs/PLACES_DATA.md lists the files, where to get them and the rule each ZIP follows.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parsePlaceIndex } from "../lib/places/parse";
import type { PlaceDataSource, PlaceIndexFile } from "../lib/places/types";
import { CHECKED_COUNTIES, placeHolding, ZIP_PLACE_SHARE, type LandPart, type ZipIndexFile } from "../lib/places/zips";
import { readTable } from "./places/census";

const PLACES = join(__dirname, "..", "public", "places", "us-places.json");
const OUT = join(__dirname, "..", "public", "places", "us-zips.json");

const REL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520";
const COUNTY_FILE = "tab20_zcta520_county20_natl.txt";
const PLACE_FILE = "tab20_zcta520_place20_natl.txt";
const SOURCES: PlaceDataSource[] = [
  { name: "2020 ZCTA to county relationship file", file: COUNTY_FILE, url: `${REL}/${COUNTY_FILE}`, vintage: "2020 Census relationship files", use: "The counties each ZIP code lies in, by land area." },
  { name: "2020 ZCTA to place relationship file", file: PLACE_FILE, url: `${REL}/${PLACE_FILE}`, vintage: "2020 Census relationship files", use: "The cities, towns and CDPs each ZIP code lies in, by land area, and its land in no place." },
];

/** Connecticut's state FIPS. Its 2020 counties became planning regions, which the place index lists instead. */
const CONNECTICUT = "09";

type Part = LandPart;

interface Zcta {
  land: number;
  counties: Part[];
  places: Part[];
  /** Land in no place. */
  noPlace: number;
}

function args(): { dir: string; built: string } {
  const [dir, ...rest] = process.argv.slice(2);
  if (!dir) throw new Error("Usage: npx tsx scripts/build-zips.ts <folder with the Census files> [--built YYYY-MM-DD]");
  const at = rest.indexOf("--built");
  const built = at >= 0 ? rest[at + 1] : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(built ?? "")) throw new Error(`--built must look like 2026-10-22, not ${built}`);
  return { dir, built };
}

function landOf(value: string, what: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${what} has land area "${value}"`);
  return n;
}

function readZctas(dir: string): Map<string, Zcta> {
  const zctas = new Map<string, Zcta>();
  for (const r of readTable(readFileSync(join(dir, COUNTY_FILE), "utf8"))) {
    const zip = r.GEOID_ZCTA5_20;
    if (!zip) continue; // County land in no ZCTA.
    if (!/^\d{5}$/.test(zip) || !/^\d{5}$/.test(r.GEOID_COUNTY_20)) throw new Error(`Bad county row ${JSON.stringify(r)}`);
    const z = zctas.get(zip) ?? { land: landOf(r.AREALAND_ZCTA5_20, zip), counties: [], places: [], noPlace: 0 };
    zctas.set(zip, { ...z, counties: [...z.counties, { id: r.GEOID_COUNTY_20, land: landOf(r.AREALAND_PART, zip) }] });
  }
  for (const r of readTable(readFileSync(join(dir, PLACE_FILE), "utf8"))) {
    const zip = r.GEOID_ZCTA5_20;
    if (!zip) continue; // Place land in no ZCTA.
    const z = zctas.get(zip);
    if (!z) throw new Error(`ZCTA ${zip} is in the place file but not the county file`);
    const land = landOf(r.AREALAND_PART, zip);
    if (r.GEOID_PLACE_20 === "") zctas.set(zip, { ...z, noPlace: z.noPlace + land });
    else if (/^\d{7}$/.test(r.GEOID_PLACE_20)) zctas.set(zip, { ...z, places: [...z.places, { id: r.GEOID_PLACE_20, land }] });
    else throw new Error(`Bad place row ${JSON.stringify(r)}`);
  }
  return zctas;
}

const byLand = (a: Part, b: Part) => b.land - a.land || a.id.localeCompare(b.id);

function main(): void {
  const { dir, built } = args();
  const index = parsePlaceIndex(JSON.parse(readFileSync(PLACES, "utf8")) as PlaceIndexFile);
  const counts: Record<string, number> = {
    zips: 0,
    maps_to_one_place: 0,
    asks_which_place: 0,
    stays_a_zip: 0,
    in_more_than_one_state: 0,
    place_not_in_index_so_not_mapped: 0,
    outside_the_states_left_out: 0,
    connecticut_counties_left_out: 0,
    no_land_left_out: 0,
  };
  const rows: string[] = [];
  const stateFips = new Set((JSON.parse(readFileSync(PLACES, "utf8")) as PlaceIndexFile).states.map(([, fips]) => fips));
  for (const [zip, z] of [...readZctas(dir)].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!z.counties.some((c) => stateFips.has(c.id.slice(0, 2)))) {
      counts.outside_the_states_left_out += 1;
      continue;
    }
    if (z.land === 0) {
      counts.no_land_left_out += 1;
      continue;
    }
    const all = z.counties.filter((c) => stateFips.has(c.id.slice(0, 2))).sort(byLand);
    const stateLand = new Map<string, number>();
    for (const c of all) stateLand.set(c.id.slice(0, 2), (stateLand.get(c.id.slice(0, 2)) ?? 0) + c.land);
    const mainState = [...stateLand].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const manyStates = stateLand.get(mainState)! < ZIP_PLACE_SHARE * z.land;
    // Connecticut's 2020 counties are planning regions in the place index, so they can't be named.
    // A ZIP with no county the index lists names its state's FIPS instead.
    const counties = all.filter((c) => index.countyNames.has(c.id));
    for (const c of all) if (!index.countyNames.has(c.id) && c.id.slice(0, 2) !== CONNECTICUT) throw new Error(`ZIP ${zip} lies in county ${c.id}, which the place index doesn't list`);
    if (counties.length < all.length) counts.connecticut_counties_left_out += 1;
    const mainFirst = [...counties.filter((c) => c.id.startsWith(mainState)), ...counties.filter((c) => !c.id.startsWith(mainState))];
    const countyField = [...(mainFirst[0]?.id.startsWith(mainState) ? [] : [mainState]), ...mainFirst.map((c) => c.id)];
    const places = [...z.places].sort(byLand);
    const holding = manyStates ? null : placeHolding(z.land, places);
    let place = "";
    if (holding !== null) {
      if (index.byId.has(`p-${holding}`)) place = holding;
      else counts.place_not_in_index_so_not_mapped += 1;
    }
    const checked = counties.some((c) => CHECKED_COUNTIES.has(c.id));
    let list: string[] = [];
    let uninc: string[] = [];
    if (place === "" && !manyStates && checked) {
      list = places.filter((p) => p.land > 0).map((p) => p.id);
      for (const id of list) if (!index.byId.has(`p-${id}`)) throw new Error(`ZIP ${zip} covers place ${id} in a checked county, and the place index doesn't list it`);
      uninc = unincorporatedCounties(index, counties, places, z.noPlace);
    }
    if (place !== "") counts.maps_to_one_place += 1;
    else if (manyStates || checked) counts.asks_which_place += 1;
    else counts.stays_a_zip += 1;
    if (stateLand.size > 1) counts.in_more_than_one_state += 1;
    counts.zips += 1;
    const fields = [zip, countyField.join("."), place, list.join("."), uninc.join("."), manyStates ? "m" : ""];
    while (fields.length > 2 && fields[fields.length - 1] === "") fields.pop();
    rows.push(fields.join("|"));
  }
  checkSanDiego(rows);
  const file: ZipIndexFile = {
    format: 1,
    built,
    about: "Every US ZIP code (Census ZCTA) for the place search, and the place each one maps to when one place holds at least 99 percent of its land. Built by scripts/build-zips.ts. See docs/PLACES_DATA.md.",
    sources: SOURCES,
    counts,
    checkedCounties: [...CHECKED_COUNTIES],
    rows,
  };
  writeFileSync(OUT, serialize(file));
  process.stdout.write(`${OUT}: ${JSON.stringify(counts)}\n`);
}

/**
 * The counties where some of the ZIP's land is in no place. A county's land in no place is its part
 * of the ZIP less the places that lie only in that county. A place in more than one county is not
 * taken off, so a county is listed whenever it might hold such land, and never left out.
 */
function unincorporatedCounties(index: ReturnType<typeof parsePlaceIndex>, counties: Part[], places: Part[], noPlace: number): string[] {
  if (noPlace === 0) return [];
  if (counties.length === 1) return [counties[0].id];
  return counties
    .filter((c) => {
      const inPlaces = places.filter((p) => {
        const entry = index.byId.get(`p-${p.id}`);
        return entry !== undefined && entry.counties.length === 1 && entry.counties[0] === c.id;
      });
      return c.land - inPlaces.reduce((sum, p) => sum + p.land, 0) > 0;
    })
    .map((c) => c.id);
}

/** Stops the build when a ZIP that the docs and tests name no longer maps the way they say. */
function checkSanDiego(rows: string[]): void {
  const row = (zip: string) => rows.find((r) => r.startsWith(`${zip}|`));
  if (row("92130") !== "92130|06073|0666000") throw new Error(`92130 should map to the City of San Diego alone, not ${row("92130")}`);
  if (!row("92067")?.startsWith("92067|06073||")) throw new Error(`92067 should be split across places, not ${row("92067")}`);
}

/** One row per line, so a rebuild's diff shows which ZIPs changed. */
function serialize(file: ZipIndexFile): string {
  const { rows, ...head } = file;
  const top = JSON.stringify(head, null, 1).replace(/\n}$/, "");
  return `${top},\n"rows": [\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n}\n`;
}

main();
