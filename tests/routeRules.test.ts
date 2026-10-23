// The where-you-ride rules the route check ships (data/rules/route/), checked against the verified
// sources they were derived from: the state table's where_allowed and local_authority text, and the
// San Diego records' other_local_rules. A rule that doesn't quote its source word for word fails.

import { describe, expect, it } from "vitest";
import statesTable from "@/data/rules/all_states.normalized.json";
import sdTable from "@/data/rules/san_diego_local.json";
import { ROUTE_RULES } from "@/lib/route/ruleData";
import { LEGAL_KINDS, localRuleProblems, stateRuleProblems } from "@/lib/route/rules";
import { PLACE_IDS, STATE_CODES } from "@/lib/rules";

type Raw = Record<string, Record<string, unknown>>;
const STATES = statesTable as unknown as Raw;
const SD = (sdTable as unknown as { jurisdictions: { id: string; other_local_rules: { quote: string }[]; primary_sources?: { quote?: string }[] }[] }).jurisdictions;

/** The text of a field named like "where_allowed.paths_trails", as one string. */
function fieldText(code: string, field: string): string {
  const [top, key] = field.split(".");
  const value = (STATES[code]?.[top] as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

describe("the state where-you-ride rules", () => {
  it("cover every state and DC, with every kind and class, in a sound shape", () => {
    expect(Object.keys(ROUTE_RULES.states).sort()).toEqual([...STATE_CODES].sort());
    expect(stateRuleProblems(ROUTE_RULES.states)).toEqual([]);
  });

  it("quote the verified state table word for word for every kind", () => {
    const misses: string[] = [];
    for (const [code, s] of Object.entries(ROUTE_RULES.states)) {
      for (const kind of LEGAL_KINDS) {
        const k = s.kinds[kind];
        if (!fieldText(code, k.field).includes(k.basis)) misses.push(`${code} ${kind} (${k.field})`);
      }
    }
    expect(misses).toEqual([]);
  });

  it("match California's verified text: no state path ban since AB 1909, and locals may restrict paths and sidewalks", () => {
    const ca = ROUTE_RULES.states.CA.kinds;
    for (const kind of ["road", "bike_lane", "bike_path", "sidewalk"] as const) {
      expect([ca[kind]["1"], ca[kind]["2"], ca[kind]["3"]], kind).toEqual(["allowed", "allowed", "allowed"]);
    }
    expect(ca.bike_path.localMayRestrict).toBe(true);
    expect(ca.sidewalk.localMayRestrict).toBe(true);
  });
});

describe("the San Diego County where-you-ride rules", () => {
  const ids = Object.keys(ROUTE_RULES.local).sort();

  it("cover all 18 cities and the unincorporated county, in a sound shape", () => {
    expect(ids).toEqual(PLACE_IDS.filter((p) => p !== "sduhsd_campuses").sort());
    expect(localRuleProblems(ROUTE_RULES.local)).toEqual([]);
  });

  it("quote each record word for word when a rule comes from the verified record", () => {
    const misses: string[] = [];
    for (const [id, j] of Object.entries(ROUTE_RULES.local)) {
      const record = SD.find((r) => r.id === id);
      const quotes = [...(record?.other_local_rules ?? []).map((r) => r.quote), ...(record?.primary_sources ?? []).map((s) => s.quote ?? "")];
      const rules = [...Object.values(j.kinds).flat(), ...j.facilities].filter((r) => r && r.from === "record");
      for (const r of rules) if (r && !quotes.some((q) => q.includes(r.quote))) misses.push(`${id} ${r.rule}`);
    }
    expect(misses).toEqual([]);
  });

  it("give every new reading an https source and a check date", () => {
    const bad: string[] = [];
    for (const [id, j] of Object.entries(ROUTE_RULES.local)) {
      for (const r of [...Object.values(j.kinds).flat(), ...j.facilities]) {
        if (r && r.from === "new_reading" && (!/^https:\/\//.test(r.source_url) || !/^\d{4}-\d{2}-\d{2}$/.test(r.checked))) bad.push(`${id} ${r.rule}`);
      }
      for (const [kind, n] of Object.entries(j.noRuleFound)) if (n && !/^https:\/\//.test(n.source_url)) bad.push(`${id} noRuleFound ${kind}`);
    }
    expect(bad).toEqual([]);
  });

  it("keep the verified boardwalk ban in the City of San Diego and Encinitas's business-district sidewalk ban", () => {
    const sd = ROUTE_RULES.local.city_of_san_diego;
    expect(sd.facilities.some((f) => f.names.includes("Ocean Front Walk") && f.status === "banned" && f.citation.includes("84.18"))).toBe(true);
    const enc = ROUTE_RULES.local.encinitas.kinds.sidewalk ?? [];
    expect(enc.some((r) => r.status === "banned" && r.where === "business_district" && r.citation.includes("14.56.020"))).toBe(true);
  });
});
