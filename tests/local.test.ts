// San Diego local layer. Cases come from data/rules/san_diego_local.json.

import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { jurisdiction, under12CheckedThrough } from "@/lib/rules/local";
import { renderLine } from "@/lib/i18n/verdicts";
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
  it("is allowed in unincorporated county, which has adopted no under-12 ban (checked Oct 19, 2026)", () => {
    const county = local(r, "unincorporated_san_diego_county");
    expect(county.status).toBe("yes");
    expect(codes(county.notes)).toContain("county_no_ordinance");
    expect(county.notes.find((n) => n.code === "county_no_ordinance")?.params?.date).toBe("2026-10-19");
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
  it("the City rule starts Aug 13, 2026, and after its Jan 1, 2029 end an under-12 answer can't be confirmed", () => {
    expect(local(run("CA", 11, classBike(1), "2026-08-12", ["city_of_san_diego"]), "city_of_san_diego").status).toBe("yes");
    // The ordinance ends with VC 21214.7, unless the state extends that sunset. That is past what
    // the Oct 19, 2026 check can vouch for, so it is can't confirm, never yes.
    const after = local(run("CA", 11, classBike(1), "2029-01-01", ["city_of_san_diego"]), "city_of_san_diego");
    expect(after.status).toBe("cant_confirm");
    expect(after.reason.code).toBe("local_under_12_after_check");
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

describe("rules read in enacted text on Oct 19, 2026", () => {
  it("every place except SDUHSD is primary_verified, and SDUHSD is primary_partial", () => {
    const r = run("CA", 30, classBike(1), "2026-10-19", [...ALL_PLACES]);
    for (const v of r.local) {
      expect(v.level, v.id).toBe(v.id === "sduhsd_campuses" ? "primary_partial" : "primary_verified");
    }
  });
  it("the City under-12 ban cites SDMC 84.19 and the enacted ordinance text", () => {
    const r = run("CA", 11, classBike(2), "2026-10-19", ["city_of_san_diego"]);
    const source = local(r, "city_of_san_diego").reason.source;
    expect(source?.citation).toContain("84.19");
    expect(source?.kind).toBe("ordinance_text");
  });
  it("a 12-year-old in the City gets the SDMC 84.19 note, with its source", () => {
    const note = local(run("CA", 12, classBike(1), "2026-10-19", ["city_of_san_diego"]), "city_of_san_diego").notes.find(
      (n) => n.code === "sd_age_12",
    );
    expect(note?.source?.citation).toContain("84.19");
  });
  it("the City warning period cites SDMC 84.20(a) and the City release for the date", () => {
    const note = local(run("CA", 11, classBike(1), "2026-09-01", ["city_of_san_diego"]), "city_of_san_diego").notes.find(
      (n) => n.code === "sd_warning_period",
    );
    expect(note?.params?.from).toBe("2026-10-12");
    expect(note?.source?.citation).toContain("84.20(a)");
    expect(note?.source?.kind).toBe("press_release");
  });
  it("City cards a rider may use name the sidewalk, park and boardwalk limits", () => {
    const sd = local(run("CA", 14, classBike(1), "2026-10-19", ["city_of_san_diego"]), "city_of_san_diego");
    expect(codes(sd.notes)).toEqual(expect.arrayContaining(["sd_sidewalks", "sd_parks", "sd_boardwalks", "sd_passengers"]));
  });
  it("Carlsbad warns that under-12 passengers are barred too, and notes the disability exemption on a no", () => {
    const carlsbad = local(run("CA", 11, classBike(2), "2026-10-19", ["carlsbad"]), "carlsbad");
    expect(carlsbad.status).toBe("no");
    expect(codes(carlsbad.notes)).toEqual(expect.arrayContaining(["carlsbad_under_12_passengers", "carlsbad_disability"]));
  });
  it("Carlsbad, Encinitas, Solana Beach, Del Mar and the county name their sidewalk rules", () => {
    const r = run("CA", 14, classBike(1), "2026-10-19", [...ALL_PLACES]);
    expect(codes(local(r, "carlsbad").notes)).toContain("carlsbad_sidewalks");
    expect(codes(local(r, "encinitas").notes)).toContain("encinitas_sidewalks");
    expect(codes(local(r, "solana_beach").notes)).toContain("solana_sidewalks");
    expect(codes(local(r, "del_mar").notes)).toEqual(expect.arrayContaining(["del_mar_bans", "del_mar_beaches"]));
    expect(codes(local(r, "unincorporated_san_diego_county").notes)).toContain("county_sidewalks");
  });
  it("SDUHSD bars Class 3 from the first day of school, Aug 11, 2026, not only after the tag grace period", () => {
    expect(local(run("CA", 17, classBike(3), "2026-08-11", ["sduhsd_campuses"]), "sduhsd_campuses").status).toBe("no");
    expect(local(run("CA", 17, classBike(3), "2026-08-27", ["sduhsd_campuses"]), "sduhsd_campuses").status).toBe("no");
  });
  it("the SDUHSD helmet rule cites AR 5142 as a district regulation", () => {
    const campus = local(run("CA", 15, classBike(1), "2026-10-19", ["sduhsd_campuses"]), "sduhsd_campuses");
    const helmet = campus.requirements.find((l) => l.code === "req_campus_helmet");
    expect(helmet?.source?.citation).toContain("5142");
    expect(helmet?.source?.kind).toBe("administrative_regulation");
  });
});

describe("review fixes to local notes and sources (Oct 19, 2026)", () => {
  it("a Class 3 under 12 is barred by state law, so Carlsbad's disability note and the City's fine waiver don't show", () => {
    const r = run("CA", 11, classBike(3), "2026-10-19", ["carlsbad", "city_of_san_diego"]);
    expect(local(r, "carlsbad").reason.code).toBe("under_min_age");
    expect(codes(local(r, "carlsbad").notes)).not.toContain("carlsbad_disability");
    expect(codes(local(r, "city_of_san_diego").notes)).not.toContain("sd_course_in_lieu");
  });
  it("before citations start, a Class 3 under 12 gets no City warnings-only note", () => {
    const sd = local(run("CA", 11, classBike(3), "2026-09-01", ["city_of_san_diego"]), "city_of_san_diego");
    expect(codes(sd.notes)).not.toContain("sd_warning_period");
  });
  it("an unknown class under 12 is barred partly by state law, so local relief notes don't show", () => {
    const unknown = classBike(1, { classes: [], hasThrottle: false, assistMph: null });
    const r = run("CA", 11, unknown, "2026-10-19", ["carlsbad", "city_of_san_diego"]);
    expect(local(r, "carlsbad").reason.code).toBe("no_any_class");
    expect(codes(local(r, "carlsbad").notes)).not.toContain("carlsbad_disability");
    expect(codes(local(r, "city_of_san_diego").notes)).not.toContain("sd_course_in_lieu");
  });
  it("the City fine waiver still shows when the local ban is the only reason", () => {
    const sd = local(run("CA", 11, classBike(2), "2026-10-19", ["city_of_san_diego"]), "city_of_san_diego");
    expect(codes(sd.notes)).toContain("sd_course_in_lieu");
  });
  it("Carlsbad's Class 3 trail note cites the city flier, and the code note cites CMC 11.32", () => {
    const carlsbad = local(run("CA", 16, classBike(3), "2026-10-19", ["carlsbad"]), "carlsbad");
    const flier = carlsbad.notes.find((n) => n.code === "carlsbad_class3_trails");
    expect(flier?.source?.kind).toBe("official_page");
    expect(flier?.source?.url).toContain("showpublisheddocument/25500");
    const code = carlsbad.notes.find((n) => n.code === "carlsbad_class3_paths");
    expect(code?.source?.citation).toContain("11.32.030");
    expect(carlsbad.sources.some((s) => s.url?.includes("25500"))).toBe(true);
  });
  it("Encinitas's no-age-limit note cites the Aug 19 staff report as a staff report, not as ordinance text", () => {
    const enc = local(run("CA", 15, classBike(1), "2026-10-19", ["encinitas"]), "encinitas");
    const note = enc.notes.find((n) => n.code === "encinitas_no_age_limit");
    expect(note?.source?.kind).toBe("staff_report");
    expect(note?.source?.url).toContain("encinitas.granicus.com");
    expect(note?.source?.quote).toContain("consistent with those cities");
  });
  it("Carlsbad's park ban is labeled a packet draft with no effective date, and the passenger rule predates CS-509", () => {
    const carlsbad = local(run("CA", 15, classBike(1), "2026-10-19", ["carlsbad"]), "carlsbad");
    const park = carlsbad.notes.find((n) => n.code === "carlsbad_parks");
    expect(park?.source?.kind).toBe("packet_draft");
    expect(park?.source?.effective).toBeNull();
    const passengers = carlsbad.notes.find((n) => n.code === "carlsbad_passengers");
    expect(passengers?.source?.effective).toBeNull();
  });
});

describe("second review fixes: how far ahead a local under-12 answer holds (Oct 19, 2026)", () => {
  const NO_BAN = ["encinitas", "solana_beach", "del_mar", "unincorporated_san_diego_county"] as const;

  it("a place that had no under-12 ban when checked can't vouch for a ride two years out", () => {
    for (const place of NO_BAN) {
      const result = evaluate({ state: "CA", riderAge: 10, rideDate: "2028-06-01", facts: classBike(1), places: [place] });
      const card = local(result, place);
      expect(card.status, place).toBe("cant_confirm");
      expect(card.reason.code, place).toBe("local_under_12_after_check");
      expect(card.reason.params, place).toMatchObject({ checked: "2026-10-19", through: "2026-11-18" });
      expect(bottomLine(result, "2028-06-01").kind, place).toBe("no_unconfirmed");
    }
  });

  it("holds through 30 days after the check, the time a new ordinance needs to take effect, and not a day more", () => {
    expect(under12CheckedThrough(jurisdiction("encinitas"))).toBe("2026-11-18");
    for (const place of NO_BAN) {
      expect(local(run("CA", 10, classBike(2), "2026-11-18", [place]), place).status, place).toBe("yes");
      expect(local(run("CA", 10, classBike(2), "2026-11-19", [place]), place).status, place).toBe("cant_confirm");
    }
  });

  it("the City of San Diego after its ban's Jan 1, 2029 end is NO, can't confirm, not YES", () => {
    const result = evaluate({ state: "CA", riderAge: 10, rideDate: "2029-06-01", facts: classBike(1), places: ["city_of_san_diego"] });
    expect(local(result, "city_of_san_diego").reason.code).toBe("local_under_12_after_check");
    expect(local(result, "city_of_san_diego").reason.source?.citation).toContain("84.19");
    expect(bottomLine(result, "2029-06-01").kind).toBe("no_unconfirmed");
  });

  it("a ban in force still says no past the horizon, and Carlsbad keeps its no-end-date reason", () => {
    expect(local(run("CA", 10, classBike(1), "2027-06-01", ["city_of_san_diego"]), "city_of_san_diego").reason.code).toBe("local_under_12");
    expect(local(run("CA", 10, classBike(1), "2029-06-01", ["carlsbad"]), "carlsbad").reason.code).toBe("local_under_12_no_end");
  });

  it("only touches riders under 12 on Class 1 or 2", () => {
    expect(local(run("CA", 12, classBike(1), "2028-06-01", ["encinitas"]), "encinitas").status).toBe("yes");
    expect(local(run("CA", 16, classBike(3), "2028-06-01", ["encinitas"]), "encinitas").status).toBe("yes");
    expect(local(run("CA", 11, classBike(3), "2028-06-01", ["encinitas"]), "encinitas").reason.code).toBe("under_min_age");
  });

  it("the County note says state law lets it adopt a ban only while that power exists", () => {
    const before = run("CA", 11, classBike(2), "2026-10-19", ["unincorporated_san_diego_county", "carlsbad"]);
    expect(codes(local(before, "unincorporated_san_diego_county").notes)).toContain("county_no_ordinance");
    const after = run("CA", 11, classBike(2), "2029-03-01", ["unincorporated_san_diego_county", "carlsbad"]);
    expect(codes(local(after, "unincorporated_san_diego_county").notes)).not.toContain("county_no_ordinance");
    expect(local(after, "carlsbad").reason.code).toBe("local_under_12_no_end");
  });

  it("names the check date and the last vouched date in both languages", () => {
    const line = local(run("CA", 10, classBike(1), "2028-06-01", ["del_mar"]), "del_mar").reason;
    expect(renderLine(line, "en", "California")).toContain("Oct 19, 2026");
    expect(renderLine(line, "en", "California")).toContain("Nov 18, 2026");
    expect(renderLine(line, "es", "California")).toContain("18 de noviembre de 2026");
  });
});

describe("second review fixes: the Del Mar beach note (Oct 19, 2026)", () => {
  it("presents DMMC 8.04.020 as unsettled for e-bikes, as the record and its sources do", () => {
    const note = local(run("CA", 30, classBike(1), "2026-10-19", ["del_mar"]), "del_mar").notes.find((n) => n.code === "del_mar_beaches");
    expect(note?.source?.citation).toBe("DMMC 8.04.020");
    const en = renderLine({ code: "del_mar_beaches" }, "en", "California");
    const es = renderLine({ code: "del_mar_beaches" }, "es", "California");
    expect(en).not.toMatch(/treat e-bike riding on city beaches as illegal/);
    expect(en).toContain("isn't settled whether that covers e-bikes");
    expect(es).not.toMatch(/tratan como ilegal/);
    expect(es).toContain("no está resuelto si eso incluye las bicicletas eléctricas");
  });
});
