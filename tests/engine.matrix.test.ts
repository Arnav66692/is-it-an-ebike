// The hard gate. Every state, class, age band, caution condition and switch date,
// checked against an independent reading of the raw data in tests/oracle.ts.

import { describe, expect, it } from "vitest";
import { runMatrix } from "./matrix";

describe("generated test matrix", () => {
  const summary = runMatrix();

  it("covers every state and San Diego place", () => {
    expect(summary.stateCases).toBeGreaterThan(100_000);
    expect(summary.localCases).toBeGreaterThan(30_000);
  });

  it("has zero false-legal results (a yes where the table gives any reason for not yes)", () => {
    const sample = summary.falseLegal.slice(0, 5);
    expect(sample, JSON.stringify(sample, null, 1)).toEqual([]);
  });

  it("says yes whenever the table gives no reason against it, so it can't pass by refusing everything", () => {
    const sample = summary.missedYes.slice(0, 5);
    expect(sample, JSON.stringify(sample, null, 1)).toEqual([]);
  });
});
