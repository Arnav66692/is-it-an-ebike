// Pilot check "invented facts": runs OCR and the parser on the 12 research photos and
// counts any class, watt or speed value reported. The photos never enter the repo, so the
// folder is passed in. Only file names and extracted values are written out.
//
// Usage: npx tsx scripts/pilot-ocr.ts <photo folder> <cache folder>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createWorker } from "tesseract.js";
import { hasLegalFacts, parseSpecText } from "../lib/extract/parse";

interface Row {
  file: string;
  product: string;
  has_pedals: string;
}

function readPhotoList(): Row[] {
  const lines = readFileSync(join(__dirname, "..", "pilot", "photos.csv"), "utf8").trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    const get = (name: string) => cells[header.indexOf(name)] ?? "";
    return { file: get("file"), product: get("product"), has_pedals: get("has_pedals") };
  });
}

async function main(): Promise<void> {
  const [photoDir, cacheDir] = process.argv.slice(2);
  if (!photoDir || !cacheDir) throw new Error("Usage: npx tsx scripts/pilot-ocr.ts <photo folder> <cache folder>");
  mkdirSync(cacheDir, { recursive: true });
  const worker = await createWorker("eng", 1, { cachePath: cacheDir });
  const rows = readPhotoList();
  const results = [];
  for (const row of rows) {
    const { data } = await worker.recognize(join(photoDir, row.file));
    const extraction = parseSpecText(data.text, "label");
    results.push({
      file: row.file,
      ocr_characters: data.text.trim().length,
      invented_values: hasLegalFacts(extraction),
      facts: extraction.facts,
    });
  }
  await worker.terminate();
  const invented = results.filter((r) => r.invented_values).length;
  const out = {
    check: "Invented facts: zero class, watt or speed values reported when no label is visible",
    tool: "tesseract.js 7.0.0 (eng) plus lib/extract/parse.ts in label mode",
    run_at: new Date().toISOString(),
    photos: results.length,
    photos_with_invented_values: invented,
    pass: invented === 0,
    results,
  };
  mkdirSync(join(__dirname, "..", "pilot", "results"), { recursive: true });
  writeFileSync(join(__dirname, "..", "pilot", "results", "photos-ocr.json"), JSON.stringify(out, null, 2) + "\n");
  process.stdout.write(`${invented} of ${results.length} photos produced a class, watt or speed value. Pass: ${invented === 0}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
