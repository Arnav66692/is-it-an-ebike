// The hard gate. Every state, class, age band, caution condition and switch date,
// checked against an independent reading of the raw data in tests/oracle.ts.

import { describe, expect, it } from "vitest";
import { runBottomLineMatrix, runMatrix } from "./matrix";

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

describe("generated bottom-line matrix", () => {
  const summary = runBottomLineMatrix();
  const show = (cases: unknown[]) => JSON.stringify(cases.slice(0, 5), null, 1);

  it("covers every state, and every California place set with and without Somewhere else", () => {
    expect(summary.cases).toBeGreaterThan(350_000);
    expect(summary.byKind.yes).toBeGreaterThan(0);
    expect(summary.byKind.no_illegal).toBeGreaterThan(0);
    expect(summary.byKind.no_unconfirmed).toBeGreaterThan(0);
  });

  it("never says YES when the independent checker lists any reason against it", () => {
    expect(summary.falseYes.slice(0, 5), show(summary.falseYes)).toEqual([]);
  });

  it("says YES whenever the independent checker lists no reason against it", () => {
    expect(summary.missedYes.slice(0, 5), show(summary.missedYes)).toEqual([]);
  });

  it("is never YES when a card is not allowed, can't confirm, unanswered, not sure or unverified", () => {
    expect(summary.wrongKind.slice(0, 5), show(summary.wrongKind)).toEqual([]);
  });

  it("never shows a bare YES for a place it did not check", () => {
    expect(summary.missingCaveat.slice(0, 5), show(summary.missingCaveat)).toEqual([]);
  });
});
