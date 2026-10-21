// The 13 San Diego County cities added on Oct 20, 2026. Each record was read in enacted code or
// ordinance text and reread by an independent second pass. Cases run through the real engine and
// data. Oct 25, 2026 is inside every horizon: the state rules (checked Oct 16, good through Nov 15)
// and the city records (checked Oct 20, good through Nov 19).

import { describe, expect, it } from "vitest";
import sdJson from "@/data/rules/san_diego_local.json";
import { bottomLine } from "@/lib/rules/bottomLine";
import { PLACE_IDS } from "@/lib/rules/local";
import { renderLine } from "@/lib/i18n/verdicts";
import { placeName } from "@/lib/i18n/names";
import type { PlaceId } from "@/lib/rules/types";
import { classBike, codes, run } from "./helpers";

const DAY = "2026-10-25";

/** Cities with an under-12 ban in force on DAY, and the day it took effect. */
const BAN_IN_FORCE: Partial<Record<PlaceId, string>> = {
  chula_vista: "2025-09-04",
  coronado: "2025-01-02",
  la_mesa: "2026-06-11",
  poway: "2025-11-20",
  san_marcos: "2025-12-10",
  santee: "2026-01-09",
};
/** Cities with no under-12 ban when checked on Oct 20, 2026. */
const NO_BAN: PlaceId[] = ["el_cajon", "imperial_beach", "lemon_grove", "national_city", "oceanside", "vista"];
const NEW_CITIES: PlaceId[] = [...(Object.keys(BAN_IN_FORCE) as PlaceId[]), "escondido", ...NO_BAN];

interface CityRecord {
  id: string;
  verification_level: string;
  checked_through: string;
  local_age_limits: { rule: string; effective_date: string | null; ends?: string | null; source_type: string; quote: string | null }[];
  primary_sources: unknown[];
}
const RECORDS = (sdJson as unknown as { jurisdictions: CityRecord[] }).jurisdictions;
const recordOf = (id: string): CityRecord => {
  const found = RECORDS.find((j) => j.id === id);
  if (!found) throw new Error(`no record for ${id}`);
  return found;
};

function card(place: PlaceId, age: number, cls: 1 | 2 | 3, date = DAY, over = {}) {
  const r = run("CA", age, classBike(cls, over), date, [place]);
  const found = r.local.find((v) => v.id === place);
  if (!found) throw new Error(`no card for ${place}`);
  return found;
}

describe("the 13 new city records", () => {
  it("are all places the app offers, each checked on Oct 20, 2026 and read in enacted text", () => {
    for (const id of NEW_CITIES) {
      expect(PLACE_IDS, id).toContain(id);
      const rec = recordOf(id);
      expect(rec.verification_level, id).toBe("primary_verified");
      expect(rec.checked_through, id).toBe("2026-10-20");
      expect(rec.primary_sources.length, id).toBeGreaterThan(0);
    }
    expect(NEW_CITIES).toHaveLength(13);
  });

  it("rest every under-12 finding on ordinance text, with a quote for each ban", () => {
    for (const id of NEW_CITIES) {
      const age = recordOf(id).local_age_limits;
      expect(age, id).toHaveLength(1);
      expect(age[0].source_type, id).toBe("ordinance_text");
      if (age[0].rule === "under_12_ban") expect(age[0].quote, id).toMatch(/under (the age of )?(12|twelve)/);
      else expect(age[0].rule, id).toBe("no_local_age_limit_found");
    }
  });

  it("have a name in English and Spanish", () => {
    for (const id of NEW_CITIES) {
      expect(placeName(id, "en"), id).not.toBe(id);
      expect(placeName(id, "es"), id).not.toBe(id);
    }
  });
});

describe("an 11-year-old on a Class 2 in each new city", () => {
  for (const [place, since] of Object.entries(BAN_IN_FORCE) as [PlaceId, string][]) {
    it(`is not allowed in ${place}, under its under-12 ban since ${since}`, () => {
      const c = card(place, 11, 2);
      expect(c.status).toBe("no");
      expect(c.reason.code).toBe("local_under_12");
      expect(c.reason.params?.since).toBe(since);
      const bl = bottomLine(run("CA", 11, classBike(2), DAY, [place]), DAY);
      expect(bl.kind).toBe("no_illegal");
    });
  }

  for (const place of NO_BAN) {
    it(`is allowed in ${place}, which had no ban when checked, and the bottom line is YES`, () => {
      const c = card(place, 11, 2);
      expect(c.status).toBe("yes");
      expect(codes(c.notes)).toContain("city_no_age_limit");
      const bl = bottomLine(run("CA", 11, classBike(2), DAY, [place]), DAY);
      expect(bl.kind).toBe("yes");
    });

    it(`can't be confirmed in ${place} past Nov 19, 2026, 30 days after the check`, () => {
      expect(card(place, 11, 2, "2026-11-19").status).toBe("yes");
      const late = card(place, 11, 2, "2026-11-20");
      expect(late.status).toBe("cant_confirm");
      expect(late.reason.code).toBe("local_under_12_after_check");
    });
  }

  it("can't be confirmed in Escondido before Nov 15, 2026, and is not allowed from then on", () => {
    const early = card("escondido", 11, 2);
    expect(early.status).toBe("cant_confirm");
    expect(early.reason.code).toBe("local_under_12_start_unclear");
    expect(early.reason.params).toMatchObject({ from: "2026-10-16", since: "2026-11-15" });
    expect(bottomLine(run("CA", 11, classBike(2), DAY, ["escondido"]), DAY).kind).toBe("no_unconfirmed");
    expect(card("escondido", 11, 2, "2026-11-14").status).toBe("cant_confirm");
    const on = card("escondido", 11, 2, "2026-11-15");
    expect(on.status).toBe("no");
    expect(on.reason.code).toBe("local_under_12");
  });
});

describe("other riders in the new cities", () => {
  it("lets a 12-year-old ride Class 1 or 2 in every ban city, and says the ban covers only under 12", () => {
    for (const place of [...(Object.keys(BAN_IN_FORCE) as PlaceId[]), "escondido" as PlaceId]) {
      for (const cls of [1, 2] as const) {
        const c = card(place, 12, cls, "2026-11-16");
        expect(c.status, `${place} class ${cls}`).toBe("yes");
        expect(codes(c.notes), place).toContain("city_age_12");
      }
    }
  });

  it("keeps state law for a Class 3: no under 16, yes at 16 with a helmet", () => {
    for (const place of NEW_CITIES) {
      expect(card(place, 15, 3).status, place).toBe("no");
      expect(card(place, 16, 3).status, place).toBe("yes");
    }
  });

  it("warns about under-12 passengers where the city text says 'operate or ride'", () => {
    const passengerCities: [PlaceId, string][] = [
      ["chula_vista", "cv_under_12_passengers"],
      ["coronado", "cor_under_12_passengers"],
      ["poway", "poway_under_12_passengers"],
      ["santee", "santee_under_12_passengers"],
      ["escondido", "esc_under_12_passengers"],
    ];
    for (const [place, note] of passengerCities) expect(codes(card(place, 30, 2).notes), place).toContain(note);
    // La Mesa and San Marcos ban operating only.
    expect(codes(card("la_mesa", 30, 2).notes).join(" ")).not.toMatch(/passengers/);
    expect(codes(card("san_marcos", 30, 2).notes).join(" ")).not.toMatch(/passengers/);
  });

  it("tells a 15-year-old in Chula Vista or Poway they can't carry a passenger, and not an adult", () => {
    expect(codes(card("chula_vista", 15, 1).notes)).toContain("cv_no_passengers_under_18");
    expect(codes(card("poway", 15, 1).notes)).toContain("poway_no_passengers_under_18");
    expect(codes(card("chula_vista", 30, 1).notes)).not.toContain("cv_no_passengers_under_18");
  });

  it("shows Escondido's sidewalk ban as starting Nov 15 before then, and as in force after", () => {
    expect(codes(card("escondido", 30, 1).notes)).toContain("esc_sidewalks_soon");
    const after = codes(card("escondido", 30, 1, "2026-11-16").notes);
    expect(after).toContain("esc_sidewalks");
    expect(after).not.toContain("esc_sidewalks_soon");
  });

  it("names El Cajon's park ban and Coronado's sidewalk ban for an adult on a Class 1", () => {
    expect(codes(card("el_cajon", 30, 1).notes)).toContain("ec_parks");
    expect(codes(card("coronado", 30, 1).notes)).toContain("cor_sidewalks");
  });

  it("says a machine with no pedals is not an e-bike in every new city, with a city or state e-moto note", () => {
    for (const place of NEW_CITIES) {
      const c = card(place, 30, 2, DAY, { hasPedals: false });
      expect(c.status, place).toBe("not_ebike");
      expect(c.notes.length, place).toBeGreaterThan(0);
    }
    expect(codes(card("la_mesa", 30, 2, DAY, { hasPedals: false }).notes)).toContain("lm_emoto");
  });
});

describe("after the state power ends on Jan 1, 2029", () => {
  it("never says yes for an under-12 rider in a new city", () => {
    for (const place of NEW_CITIES) {
      expect(card(place, 11, 2, "2029-01-02").status, place).not.toBe("yes");
    }
  });

  it("says a ban with no end date in its text can't be confirmed, not repealed", () => {
    expect(recordOf("poway").local_age_limits[0].ends).toBeNull();
    expect(recordOf("san_marcos").local_age_limits[0].ends).toBeNull();
    expect(card("poway", 11, 2, "2029-01-02").reason.code).toBe("local_under_12_no_end");
    expect(card("san_marcos", 11, 2, "2029-01-02").reason.code).toBe("local_under_12_no_end");
  });
});

describe("city notes render in both languages", () => {
  it("never shows a raw code, an em dash or a semicolon", () => {
    for (const place of NEW_CITIES) {
      for (const [age, cls, date, over] of [
        [11, 2, DAY, {}],
        [15, 3, DAY, {}],
        [30, 1, "2026-11-16", {}],
        [30, 2, DAY, { hasPedals: false }],
        [30, 2, DAY, { motorOver20: true }],
      ] as const) {
        const c = card(place, age, cls, date, over);
        for (const line of [c.reason, ...c.requirements, ...c.notes]) {
          for (const lang of ["en", "es"] as const) {
            const text = renderLine(line, lang, "California");
            expect(text, `${place} ${line.code}`).not.toMatch(/[a-z]+_[a-z_]+/);
            expect(text, `${place} ${line.code}`).not.toMatch(/[—;]/);
          }
        }
      }
    }
  });
});
