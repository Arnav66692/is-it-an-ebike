// Regression tests for the fifth review (Oct 19, 2026). Each block names the problem it closes.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkerToday, DATA_CHECKED_ON, rideDateFor, rideDateIn } from "@/lib/checkerState";
import { formatDate } from "@/lib/i18n/names";
import { isIsoDate } from "@/lib/rules/dates";
import { evaluate, validateInput } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { classBike } from "./helpers";

describe("a date that doesn't exist is not a date", () => {
  it("refuses Nov 31 and Feb 30, so the engine and the bottom line can't disagree on the day", () => {
    for (const bad of ["2026-11-31", "2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "2026-04-31"]) {
      expect(isIsoDate(bad), bad).toBe(false);
      expect(rideDateIn(bad, "2026-10-19"), bad).toBeNull();
      expect(validateInput({ state: "CA", riderAge: 30, rideDate: bad, facts: classBike(1), places: [] }), bad).not.toBeNull();
    }
  });

  it("still takes real days, including a leap day", () => {
    for (const good of ["2026-11-30", "2028-02-29", "2026-12-31", "2027-01-01"]) expect(isIsoDate(good), good).toBe(true);
    expect(formatDate("2026-11-30", "en")).toBe("Nov 30, 2026");
  });
});

describe("a device clock that runs behind can't reach a ride date before the rules were checked", () => {
  it("the first ride date is the table's check date, not a device day before it", () => {
    expect(DATA_CHECKED_ON >= "2026-10-19").toBe(true);
    expect(checkerToday("2026-06-30")).toBe(DATA_CHECKED_ON);
    expect(checkerToday("2027-03-01")).toBe("2027-03-01");
    expect(rideDateFor(false, "", "2026-06-30")).toBe(DATA_CHECKED_ON);
    expect(rideDateFor(true, "2026-06-30", "2026-06-30")).toBeNull();
    expect(rideDateIn("2026-07-14", "2026-07-14")).toBeNull();
  });

  it("so a Tennessee 10-year-old on a Class 3 gets the age rule in force now, not a YES from before it", () => {
    const date = rideDateFor(false, "", "2026-06-30") ?? "";
    const facts = classBike(3, { hasThrottle: false, throttleMph: null, assistMph: 28, wheelFrontIn: 26, wheelRearIn: 26 });
    const result = evaluate({ state: "TN", riderAge: 10, rideDate: date, facts, places: [] });
    expect(result.state.status).toBe("no");
    expect(bottomLine(result, date).kind).toBe("no_illegal");
  });

  it("is what the checker reads as today, on load, at midnight and on Check", () => {
    const source = readFileSync(join(__dirname, "..", "components", "Checker.tsx"), "utf8");
    expect(source.match(/checkerToday\(localToday\(\)\)/g)?.length).toBe(3);
    expect(source).not.toMatch(/[^(]localToday\(\)[,;]/);
  });
});
