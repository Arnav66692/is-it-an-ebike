// Photo pilot v2, invented-facts check. Runs OCR and the label parser on every photo listed in a
// CSV (column "file") and counts photos that produce any class, watt or speed value.
// Same tools as v1 (scripts/pilot-ocr.ts). Photos stay outside the repo.
//
// Usage: npx tsx scripts/pilot-v2-ocr.ts <csv> <photo folder> <cache folder> <output json>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWorker } from "tesseract.js";
import { hasLegalFacts, parseSpecText } from "../lib/extract/parse";

async function main(): Promise<void> {
  const [csv, photoDir, cacheDir, outPath] = process.argv.slice(2);
  if (!csv || !photoDir || !cacheDir || !outPath) throw new Error("Usage: npx tsx scripts/pilot-v2-ocr.ts <csv> <photo folder> <cache folder> <output json>");
  const lines = readFileSync(csv, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const fileCol = lines[0].split(",").indexOf("file");
  const files = lines.slice(1).map((l) => l.split(",")[fileCol]);
  mkdirSync(cacheDir, { recursive: true });
  const worker = await createWorker("eng", 1, { cachePath: cacheDir });
  const results = [];
  for (const file of files) {
    const { data } = await worker.recognize(join(photoDir, file));
    const e = parseSpecText(data.text, "label");
    results.push({ file, ocr_characters: data.text.trim().length, invented_values: hasLegalFacts(e), facts: e.facts });
  }
  await worker.terminate();
  const invented = results.filter((r) => r.invented_values).length;
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        check: "Invented facts: zero class, watt or speed values reported when no label is visible",
        tool: "tesseract.js 7.0.0 (eng) plus lib/extract/parse.ts in label mode",
        run_at: new Date().toISOString(),
        photos: results.length,
        photos_with_invented_values: invented,
        pass: invented === 0,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(`${invented} of ${results.length} photos produced a class, watt or speed value.\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
