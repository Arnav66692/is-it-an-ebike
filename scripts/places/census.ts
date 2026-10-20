// Readers for the Census files the place index is built from. They read the .zip files in place,
// so nothing is unzipped to disk, and they need no packages beyond Node itself.

import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;

/** The names of the files inside a .zip archive. */
export function zipEntries(zip: Buffer): string[] {
  return centralDirectory(zip).map((e) => e.name);
}

/** One file from a .zip archive, inflated. Throws when the file is missing or damaged. */
export function readZipEntry(zip: Buffer, name: string): Buffer {
  const entry = centralDirectory(zip).find((e) => e.name === name);
  if (!entry) throw new Error(`${name} is not in the archive`);
  if (zip.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE) throw new Error(`${name} has a damaged local header`);
  const nameLength = zip.readUInt16LE(entry.localOffset + 26);
  const extraLength = zip.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const data = zip.subarray(start, start + entry.compressedSize);
  let out: Buffer;
  if (entry.method === STORED) out = Buffer.from(data);
  else if (entry.method === DEFLATED) out = inflateRawSync(data);
  else throw new Error(`${name} uses zip method ${entry.method}, which this reader does not handle`);
  if (out.length !== entry.size) throw new Error(`${name} inflated to ${out.length} bytes, expected ${entry.size}`);
  return out;
}

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

function centralDirectory(zip: Buffer): CentralEntry[] {
  let eocd = -1;
  const stop = Math.max(0, zip.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let i = zip.length - EOCD_MIN_SIZE; i >= stop; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive");
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries: CentralEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error("Damaged zip directory");
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    entries.push({
      method: zip.readUInt16LE(offset + 10),
      compressedSize: zip.readUInt32LE(offset + 20),
      size: zip.readUInt32LE(offset + 24),
      localOffset: zip.readUInt32LE(offset + 42),
      name: zip.toString("utf8", offset + 46, offset + 46 + nameLength),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * A pipe- or tab-separated Census text file as rows keyed by its header. Gazetteer files pad
 * the last column with spaces, so every value is trimmed.
 */
export function readTable(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes("|") ? "|" : "\t";
  const header = lines[0].split(delimiter).map((h) => h.trim());
  return lines.slice(1).map((line, i) => {
    const cells = line.split(delimiter).map((c) => c.trim());
    if (cells.length !== header.length) throw new Error(`Row ${i + 2} has ${cells.length} columns, the header has ${header.length}`);
    const row: Record<string, string> = {};
    header.forEach((h, k) => (row[h] = cells[k]));
    return row;
  });
}

/** Total population by geography, from an ACS table-based summary file for table B01003. */
export interface AcsPopulation {
  /** Summary level 050, keyed by the 5-digit county GEOID. */
  county: Map<string, number>;
  /** Summary level 060, keyed by the 10-digit county subdivision GEOID. */
  cousub: Map<string, number>;
  /** Summary level 160, keyed by the 7-digit place GEOID. */
  place: Map<string, number>;
  /** Summary level 155, the part of each place in each county, keyed by the place GEOID. */
  placeCounty: Map<string, { county: string; population: number }[]>;
  /** Summary level 040, keyed by the 2-digit state FIPS code. */
  state: Map<string, number>;
}

/** GEO_ID values look like "1600000US0611194": a 3-digit summary level, "0000US", then the GEOID. */
const GEO_PREFIX_LENGTH = 9;

export function readAcsPopulation(text: string): AcsPopulation {
  const out: AcsPopulation = { county: new Map(), cousub: new Map(), place: new Map(), placeCounty: new Map(), state: new Map() };
  for (const row of readTable(text)) {
    const geo = row.GEO_ID;
    const estimate = Number(row.B01003_E001);
    if (!geo || !Number.isFinite(estimate)) throw new Error(`Bad ACS row ${JSON.stringify(row)}`);
    if (geo.slice(3, GEO_PREFIX_LENGTH) !== "0000US") continue;
    const level = geo.slice(0, 3);
    const id = geo.slice(GEO_PREFIX_LENGTH);
    if (level === "040") out.state.set(id, estimate);
    else if (level === "050") out.county.set(id, estimate);
    else if (level === "060") out.cousub.set(id, estimate);
    else if (level === "160") out.place.set(id, estimate);
    else if (level === "155") {
      // State (2) + place (5) + county (3).
      const place = id.slice(0, 7);
      const county = id.slice(0, 2) + id.slice(7);
      const parts = out.placeCounty.get(place) ?? [];
      out.placeCounty.set(place, [...parts, { county, population: estimate }]);
    }
  }
  return out;
}
