// Pilot listing checks. Reads Arnav's hand-written answer key in pilot/listings.csv, fetches
// each listing, runs the parser and the engine, and scores the three listing bars in PILOT.md.
// Fetched text is cached in .cache/listings/ (not committed) so a rerun gives the same input.
//
// Usage: npx tsx scripts/pilot-listings.ts

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchListing } from "../lib/extract/fetchListing";
import { factsFromExtraction } from "../lib/extract/merge";
import { parseSpecText, type Extraction } from "../lib/extract/parse";
import { evaluate } from "../lib/rules";
import { emptyFacts, type ClassNum } from "../lib/rules/types";

const root = join(__dirname, "..");
const cacheDir = join(root, ".cache", "listings");
const PILOT_DATE = "2026-10-17";

interface KeyRow {
  url: string;
  product: string;
  has_pedals: string;
  states_class: string;
  exceeds_class: string;
  notes: string;
}

function parseCsv(path: string): KeyRow[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const split = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        cells.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  const header = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const get = (name: string) => cells[header.indexOf(name)] ?? "";
    return {
      url: get("url"),
      product: get("product"),
      has_pedals: get("has_pedals").toLowerCase(),
      states_class: get("states_class"),
      exceeds_class: get("exceeds_class").toLowerCase(),
      notes: get("notes"),
    };
  });
}

async function listingText(url: string): Promise<string | null> {
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, `${createHash("sha256").update(url).digest("hex").slice(0, 16)}.txt`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  try {
    const listing = await fetchListing(url);
    writeFileSync(file, listing.text);
    return listing.text;
  } catch {
    return null;
  }
}

/** Every evidence snippet must be in the text, and every number we report must be in its snippet. */
function grounded(e: Extraction): boolean {
  for (const list of Object.values(e.evidence)) {
    for (const ev of list ?? []) if (!e.text.includes(ev.text)) return false;
  }
  const checks: [number | null | undefined, string][] = [
    [e.facts.ratedWatts, "ratedWatts"],
    [e.facts.peakWatts, "peakWatts"],
    [e.facts.wattsUpTo, "wattsUpTo"],
    [e.facts.throttleMph, "throttleMph"],
    [e.facts.assistMph, "assistMph"],
    [e.facts.topSpeedMph, "topSpeedMph"],
  ];
  for (const [value, key] of checks) {
    if (value === undefined || value === null) continue;
    const evs = e.evidence[key as keyof Extraction["evidence"]] ?? [];
    const digits = (s: string) => s.replace(/,/g, "");
    const plain = String(value);
    const kilo = value >= 1000 && value % 100 === 0 ? String(value / 1000) : null;
    const found = evs.some((ev) => digits(ev.text).includes(plain) || (kilo !== null && ev.text.includes(kilo)) || /km/i.test(ev.text));
    if (!found) return false;
  }
  return true;
}

async function main(): Promise<void> {
  const rows = parseCsv(join(root, "pilot", "listings.csv"));
  if (rows.length === 0) throw new Error("pilot/listings.csv has no rows yet. Fill in the audit first.");
  const results = [];
  for (const row of rows) {
    const text = await listingText(row.url);
    if (text === null) {
      results.push({ url: row.url, product: row.product, fetched: false });
      continue;
    }
    const e = parseSpecText(text, "listing");
    // A user confirms the "what I read" card. This run assumes a trusting user: pedals answered
    // truthfully from the key, and "no" to fast modes unless the listing itself says otherwise.
    const facts = {
      ...factsFromExtraction(e, emptyFacts()),
      hasPedals: e.facts.hasPedals ?? (row.has_pedals === "yes" ? true : row.has_pedals === "no" ? false : null),
      motorOver20: false,
      assistOver28: false,
    };
    const verdict = evaluate({ state: "CA", riderAge: 30, rideDate: PILOT_DATE, facts, places: [] }).state;
    const keyClasses = row.states_class
      .split(/[|/ ]+/)
      .map(Number)
      .filter((n): n is ClassNum => n === 1 || n === 2 || n === 3)
      .sort();
    const read = (e.facts.classes ?? []).slice().sort();
    const classOutcome =
      keyClasses.length === 0
        ? "not_stated"
        : read.length === 0
          ? "missed"
          : JSON.stringify(read) === JSON.stringify(keyClasses)
            ? "right"
            : "wrong";
    results.push({
      url: row.url,
      product: row.product,
      fetched: true,
      key: { has_pedals: row.has_pedals, states_class: row.states_class, exceeds_class: row.exceeds_class },
      read: e.facts,
      flags: e.flags,
      verdict: verdict.status,
      reason: verdict.reason.code,
      false_legal: row.exceeds_class === "yes" && verdict.status === "yes",
      grounded: grounded(e),
      class_outcome: classOutcome,
    });
  }
  const fetched = results.filter((r) => r.fetched);
  const falseLegal = fetched.filter((r) => "false_legal" in r && r.false_legal).length;
  const ungrounded = fetched.filter((r) => "grounded" in r && !r.grounded).length;
  const stated = fetched.filter((r) => "class_outcome" in r && r.class_outcome !== "not_stated");
  const misses = stated.filter((r) => "class_outcome" in r && r.class_outcome === "missed").length;
  const wrong = stated.filter((r) => "class_outcome" in r && r.class_outcome === "wrong").length;
  const out = {
    run_at: new Date().toISOString(),
    pilot_date: PILOT_DATE,
    assumptions: "California, adult rider, pedals answered from the key when the text doesn't say, fast-mode questions answered no.",
    listings: rows.length,
    fetched: fetched.length,
    bars: {
      false_legal: { bar: "Zero yes for listings whose stated specs exceed a class", result: `${falseLegal}`, pass: falseLegal === 0 },
      grounding: { bar: "Every extracted value appears in the listing text", result: `${fetched.length - ungrounded} of ${fetched.length}`, pass: ungrounded === 0 },
      usefulness: {
        bar: "Stated class comes back for all but at most one, and any miss is can't confirm, never a wrong class",
        result: `${stated.length - misses - wrong} of ${stated.length} right, ${misses} missed, ${wrong} wrong`,
        pass: wrong === 0 && misses <= 1,
      },
    },
    results,
  };
  mkdirSync(join(root, "pilot", "results"), { recursive: true });
  writeFileSync(join(root, "pilot", "results", "listings.json"), JSON.stringify(out, null, 2) + "\n");
  process.stdout.write(`${JSON.stringify(out.bars, null, 2)}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
