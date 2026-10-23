// The where-you-ride rules the route check reads, and a check of their shape. The state file is
// derived from the verified where_allowed text in data/rules/all_states.normalized.json, and the
// local files from the verified other_local_rules in data/rules/san_diego_local.json plus new
// readings of enacted city and county code, each with its quote. See data/rules/route/.

import type { ClassNum } from "@/lib/rules/types";

/** The kinds of way a rule can name. A crossing follows the road rules, and a ferry isn't ridden. */
export type LegalKind = "road" | "bike_lane" | "separated_bikeway" | "bike_path" | "sidewalk" | "footway" | "trail";

export const LEGAL_KINDS: readonly LegalKind[] = ["road", "bike_lane", "separated_bikeway", "bike_path", "sidewalk", "footway", "trail"];

/** What a rule says about one class on one kind of way. */
export type WayStatus = "allowed" | "banned" | "unclear";

const STATUSES: readonly WayStatus[] = ["allowed", "banned", "unclear"];

export interface StateKindRule {
  "1": WayStatus;
  "2": WayStatus;
  "3": WayStatus;
  /** State law lets a city, county or agency ban or regulate riding on this kind of way. */
  localMayRestrict: boolean;
  /** A state ban here can be lifted by a local authority. */
  localMayAllow: boolean;
  /** The words of the verified state entry this rule was read from. */
  basis: string;
  field: string;
}

export interface StateWayRules {
  citation: string;
  source_url: string;
  kinds: Record<LegalKind, StateKindRule>;
}

export type LocalWhere = "everywhere" | "business_district" | "posted_signs" | "parks" | "beaches" | "other";

const WHERES: readonly LocalWhere[] = ["everywhere", "business_district", "posted_signs", "parks", "beaches", "other"];

export interface LocalKindRule {
  classes: ClassNum[];
  status: WayStatus;
  where: LocalWhere;
  whereNote?: string;
  rule: string;
  citation: string;
  source_url: string;
  quote: string;
  from: "record" | "new_reading";
  checked: string;
}

/** A named place with its own rule, like a boardwalk, matched by the names a map gives its ways. */
export interface LocalFacility {
  id: string;
  names: string[];
  classes: ClassNum[];
  status: WayStatus;
  extent: string;
  rule: string;
  citation: string;
  source_url: string;
  quote: string;
  from: "record" | "new_reading";
  checked: string;
}

export interface LocalWayRules {
  kinds: Partial<Record<LegalKind, LocalKindRule[]>>;
  /** Kinds whose chapters were read in full in enacted code and hold no rule, so state law decides. */
  noRuleFound: Partial<Record<LegalKind, { read: string; source_url: string; checked: string }>>;
  /** Kinds whose local rules weren't read, so no YES can rest on them where state law lets locals restrict. */
  notChecked: LegalKind[];
  facilities: LocalFacility[];
}

export interface RouteRules {
  states: Record<string, StateWayRules>;
  /** By local record id, like city_of_san_diego. */
  local: Record<string, LocalWayRules>;
}

function isClass(n: unknown): n is ClassNum {
  return n === 1 || n === 2 || n === 3;
}

function text(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Every problem with a state rule file's shape, empty when it is sound. */
export function stateRuleProblems(states: Record<string, StateWayRules>): string[] {
  const problems: string[] = [];
  for (const [code, s] of Object.entries(states)) {
    // A state whose every rule is unclear makes no claim, so it needs no citation (Alaska's entry has none).
    const claims = LEGAL_KINDS.some((kind) => (["1", "2", "3"] as const).some((c) => s?.kinds?.[kind]?.[c] !== "unclear"));
    if (claims && (!text(s?.citation) || !text(s?.source_url))) problems.push(`${code}: citation or source_url missing`);
    for (const kind of LEGAL_KINDS) {
      const k = s?.kinds?.[kind];
      if (!k) {
        problems.push(`${code}: ${kind} missing`);
        continue;
      }
      for (const c of ["1", "2", "3"] as const) if (!STATUSES.includes(k[c])) problems.push(`${code}: ${kind} class ${c} is ${String(k[c])}`);
      if (typeof k.localMayRestrict !== "boolean" || typeof k.localMayAllow !== "boolean") problems.push(`${code}: ${kind} flags missing`);
      if (!text(k.basis)) problems.push(`${code}: ${kind} basis missing`);
    }
  }
  return problems;
}

/** Every problem with a local rule file's shape, empty when it is sound. */
export function localRuleProblems(local: Record<string, LocalWayRules>): string[] {
  const problems: string[] = [];
  for (const [id, j] of Object.entries(local)) {
    for (const kind of LEGAL_KINDS) {
      const places = [j.kinds?.[kind] ? 1 : 0, j.noRuleFound?.[kind] ? 1 : 0, j.notChecked?.includes(kind) ? 1 : 0].reduce((a, b) => a + b, 0);
      if (places !== 1) problems.push(`${id}: ${kind} is accounted for ${places} times`);
      for (const r of j.kinds?.[kind] ?? []) {
        if (!r.classes?.length || !r.classes.every(isClass)) problems.push(`${id}: ${kind} ${r.rule} has bad classes`);
        if (!STATUSES.includes(r.status)) problems.push(`${id}: ${kind} ${r.rule} status ${String(r.status)}`);
        if (!WHERES.includes(r.where)) problems.push(`${id}: ${kind} ${r.rule} where ${String(r.where)}`);
        if (!text(r.quote) || !text(r.citation) || !text(r.source_url)) problems.push(`${id}: ${kind} ${r.rule} lacks its quote, citation or URL`);
      }
    }
    for (const f of j.facilities ?? []) {
      // A place with no name on the map can't be matched by name, so it needs the words that say where it is.
      if (!Array.isArray(f.names) || !f.names.every(text) || (f.names.length === 0 && !text(f.extent))) problems.push(`${id}: facility ${f.id} has no names`);
      if (!f.classes?.length || !f.classes.every(isClass)) problems.push(`${id}: facility ${f.id} has bad classes`);
      if (!STATUSES.includes(f.status)) problems.push(`${id}: facility ${f.id} status ${String(f.status)}`);
      if (!text(f.quote) || !text(f.citation) || !text(f.source_url)) problems.push(`${id}: facility ${f.id} lacks its quote, citation or URL`);
    }
  }
  return problems;
}
