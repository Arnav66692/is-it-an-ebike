// More e-bike models for the Map's model search, each read from its maker's own page on Oct 23,
// 2026, with a word-for-word quote showing its class and battery (data/bikes/models.json, listed
// with the pages it skipped in data/bikes/models_report.md). These fill a battery estimate and the
// class a route is checked for. The bike finder still uses only its fully checked catalog.

import modelsJson from "@/data/bikes/models.json";
import { emptyFacts, type BikeFacts, type ClassNum } from "@/lib/rules";

export interface BikeModel {
  id: string;
  maker: string;
  model: string;
  classes: ClassNum[];
  motor_rated_w: number | null;
  battery_wh: number;
  weight_lb: number | null;
  top_assist_mph: number | null;
  throttle: boolean | null;
  source_url: string;
  read_date: string;
  quote: string;
}

export const BIKE_MODELS: readonly BikeModel[] = (modelsJson as unknown as { models: BikeModel[] }).models;

/** The facts a maker's page states, for the Map. Anything the page didn't state stays unknown. */
export function modelFacts(m: BikeModel): BikeFacts {
  return { ...emptyFacts(), hasPedals: true, classes: [...m.classes], ratedWatts: m.motor_rated_w, hasThrottle: m.throttle, assistMph: m.top_assist_mph, weightLb: m.weight_lb };
}
