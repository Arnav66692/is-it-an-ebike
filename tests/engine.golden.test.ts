// Hand-picked cases. Each one comes from a line in data/rules/ or the verification report.

import { describe, expect, it } from "vitest";
import { classBike, codes, run } from "./helpers";

describe("never return legal (AK, KY, SC)", () => {
  for (const state of ["AK", "KY", "SC"]) {
    it(`${state} never says yes, even for a plain adult Class 1`, () => {
      const r = run(state, 30, classBike(1));
      expect(r.state.status).toBe("cant_confirm");
      expect(r.state.reason.code).toBe("never_legal");
    });
  }
  it("SC still calls a pedal-less machine not an e-bike", () => {
    expect(run("SC", 30, classBike(1, { hasPedals: false })).state.status).toBe("not_ebike");
  });
});

describe("watt line by state", () => {
  it("750 W passes in an at-most state (CA)", () => {
    expect(run("CA", 30, classBike(2, { ratedWatts: 750 })).state.status).toBe("yes");
  });
  it("750 W can't be confirmed in a less-than state (TX)", () => {
    const r = run("TX", 30, classBike(2, { ratedWatts: 750 }));
    expect(r.state.status).toBe("cant_confirm");
    expect(r.state.reason.code).toBe("watts_750_strict");
  });
  it("over the cap is not an e-bike", () => {
    expect(run("TX", 30, classBike(2, { ratedWatts: 1000 })).state.status).toBe("not_ebike");
    expect(run("CA", 30, classBike(2, { ratedWatts: 1000 })).state.status).toBe("not_ebike");
  });
  it("Vermont treats a 750 W bike as a motor-assisted bicycle", () => {
    const r = run("VT", 30, classBike(2, { ratedWatts: 750 }));
    expect(r.state.status).toBe("not_ebike");
    expect(r.state.reason.code).toBe("vt_motor_assisted_bicycle");
  });
  it("Illinois 750 W is unclear in 2026 and a motor driven cycle from Jan 1, 2027", () => {
    expect(run("IL", 30, classBike(2, { ratedWatts: 750 }), "2026-12-31").state.status).toBe("cant_confirm");
    const after = run("IL", 30, classBike(2, { ratedWatts: 750 }), "2027-01-01");
    expect(after.state.status).toBe("not_ebike");
    expect(after.state.reason.code).toBe("il_motor_driven_cycle");
  });
  it("Nebraska labels from 746 W are unclear because of the 1 bhp clause", () => {
    expect(run("NE", 30, classBike(1, { ratedWatts: 750 })).state.status).toBe("cant_confirm");
    expect(run("NE", 30, classBike(1, { ratedWatts: 745 })).state.status).toBe("yes");
  });
  it("no watt cap in Oregon, DC, Montana or New Jersey Class 1", () => {
    expect(run("OR", 30, classBike(1, { ratedWatts: 1500 })).state.status).toBe("yes");
    expect(run("DC", 30, classBike(1, { ratedWatts: 1500 })).state.status).toBe("yes");
    expect(run("MT", 30, classBike(1, { ratedWatts: 1500 })).state.status).toBe("yes");
    expect(run("NJ", 30, classBike(1, { ratedWatts: 1500 })).state.status).toBe("yes");
  });
  it("never fails a bike on peak watts alone (Aventon Level 3 style 500 W rated, 864 W peak)", () => {
    expect(run("CA", 30, classBike(2, { ratedWatts: 500, peakWatts: 864 })).state.status).toBe("yes");
    const peakOnly = run("CA", 30, classBike(2, { ratedWatts: null, peakWatts: 864 }));
    expect(peakOnly.state.status).toBe("cant_confirm");
    expect(peakOnly.state.reason.code).toBe("watts_peak_only");
  });
  it("a peak figure under the cap proves the rated figure is under it too", () => {
    expect(run("CA", 30, classBike(2, { ratedWatts: null, peakWatts: 700 })).state.status).toBe("yes");
  });
  it("unknown watts can't be confirmed where there is a cap", () => {
    expect(run("CA", 30, classBike(2, { ratedWatts: null })).state.reason.code).toBe("watts_unknown");
  });
});

describe("pedals and class", () => {
  it("no pedals is not an e-bike where pedals are required", () => {
    const r = run("CA", 30, classBike(2, { hasPedals: false }));
    expect(r.state.status).toBe("not_ebike");
    expect(r.state.reason.code).toBe("no_pedals");
  });
  it("Montana's definition doesn't require pedals, so a pedal-less machine is unclear there", () => {
    expect(run("MT", 30, classBike(2, { hasPedals: false })).state.status).toBe("cant_confirm");
  });
  it("unknown pedals can't be confirmed", () => {
    expect(run("CA", 30, classBike(2, { hasPedals: null })).state.reason.code).toBe("pedals_unknown");
  });
  it("a Class 1 or 3 label with a throttle fits no single class", () => {
    expect(run("CA", 30, classBike(1, { hasThrottle: true })).state.reason.code).toBe("class_conflict_throttle");
    expect(run("CA", 30, classBike(3, { hasThrottle: true })).state.reason.code).toBe("class_conflict_throttle");
  });
  it("a Class 2 label with a 28 mph assist speed doesn't match", () => {
    expect(run("CA", 30, classBike(2, { assistMph: 28 })).state.reason.code).toBe("class_conflict_speed");
  });
  it("infers Class 1 only from a complete pedal-assist spec", () => {
    const r = run("CA", 30, classBike(1, { classes: [], hasThrottle: false, assistMph: 20 }));
    expect(r.state.status).toBe("yes");
    expect(r.state.classes).toEqual([1]);
  });
  it("Jasion EB5 style listing, throttle and 28 mph with no class, can't be confirmed", () => {
    const r = run("CA", 30, classBike(2, { classes: [], hasThrottle: true, throttleMph: null, assistMph: null, topSpeedMph: 28 }));
    expect(r.state.status).toBe("cant_confirm");
  });
  it("a stated assist speed above 28 mph fits no class", () => {
    expect(run("CA", 30, classBike(3, { assistMph: 32 })).state.reason.code).toBe("fits_no_class_speed");
  });
});

describe("fast modes and unlock settings", () => {
  it("asks about fast modes before saying yes", () => {
    const r = run("CA", 30, classBike(2, { motorOver20: null, assistOver28: null, switchable: null }));
    expect(r.state.status).toBe("need_info");
    expect(r.state.questions).toContain("fast_mode");
  });
  it("California: a mode over 20 mph on the motor alone is not an e-bike (VC 312.5(d))", () => {
    expect(run("CA", 30, classBike(2, { motorOver20: true })).state.status).toBe("not_ebike");
  });
  it("Delaware: a throttle over 20 mph makes it a moped", () => {
    expect(run("DE", 30, classBike(2, { motorOver20: true })).state.status).toBe("not_ebike");
  });
  it("Texas has no explicit rule, so a fast mode is can't confirm, not a false yes", () => {
    const r = run("TX", 30, classBike(2, { motorOver20: true }));
    expect(r.state.status).toBe("cant_confirm");
    expect(r.state.reason.code).toBe("fits_no_class_mode");
  });
  it("not sure about fast modes blocks a yes where the table names it (CA, WA, UT, CO, CT)", () => {
    for (const state of ["CA", "WA", "CO", "CT"]) {
      const r = run(state, 30, classBike(1, { motorOver20: null, assistOver28: null, switchable: null, unsure: ["fast_mode"] }));
      expect(r.state.status, state).toBe("cant_confirm");
    }
  });
  it("not sure about fast modes only adds a caution where the table doesn't name it (TX)", () => {
    const r = run("TX", 30, classBike(1, { motorOver20: null, assistOver28: null, switchable: null, unsure: ["fast_mode"] }));
    expect(r.state.status).toBe("yes");
    expect(codes(r.state.cautions)).toContain("caution_fast_mode_unverified");
  });
});

describe("caution conditions a label can't show", () => {
  it("Tennessee: wheels under 20 inches are not an e-bike", () => {
    expect(run("TN", 30, classBike(1, { wheelFrontIn: 16, wheelRearIn: 16 })).state.status).toBe("not_ebike");
    expect(run("TN", 30, classBike(1)).state.status).toBe("yes");
  });
  it("Texas: asks for wheel size, and 14 inch wheels are not an e-bike", () => {
    const ask = run("TX", 30, classBike(1, { wheelCount: null, wheelFrontIn: null, wheelRearIn: null }));
    expect(ask.state.status).toBe("need_info");
    expect(ask.state.questions).toContain("wheels");
    expect(run("TX", 30, classBike(1, { wheelFrontIn: 14, wheelRearIn: 14 })).state.status).toBe("not_ebike");
  });
  it("Washington: a 14 inch two-wheeler is not an e-bike, a 20 inch three-wheeler is fine", () => {
    expect(run("WA", 30, classBike(1, { wheelFrontIn: 14, wheelRearIn: 14 })).state.status).toBe("not_ebike");
    expect(run("WA", 30, classBike(1, { wheelCount: 3 })).state.status).toBe("yes");
  });
  it("Alabama: an electric trike is unclear", () => {
    expect(run("AL", 30, classBike(1, { wheelCount: 3 })).state.status).toBe("cant_confirm");
  });
  it("Pennsylvania: over 100 lb is not an e-bike, and an unknown weight blocks a yes", () => {
    expect(run("PA", 30, classBike(1, { weightLb: 120 })).state.status).toBe("not_ebike");
    const unsure = run("PA", 30, classBike(1, { weightLb: null, weightOver100: null, unsure: ["weight"] }));
    expect(unsure.state.status).toBe("cant_confirm");
  });
  it("Utah: foot pegs or a pedal kit are not an e-bike, and Class 2 is unclear", () => {
    expect(run("UT", 30, classBike(1, { hasFootPegs: true })).state.status).toBe("not_ebike");
    expect(run("UT", 30, classBike(1, { needsPedalKit: true })).state.status).toBe("not_ebike");
    expect(run("UT", 30, classBike(2)).state.status).toBe("cant_confirm");
  });
  it("Illinois, Louisiana and Oregon wheel rules found in the verified notes", () => {
    expect(run("IL", 30, classBike(1, { wheelFrontIn: 10, wheelRearIn: 10 })).state.status).toBe("cant_confirm");
    expect(run("LA", 30, classBike(1, { wheelFrontIn: 14, wheelRearIn: 14 })).state.status).toBe("cant_confirm");
    expect(run("OR", 30, classBike(1, { wheelFrontIn: 14, wheelRearIn: 14 })).state.status).toBe("cant_confirm");
  });
});

describe("classes a state doesn't recognize", () => {
  it("Class 3 is not an e-bike in DC, MA, MT and NY", () => {
    for (const state of ["DC", "MA", "MT", "NY"]) {
      const status = run(state, 30, classBike(3)).state.status;
      expect(["not_ebike", "cant_confirm"], state).toContain(status);
      expect(status, state).not.toBe("yes");
    }
  });
  it("New Jersey Class 2 and 3 are motorized bicycles", () => {
    expect(run("NJ", 30, classBike(2)).state.status).toBe("not_ebike");
    expect(run("NJ", 30, classBike(3)).state.status).toBe("not_ebike");
  });
  it("Pennsylvania Class 3 is unclear, never legal", () => {
    expect(run("PA", 30, classBike(3)).state.status).toBe("cant_confirm");
  });
  it("West Virginia Class 3 under 16 is unclear, and fine at 16", () => {
    expect(run("WV", 15, classBike(3)).state.status).toBe("cant_confirm");
    expect(run("WV", 16, classBike(3)).state.status).toBe("yes");
  });
});

describe("ages, supervision and licenses", () => {
  it("California Class 3 needs 16, and a helmet at every age", () => {
    expect(run("CA", 15, classBike(3)).state.status).toBe("no");
    const ok = run("CA", 30, classBike(3));
    expect(ok.state.status).toBe("yes");
    expect(codes(ok.state.requirements)).toContain("req_helmet_all_ages");
  });
  it("California Class 2 at 13 is fine with a helmet", () => {
    const r = run("CA", 13, classBike(2));
    expect(r.state.status).toBe("yes");
    expect(codes(r.state.requirements)).toContain("req_helmet_under");
  });
  it("a rider who is too young gets no even when the class is unknown (New York, 16+)", () => {
    const r = run("NY", 12, classBike(2, { classes: [], hasThrottle: null, throttleMph: null, assistMph: null }));
    expect(r.state.status).toBe("no");
  });
  it("Hawaii Class 2 under 16 is allowed only with direct supervision, and needs registration", () => {
    const r = run("HI", 14, classBike(2));
    expect(r.state.status).toBe("yes");
    expect(codes(r.state.requirements)).toEqual(expect.arrayContaining(["req_supervision", "req_registration"]));
  });
  it("Virginia Class 3 under 14 needs adult supervision", () => {
    const r = run("VA", 12, classBike(3));
    expect(r.state.status).toBe("yes");
    expect(codes(r.state.requirements)).toContain("req_supervision");
  });
  it("New Jersey Class 1 needs 15, then a license and registration", () => {
    expect(run("NJ", 14, classBike(1)).state.status).toBe("no");
    const r = run("NJ", 16, classBike(1));
    expect(r.state.status).toBe("yes");
    expect(codes(r.state.requirements)).toEqual(expect.arrayContaining(["nj_license_by_age", "req_registration"]));
  });
  it("Utah today: 8 to 13 with supervision, under 8 no", () => {
    expect(codes(run("UT", 10, classBike(1)).state.requirements)).toContain("req_supervision");
    const young = run("UT", 6, classBike(1));
    expect(young.state.status).toBe("no");
    expect(young.state.reason.params?.minAge).toBe(8);
  });
});

describe("date switches from pending_changes", () => {
  it("North Carolina Class 3 becomes an e-bike on Dec 1, 2026", () => {
    expect(run("NC", 30, classBike(3), "2026-11-30").state.status).toBe("not_ebike");
    expect(run("NC", 30, classBike(3), "2026-12-01").state.status).toBe("yes");
    const teen = run("NC", 15, classBike(3), "2026-12-01");
    expect(teen.state.status).toBe("yes");
    expect(codes(teen.state.requirements)).toContain("req_helmet_under");
  });
  it("Illinois Class 1 and 2 need age 15 from Jan 1, 2027", () => {
    expect(run("IL", 14, classBike(1), "2026-12-31").state.status).toBe("yes");
    expect(run("IL", 14, classBike(1), "2027-01-01").state.status).toBe("no");
    expect(run("IL", 14, classBike(2), "2027-01-01").state.status).toBe("no");
    expect(run("IL", 15, classBike(2), "2027-01-01").state.status).toBe("yes");
  });
  it("Oregon Class 1 drops to age 14 on Jan 1, 2027, Class 2 stays 16", () => {
    expect(run("OR", 14, classBike(1), "2026-12-31").state.status).toBe("no");
    expect(run("OR", 14, classBike(1), "2027-01-01").state.status).toBe("yes");
    expect(run("OR", 15, classBike(2), "2027-01-01").state.status).toBe("no");
  });
  it("Utah from May 5, 2027: ages 8 to 15 need supervision or a certificate, Class 3 at 15 allowed that way", () => {
    expect(run("UT", 15, classBike(3), "2027-05-04").state.status).toBe("no");
    const after = run("UT", 15, classBike(3), "2027-05-05");
    expect(after.state.status).toBe("yes");
    expect(codes(after.state.requirements)).toContain("req_supervision_or_certificate");
  });
  it("shows upcoming changes after the ride date", () => {
    const r = run("CA", 30, classBike(2), "2026-10-17");
    expect(r.state.notes.some((n) => n.code === "upcoming_change" && n.params?.date === "2027-01-01")).toBe(true);
    const later = run("CA", 30, classBike(2), "2027-02-01");
    expect(later.state.notes.some((n) => n.code === "upcoming_change")).toBe(false);
  });
});

describe("Arnav's stop-pedaling policy (decided Oct 16, 2026)", () => {
  it("adds one caution line to Class 2 yes verdicts in the 18 states", () => {
    const fl = run("FL", 30, classBike(2));
    expect(fl.state.status).toBe("yes");
    expect(codes(fl.state.cautions)).toContain("caution_stop_pedaling_class2");
  });
  it("leaves Class 1 alone and leaves other states alone", () => {
    expect(codes(run("FL", 30, classBike(1)).state.cautions)).not.toContain("caution_stop_pedaling_class2");
    expect(codes(run("CA", 30, classBike(2)).state.cautions)).not.toContain("caution_stop_pedaling_class2");
  });
});
