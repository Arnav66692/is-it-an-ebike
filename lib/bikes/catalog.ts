// The maker catalog for the bike finder, data/bikes/catalog.json, read Oct 21, 2026 from each
// maker's own page and checked by a second reader. The finder page gets each record without its
// evidence and checking notes, which stay in the file.

import catalogFile from "@/data/bikes/catalog.json";
import type { CatalogBike } from "./facts";

export interface CatalogMeta {
  readDate: string;
  method: string;
  nullRule: string;
  notLegalAdvice: string;
}

interface RawCatalog {
  meta: { read_date: string; method: string; null_rule: string; not_legal_advice: string };
  bikes: (CatalogBike & Record<string, unknown>)[];
}

const RAW = catalogFile as unknown as RawCatalog;

/** The fields the finder and the checker use. */
function slim(b: CatalogBike): CatalogBike {
  return {
    id: b.id,
    maker: b.maker,
    model: b.model,
    vehicle_type: b.vehicle_type,
    maker_url: b.maker_url,
    read_date: b.read_date,
    class_as_stated: b.class_as_stated,
    pedals: b.pedals,
    throttle: b.throttle,
    throttle_top_speed_mph: b.throttle_top_speed_mph,
    assisted_top_speed_mph: b.assisted_top_speed_mph,
    top_speed_stated_mph: b.top_speed_stated_mph,
    speed_note: b.speed_note,
    motor_rated_w: b.motor_rated_w,
    motor_peak_w: b.motor_peak_w,
    battery_wh: b.battery_wh,
    weight_lb: b.weight_lb,
    wheel_size: b.wheel_size,
    rider_fit: b.rider_fit,
    rider_min_height_in: b.rider_min_height_in,
    rider_age: b.rider_age,
    price_usd: b.price_usd,
    price_note: b.price_note,
    colors: b.colors ?? [],
    intended_use_as_stated: b.intended_use_as_stated,
    class_note: b.class_note,
    derived: {
      use_tags: b.derived.use_tags,
      max_speed_any_mode_mph: b.derived.max_speed_any_mode_mph,
      can_exceed_20_mph: b.derived.can_exceed_20_mph,
      class_3_mode_mentioned: b.derived.class_3_mode_mentioned,
    },
  };
}

export const CATALOG: readonly CatalogBike[] = RAW.bikes.map(slim);

export const CATALOG_META: CatalogMeta = {
  readDate: RAW.meta.read_date,
  method: RAW.meta.method,
  nullRule: RAW.meta.null_rule,
  notLegalAdvice: RAW.meta.not_legal_advice,
};

export function catalogBike(id: string): CatalogBike | null {
  return CATALOG.find((b) => b.id === id) ?? null;
}
