// Parser and three-valued evaluator for the condition strings in verdict_cautions,
// for example "(wheel_count == 2 and max_wheel_diameter_in < 16) or wheel_count == 3".
// Numbers are known as intervals, so a partly known fact still settles some comparisons.

import type { QuestionId, Tri } from "./types";

export interface Interval {
  lo: number;
  loOpen: boolean;
  hi: number;
  hiOpen: boolean;
}

export type Value = { kind: "num"; iv: Interval } | { kind: "bool"; v: Tri };
export type Env = Record<string, Value>;

type Op = "<" | "<=" | ">" | ">=" | "==";

export type ConditionNode =
  | { t: "or"; a: ConditionNode; b: ConditionNode }
  | { t: "and"; a: ConditionNode; b: ConditionNode }
  | { t: "cmp"; field: string; op: Op; n: number }
  | { t: "flag"; field: string };

export const NUMERIC_FIELDS = [
  "max_wheel_diameter_in",
  "min_wheel_diameter_in",
  "wheel_count",
  "throttle_max_mph",
  "motor_only_max_mph",
  "bike_weight_lb",
  "label_watts",
] as const;

export const BOOLEAN_FIELDS = [
  "switchable_out_of_class",
  "assist_over_28",
  "has_foot_pegs",
  "needs_pedal_kit",
] as const;

/** Which follow-up question settles each condition field. Watts come from the label, not a question. */
export const FIELD_QUESTION: Record<string, QuestionId | null> = {
  max_wheel_diameter_in: "wheels",
  min_wheel_diameter_in: "wheels",
  wheel_count: "wheels",
  throttle_max_mph: "fast_mode",
  motor_only_max_mph: "fast_mode",
  switchable_out_of_class: "fast_mode",
  assist_over_28: "fast_mode",
  bike_weight_lb: "weight",
  has_foot_pegs: "pegs_kit",
  needs_pedal_kit: "pegs_kit",
  label_watts: null,
};

const numeric = new Set<string>(NUMERIC_FIELDS);
const boolean = new Set<string>(BOOLEAN_FIELDS);

type Token =
  | { k: "lp" }
  | { k: "rp" }
  | { k: "op"; v: Op }
  | { k: "num"; v: number }
  | { k: "word"; v: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
    } else if (ch === "(") {
      tokens.push({ k: "lp" });
      i += 1;
    } else if (ch === ")") {
      tokens.push({ k: "rp" });
      i += 1;
    } else if (/[<>=]/.test(ch)) {
      const two = src.slice(i, i + 2);
      if (two === "<=" || two === ">=" || two === "==") {
        tokens.push({ k: "op", v: two });
        i += 2;
      } else if (ch === "<" || ch === ">") {
        tokens.push({ k: "op", v: ch });
        i += 1;
      } else {
        throw new Error(`Bad operator at ${i} in "${src}"`);
      }
    } else if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at ${i} in "${src}"`);
      tokens.push({ k: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z_]/.test(ch)) {
      const m = /^[a-z_][a-z0-9_]*/.exec(src.slice(i));
      if (!m) throw new Error(`Bad word at ${i} in "${src}"`);
      tokens.push({ k: "word", v: m[0] });
      i += m[0].length;
    } else {
      throw new Error(`Unexpected "${ch}" at ${i} in "${src}"`);
    }
  }
  return tokens;
}

/** Parses a condition string. Throws on any field the engine doesn't know, so bad data fails loudly. */
export function parseCondition(src: string): ConditionNode {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const isWord = (word: string): boolean => {
    const t = peek();
    return t?.k === "word" && t.v === word;
  };

  function parseOr(): ConditionNode {
    let node = parseAnd();
    while (isWord("or")) {
      pos += 1;
      node = { t: "or", a: node, b: parseAnd() };
    }
    return node;
  }

  function parseAnd(): ConditionNode {
    let node = parseAtom();
    while (isWord("and")) {
      pos += 1;
      node = { t: "and", a: node, b: parseAtom() };
    }
    return node;
  }

  function parseAtom(): ConditionNode {
    const t = peek();
    if (!t) throw new Error(`Unexpected end of "${src}"`);
    if (t.k === "lp") {
      pos += 1;
      const node = parseOr();
      if (peek()?.k !== "rp") throw new Error(`Missing ) in "${src}"`);
      pos += 1;
      return node;
    }
    if (t.k !== "word") throw new Error(`Expected a field in "${src}"`);
    pos += 1;
    const next = peek();
    if (next?.k === "op") {
      pos += 1;
      const num = peek();
      if (num?.k !== "num") throw new Error(`Expected a number after ${next.v} in "${src}"`);
      pos += 1;
      if (!numeric.has(t.v)) throw new Error(`Unknown numeric field "${t.v}" in "${src}"`);
      return { t: "cmp", field: t.v, op: next.v, n: num.v };
    }
    if (!boolean.has(t.v)) throw new Error(`Unknown flag "${t.v}" in "${src}"`);
    return { t: "flag", field: t.v };
  }

  const node = parseOr();
  if (pos !== tokens.length) throw new Error(`Trailing input in "${src}"`);
  return node;
}

export function fieldsOf(node: ConditionNode): string[] {
  switch (node.t) {
    case "or":
    case "and":
      return [...new Set([...fieldsOf(node.a), ...fieldsOf(node.b)])];
    case "cmp":
    case "flag":
      return [node.field];
  }
}

export function compare(iv: Interval, op: Op, n: number): Tri {
  switch (op) {
    case ">":
      if (iv.lo > n || (iv.lo === n && iv.loOpen)) return true;
      if (iv.hi <= n) return false;
      return null;
    case ">=":
      if (iv.lo >= n) return true;
      if (iv.hi < n || (iv.hi === n && iv.hiOpen)) return false;
      return null;
    case "<":
      if (iv.hi < n || (iv.hi === n && iv.hiOpen)) return true;
      if (iv.lo >= n) return false;
      return null;
    case "<=":
      if (iv.hi <= n) return true;
      if (iv.lo > n || (iv.lo === n && iv.loOpen)) return false;
      return null;
    case "==":
      if (iv.lo === n && iv.hi === n && !iv.loOpen && !iv.hiOpen) return true;
      if (iv.hi < n || iv.lo > n || (iv.hi === n && iv.hiOpen) || (iv.lo === n && iv.loOpen)) {
        return false;
      }
      return null;
  }
}

function and3(a: Tri, b: Tri): Tri {
  if (a === false || b === false) return false;
  if (a === true && b === true) return true;
  return null;
}

function or3(a: Tri, b: Tri): Tri {
  if (a === true || b === true) return true;
  if (a === false && b === false) return false;
  return null;
}

/** Kleene logic: true, false, or null when the facts can't settle it. */
export function evaluateCondition(node: ConditionNode, env: Env): Tri {
  switch (node.t) {
    case "or":
      return or3(evaluateCondition(node.a, env), evaluateCondition(node.b, env));
    case "and":
      return and3(evaluateCondition(node.a, env), evaluateCondition(node.b, env));
    case "cmp": {
      const value = env[node.field];
      if (!value || value.kind !== "num") throw new Error(`No numeric value for ${node.field}`);
      return compare(value.iv, node.op, node.n);
    }
    case "flag": {
      const value = env[node.field];
      if (!value || value.kind !== "bool") throw new Error(`No flag value for ${node.field}`);
      return value.v;
    }
  }
}

/**
 * Fields whose answer could still change the condition. A comparison the known range already
 * settles is not one of them, so a Utah bike with no throttle and both fast-mode answers No is
 * never asked about fast modes again just because its motor speed is a range, not one number.
 */
export function unknownFields(node: ConditionNode, env: Env): string[] {
  if (evaluateCondition(node, env) !== null) return [];
  switch (node.t) {
    case "or":
    case "and":
      return [...new Set([...unknownFields(node.a, env), ...unknownFields(node.b, env)])];
    case "cmp":
    case "flag":
      return [node.field];
  }
}

export const ANY: Interval = { lo: 0, loOpen: false, hi: Number.POSITIVE_INFINITY, hiOpen: true };

export function exactly(n: number): Interval {
  return { lo: n, loOpen: false, hi: n, hiOpen: false };
}
