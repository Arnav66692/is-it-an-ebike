// The colors in app/globals.css meet WCAG AA contrast in the light theme and the dark one. Text
// needs 4.5 to 1. Field borders, focus rings and the YES and NO marks need 3 to 1.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

/** The --name: #hex tokens in the first block after `marker`. */
function tokens(marker: string): Record<string, string> {
  const start = CSS.indexOf(marker);
  if (start < 0) throw new Error(`no ${marker} in globals.css`);
  const open = CSS.indexOf("{", CSS.indexOf(":root", start));
  const close = CSS.indexOf("}", open);
  const block = CSS.slice(open + 1, close);
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum] for every pair the page draws. */
const TEXT = 4.5;
const UI = 3;
const PAIRS: [string, string, number][] = [
  ["ink", "bg", TEXT],
  ["ink", "card", TEXT],
  ["ink", "sunk", TEXT],
  ["muted", "bg", TEXT],
  ["muted", "card", TEXT],
  ["muted", "sunk", TEXT],
  ["muted", "accent-soft", TEXT],
  ["accent", "card", TEXT],
  ["accent", "bg", TEXT],
  ["accent", "accent-soft", TEXT],
  ["accent-ink", "accent", TEXT],
  ["yes", "card", TEXT],
  ["yes", "yes-bg", TEXT],
  ["ink", "yes-bg", TEXT],
  ["no", "card", TEXT],
  ["no", "no-bg", TEXT],
  ["ink", "no-bg", TEXT],
  ["maybe", "maybe-bg", TEXT],
  ["ink", "maybe-bg", TEXT],
  ["card", "yes", UI],
  ["card", "no", UI],
  ["field-line", "card", UI],
  ["focus", "card", UI],
  ["focus", "bg", UI],
];

describe("the page colors meet WCAG AA contrast", () => {
  for (const [theme, marker] of [
    ["light", ":root {"],
    ["dark", "@media (prefers-color-scheme: dark)"],
  ] as const) {
    it(`in the ${theme} theme`, () => {
      const t = tokens(marker);
      const low = PAIRS.filter(([fg, bg]) => !t[fg] || !t[bg]).map(([fg, bg]) => `${fg} on ${bg} is not a token`);
      expect(low).toEqual([]);
      const fails = PAIRS.filter(([fg, bg, min]) => ratio(t[fg], t[bg]) < min).map(([fg, bg, min]) => `${fg} on ${bg}: ${ratio(t[fg], t[bg]).toFixed(2)} < ${min}`);
      expect(fails).toEqual([]);
    });
  }

  it("measures contrast the WCAG way", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});
