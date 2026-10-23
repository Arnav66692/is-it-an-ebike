// The where-you-ride rules the app ships, from data/rules/route/. tests/routeRules.test.ts checks
// their shape, that every state rule quotes the verified state table word for word, and that every
// local rule taken from a record quotes that record word for word.

import statesJson from "@/data/rules/route/states.json";
import localA from "@/data/rules/route/local_sd_a.json";
import localB from "@/data/rules/route/local_sd_b.json";
import type { LocalWayRules, RouteRules, StateWayRules } from "./rules";

type StatesFile = { states: Record<string, StateWayRules> };
type LocalFile = { jurisdictions: Record<string, LocalWayRules> };

export const ROUTE_RULES: RouteRules = {
  states: (statesJson as unknown as StatesFile).states,
  local: { ...(localA as unknown as LocalFile).jurisdictions, ...(localB as unknown as LocalFile).jurisdictions },
};
