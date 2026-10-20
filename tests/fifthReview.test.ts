// Regression tests for the fifth review (Oct 19, 2026). Each block names the problem it closes.

import { describe, expect, it } from "vitest";
import { rideDateIn } from "@/lib/checkerState";
import { formatDate } from "@/lib/i18n/names";
import { isIsoDate } from "@/lib/rules/dates";
import { validateInput } from "@/lib/rules";
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
