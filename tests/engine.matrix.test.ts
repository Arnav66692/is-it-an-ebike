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

  it("shows every rendered place card's answer as a plain YES or NO, never can't confirm, unsure or not sure", () => {
    // Every status comes up, so cards that can't confirm or still ask questions are among those read.
    for (const status of ["yes", "no", "not_ebike", "cant_confirm", "need_info"] as const) expect(summary.byStatus[status], status).toBeGreaterThan(0);
    expect(summary.answerCards).toBeGreaterThan(1_000);
    const sample = summary.hedged.slice(0, 5);
    expect(sample, JSON.stringify(sample, null, 1)).toEqual([]);
  });

  it("counts how each verdict is drawn, and draws every card the way the raw data says", () => {
    const sample = summary.shownWrong.slice(0, 5);
    expect(sample, JSON.stringify(sample, null, 1)).toEqual([]);
    // Only an allowed card is ever drawn YES, and some allowed cards are drawn NO, like a ride past the state check.
    for (const status of ["no", "not_ebike", "cant_confirm", "need_info"] as const) expect(summary.shownAs[status].yes, status).toBe(0);
    expect(summary.shownAs.yes.yes + summary.shownAs.yes.no).toBe(summary.byStatus.yes);
    expect(summary.shownAs.yes.no).toBeGreaterThan(0);
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

  it("is never YES when a card is not allowed, can't confirm, unanswered, not sure or unverified", () => {
    expect(summary.wrongKind.slice(0, 5), show(summary.wrongKind)).toEqual([]);
  });

  it("never shows a place card YES under a NO that names that card", () => {
    expect(summary.placeCards).toBeGreaterThan(1_000);
    expect(summary.cardYesUnderNo.slice(0, 5), show(summary.cardYesUnderNo)).toEqual([]);
  });

  it("shows every rendered bottom line and announcement as a plain YES or NO, never can't confirm, unsure or not sure", () => {
    expect(summary.answerCards).toBeGreaterThan(300);
    expect(summary.hedged.slice(0, 5), show(summary.hedged)).toEqual([]);
  });

  it("shows the unchecked-places line on the rendered card exactly when a place was not checked", () => {
    expect(summary.renderedCards).toBeGreaterThan(150);
    expect(summary.missingCaveat.slice(0, 5), show(summary.missingCaveat)).toEqual([]);
  });
});
