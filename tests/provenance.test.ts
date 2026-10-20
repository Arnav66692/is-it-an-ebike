// Facts read from a link or photo stay "not checked" until the family checks each one against the
// bike, and the bottom line can't say YES before then. Runs the pure pieces the checker uses.

import { describe, expect, it } from "vitest";
import { withFootPegs, withWeight, withWheelSize } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import { parseSpecText } from "@/lib/extract/parse";
import {
  checkCounts,
  emptyChecked,
  fromRead,
  hasValue,
  unconfirmedFields,
  withConfirmed,
  withEdit,
  withPedalCall,
  type CheckedFacts,
} from "@/lib/provenance";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, READ_FIELDS, type BikeFacts, type PlaceId, type ReadField } from "@/lib/rules/types";
import { READ_FIELD_NAMES, readFieldList, renderLine } from "@/lib/i18n/verdicts";
import { brief, classBike } from "./helpers";

const DAY = "2026-10-19";

/** A listing for a plain Class 2 kids' e-bike, the kind a family pastes in. */
const CLASS_2_LISTING =
  "Class 2 electric bike with pedals. 500W rated motor. Thumb throttle up to 20 mph. Pedal assist up to 20 mph. 20 x 4.0 tires. Weight 62 lbs with battery.";

function read(text: string): CheckedFacts {
  return fromRead(factsFromExtraction(parseSpecText(text, "listing"), emptyFacts()));
}

function answer(state: string, age: number, bike: CheckedFacts, places: PlaceId[]) {
  const result = evaluate({ state, riderAge: age, rideDate: DAY, facts: bike.facts, places });
  return bottomLine(result, DAY, unconfirmedFields(bike.checks));
}

function confirmAll(bike: CheckedFacts, fields: readonly ReadField[] = READ_FIELDS): CheckedFacts {
  return fields.reduce((b, f) => withConfirmed(b, f, true), bike);
}

describe("where each fact came from", () => {
  it("marks every value a link gave as read and not checked, and nothing it didn't give", () => {
    const bike = read(CLASS_2_LISTING);
    expect(unconfirmedFields(bike.checks)).toEqual(["hasPedals", "classes", "ratedWatts", "hasThrottle", "throttleMph", "assistMph", "wheelSize", "weightLb"]);
    for (const field of READ_FIELDS) {
      expect(bike.checks[field] !== undefined, field).toBe(hasValue(bike.facts, field));
      if (bike.checks[field]) expect(brief(bike.checks[field])).toEqual({ source: "text", status: "unchecked" });
      // Each check keeps the facts as read, so a value put back to the read one is as read again.
      if (bike.checks[field]) expect(bike.checks[field]?.asRead).toBe(bike.facts);
    }
    expect(checkCounts(bike.checks)).toEqual({ read: 8, confirmed: 0 });
  });

  it("counts every field a reader can fill, a wheel size from either wheel, and a class only when one is given", () => {
    const full: BikeFacts = { ...classBike(2), peakWatts: 900, wattsUpTo: 750, topSpeedMph: 20, switchable: true, hasFootPegs: false };
    expect(unconfirmedFields(fromRead(full).checks)).toEqual([...READ_FIELDS]);
    expect(unconfirmedFields(fromRead({ ...emptyFacts(), wheelRearIn: 16 }).checks)).toEqual(["wheelSize"]);
    expect(unconfirmedFields(fromRead({ ...emptyFacts(), classes: [] }).checks)).toEqual([]);
    // Follow-up answers are the family's own, never read.
    expect(unconfirmedFields(fromRead({ ...emptyFacts(), motorOver20: false, assistOver28: false, weightOver100: false, needsPedalKit: false }).checks)).toEqual([]);
  });

  it("starts with nothing to check, and typed facts are the family's own", () => {
    const typed = withEdit(emptyChecked(), classBike(2));
    expect(typed.checks).toEqual({});
    expect(unconfirmedFields(typed.checks)).toEqual([]);
    expect(checkCounts(typed.checks)).toEqual({ read: 0, confirmed: 0 });
  });

  it("ticks one fact at a time, and can untick it", () => {
    const bike = read(CLASS_2_LISTING);
    const one = withConfirmed(bike, "classes", true);
    expect(brief(one.checks.classes)).toEqual({ source: "text", status: "ticked" });
    expect(unconfirmedFields(one.checks)).not.toContain("classes");
    expect(unconfirmedFields(one.checks)).toHaveLength(7);
    expect(brief(withConfirmed(one, "classes", false).checks.classes)).toEqual({ source: "text", status: "unchecked" });
    expect(one.facts).toBe(bike.facts);
  });

  it("has nothing to tick for a fact that wasn't read", () => {
    const bike = read(CLASS_2_LISTING);
    expect(withConfirmed(bike, "peakWatts", true)).toBe(bike);
    expect(bike.checks.peakWatts).toBeUndefined();
  });

  it("counts a read fact the family changes as checked, and leaves the others alone", () => {
    const bike = read(CLASS_2_LISTING);
    const edited = withEdit(bike, { ...bike.facts, ratedWatts: 750 });
    expect(brief(edited.checks.ratedWatts)).toEqual({ source: "text", status: "theirs" });
    expect(unconfirmedFields(edited.checks)).toEqual(["hasPedals", "classes", "hasThrottle", "throttleMph", "assistMph", "wheelSize", "weightLb"]);
  });

  it("counts a picked or typed wheel size, weight or pegs answer as the family's, the same as on the card", () => {
    const bike = read(`${CLASS_2_LISTING} Foot pegs: No.`);
    expect(brief(bike.checks.hasFootPegs)).toEqual({ source: "text", status: "unchecked" });
    expect(withEdit(bike, withWheelSize(bike.facts, 24, true)).checks.wheelSize?.status).toBe("theirs");
    expect(withEdit(bike, withWeight(bike.facts, 70)).checks.weightLb?.status).toBe("theirs");
    expect(withEdit(bike, withFootPegs(bike.facts, "yes")).checks.hasFootPegs?.status).toBe("theirs");
  });

  it("counts a read value the family clears as checked, so the box stays while they type a new number", () => {
    const bike = read(CLASS_2_LISTING);
    // Typing 64 over 62 passes through "6", which is out of range and so empty, then 64.
    const midway = withEdit(bike, withWeight(bike.facts, null));
    expect(brief(midway.checks.weightLb)).toEqual({ source: "text", status: "theirs" });
    const typed = withEdit(midway, withWeight(midway.facts, 64));
    expect(brief(typed.checks.weightLb)).toEqual({ source: "text", status: "theirs" });
    expect(typed.facts.weightLb).toBe(64);
    // A weight follow-up answer replaces a read weight the same way.
    const answered = withEdit(bike, { ...bike.facts, weightLb: null, weightOver100: false });
    expect(unconfirmedFields(answered.checks)).not.toContain("weightLb");
    expect(checkCounts(answered.checks)).toEqual({ read: 8, confirmed: 1 });
  });

  it("adds nothing when the family edits a fact that wasn't read", () => {
    const bike = read(CLASS_2_LISTING);
    const edited = withEdit(bike, { ...bike.facts, peakWatts: 900, motorOver20: false });
    expect(edited.checks).toEqual(bike.checks);
  });

  it("starts over with a new link, so a fact checked on the last bike comes back not checked", () => {
    const checked = confirmAll(read(CLASS_2_LISTING));
    expect(unconfirmedFields(checked.checks)).toEqual([]);
    const next = read(CLASS_2_LISTING);
    expect(unconfirmedFields(next.checks)).toHaveLength(8);
  });
});

describe("the pedal photo check", () => {
  it("fills an empty pedals answer as read from the photo, not checked", () => {
    const typed = withEdit(emptyChecked(), { ...classBike(2), hasPedals: null });
    const called = withPedalCall(typed, "pedals");
    expect(called.facts.hasPedals).toBe(true);
    expect(brief(called.checks.hasPedals)).toEqual({ source: "photo", status: "unchecked" });
    expect(unconfirmedFields(called.checks)).toEqual(["hasPedals"]);
    // It changes only the pedals answer.
    expect({ ...called.facts, hasPedals: null }).toEqual(typed.facts);
  });

  it("resets a checked pedals answer that the photo changes", () => {
    const checked = withConfirmed(read(CLASS_2_LISTING), "hasPedals", true);
    const called = withPedalCall(checked, "no_pedals");
    expect(called.facts.hasPedals).toBe(false);
    expect(brief(called.checks.hasPedals)).toEqual({ source: "photo", status: "unchecked" });
  });

  it("keeps an answer the photo agrees with as it was, and a close call changes nothing", () => {
    const checked = withConfirmed(read(CLASS_2_LISTING), "hasPedals", true);
    expect(withPedalCall(checked, "pedals")).toBe(checked);
    expect(withPedalCall(checked, "ask")).toBe(checked);
    const typed = withEdit(emptyChecked(), classBike(2));
    expect(withPedalCall(typed, "pedals")).toBe(typed);
  });
});

describe("the bottom-line gate", () => {
  const encinitas = (facts: BikeFacts) => evaluate({ state: "CA", riderAge: 11, rideDate: DAY, facts, places: ["encinitas"] });

  it("turns a verified YES into NO, can't confirm, naming the facts in card order, first in the list", () => {
    const result = encinitas(classBike(2));
    expect(bottomLine(result, DAY).kind).toBe("yes");
    const bl = bottomLine(result, DAY, ["weightLb", "classes", "classes"]);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing).toEqual([{ kind: "facts", where: [], line: { code: "bl_unconfirmed_facts", params: { fields: "classes,weightLb" } } }]);
    expect(bl.requirements).toEqual([]);
  });

  it("counts every read field, not only the ones a card used", () => {
    const result = encinitas(classBike(2));
    for (const field of READ_FIELDS) {
      const bl = bottomLine(result, DAY, [field]);
      expect(bl.kind, field).toBe("no_unconfirmed");
      expect(bl.missing.map((m) => m.line.params?.fields), field).toEqual([field]);
    }
  });

  it("adds the facts first to an answer already not confirmed", () => {
    const result = evaluate({ state: "CA", riderAge: 15, rideDate: DAY, facts: classBike(1), places: ["sduhsd_campuses"] });
    const bl = bottomLine(result, DAY, ["classes"]);
    expect(bl.missing.map((m) => m.kind)).toEqual(["facts", "unverified"]);
  });

  it("keeps a NO, not allowed, since a rule that says no still says no", () => {
    const result = evaluate({ state: "CA", riderAge: 11, rideDate: DAY, facts: classBike(2), places: ["city_of_san_diego"] });
    const bl = bottomLine(result, DAY, ["classes"]);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.blocked[0].line.code).toBe("local_under_12");
  });

  it("leaves the place cards' own verdicts alone", () => {
    const result = encinitas(classBike(2));
    bottomLine(result, DAY, [...READ_FIELDS]);
    expect([result.state.status, ...result.local.map((v) => v.status)]).toEqual(["yes", "yes"]);
  });
});

describe("golden: a link-read Class 2 for an 11-year-old in Encinitas", () => {
  it("is NO, can't confirm until every read fact is checked, then YES with a helmet", () => {
    let bike = read(CLASS_2_LISTING);
    // The family answers the fast-mode follow-up. Those answers are theirs, not read.
    bike = withEdit(bike, { ...bike.facts, motorOver20: false, assistOver28: false });
    const fields = unconfirmedFields(bike.checks);
    expect(fields).toHaveLength(8);
    const result = evaluate({ state: "CA", riderAge: 11, rideDate: DAY, facts: bike.facts, places: ["encinitas"] });
    expect([result.state.status, ...result.local.map((v) => v.status)]).toEqual(["yes", "yes"]);

    for (const [i, field] of fields.entries()) {
      const bl = answer("CA", 11, bike, ["encinitas"]);
      expect(bl.kind, `before ${field}`).toBe("no_unconfirmed");
      expect(bl.missing).toEqual([{ kind: "facts", where: [], line: { code: "bl_unconfirmed_facts", params: { fields: fields.slice(i).join(",") } } }]);
      bike = withConfirmed(bike, field, true);
    }
    const done = answer("CA", 11, bike, ["encinitas"]);
    expect(done.kind).toBe("yes");
    expect(done.requirements.map((l) => l.code)).toContain("req_helmet_under");
  });

  it("is YES the same way when the family fixes a fact instead of ticking it", () => {
    let bike = read(CLASS_2_LISTING);
    bike = withEdit(bike, { ...bike.facts, motorOver20: false, assistOver28: false, weightLb: 64 });
    bike = confirmAll(bike, unconfirmedFields(bike.checks));
    expect(answer("CA", 11, bike, ["encinitas"]).kind).toBe("yes");
  });

  it("goes back to NO, can't confirm when the pedal photo check changes the pedals answer", () => {
    let bike = read(CLASS_2_LISTING);
    // Not sure about the pedals, so the family picks "Not sure" and runs the photo check.
    bike = withEdit(bike, { ...bike.facts, hasPedals: null, motorOver20: false, assistOver28: false });
    bike = confirmAll(bike);
    expect(brief(bike.checks.hasPedals)).toEqual({ source: "text", status: "theirs" });
    expect(unconfirmedFields(bike.checks)).toEqual([]);
    expect(answer("CA", 11, bike, ["encinitas"]).kind).not.toBe("yes");
    bike = withPedalCall(bike, "pedals");
    const bl = answer("CA", 11, bike, ["encinitas"]);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing.map((m) => m.line.params?.fields)).toEqual(["hasPedals"]);
    expect(answer("CA", 11, withConfirmed(bike, "hasPedals", true), ["encinitas"]).kind).toBe("yes");
  });

  it("is the same answer typed in on the Type it in tab, with nothing to check", () => {
    const typed = withEdit(emptyChecked(), { ...read(CLASS_2_LISTING).facts, motorOver20: false, assistOver28: false });
    expect(answer("CA", 11, typed, ["encinitas"]).kind).toBe("yes");
  });
});

describe("the sentence for unchecked facts", () => {
  it("names every unchecked fact in plain words in both languages", () => {
    const all = READ_FIELDS.join(",");
    for (const lang of ["en", "es"] as const) {
      const text = renderLine({ code: "bl_unconfirmed_facts", params: { fields: all } }, lang, "California");
      for (const f of READ_FIELDS) expect(text, `${lang} ${f}`).toContain(READ_FIELD_NAMES[lang][f]);
      expect(text).not.toMatch(/[A-Z][a-z]+[A-Z]|_|[—;]|undefined/);
    }
    expect(renderLine({ code: "bl_unconfirmed_facts", params: { fields: "classes,weightLb" } }, "en", "California")).toBe(
      'You haven\'t checked the class and the weight against the bike yet. Facts read from a link or photo can be wrong, so look at the bike and tick "It matches the bike" under each one in "Check the facts" above, or fix any that are wrong.',
    );
    expect(renderLine({ code: "bl_unconfirmed_facts", params: { fields: "classes,weightLb" } }, "es", "California")).toContain(
      "Todavía no comparaste con la bicicleta la clase y el peso.",
    );
    expect(readFieldList("hasPedals", "es")).toBe("los pedales");
  });
});
