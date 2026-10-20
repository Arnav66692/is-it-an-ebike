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
    expect(summary.cases).toBeGreaterThan(400_000);
    expect(summary.byKind.yes).toBeGreaterThan(0);
    expect(summary.byKind.no_illegal).toBeGreaterThan(0);
    expect(summary.byKind.no_unconfirmed).toBeGreaterThan(0);
  });

  it("runs every ride typed in, and read from a link or photo with none, one or every fact left unchecked", () => {
    expect(summary.bottomLines).toBe(4 * summary.cases);
    for (const variant of ["typed", "read_none_checked", "read_one_unchecked", "read_all_checked"] as const) {
      const counted = summary.byRead[variant];
      expect(counted.yes + counted.no_illegal + counted.no_unconfirmed, variant).toBe(summary.cases);
    }
    expect(summary.byRead.read_all_checked).toEqual(summary.byRead.typed);
  });

  it("never says YES while a fact read from a link or photo is unchecked", () => {
    expect(summary.byRead.read_none_checked.yes).toBe(0);
    expect(summary.byRead.read_one_unchecked.yes).toBe(0);
    expect(summary.uncheckedYes.slice(0, 5), show(summary.uncheckedYes)).toEqual([]);
  });

  it("names exactly the unchecked facts, in one line, whenever the answer is any kind of NO, and none once all are checked", () => {
    expect(summary.factsNotNamed.slice(0, 5), show(summary.factsNotNamed)).toEqual([]);
    // A NO, not allowed with facts left unchecked really comes up, so the gate above is not empty.
    expect(summary.byRead.read_none_checked.no_illegal).toBeGreaterThan(0);
  });

  it("keeps NO, not allowed the same whether the facts were read or typed, and checked or not", () => {
    expect(summary.byRead.read_none_checked.no_illegal).toBe(summary.byRead.typed.no_illegal);
    expect(summary.byRead.read_one_unchecked.no_illegal).toBe(summary.byRead.typed.no_illegal);
    expect(summary.illegalChanged.slice(0, 5), show(summary.illegalChanged)).toEqual([]);
  });

  it("shows the line naming the unchecked facts once on the rendered card, and announces that a NO, not allowed could change", () => {
    expect(summary.factsCards).toBeGreaterThan(30);
    expect(summary.factsNotShown.slice(0, 5), show(summary.factsNotShown)).toEqual([]);
  });

  it("never says YES when the independent checker lists any reason against it", () => {
    expect(summary.falseYes.slice(0, 5), show(summary.falseYes)).toEqual([]);
  });

  it("says YES whenever the independent checker lists no reason against it", () => {
    expect(summary.missedYes.slice(0, 5), show(summary.missedYes)).toEqual([]);
  });

  it("says NO, not allowed only when the independent checker finds a rule that says no", () => {
    expect(summary.falseIllegal.slice(0, 5), show(summary.falseIllegal)).toEqual([]);
  });

  it("says NO, not allowed whenever the independent checker finds a rule that says no", () => {
    expect(summary.missedIllegal.slice(0, 5), show(summary.missedIllegal)).toEqual([]);
  });

  it("is never YES when a card is not allowed, can't confirm, unanswered, not sure or unverified, or a read fact is unchecked", () => {
    expect(summary.wrongKind.slice(0, 5), show(summary.wrongKind)).toEqual([]);
  });

  it("shows the unchecked-places line on the rendered card exactly when a place was not checked", () => {
    expect(summary.renderedCards).toBeGreaterThan(150);
    expect(summary.missingCaveat.slice(0, 5), show(summary.missingCaveat)).toEqual([]);
  });
});
