// Pilot label check (Sunday bike shop photos). Reads the answer key pilot/labels.csv
// (file, printed_class), runs OCR and the parser on each photo, and scores the bar:
// class read correctly or "can't confirm" on every photo, never a wrong class.
// The photos stay outside the repo, so the folder is passed in.
//
// Usage: npx tsx scripts/pilot-labels.ts <photo folder> <cache folder>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWorker } from "tesseract.js";
import { parseSpecText } from "../lib/extract/parse";

interface Row {
  file: string;
  printed_class: string;
}

function readKey(path: string): Row[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    return { file: cells[header.indexOf("file")] ?? "", printed_class: cells[header.indexOf("printed_class")] ?? "" };
  });
}

async function main(): Promise<void> {
  const [photoDir, cacheDir] = process.argv.slice(2);
  if (!photoDir || !cacheDir) throw new Error("Usage: npx tsx scripts/pilot-labels.ts <photo folder> <cache folder>");
  const rows = readKey(join(__dirname, "..", "pilot", "labels.csv"));
  if (rows.length === 0) throw new Error("pilot/labels.csv has no rows. Write the printed class for each photo first.");
  mkdirSync(cacheDir, { recursive: true });
  const worker = await createWorker("eng", 1, { cachePath: cacheDir });
  const results = [];
  for (const row of rows) {
    const { data } = await worker.recognize(join(photoDir, row.file));
    const e = parseSpecText(data.text, "label");
    const read = (e.facts.classes ?? []).join("|");
    const truth = row.printed_class.replace(/\s/g, "");
    const outcome = read === "" ? "cant_confirm" : read === truth ? "right" : "wrong";
    results.push({ file: row.file, printed_class: truth, read_class: read || null, watts: e.facts.ratedWatts ?? null, assist_mph: e.facts.assistMph ?? null, outcome });
  }
  await worker.terminate();
  const wrong = results.filter((r) => r.outcome === "wrong").length;
  const right = results.filter((r) => r.outcome === "right").length;
  const out = {
    check: "Label reading: class read correctly or can't confirm on every photo, never a wrong class",
    tool: "tesseract.js 7.0.0 (eng) plus lib/extract/parse.ts in label mode",
    run_at: new Date().toISOString(),
    photos: results.length,
    right,
    cant_confirm: results.length - right - wrong,
    wrong,
    pass: wrong === 0,
    results,
  };
  writeFileSync(join(__dirname, "..", "pilot", "results", "labels.json"), JSON.stringify(out, null, 2) + "\n");
  process.stdout.write(`${right} right, ${out.cant_confirm} can't confirm, ${wrong} wrong of ${results.length}. Pass: ${wrong === 0}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
