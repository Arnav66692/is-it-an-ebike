// A small reader for Census cartographic boundary shapefiles, read straight from the .zip, and a
// point-in-polygon test. The place index uses it to find the county of a place the population
// table doesn't place, and to find San Diego County communities that sit on tribal land.

import { readZipEntry } from "./census";

const SHP_HEADER = 100;
const POLYGON = 5;
const NULL_SHAPE = 0;
const DBF_FIELD_SIZE = 32;
const DBF_HEADER_END = 0x0d;

export interface ShapeFeature {
  /** The .dbf attributes, trimmed. */
  props: Record<string, string>;
  /** Rings of [lon, lat] points. Outer rings and holes alike, so the even-odd rule decides. */
  rings: [number, number][][];
  bbox: [number, number, number, number];
}

/** Reads `<base>.shp` and `<base>.dbf` from a cartographic boundary .zip. */
export function readShapefile(zip: Buffer, base: string): ShapeFeature[] {
  const shp = readZipEntry(zip, `${base}.shp`);
  const props = readDbf(readZipEntry(zip, `${base}.dbf`));
  const shapes = readPolygons(shp);
  if (shapes.length !== props.length) throw new Error(`${base}: ${shapes.length} shapes but ${props.length} records`);
  return shapes.map((s, i) => ({ ...s, props: props[i] }));
}

function readPolygons(shp: Buffer): Omit<ShapeFeature, "props">[] {
  const out: Omit<ShapeFeature, "props">[] = [];
  let offset = SHP_HEADER;
  while (offset < shp.length) {
    // Record header: number and length in 16-bit words, both big-endian.
    const words = shp.readInt32BE(offset + 4);
    const content = offset + 8;
    const type = shp.readInt32LE(content);
    if (type === NULL_SHAPE) {
      out.push({ rings: [], bbox: [0, 0, 0, 0] });
    } else if (type === POLYGON) {
      const bbox: [number, number, number, number] = [
        shp.readDoubleLE(content + 4),
        shp.readDoubleLE(content + 12),
        shp.readDoubleLE(content + 20),
        shp.readDoubleLE(content + 28),
      ];
      const numParts = shp.readInt32LE(content + 36);
      const numPoints = shp.readInt32LE(content + 40);
      const partsAt = content + 44;
      const pointsAt = partsAt + numParts * 4;
      const starts = Array.from({ length: numParts }, (_, i) => shp.readInt32LE(partsAt + i * 4));
      const rings = starts.map((start, i) => {
        const end = i + 1 < numParts ? starts[i + 1] : numPoints;
        const ring: [number, number][] = [];
        for (let p = start; p < end; p++) ring.push([shp.readDoubleLE(pointsAt + p * 16), shp.readDoubleLE(pointsAt + p * 16 + 8)]);
        return ring;
      });
      out.push({ rings, bbox });
    } else {
      throw new Error(`Shape type ${type} is not a polygon`);
    }
    offset = content + words * 2;
  }
  return out;
}

function readDbf(dbf: Buffer): Record<string, string>[] {
  const count = dbf.readUInt32LE(4);
  const headerLength = dbf.readUInt16LE(8);
  const recordLength = dbf.readUInt16LE(10);
  const fields: { name: string; length: number }[] = [];
  for (let at = DBF_FIELD_SIZE; dbf[at] !== DBF_HEADER_END; at += DBF_FIELD_SIZE) {
    const name = dbf.toString("latin1", at, at + 11).replace(/\0.*$/, "");
    fields.push({ name, length: dbf[at + 16] });
  }
  const rows: Record<string, string>[] = [];
  for (let r = 0; r < count; r++) {
    let at = headerLength + r * recordLength + 1;
    const row: Record<string, string> = {};
    for (const f of fields) {
      row[f.name] = dbf.toString("utf8", at, at + f.length).trim();
      at += f.length;
    }
    rows.push(row);
  }
  return rows;
}

/** True when the point is inside the feature, by the even-odd rule over all its rings. */
export function containsPoint(feature: ShapeFeature, lon: number, lat: number): boolean {
  const [minX, minY, maxX, maxY] = feature.bbox;
  if (lon < minX || lon > maxX || lat < minY || lat > maxY) return false;
  let inside = false;
  for (const ring of feature.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** The features that contain the point. */
export function featuresAt(features: ShapeFeature[], lon: number, lat: number): ShapeFeature[] {
  return features.filter((f) => containsPoint(f, lon, lat));
}
