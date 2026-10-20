// Dates are plain YYYY-MM-DD strings, so string comparison is date comparison.

export interface DateWindow {
  /** First day the rule applies, or null for "already in force". */
  from: string | null;
  /** First day the rule no longer applies, or null for "no end date". */
  until: string | null;
}

const ISO_DATE = /\d{4}-\d{2}-\d{2}/;

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** Pulls the first YYYY-MM-DD out of free text like "2026-04-01 (Section 1)". */
export function firstIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = ISO_DATE.exec(value);
  return match ? match[0] : null;
}

export function inWindow(date: string, window: DateWindow): boolean {
  if (window.from !== null && date < window.from) return false;
  if (window.until !== null && date >= window.until) return false;
  return true;
}

/** The YYYY-MM-DD date a whole number of days after another one. Counted in UTC, so no time zone shifts it. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Today's date where the code runs, as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
