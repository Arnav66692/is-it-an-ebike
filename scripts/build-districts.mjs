// Builds public/places/us-districts.json, every operating US public school district for the
// "Where do they ride?" search. It reads the NCES files in place, from one folder, and needs
// nothing beyond Node. docs/PLACES_DATA.md lists the files and where to get them.
//
// Usage: node scripts/build-districts.mjs <folder with the NCES files> [--built YYYY-MM-DD] [--places <us-places.json>] [--out <file>]
//
// The folder holds the two files in SOURCES. Every county is checked against the app's place
// index, public/places/us-places.json unless --places names another. --out defaults to
// public/places/us-districts.json.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));

const DIRECTORY_ZIP = "ccd_lea_029_2526_w_0a_050626.zip";
const DIRECTORY_CSV = "ccd_lea_029_2526_w_0a_050626.csv";
const GEOCODE_ZIP = "EDGE_GEOCODE_PUBLICLEA_2425.zip";
const GEOCODE_DBF = "Shapefiles_LEA/EDGE_GEOCODE_PUBLICLEA_2425.dbf";

const SOURCES = [
  {
    name: "Common Core of Data, Local Education Agency Universe Survey, directory file",
    file: DIRECTORY_ZIP,
    url: `https://nces.ed.gov/ccd/data/zip/${DIRECTORY_ZIP}`,
    vintage: "School year 2025-26, preliminary version 0a, data as of May 6, 2026",
    use: "Every district, with its NCES ID, name, state, office city, type and status.",
  },
  {
    name: "EDGE public school district geocodes",
    file: GEOCODE_ZIP,
    url: `https://nces.ed.gov/programs/edge/data/${GEOCODE_ZIP}`,
    vintage: "School year 2024-25",
    use: "The county of each district office. Districts new in 2025-26 are not in it yet, so their county is blank.",
  },
];

/** Start of year statuses that mean a district operates. 1 Open, 3 New, 4 Added, 5 Changed boundary, 8 Reopened. */
const OPERATING = new Set(["1", "3", "4", "5", "8"]);

/** Bureau of Indian Education schools. They are kept, under the state each school is in. */
const BIE = "BI";

/**
 * SY_STATUS counts for all records in DIRECTORY_CSV, from Table 1.1 of the NCES release notes,
 * https://nces.ed.gov/ccd/doc/SY_2025-26_Preliminary_Data_Release_CCD_Nonfiscal_Release_Notes.docx
 * The build stops when the file no longer matches them.
 */
const PUBLISHED_STATUS = { 1: 19314, 2: 128, 3: 98, 4: 23, 5: 7, 6: 80, 7: 60, 8: 1 };
const PUBLISHED_TOTAL = 19711;

/** The one district with checked campus rules in the app. Every other district is shown as not checked. */
const CHECKED = [{ leaid: "0634380", name: "San Dieguito Union High", state: "CA", county: "06073" }];

/** The 50 states and DC, the jurisdictions the app's rules table covers. */
const STATES = new Set(
  "AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split(" "),
);

function args() {
  const [dir, ...rest] = process.argv.slice(2);
  if (!dir) throw new Error("Usage: node scripts/build-districts.mjs <folder with the NCES files> [--built YYYY-MM-DD] [--places <us-places.json>] [--out <file>]");
  const flag = (name) => {
    const at = rest.indexOf(name);
    return at >= 0 ? rest[at + 1] : undefined;
  };
  const built = flag("--built") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(built)) throw new Error(`--built must look like 2026-10-21, not ${built}`);
  const places = flag("--places") ?? join(HERE, "..", "public", "places", "us-places.json");
  return { dir, built, places, out: flag("--out") ?? join(HERE, "..", "public", "places", "us-districts.json") };
}

// ---------- zip ----------

function centralDirectory(zip) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive");
  const entries = [];
  let at = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < zip.readUInt16LE(eocd + 10); n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("Damaged zip directory");
    const nameLength = zip.readUInt16LE(at + 28);
    entries.push({
      name: zip.toString("utf8", at + 46, at + 46 + nameLength),
      method: zip.readUInt16LE(at + 10),
      compressedSize: zip.readUInt32LE(at + 20),
      size: zip.readUInt32LE(at + 24),
      localOffset: zip.readUInt32LE(at + 42),
    });
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return entries;
}

/** One file from a .zip archive, inflated in memory. */
function readZipEntry(zipPath, name) {
  const zip = readFileSync(zipPath);
  const entry = centralDirectory(zip).find((e) => e.name === name);
  if (!entry) throw new Error(`${name} is not in ${zipPath}`);
  const local = entry.localOffset;
  if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name} has a damaged local header`);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + entry.compressedSize);
  const out = entry.method === 0 ? Buffer.from(data) : entry.method === 8 ? inflateRawSync(data) : null;
  if (!out) throw new Error(`${name} uses zip method ${entry.method}, which this reader does not handle`);
  if (out.length !== entry.size) throw new Error(`${name} inflated to ${out.length} bytes, expected ${entry.size}`);
  return out;
}

// ---------- CSV and DBF ----------

/** Parses RFC 4180 CSV into objects keyed by the header row. */
function readCsv(text) {
  const records = [];
  let field = "";
  let record = [];
  let quoted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { record.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field); records.push(record); record = []; field = "";
    } else field += ch;
  }
  if (field !== "" || record.length > 0) { record.push(field); records.push(record); }
  const [head, ...rows] = records.filter((r) => r.length > 1 || r[0] !== "");
  return rows.map((r, n) => {
    if (r.length !== head.length) throw new Error(`CSV row ${n + 2} has ${r.length} fields, the header has ${head.length}`);
    return Object.fromEntries(head.map((h, i) => [h, r[i]]));
  });
}

/** Reads a dBase III table, skipping deleted records. Text is UTF-8, per the shapefile's .cpg. */
function readDbf(buf) {
  const count = buf.readUInt32LE(4);
  const headerLength = buf.readUInt16LE(8);
  const recordLength = buf.readUInt16LE(10);
  const fields = [];
  let offset = 1;
  for (let at = 32; buf[at] !== 0x0d; at += 32) {
    const name = buf.toString("latin1", at, at + 11).replace(/\0.*$/, "");
    fields.push({ name, offset, length: buf[at + 16] });
    offset += buf[at + 16];
  }
  if (offset !== recordLength) throw new Error(`DBF fields add up to ${offset} bytes, records are ${recordLength}`);
  const rows = [];
  for (let n = 0; n < count; n++) {
    const at = headerLength + n * recordLength;
    if (buf[at] === 0x2a) continue;
    rows.push(Object.fromEntries(fields.map((f) => [f.name, buf.toString("utf8", at + f.offset, at + f.offset + f.length).trim()])));
  }
  return rows;
}

// ---------- build ----------

/** Trims and collapses runs of spaces. Names and cities are otherwise kept as NCES publishes them. */
function clean(text, what) {
  const out = text.replace(/\s+/g, " ").trim();
  if (out === "") throw new Error(`${what} is blank`);
  return out;
}

function checkPublished(all) {
  const counts = {};
  for (const r of all) counts[r.SY_STATUS] = (counts[r.SY_STATUS] ?? 0) + 1;
  const same = all.length === PUBLISHED_TOTAL && Object.entries(PUBLISHED_STATUS).every(([k, v]) => counts[k] === v);
  if (!same) throw new Error(`${DIRECTORY_CSV} status counts ${JSON.stringify(counts)} of ${all.length} no longer match the NCES release notes`);
}

/** County FIPS and name for each LEAID, from the EDGE geocode table. */
function readCounties(dir) {
  const byLeaid = new Map();
  for (const g of readDbf(readZipEntry(join(dir, GEOCODE_ZIP), GEOCODE_DBF))) {
    if (!/^\d{7}$/.test(g.LEAID) || !/^\d{5}$/.test(g.CNTY)) throw new Error(`Geocode row ${g.LEAID} has county "${g.CNTY}"`);
    if (byLeaid.has(g.LEAID)) throw new Error(`Geocode lists ${g.LEAID} twice`);
    byLeaid.set(g.LEAID, { fips: g.CNTY, name: clean(g.NMCNTY, `County of ${g.LEAID}`) });
  }
  return byLeaid;
}

/** State FIPS for each postal code, from the directory file itself. */
function stateFips(all) {
  const map = new Map();
  for (const r of all) {
    const seen = map.get(r.ST);
    if (seen && seen !== r.FIPST) throw new Error(`${r.ST} has FIPS ${seen} and ${r.FIPST}`);
    map.set(r.ST, r.FIPST);
  }
  return map;
}

function buildRows(all, geocodes) {
  const fipsOf = stateFips(all);
  const rows = [];
  const counties = new Map();
  const tally = { not_operating: 0, outlying_areas_left_out: 0, bie_schools_kept: 0, no_county: 0, county_in_other_state: 0 };
  for (const r of all) {
    if (!OPERATING.has(r.SY_STATUS)) {
      tally.not_operating += 1;
      continue;
    }
    const state = r.ST === BIE ? r.LSTATE : r.ST;
    if (!STATES.has(state)) {
      tally.outlying_areas_left_out += 1;
      continue;
    }
    if (r.ST === BIE) tally.bie_schools_kept += 1;
    if (!/^\d{7}$/.test(r.LEAID)) throw new Error(`LEAID "${r.LEAID}" is not seven digits`);
    if (!/^[1-9]$/.test(r.LEA_TYPE)) throw new Error(`${r.LEAID} has LEA_TYPE "${r.LEA_TYPE}"`);
    const geocoded = geocodes.get(r.LEAID);
    // An office in another state, like a Vermont interstate district run from New Hampshire, gets no county.
    const outside = geocoded !== undefined && geocoded.fips.slice(0, 2) !== fipsOf.get(state);
    const county = outside ? undefined : geocoded;
    if (outside) tally.county_in_other_state += 1;
    if (county) counties.set(county.fips, county.name);
    else tally.no_county += 1;
    rows.push([r.LEAID, clean(r.LEA_NAME, `Name of ${r.LEAID}`), state, county?.fips ?? "", clean(r.LCITY, `City of ${r.LEAID}`), Number(r.LEA_TYPE)]);
  }
  rows.sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1], "en", { sensitivity: "base" }) || a[0].localeCompare(b[0]));
  return { rows, counties: [...counties.entries()].sort((a, b) => a[0].localeCompare(b[0])), tally };
}

function typeNames(all) {
  const types = {};
  for (const r of all) types[r.LEA_TYPE] = r.LEA_TYPE_TEXT;
  return Object.fromEntries(Object.entries(types).sort());
}

function checkChecked(rows) {
  for (const c of CHECKED) {
    const row = rows.find((r) => r[0] === c.leaid);
    if (!row || row[1] !== c.name || row[2] !== c.state || row[3] !== c.county) {
      throw new Error(`Checked district ${c.name} (${c.leaid}) is not in ${c.state}, county ${c.county}, in these files`);
    }
  }
}

/** Stops when a county is missing from the app's place index or has another name there. */
function checkPlaces(placesPath, counties) {
  const known = new Map(JSON.parse(readFileSync(placesPath, "utf8")).counties);
  for (const [fips, name] of counties) {
    if (known.get(fips) !== name) throw new Error(`County ${fips} "${name}" is "${known.get(fips)}" in ${placesPath}`);
  }
}

/** One row per line, so a rebuild's diff shows which districts changed. */
function serialize(file) {
  const { rows, counties, ...head } = file;
  const lines = (items) => items.map((x) => `  ${JSON.stringify(x)}`).join(",\n");
  return `${JSON.stringify(head, null, 1).replace(/\n}$/, "")},\n"counties": [\n${lines(counties)}\n],\n"rows": [\n${lines(rows)}\n]\n}\n`;
}

function main() {
  const { dir, built, places, out } = args();
  const all = readCsv(readZipEntry(join(dir, DIRECTORY_ZIP), DIRECTORY_CSV).toString("utf8"));
  checkPublished(all);
  const { rows, counties, tally } = buildRows(all, readCounties(dir));
  checkChecked(rows);
  if (places) checkPlaces(places, counties);
  const counts = { rows: rows.length, records_in_file: all.length, ...tally, counties_used: counties.length };
  for (const type of Object.keys(typeNames(all))) counts[`type_${type}`] = rows.filter((r) => String(r[5]) === type).length;
  const file = {
    format: 1,
    built,
    about:
      "Every operating US public school district in the 50 states and DC, for the district search. Built by scripts/build-districts.mjs from the NCES files in sources. A row is NCES LEAID, name, state, county FIPS, office city and NCES type. The county is where the district office was in the 2024-25 geocodes, and a district can reach into other counties. It is blank for a district new since then or with its office in another state. LEAIDs that start with 59 are Bureau of Indian Education schools, listed under the state they are in. Names and cities are as NCES publishes them, some in capitals.",
    schoolYear: "2025-26",
    sources: SOURCES,
    checked: CHECKED.map((c) => c.leaid),
    checkedNote: "Only San Dieguito Union High School District has checked campus rules. Every other district is shown as not checked.",
    columns: ["leaid", "name", "state", "county", "city", "type"],
    types: typeNames(all),
    counts,
    counties,
    rows,
  };
  writeFileSync(out, serialize(file));
  process.stdout.write(`${out}: ${rows.length} rows, ${JSON.stringify(counts)}\n`);
}

main();
