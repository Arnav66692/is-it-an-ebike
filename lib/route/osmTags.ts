// The posted-sign side of the legal route check. The router tells us which OpenStreetMap ways the
// route runs on, but not the tags that carry a posted rule, like bicycle=no or electric_bicycle=no.
// QLever, a public SPARQL engine loaded with all of OpenStreetMap, answers for a list of ways in
// one request. The pipeline in plan.ts does the asking, and a failure there never fails the route.
// This file only writes the question and reads the answer.

import type { PostedTags } from "./types";

export const QLEVER_URL = "https://qlever.dev/api/osm-planet";

/** One route touches a few hundred ways. This keeps a strange answer from sending a huge question. */
export const MAX_TAG_WAYS = 5000;

/** The tags we read, which are the only ones the rules need. */
const KEYS = ["bicycle", "electric_bicycle", "access", "highway", "footway", "is_sidepath"] as const;

type Key = (typeof KEYS)[number];

/**
 * The SPARQL question for the tags on some ways. Each tag is OPTIONAL, so a way that lacks a tag
 * still comes back, and the way ids are digits only, so nothing but numbers reaches the query.
 */
export function tagsQuery(wayIds: readonly number[]): string {
  const ids = [...new Set(wayIds)].filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, MAX_TAG_WAYS);
  const lines = [
    "PREFIX osmway: <https://www.openstreetmap.org/way/>",
    "PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>",
    `SELECT ?way ${KEYS.map((k) => `?${k}`).join(" ")} WHERE {`,
    `  VALUES ?way { ${ids.map((id) => `osmway:${id}`).join(" ")} }`,
    ...KEYS.map((k) => `  OPTIONAL { ?way osmkey:${k} ?${k} }`),
    "}",
  ];
  return lines.join("\n");
}

/** The form body for the question. QLever takes it as the field "query". */
export function tagsBody(wayIds: readonly number[]): string {
  return new URLSearchParams({ query: tagsQuery(wayIds) }).toString();
}

/** A cell without its quotes, language tag or datatype. An IRI keeps its angle brackets. */
function cellText(cell: string): string {
  const text = cell.trim();
  if (!text.startsWith('"')) return text;
  const end = text.lastIndexOf('"');
  return end > 0 ? text.slice(1, end) : text.slice(1);
}

/** The way id in a cell like <https://www.openstreetmap.org/way/123>, or null. */
function wayIdOf(cell: string): number | null {
  const match = /(?:\/way\/|osmway:)(\d+)>?$/.exec(cell.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** OpenStreetMap values are lower case words, so a stray capital or space shouldn't hide a posted rule. */
function value(row: ReadonlyMap<Key, string>, key: Key): string | undefined {
  const text = row.get(key)?.trim().toLowerCase();
  return text ? text : undefined;
}

function tagsOfRow(row: ReadonlyMap<Key, string>): PostedTags {
  const bicycle = value(row, "bicycle");
  const electricBicycle = value(row, "electric_bicycle");
  const access = value(row, "access");
  const highway = value(row, "highway");
  const footway = value(row, "footway");
  const sidepath = value(row, "is_sidepath") === "yes" || footway === "sidewalk";
  return {
    ...(bicycle ? { bicycle } : {}),
    ...(electricBicycle ? { electricBicycle } : {}),
    ...(access ? { access } : {}),
    ...(highway ? { highway } : {}),
    ...(footway ? { footway } : {}),
    ...(sidepath ? { sidepath: true } : {}),
  };
}

/** Two rows for one way mean a tag with two values. The first one found stays, and any sign of a sidepath is kept. */
function merged(first: PostedTags, next: PostedTags): PostedTags {
  const sidepath = first.sidepath === true || next.sidepath === true;
  return { ...next, ...first, ...(sidepath ? { sidepath: true } : {}) };
}

/**
 * Reads QLever's tab-separated answer into tags by way id. The first line names the columns, like
 * "?way", and an unset tag is an empty cell. Returns null when the text is not that table, such
 * as an error page, so the caller can tell "no tags" from "no answer".
 */
export function parseTagsTsv(tsv: string): Map<number, PostedTags> | null {
  const lines = tsv.split(/\r?\n/);
  const header = lines[0]?.split("\t").map((name) => name.trim().replace(/^\?/, ""));
  if (!header || header[0] !== "way") return null;
  const tags = new Map<number, PostedTags>();
  for (const line of lines.slice(1)) {
    if (line.trim() === "") continue;
    const cells = line.split("\t");
    const id = wayIdOf(cells[0] ?? "");
    if (id === null) continue;
    const row = new Map<Key, string>();
    for (const key of KEYS) {
      const at = header.indexOf(key);
      if (at > 0 && cells[at] !== undefined) row.set(key, cellText(cells[at]));
    }
    const found = tagsOfRow(row);
    const earlier = tags.get(id);
    tags.set(id, earlier ? merged(earlier, found) : found);
  }
  return tags;
}
