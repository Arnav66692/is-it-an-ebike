// Checks on the San Diego records themselves: what the app shows as a source label, dates that
// must agree, and end dates that must be a decision per place.

import { describe, expect, it } from "vitest";
import sdJson from "@/data/rules/san_diego_local.json";
import { isUiKey } from "@/lib/i18n/ui";

interface Rule {
  rule: string;
  citation: string;
  source_url: string;
  quote: string | null;
  effective_date: string | null;
  source_type: string;
  ends?: string | null;
  notes?: string;
  citations_from_citation?: string;
  amended_by?: { bill: string; source_url: string };
}
interface Place {
  id: string;
  [group: string]: unknown;
}

const SD = sdJson as unknown as { statewide_baseline: Rule[]; jurisdictions: Place[] };
const GROUPS = ["local_age_limits", "campus_class_limits", "tag_and_course_requirements", "helmet_rules", "emoto_enforcement", "other_local_rules"];
const rulesOf = (p: Place): Rule[] => GROUPS.flatMap((g) => (p[g] as Rule[] | undefined) ?? []);
const all: [string, Rule][] = [
  ...SD.statewide_baseline.map((r): [string, Rule] => ["baseline", r]),
  ...SD.jurisdictions.flatMap((p) => rulesOf(p).map((r): [string, Rule] => [p.id, r])),
];
const find = (place: string, rule: string): Rule => {
  const found = all.find(([p, r]) => p === place && r.rule === rule);
  if (!found) throw new Error(`no ${place}.${rule}`);
  return found[1];
};

describe("source labels the app shows", () => {
  const labels = all.flatMap(([place, r]) => [
    [`${place}.${r.rule}`, r.citation],
    ...(r.citations_from_citation ? [[`${place}.${r.rule} (citations from)`, r.citations_from_citation]] : []),
  ]);

  it("read as short legal cites in Arnav's style, with no semicolons, em dashes or notes in parentheses", () => {
    for (const [where, label] of labels) {
      expect(label, where).not.toMatch(/[;—]/);
      expect(label, where).not.toMatch(/\b(see|eff\.|effective|adopted|per)\b/i);
      // A parenthesis may hold a subsection like (b) or (iv), or a document name, but not lowercase prose.
      expect(label, where).not.toMatch(/\((?![a-z]\)|[ivx]+\))[a-z]/);
      expect(label.length, where).toBeLessThanOrEqual(100);
    }
  });

  it("have a label in both languages for every kind of source", () => {
    for (const [where, r] of all) expect(isUiKey(`source_${r.source_type}`), `${where} ${r.source_type}`).toBe(true);
  });
});

describe("record facts the review corrected", () => {
  it("gives every adopted under-12 ban an explicit end date or an explicit none", () => {
    const bans = all.filter(([, r]) => r.rule === "under_12_ban");
    expect(bans.length).toBeGreaterThan(0);
    for (const [place, r] of bans) expect(r.ends === null || typeof r.ends === "string", place).toBe(true);
    expect(find("city_of_san_diego", "under_12_ban").ends).toBe("2029-01-01");
    expect(find("carlsbad", "under_12_ban").ends).toBeNull();
  });

  it("gives the same sentence from the same page the same date within a place", () => {
    for (const place of SD.jurisdictions) {
      const seen = new Map<string, Rule>();
      for (const r of rulesOf(place)) {
        if (!r.quote) continue;
        const key = `${r.source_url}|${r.quote}`;
        const first = seen.get(key);
        if (first) expect(r.effective_date, `${place.id}.${r.rule} vs ${first.rule}`).toBe(first.effective_date);
        else seen.set(key, r);
      }
    }
  });

  it("cites the Encinitas staff report as a staff report, not as code text", () => {
    const r = find("encinitas", "no_local_age_limit_found");
    expect(r.source_type).toBe("staff_report");
    expect(r.source_url).toContain("encinitas.granicus.com");
  });

  it("labels Carlsbad's park resolution as a packet draft with no effective date", () => {
    const r = find("carlsbad", "park_ban");
    expect(r.source_type).toBe("packet_draft");
    expect(r.effective_date).toBeNull();
  });

  it("dates Carlsbad's passenger ban as older than CS-509", () => {
    expect(find("carlsbad", "passengers_only_on_passenger_bikes").effective_date).toBeNull();
  });

  it("cites the city flier for Carlsbad's Class 3 trail statement", () => {
    const r = find("carlsbad", "class3_trails_city_flier");
    expect(r.source_type).toBe("official_page");
    expect(r.source_url).toContain("showpublisheddocument/25500");
    expect(find("carlsbad", "under_12_ban").notes).not.toContain("news post");
  });

  it("says SB 1167 amends VC 23135 and 22651.08, with the bill text linked", () => {
    const r = find("baseline", "emoto_removal");
    expect(r.notes).not.toMatch(/adds VC 23135/);
    expect(r.notes).toContain("amends VC 23135");
    expect(r.amended_by?.source_url).toContain("SB1167");
  });
});
