// Scores the single photo pilot v2 test run against the bars in PILOT.md. Reads the raw
// browser results (pilot/v2/test-results.json), the OCR results (pilot/v2/test-ocr.json) and
// the answer key (pilot/v2/test.csv). Writes pilot/v2/results.json.
//
// Usage: npx tsx scripts/pilot-v2-score.ts

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

interface RunRow {
  photo: string;
  score: number;
  call: "pedals" | "no pedals";
  ms: number;
}

function main(): void {
  const key = readCsv(join(root, "pilot", "v2", "test.csv"));
  const run = JSON.parse(readFileSync(join(root, "pilot", "v2", "test-results.json"), "utf8")) as { rows: RunRow[]; threshold: number };
  const ocr = JSON.parse(readFileSync(join(root, "pilot", "v2", "test-ocr.json"), "utf8")) as { photos_with_invented_values: number; photos: number };
  const byFile = new Map(run.rows.map((r) => [r.photo.split("/").pop() ?? r.photo, r]));
  const rows = key.map((k) => {
    const r = byFile.get(k.file);
    if (!r) throw new Error(`No run result for ${k.file}`);
    const truth = k.pedals === "yes";
    const right = (r.call === "pedals") === truth;
    return { file: k.file, product: k.product, style: k.style, setting: k.setting, pedals: k.pedals, score: r.score, call: r.call, right };
  });
  const count = (f: (r: (typeof rows)[number]) => boolean) => {
    const sel = rows.filter(f);
    return { right: sel.filter((r) => r.right).length, of: sel.length };
  };
  const noPedal = count((r) => r.pedals === "no");
  const all = count(() => true);
  const out = {
    scored_at: new Date().toISOString(),
    method: "pedal-sorter-v2 (pilot/v2/method.json)",
    threshold: run.threshold,
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
    },
    rows,
  };
  const pass = Object.values(out.bars).every((b) => b.pass);
  writeFileSync(join(root, "pilot", "v2", "results.json"), JSON.stringify({ pass, ...out }, null, 2) + "\n");
  process.stdout.write(`${JSON.stringify({ pass, bars: out.bars, breakdown: out.breakdown }, null, 2)}\n`);
}

main();
