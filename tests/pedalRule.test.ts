// The app's pedal rule must match the frozen photo pilot v3 method exactly, and the photo check may only
// ever fill the pedals fact. The risky mistake is calling a no-pedal machine "pedals", because pedals are
// the one fact every legal answer needs, so that direction is checked on every dev and test photo.

import { describe, expect, it } from "vitest";
import devRaw from "@/pilot/v3/dev-raw-v3.json";
import devTune from "@/pilot/v3/dev-tune-v3.json";
import testRaw from "@/pilot/v3/test-raw-v3.json";
import testResults from "@/pilot/v3/results.json";
import { CLOSE_CALL_MARGIN, PEDAL_QUERIES, PEDAL_THRESHOLD, applyPedalCall, pedalCall, pedalScore, type BestLogits } from "@/lib/photo/pedalRule";
import { emptyFacts } from "@/lib/rules/types";

interface RawPhoto {
  file: string;
  q: Record<string, { logit: number }>;
}

const bestLogits = (p: RawPhoto): BestLogits => Object.fromEntries(Object.entries(p.q).map(([q, v]) => [q, v.logit]));
const name = (file: string) => file.split("/").pop() ?? file;
const testPhotos = new Map((testRaw.photos as RawPhoto[]).map((p) => [name(p.file), p]));
const devPhotos = new Map((devRaw.photos as RawPhoto[]).map((p) => [name(p.file), p]));

describe("pedal rule matches the frozen v3 method", () => {
  it("uses the same 20 queries as the dev and test runs", () => {
    expect(PEDAL_QUERIES).toEqual(testRaw.queries);
    expect(PEDAL_QUERIES).toEqual(devRaw.queries);
  });

  it("reproduces every scored call from the single test run", () => {
    expect(testResults.rows).toHaveLength(24);
    for (const row of testResults.rows) {
      const photo = testPhotos.get(row.file);
      if (!photo || row.score === null) throw new Error(`No test score for ${row.file}`);
      const score = pedalScore(bestLogits(photo));
      expect(score).toBeCloseTo(row.score, 9);
      expect(score >= PEDAL_THRESHOLD ? "pedals" : "no pedals").toBe(row.call);
    }
  });

  it("reproduces every dev call from the tuning run", () => {
    expect(devTune.per_photo).toHaveLength(71);
    for (const row of devTune.per_photo) {
      const photo = devPhotos.get(row.file);
      if (!photo) throw new Error(`No dev score for ${row.file}`);
      const score = pedalScore(bestLogits(photo));
      expect(score).toBeCloseTo(row.score, 3);
      expect(score >= PEDAL_THRESHOLD ? "pedals" : "no pedals").toBe(row.call);
    }
  });
});

describe("close calls ask instead of filling the fact", () => {
  it("asks inside the margin, including right at the line", () => {
    expect(pedalCall(PEDAL_THRESHOLD)).toBe("ask");
    expect(pedalCall(PEDAL_THRESHOLD + CLOSE_CALL_MARGIN - 0.01)).toBe("ask");
    expect(pedalCall(PEDAL_THRESHOLD - CLOSE_CALL_MARGIN + 0.01)).toBe("ask");
  });

  it("gives a clear call at or past the margin", () => {
    expect(pedalCall(PEDAL_THRESHOLD + CLOSE_CALL_MARGIN)).toBe("pedals");
    expect(pedalCall(PEDAL_THRESHOLD - CLOSE_CALL_MARGIN)).toBe("no_pedals");
    expect(pedalCall(3)).toBe("pedals");
    expect(pedalCall(-3)).toBe("no_pedals");
  });

  it("never fills 'pedals' for a no-pedal machine in the dev or test photos", () => {
    const noPedalScores = [
      ...testResults.rows.filter((r) => r.pedals === "no").map((r) => pedalScore(bestLogits(testPhotos.get(r.file) as RawPhoto))),
      ...devTune.per_photo.filter((r) => r.pedals === "no").map((r) => pedalScore(bestLogits(devPhotos.get(r.file) as RawPhoto))),
    ];
    expect(noPedalScores).toHaveLength(43);
    for (const s of noPedalScores) expect(pedalCall(s)).not.toBe("pedals");
  });
});

describe("the photo check only fills the pedals fact", () => {
  const base = { ...emptyFacts(), classes: [1 as const], ratedWatts: 500, hasThrottle: false };

  it("sets pedals on a clear call and leaves every other fact alone", () => {
    expect(applyPedalCall(base, "pedals")).toEqual({ ...base, hasPedals: true });
    expect(applyPedalCall(base, "no_pedals")).toEqual({ ...base, hasPedals: false });
  });

  it("changes nothing on a close call", () => {
    expect(applyPedalCall(base, "ask")).toBe(base);
    expect(applyPedalCall({ ...base, hasPedals: true }, "ask").hasPedals).toBe(true);
  });
});
