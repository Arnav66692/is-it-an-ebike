// The bike finder: which catalog bikes fit a rider, ranked by fit alone, each with a YES or NO for
// this rider in these places from the rules engine. The engine reads only what the maker's page
// states. No brand counts for or against a bike, and price only counts as the budget.

import { bottomLine, evaluate, type BottomLine } from "@/lib/rules";
import type { PlaceId } from "@/lib/rules/types";
import { catalogFacts, statedSpeedAnswers, type CatalogBike } from "./facts";

export type Use = "commute" | "fun" | "trails" | "cargo" | "folding";
export const USES: readonly Use[] = ["commute", "fun", "trails", "cargo", "folding"];

/** The catalog's use tags each use matches. */
export const USE_TAGS: Record<Use, readonly string[]> = {
  commute: ["commuter", "lightweight"],
  fun: ["moto_style", "fat_tire_or_trail"],
  trails: ["fat_tire_or_trail"],
  cargo: ["cargo"],
  folding: ["folding"],
};

export type Budget = "800" | "1500" | "2200" | "3000" | "any";
export const BUDGETS: readonly Budget[] = ["800", "1500", "2200", "3000", "any"];

export type ColorFamily = "black" | "white" | "gray" | "blue" | "green" | "red" | "other";
export const COLOR_FAMILIES: readonly ColorFamily[] = ["black", "white", "gray", "blue", "green", "red", "other"];

/** Words in a maker's color name that put it in a family. A name can be in more than one. */
const COLOR_WORDS: Record<ColorFamily, readonly string[]> = {
  black: ["black", "stealth", "obsidian", "onyx"],
  white: ["white"],
  gray: ["gray", "grey", "slate", "sterling", "aluminum"],
  blue: ["blue", "blu", "cobalt", "azure", "navy"],
  green: ["green", "sage", "matcha", "mint", "pine", "fir", "olive"],
  red: ["red", "crimson", "cranberry", "cherry", "lava", "tabasco", "sriracha"],
  other: ["yellow", "mustard", "pink", "lavender", "bronze", "copper", "gold", "sand", "baja", "tan", "java"],
};

/** The maker's color names in this family. */
export function colorsIn(bike: CatalogBike, family: ColorFamily): string[] {
  return bike.colors.filter((c) => COLOR_WORDS[family].some((w) => c.toLowerCase().includes(w)));
}

/** Heights in a maker's fit line, like 4'11" and 6'3", in inches. */
export function heightsIn(text: string | null): number[] {
  if (!text) return [];
  return [...text.matchAll(/(\d)\s*'\s*(\d{1,2})?/g)].map((m) => Number(m[1]) * 12 + Number(m[2] ?? 0));
}

/** The tallest rider the maker's fit line names, or null. */
export function maxHeight(bike: CatalogBike): number | null {
  const all = heightsIn(bike.rider_fit);
  return all.length > 0 ? Math.max(...all) : null;
}

/** The ages the maker's own age line allows, like 13 and up or 4 to 8. Null when it names none. */
export function makerAges(text: string | null): { min: number; max: number | null } | null {
  if (!text) return null;
  const range = text.match(/(\d{1,2})\s*(?:~|-|to)\s*(\d{1,2})/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const over = text.match(/over (\d{1,2})/i);
  if (over) return { min: Number(over[1]) + 1, max: null };
  const plus = text.match(/(\d{1,2})\s*\+/);
  if (plus) return { min: Number(plus[1]), max: null };
  const older = text.match(/(\d{1,2}) years? of age (?:or|and) older/i);
  if (older) return { min: Number(older[1]), max: null };
  return null;
}

export interface FinderQuiz {
  age: number;
  /** Inches, or null when skipped. */
  height: number | null;
  uses: Use[];
  budget: Budget;
  colors: ColorFamily[];
  state: string;
  places: PlaceId[];
  otherPlaces: boolean;
  rideDate: string;
}

export function inBudget(bike: CatalogBike, budget: Budget): boolean {
  if (budget === "any") return true;
  return bike.price_usd !== null && bike.price_usd <= Number(budget);
}

/** Why a bike fits, or doesn't, as codes the page turns into words. */
export type FitReason =
  | { kind: "use"; use: Use }
  | { kind: "color"; names: string[] }
  | { kind: "height_fits" }
  | { kind: "too_short"; min: number }
  | { kind: "too_tall"; max: number }
  | { kind: "maker_age"; text: string };

export interface FinderResult {
  bike: CatalogBike;
  /** The engine's bottom line for this rider in these places, from the maker's stated facts. */
  line: BottomLine;
  yes: boolean;
  score: number;
  fits: FitReason[];
  misfits: FitReason[];
}

const USE_POINTS = 3;
const COLOR_POINTS = 1;
const HEIGHT_POINTS = 1;
const MISFIT_POINTS = -10;

/** The engine's answer for this bike, rider and ride, reading only the maker's stated facts. */
export function finderLine(bike: CatalogBike, quiz: Pick<FinderQuiz, "age" | "state" | "places" | "otherPlaces" | "rideDate">): BottomLine {
  const facts = { ...catalogFacts(bike), ...statedSpeedAnswers(bike) };
  const result = evaluate({ state: quiz.state, riderAge: quiz.age, rideDate: quiz.rideDate, facts, places: quiz.places, otherPlaces: quiz.otherPlaces });
  return bottomLine(result, quiz.rideDate);
}

function fitOf(bike: CatalogBike, quiz: FinderQuiz): { fits: FitReason[]; misfits: FitReason[]; score: number } {
  const fits: FitReason[] = [];
  const misfits: FitReason[] = [];
  let score = 0;
  for (const use of quiz.uses) {
    if (USE_TAGS[use].some((tag) => bike.derived.use_tags.includes(tag))) {
      fits.push({ kind: "use", use });
      score += USE_POINTS;
    }
  }
  const names = [...new Set(quiz.colors.flatMap((c) => colorsIn(bike, c)))];
  if (names.length > 0) {
    fits.push({ kind: "color", names });
    score += COLOR_POINTS;
  }
  if (quiz.height !== null) {
    const min = bike.rider_min_height_in;
    const max = maxHeight(bike);
    if (min !== null && quiz.height < min) misfits.push({ kind: "too_short", min });
    else if (max !== null && quiz.height > max) misfits.push({ kind: "too_tall", max });
    else if (min !== null) {
      fits.push({ kind: "height_fits" });
      score += HEIGHT_POINTS;
    }
  }
  const ages = makerAges(bike.rider_age);
  if (ages && bike.rider_age && (quiz.age < ages.min || (ages.max !== null && quiz.age > ages.max))) misfits.push({ kind: "maker_age", text: bike.rider_age });
  return { fits, misfits, score: score + MISFIT_POINTS * misfits.length };
}

/**
 * Every bike in the budget, best fit first. A YES for this rider in these places comes before a
 * NO, then the closer fit, then the lower price, then the model name, so no maker is favored.
 */
export function findBikes(catalog: readonly CatalogBike[], quiz: FinderQuiz): FinderResult[] {
  return catalog
    .filter((b) => inBudget(b, quiz.budget))
    .map((bike) => {
      const line = finderLine(bike, quiz);
      const fit = fitOf(bike, quiz);
      return { bike, line, yes: line.kind === "yes", ...fit };
    })
    .sort(
      (a, b) =>
        Number(b.yes) - Number(a.yes) ||
        b.score - a.score ||
        (a.bike.price_usd ?? Infinity) - (b.bike.price_usd ?? Infinity) ||
        `${a.bike.maker} ${a.bike.model}`.localeCompare(`${b.bike.maker} ${b.bike.model}`),
    );
}
