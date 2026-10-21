// Style rules from the first review of the redesign. There is no browser here, so these read the
// rules in app/globals.css that fix each problem. The screenshots in the fix notes show the result.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string, from = 0): string {
  const at = CSS.indexOf(`${selector} {`, from);
  if (at < 0) throw new Error(`no rule ${selector}`);
  const open = CSS.indexOf("{", at);
  return CSS.slice(open + 1, CSS.indexOf("}", open));
}

/** The text of an @media block, up to its matching brace. */
function media(query: string): string {
  const at = CSS.indexOf(`@media ${query} {`);
  if (at < 0) throw new Error(`no @media ${query}`);
  let depth = 0;
  for (let i = CSS.indexOf("{", at); i < CSS.length; i++) {
    if (CSS[i] === "{") depth += 1;
    if (CSS[i] === "}") depth -= 1;
    if (depth === 0) return CSS.slice(at, i + 1);
  }
  throw new Error("unclosed block");
}

/** The color tokens the light theme defines. */
function lightTokens(): string[] {
  const root = rule(":root");
  return [...root.matchAll(/--([\w-]+):\s*#[0-9a-f]{6}/gi)].map((m) => m[1]);
}

describe("the first review's style fixes", () => {
  it("floats a fact's legend inside its padding, so it sits next to its own fact", () => {
    const legend = rule(".fact > legend,\n.fact-group > legend");
    expect(legend).toMatch(/float:\s*left/);
    expect(legend).toMatch(/width:\s*100%/);
    expect(CSS).toMatch(/\.fact > legend \+ \*,\n\.fact-group > legend \+ \* \{\s*clear: both;/);
  });

  it("lists the facts in one column at every width, so every check panel is full width", () => {
    expect(CSS).not.toMatch(/\.fact-grid \{\s*grid-template-columns: repeat\(2/);
  });

  it("keeps the check count on one line, with no two columns pushed apart", () => {
    expect(rule(".check-count")).not.toMatch(/space-between/);
  });

  it("makes the Check bar sticky on a phone only when the facts list fills the screen", () => {
    expect(media("(max-width: 639px)")).toContain('.check-bar[data-sticky="true"] {');
  });

  it("gives Details summaries an arrow and the accent color, like the other folded sections", () => {
    expect(CSS).toContain(".more > summary,\n.line-details > summary {");
    expect(CSS).toContain(".more > summary::before,\n.line-details > summary::before {");
  });

  it("prints with the light colors, every token included, even from a device in dark mode", () => {
    const print = media("print");
    for (const token of lightTokens()) {
      if (token === "focus" || token === "accent-hover") continue;
      expect(print, token).toMatch(new RegExp(`--${token}:\\s*#`));
    }
  });

  it("draws the select arrow as one chevron, not two triangles", () => {
    expect(rule("select.field")).toContain("var(--select-arrow)");
    expect(rule("select.field")).not.toContain("linear-gradient");
  });

  it("leaves no hairline of white around the bottom line's tinted header", () => {
    expect(rule(".bottom-line")).toMatch(/border:\s*0/);
  });

  it("marks the open tab with a solid ink fill, not a shade alone", () => {
    expect(rule('.tabs button[aria-selected="true"]')).toMatch(/background: var\(--primary\)/);
  });

  it("keeps focus rings, picked choices and the open tab in Windows contrast themes", () => {
    const forced = media("(forced-colors: active)");
    expect(forced).toMatch(/\.field:focus-visible \{\s*outline: 3px solid Highlight/);
    expect(forced).toContain(".choice input:checked + span");
    expect(forced).toContain('.tabs button[aria-selected="true"]');
  });

  it("fits the Spanish search placeholder on a 320 px phone without going under 16 px", () => {
    const narrow = media("(max-width: 359px)");
    expect(narrow).toMatch(/\.combo-input \{\s*padding-left: 2\.5rem;\s*font-size: 1rem;/);
  });
});
