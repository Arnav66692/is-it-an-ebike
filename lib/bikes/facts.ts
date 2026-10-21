// Turns one catalog record, what a maker's page says about a bike, into the facts the rules engine
// reads. Only what the page states is set. A field the page is silent on stays null, so the engine
// can't confirm a rule that turns on it, and the answer is NO. Nothing here guesses.

import type { Evidence, Extraction, FactKey } from "@/lib/extract/parse";
import { emptyFacts, type BikeFacts, type ClassNum } from "@/lib/rules/types";

/** One bike as data/bikes/catalog.json records it. Null means the maker's page didn't say. */
export interface CatalogBike {
  id: string;
  maker: string;
  model: string;
  vehicle_type: "e-bike" | "pedal-less e-moto";
  maker_url: string;
  read_date: string;
  class_as_stated: string | null;
  pedals: boolean | null;
  throttle: boolean | null;
  throttle_top_speed_mph: number | null;
  assisted_top_speed_mph: number | null;
  top_speed_stated_mph: number | null;
  speed_note: string | null;
  motor_rated_w: number | null;
  motor_peak_w: number | null;
  battery_wh: number | null;
  weight_lb: number | null;
  wheel_size: string | null;
  rider_fit: string | null;
  rider_min_height_in: number | null;
  rider_age: string | null;
  price_usd: number | null;
  price_note: string | null;
  colors: string[];
  intended_use_as_stated: string | null;
  class_note: string | null;
  derived: {
    use_tags: string[];
    max_speed_any_mode_mph: number | null;
    can_exceed_20_mph: boolean | null;
    class_3_mode_mentioned: boolean | null;
  };
}

/**
 * The classes a maker's class line names: "Class 2" is 2, "Class 1, 2, or 3 eBike" and "Class 1-3"
 * are 1, 2 and 3, "Class 2 (Convertible to Class 3)" is 2 and 3. Empty when the page names none.
 */
export function statedClasses(text: string | null): ClassNum[] {
  if (!text) return [];
  const found = new Set<ClassNum>();
  for (const m of text.matchAll(/([123])\s*(?:-|to)\s*([123])/gi)) {
    for (let n = Number(m[1]); n <= Number(m[2]); n++) found.add(n as ClassNum);
  }
  for (const m of text.matchAll(/\b([123])\b/g)) found.add(Number(m[1]) as ClassNum);
  return [...found].sort();
}

/** ISO 622 rims, sold as 700c, are 28 inch wheels. ISO 406 rims are 20 inch wheels. */
const ISO_RIM_INCHES: Record<string, number> = { "622": 28, "406": 20 };

/**
 * The wheel diameter in inches the maker's wheel line gives, like 20 for "20 x 3.0 in" or 28 for
 * "700 x 38C". Null when the line gives none or disagrees with itself.
 */
export function statedWheelInches(text: string | null): number | null {
  if (!text || /disagree/i.test(text)) return null;
  if (/^\s*700\b/.test(text)) return ISO_RIM_INCHES["622"];
  const iso = text.match(/\b\d{2}-(406|622)\b/);
  if (iso) return ISO_RIM_INCHES[iso[1]];
  const inches = text.match(/^\s*(\d{1,2}(?:\.\d)?)\s*(?:x|in\b|inch)/i);
  return inches ? Number(inches[1]) : null;
}

/**
 * True when the page shows the bike can run in more than one class or past its shipped speed,
 * like "Class 1, 2, or 3" or "20MPH, adjustable to 25MPH". The engine treats it like a bike with
 * a mode that can be switched on, the same as the checker does.
 */
export function statedSwitchable(bike: CatalogBike): boolean | null {
  const classes = statedClasses(bike.class_as_stated);
  if (classes.length > 1 || bike.derived.class_3_mode_mentioned === true) return true;
  const top = bike.top_speed_stated_mph;
  const any = bike.derived.max_speed_any_mode_mph;
  if (top !== null && any !== null && any > top) return true;
  return null;
}

/** The fastest speed the maker's page gives for any mode, or null when it gives none. */
export function statedTopMph(bike: CatalogBike): number | null {
  const speeds = [bike.top_speed_stated_mph, bike.derived.max_speed_any_mode_mph, bike.throttle_top_speed_mph, bike.assisted_top_speed_mph].filter(
    (v): v is number => v !== null,
  );
  return speeds.length > 0 ? Math.max(...speeds) : null;
}

/**
 * The checker's speed questions, answered from the maker's own top speed. Pedal assist can't pass
 * 28 mph when the fastest stated speed in any mode is 28 or less. The motor alone can't pass 20 mph
 * when the bike has no throttle, or its stated throttle speed or fastest stated speed is 20 or less.
 * Anything else stays unanswered, so the engine can't confirm it. The checker asks these again
 * when the family opens the bike there.
 */
export function statedSpeedAnswers(bike: CatalogBike): Pick<BikeFacts, "motorOver20" | "assistOver28"> {
  const top = statedTopMph(bike);
  const assistOver28 = top !== null && top <= 28 ? false : null;
  const motorOver20 =
    bike.throttle === false || (bike.throttle_top_speed_mph !== null && bike.throttle_top_speed_mph <= 20) || (top !== null && top <= 20) ? false : null;
  return { motorOver20: bike.throttle === null && top === null ? null : motorOver20, assistOver28 };
}

/** The facts from the maker's page, as the engine reads them. */
export function catalogFacts(bike: CatalogBike): BikeFacts {
  const wheel = statedWheelInches(bike.wheel_size);
  const top = statedTopMph(bike);
  return {
    ...emptyFacts(),
    hasPedals: bike.pedals,
    classes: statedClasses(bike.class_as_stated),
    ratedWatts: bike.motor_rated_w,
    peakWatts: bike.motor_peak_w,
    hasThrottle: bike.throttle,
    throttleMph: bike.throttle_top_speed_mph,
    assistMph: bike.assisted_top_speed_mph,
    topSpeedMph: top,
    switchable: statedSwitchable(bike),
    wheelFrontIn: wheel,
    wheelRearIn: wheel,
    weightLb: bike.weight_lb,
  };
}

/** The lines the checker shows as read from the maker's page, one per fact, each naming where it came from. */
function sourceLines(bike: CatalogBike, facts: BikeFacts): Partial<Record<FactKey, string>> {
  const lines: Partial<Record<FactKey, string>> = {};
  if (facts.hasPedals !== null) lines.hasPedals = `Pedals: ${facts.hasPedals ? "yes" : "no"}`;
  if (bike.class_as_stated) lines.classes = `Class: ${bike.class_as_stated}`;
  if (facts.ratedWatts !== null) lines.ratedWatts = `Motor: ${facts.ratedWatts} W rated`;
  if (facts.peakWatts !== null) lines.peakWatts = `Motor: ${facts.peakWatts} W peak`;
  if (facts.hasThrottle !== null) lines.hasThrottle = `Throttle: ${facts.hasThrottle ? "yes" : "no"}`;
  if (facts.throttleMph !== null) lines.throttleMph = `Throttle speed: ${facts.throttleMph} mph`;
  if (facts.assistMph !== null) lines.assistMph = `Pedal assist speed: ${facts.assistMph} mph`;
  if (facts.topSpeedMph !== null) lines.topSpeedMph = `Top speed: ${facts.topSpeedMph} mph${bike.speed_note ? `. ${bike.speed_note}` : ""}`;
  if (facts.switchable !== null) lines.switchable = `Speed or class modes: ${bike.class_as_stated ?? bike.speed_note ?? ""}`;
  if (bike.wheel_size && facts.wheelFrontIn !== null) lines.wheelSize = `Wheels: ${bike.wheel_size}`;
  if (facts.weightLb !== null) lines.weightLb = `Weight: ${facts.weightLb} lb`;
  return lines;
}

/**
 * The maker's facts as a read, the same shape a product link gives the checker. Every fact comes in
 * as read and not checked, so the checker still asks the family to check each one against the bike
 * before it can say YES.
 */
export function catalogExtraction(bike: CatalogBike): Extraction {
  const facts = catalogFacts(bike);
  const lines = sourceLines(bike, facts);
  const head = `${bike.maker} ${bike.model}, maker's page, read ${bike.read_date}`;
  let text = head;
  const evidence: Partial<Record<FactKey, Evidence[]>> = {};
  for (const [key, line] of Object.entries(lines) as [FactKey, string][]) {
    text += "\n";
    evidence[key] = [{ text: line, index: text.length }];
    text += line;
  }
  const flags = facts.classes.length > 1 ? ["several_classes"] : [];
  return { text, facts, evidence, flags };
}
