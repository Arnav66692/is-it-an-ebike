// San Diego local layer. Cases come from data/rules/san_diego_local.json.

import { describe, expect, it } from "vitest";
import { classBike, codes, run } from "./helpers";

const ALL_PLACES = [
  "city_of_san_diego",
  "carlsbad",
  "encinitas",
  "solana_beach",
  "del_mar",
  "unincorporated_san_diego_county",
  "sduhsd_campuses",
] as const;

function local(result: ReturnType<typeof run>, id: string) {
  const found = result.local.find((v) => v.id === id);
  if (!found) throw new Error(`no local verdict for ${id}`);
  return found;
}

describe("the demo case: one Class 2 bike, one 11-year-old", () => {
  const r = run("CA", 11, classBike(2), "2026-10-17", [...ALL_PLACES]);
  it("is allowed by the state, with a helmet", () => {
    expect(r.state.status).toBe("yes");
  });
  it("is not allowed in the City of San Diego or Carlsbad (under-12 rule)", () => {
    expect(local(r, "city_of_san_diego").status).toBe("no");
    expect(local(r, "city_of_san_diego").reason.code).toBe("local_under_12");
    expect(local(r, "carlsbad").status).toBe("no");
  });
  it("is allowed in Encinitas, Solana Beach and Del Mar", () => {
    expect(local(r, "encinitas").status).toBe("yes");
    expect(local(r, "solana_beach").status).toBe("yes");
    expect(local(r, "del_mar").status).toBe("yes");
  });
  it("can't be confirmed in unincorporated county, where the power exists but no ordinance was found", () => {
    expect(local(r, "unincorporated_san_diego_county").status).toBe("cant_confirm");
  });
  it("is allowed on SDUHSD campuses with the course, tag and helmet", () => {
    const campus = local(r, "sduhsd_campuses");
    expect(campus.status).toBe("yes");
    expect(codes(campus.requirements)).toEqual(
      expect.arrayContaining(["req_campus_course", "req_campus_tag", "req_campus_helmet"]),
    );
  });
});

describe("local rules by age, class and date", () => {
  it("12-year-olds are allowed in the City of San Diego (the statute says under 12)", () => {
    const r = run("CA", 12, classBike(1), "2026-10-17", ["city_of_san_diego"]);
    expect(local(r, "city_of_san_diego").status).toBe("yes");
    expect(codes(local(r, "city_of_san_diego").notes)).toContain("sd_age_12");
  });
  it("the City rule starts Aug 13, 2026 and the pilot power ends Jan 1, 2029", () => {
    expect(local(run("CA", 11, classBike(1), "2026-08-12", ["city_of_san_diego"]), "city_of_san_diego").status).toBe("yes");
    expect(local(run("CA", 11, classBike(1), "2029-01-01", ["city_of_san_diego"]), "city_of_san_diego").status).toBe("yes");
  });
  it("Class 3 is never allowed on SDUHSD campuses, even at 17", () => {
    const r = run("CA", 17, classBike(3), "2026-10-17", ["sduhsd_campuses"]);
    expect(r.state.status).toBe("yes");
    expect(local(r, "sduhsd_campuses").status).toBe("no");
    expect(local(r, "sduhsd_campuses").reason.code).toBe("campus_class3");
  });
  it("an e-moto with no pedals is not allowed on campus", () => {
    const r = run("CA", 15, classBike(2, { hasPedals: false }), "2026-10-17", ["sduhsd_campuses", "carlsbad"]);
    expect(local(r, "sduhsd_campuses").status).toBe("no");
    expect(local(r, "carlsbad").status).toBe("not_ebike");
    expect(codes(local(r, "carlsbad").notes)).toContain("carlsbad_emoto");
  });
  it("with an unknown class, an 11-year-old is still a no in the City of San Diego", () => {
    const unknown = classBike(2, { classes: [], hasThrottle: null, throttleMph: null, assistMph: null });
    const r = run("CA", 11, unknown, "2026-10-17", ["city_of_san_diego", "encinitas"]);
    expect(local(r, "city_of_san_diego").status).toBe("no");
    expect(local(r, "city_of_san_diego").reason.code).toBe("no_any_class");
    expect(local(r, "encinitas").status).toBe("cant_confirm");
  });
  it("a state follow-up question carries through to local cards", () => {
    const r = run("CA", 14, classBike(2, { motorOver20: null, assistOver28: null, switchable: null }), "2026-10-17", ["encinitas"]);
    expect(local(r, "encinitas").status).toBe("need_info");
  });
});

describe("local notice", () => {
  it("outside California there are no local cards and the notice shows", () => {
    const r = run("TX", 30, classBike(1), "2026-10-17", []);
    expect(r.local).toHaveLength(0);
    expect(r.localNotice).toBe(true);
  });
  it("in California with only the campus picked, the notice still shows", () => {
    expect(run("CA", 15, classBike(1), "2026-10-17", ["sduhsd_campuses"]).localNotice).toBe(true);
  });
  it("in California with a covered town picked, the notice is off", () => {
    expect(run("CA", 15, classBike(1), "2026-10-17", ["encinitas"]).localNotice).toBe(false);
  });
});
