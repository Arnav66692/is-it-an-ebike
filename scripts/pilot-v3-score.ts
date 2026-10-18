// Scores the single photo pilot v3 test run against the bars in PILOT.md. Applies the frozen rule in
// pilot/v3/method.json to the raw browser scores (pilot/v3/test-raw-v3.json), adds the OCR check
// (pilot/v3/test-ocr.json) and compares with the answer key (pilot/v3/test.csv). Writes
// pilot/v3/results.json. A photo with no score counts as wrong.
//
// Usage: npx tsx scripts/pilot-v3-score.ts [raw json] [key csv] [ocr json] [out json]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const HARD = new Set(["moto_styled", "fat_tire", "mtb"]);

interface KeyRow {
  file: string;
  product: string;
  style: string;
  setting: string;
  pedals: string;
}

function readCsv(path: string): KeyRow[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const split = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    return cells;
  };
  const header = split(lines[0]);
  return lines.slice(1).map((line) => {
    const c = split(line);
    const get = (name: string) => (c[header.indexOf(name)] ?? "").trim();
    return { file: get("file"), product: get("product"), style: get("style"), setting: get("setting"), pedals: get("pedals") };
  });
}

interface Method {
  threshold: number;
  rule: {
    pedal_queries: string[];
    peg_queries: string[];
    whole_object_plus: string[];
    whole_object_minus: string[];
    whole_object_weight: number;
  };
}

interface RawPhoto {
  file: string;
  ms: number;
  q: Record<string, { logit: number }>;
}

function ruleScore(photo: RawPhoto, method: Method): number {
  const best = (queries: string[]): number =>
    Math.max(
      ...queries.map((q) => {
        const v = photo.q[q];
        if (!v) throw new Error(`No score for query "${q}" on ${photo.file}`);
        return v.logit;
      }),
    );
  const { rule } = method;
  const pegs = rule.peg_queries.length > 0 ? best(rule.peg_queries) : 0;
  return best(rule.pedal_queries) - pegs + rule.whole_object_weight * (best(rule.whole_object_plus) - best(rule.whole_object_minus));
}

function main(): void {
  const v3 = join(root, "pilot", "v3");
  const [rawPath = join(v3, "test-raw-v3.json"), keyPath = join(v3, "test.csv"), ocrPath = join(v3, "test-ocr.json"), outPath = join(v3, "results.json")] = process.argv.slice(2);
  const method = JSON.parse(readFileSync(join(v3, "method.json"), "utf8")) as Method;
  const raw = JSON.parse(readFileSync(rawPath, "utf8")) as { photos?: RawPhoto[]; error?: string };
  const ocr = JSON.parse(readFileSync(ocrPath, "utf8")) as { photos_with_invented_values: number; photos: number };
  const key = readCsv(keyPath);
  const byFile = new Map((raw.photos ?? []).map((p) => [p.file.split("/").pop() ?? p.file, p]));
  const rows = key.map((k) => {
    const p = byFile.get(k.file);
    const base = { file: k.file, product: k.product, style: k.style, setting: k.setting, pedals: k.pedals };
    if (!p) return { ...base, score: null, call: "no result", right: false, ms: null };
    const score = ruleScore(p, method);
    const call = score >= method.threshold ? "pedals" : "no pedals";
    return { ...base, score, call, right: (call === "pedals") === (k.pedals === "yes"), ms: p.ms };
  });
  const count = (f: (r: (typeof rows)[number]) => boolean) => {
    const sel = rows.filter(f);
    return { right: sel.filter((r) => r.right).length, of: sel.length };
  };
  const noPedal = count((r) => r.pedals === "no");
  const all = count(() => true);
  const times = rows.flatMap((r) => (r.ms === null ? [] : [r.ms]));
  const out = {
    scored_at: new Date().toISOString(),
    method: "pedal-sorter-v3 (pilot/v3/method.json)",
    threshold: method.threshold,
    raw_error: raw.error ?? null,
    bars: {
      no_pedal_machines: { bar: "All 12 called no pedals", result: `${noPedal.right} of ${noPedal.of}`, pass: noPedal.right === noPedal.of && noPedal.of === 12 },
      pedal_call_overall: { bar: "Right on at least 22 of 24", result: `${all.right} of ${all.of}`, pass: all.right >= 22 && all.of === 24 },
      invented_facts: { bar: "Zero class, watt or speed values with no label visible", result: `${ocr.photos_with_invented_values} of ${ocr.photos} photos`, pass: ocr.photos_with_invented_values === 0 },
    },
    breakdown: {
      pedal_bikes: count((r) => r.pedals === "yes"),
      hard_cases: count((r) => r.pedals === "yes" && HARD.has(r.style)),
      real_world: count((r) => r.setting === "real_world"),
      studio: count((r) => r.setting === "studio"),
      no_result: rows.filter((r) => r.call === "no result").length,
      mean_ms: times.length > 0 ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null,
    },
    rows,
  };
  const pass = Object.values(out.bars).every((b) => b.pass);
  writeFileSync(outPath, JSON.stringify({ pass, ...out }, null, 2) + "\n");
  process.stdout.write(`${JSON.stringify({ pass, bars: out.bars, breakdown: out.breakdown }, null, 2)}\n`);
}

main();
