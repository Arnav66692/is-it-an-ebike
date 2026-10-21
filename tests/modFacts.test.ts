// The mods check in every state: how a mod and the family's answer become the engine's bike facts,
// each mod's answer from the engine, California's answers kept, and the page's links and words.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { modsHref } from "@/components/Checker";
import { linkedRide, ModAnswerCard, withLinkedRide } from "@/components/ModsCheck";
import { modsText, MODS_TEXT } from "@/lib/i18n/mods";
import { t } from "@/lib/i18n/ui";
import { answerMod } from "@/lib/mods/answer";
import { MODS_DATA, MODS_SOURCE, type ModView } from "@/lib/mods/data";
import { baseFacts, MOD_FACTS, outcomeFacts, withMod, withMods, type FactChange } from "@/lib/mods/facts";
import { answerRide, combinedRun, overallRideYes, type ModRide } from "@/lib/mods/ride";
import type { PlaceEntry } from "@/lib/places/types";
import { STATE_CODES } from "@/lib/rules";
import { emptyFacts, type BikeFacts } from "@/lib/rules/types";

const TODAY = "2026-10-21";
/** The family's answers to the engine's follow-ups: no fast mode, 26 inch wheels, 60 lb, no foot pegs. */
const ANSWERED: BikeFacts = { ...emptyFacts(), motorOver20: false, assistOver28: false, wheelCount: 2, wheelFrontIn: 26, wheelRearIn: 26, weightLb: 60, hasFootPegs: false, needsPedalKit: false };

function mod(id: string): ModView {
  const found = MODS_DATA.mods.find((m) => m.id === id);
  if (!found) throw new Error(`no mod ${id}`);
  return found;
}

function ride(state: string, extra: Partial<ModRide> = {}): ModRide {
  return { state, places: [], otherPlaces: false, riderAge: 30, rideDate: TODAY, ...extra };
}

function change(id: string, index: number): FactChange {
  const c = outcomeFacts(id, index);
  if (c === "unsettled") throw new Error(`${id} ${index} is unsettled`);
  return c;
}

describe("the mod-to-facts table", () => {
  it("has an entry for every mod and every outcome in the data, and no others", () => {
    expect(Object.keys(MOD_FACTS).sort()).toEqual(MODS_SOURCE.mods.map((m) => m.mod_id).sort());
    for (const m of MODS_SOURCE.mods) expect(MOD_FACTS[m.mod_id].length, m.mod_id).toBe(m.outcomes.length);
  });

  it("starts from the picked class with pedals, a throttle only on Class 2, and the typed watts", () => {
    expect(baseFacts(1, 500, ANSWERED)).toMatchObject({ classes: [1], hasPedals: true, hasThrottle: false, ratedWatts: 500, motorOver20: false });
    expect(baseFacts(2, null, ANSWERED)).toMatchObject({ classes: [2], hasThrottle: true, ratedWatts: null });
    expect(baseFacts(3, 750, ANSWERED).hasThrottle).toBe(false);
  });

  it("sets motorOver20 when the motor alone now passes 20 mph", () => {
    const base = baseFacts(2, 500, ANSWERED);
    expect(withMod(base, change("speed_unlock_kit", 0)).motorOver20).toBe(true);
    expect(withMod(base, change("throttle_past_20_mph", 0))).toMatchObject({ hasThrottle: true, motorOver20: true });
  });

  it("sets assistOver28 when pedal assist now passes 28 mph", () => {
    expect(withMod(baseFacts(3, 500, ANSWERED), change("speed_unlock_app_or_code", 2)).assistOver28).toBe(true);
  });

  it("uses typed watts over 750 for a motor now over 750 W, and leaves watts unknown otherwise", () => {
    expect(withMod(baseFacts(2, 1000, ANSWERED), change("motor_over_750w", 0)).ratedWatts).toBe(1000);
    expect(withMod(baseFacts(2, 500, ANSWERED), change("motor_over_750w", 0)).ratedWatts).toBeNull();
    expect(withMod(baseFacts(2, null, ANSWERED), change("higher_voltage_battery", 1)).ratedWatts).toBeNull();
  });

  it("removes the pedals, adds a throttle, and moves the class the way the outcome says", () => {
    expect(withMod(baseFacts(1, 500, ANSWERED), change("remove_pedals", 0)).hasPedals).toBe(false);
    expect(withMod(baseFacts(1, 500, ANSWERED), change("add_throttle_class1_or_class3", 0))).toMatchObject({ classes: [2], hasThrottle: true, motorOver20: false });
    expect(withMod(baseFacts(1, 500, ANSWERED), change("speed_unlock_kit", 3))).toMatchObject({ classes: [3], hasThrottle: false, assistOver28: false });
    expect(withMod(baseFacts(1, 500, ANSWERED), change("rider_foot_pegs", 1))).toMatchObject({ hasPedals: false, hasFootPegs: true });
  });

  it("changes nothing for lights, horn, child seat, trailer, passenger seat, label, brake cutoff, handlebars and tires", () => {
    const base = baseFacts(2, 500, ANSWERED);
    const none = ["lights", "horn_or_bell", "turn_signals", "kid_seat", "kid_trailer", "passenger_seat_or_pegs", "class_label_removed_or_changed", "remove_brake_motor_cutoff", "raised_handlebars", "wheel_or_tire_change"];
    for (const id of none) expect(withMod(base, change(id, 0)), id).toEqual(base);
  });

  it("can't turn a wheel change that lets the motor help faster into facts", () => {
    expect(outcomeFacts("wheel_or_tire_change", 1)).toBe("unsettled");
  });

  it("keeps the riskier answer when two mods set the same fact", () => {
    const base = baseFacts(1, 500, ANSWERED);
    const both = withMods(base, [change("add_throttle_class1_or_class3", 0), change("speed_unlock_kit", 3)]);
    expect(both).toMatchObject({ classes: [2, 3], hasThrottle: true });
    expect(withMods(base, [change("lights", 0), change("remove_pedals", 0)]).hasPedals).toBe(false);
  });
});

describe("each mod's answer comes from the engine", () => {
  it("keeps the engine's YES for a mod that changes nothing, in Texas", () => {
    const a = answerRide(MODS_DATA, mod("lights"), 2, 0, baseFacts(2, 500, ANSWERED), ride("TX"));
    expect(a.yes).toBe(true);
    expect(a.kind).toBe("engine_yes");
    expect(a.penalties).toEqual([]);
    expect(a.ca).toBeNull();
  });

  it("is NO when the watts are not typed, with the engine's reason", () => {
    const a = answerRide(MODS_DATA, mod("lights"), 2, 0, baseFacts(2, null, ANSWERED), ride("TX"));
    expect(a.yes).toBe(false);
    expect(a.engine?.line.missing.map((g) => g.line.code)).toContain("watts_unknown");
  });

  it("is NO for a throttle past 20 mph and a motor over 750 W in states with a 750 W line", () => {
    for (const state of ["TX", "NY", "FL", "CA"]) {
      expect(answerRide(MODS_DATA, mod("throttle_past_20_mph"), 2, null, baseFacts(2, 500, ANSWERED), ride(state)).yes, state).toBe(false);
      expect(answerRide(MODS_DATA, mod("motor_over_750w"), 2, null, baseFacts(2, 1000, ANSWERED), ride(state)).yes, state).toBe(false);
    }
  });

  it("is NO for no answer, something else, or an outcome that depends on the result", () => {
    const base = baseFacts(2, 500, ANSWERED);
    expect(answerRide(MODS_DATA, mod("lights"), 2, null, base, ride("TX")).kind).toBe("unanswered");
    expect(answerRide(MODS_DATA, mod("speed_unlock_kit"), 2, "other", base, ride("TX")).yes).toBe(false);
    const wheels = answerRide(MODS_DATA, mod("wheel_or_tire_change"), 2, 1, base, ride("TX"));
    expect([wheels.yes, wheels.kind]).toEqual([false, "depends_on_result"]);
  });

  it("follows the engine where a state allows more, like a 1000 W motor in Washington, DC", () => {
    const a = answerRide(MODS_DATA, mod("motor_over_750w"), 2, null, baseFacts(2, 1000, ANSWERED), ride("DC"));
    expect(a.yes).toBe(a.engine?.line.kind === "yes");
  });

  it("follows each state's own age rule for the rider", () => {
    const base = baseFacts(3, 500, ANSWERED);
    let states = 0;
    for (const state of STATE_CODES.filter((s) => s !== "CA")) {
      const old = answerRide(MODS_DATA, mod("horn_or_bell"), 3, null, base, ride(state, { riderAge: 30 }));
      const young = answerRide(MODS_DATA, mod("horn_or_bell"), 3, null, base, ride(state, { riderAge: 12 }));
      if (!old.yes || young.yes) continue;
      expect(young.kind, state).toBe(young.engine?.line.kind === "no_illegal" ? "engine_illegal" : "engine_unconfirmed");
      states += 1;
    }
    expect(states).toBeGreaterThan(0);
    expect(answerRide(MODS_DATA, mod("horn_or_bell"), 3, null, base, ride("CA", { riderAge: 14 })).kind).toBe("under_16_class_3");
  });

  it("never says YES for two mods that are each fine but not together", () => {
    const base = baseFacts(1, 500, ANSWERED);
    const mods = [
      { mod: mod("add_throttle_class1_or_class3"), choice: 0 },
      { mod: mod("speed_unlock_kit"), choice: 3 },
    ];
    const r = ride("TX");
    const answers = mods.map(({ mod: m, choice }) => answerRide(MODS_DATA, m, 1, choice, base, r));
    expect(answers.every((a) => a.yes)).toBe(true);
    expect(overallRideYes(answers, combinedRun(mods, 1, base, r))).toBe(false);
  });
});

describe("California keeps its verified answers", () => {
  it("is the mods data's answer, word for word, when the engine says YES", () => {
    const base = baseFacts(2, 500, ANSWERED);
    const seat = mod("passenger_seat_or_pegs");
    for (const city of [false, true]) {
      const a = answerRide(MODS_DATA, seat, 2, 0, base, ride("CA", { places: city ? ["city_of_san_diego"] : [] }));
      const ca = answerMod(MODS_DATA, seat, 2, 0, TODAY, city, 30);
      expect([a.yes, a.kind, a.reasons, a.penalties]).toEqual([ca.yes, ca.kind, ca.reasons, ca.penalties]);
    }
  });

  it("turns a California YES into NO when the engine can't confirm the bike", () => {
    const a = answerRide(MODS_DATA, mod("horn_or_bell"), 2, null, baseFacts(2, null, ANSWERED), ride("CA"));
    expect(a.ca?.yes).toBe(true);
    expect([a.yes, a.kind]).toEqual([false, "engine_unconfirmed"]);
  });
});

describe("the answer cards", () => {
  it("say in one line outside California that the state's rules for the mod and its penalties were not checked", () => {
    const a = answerRide(MODS_DATA, mod("passenger_seat_or_pegs"), 2, 0, baseFacts(2, 500, ANSWERED), ride("TX"));
    const html = renderToStaticMarkup(createElement(ModAnswerCard, { mod: mod("passenger_seat_or_pegs"), answer: a, lang: "en" }));
    expect(html).toContain("Rules for this mod and its penalties in Texas were not checked.");
    expect(html).not.toContain("data-claim");
    expect(html).not.toMatch(/California|San Diego|may |might /);
    const es = renderToStaticMarkup(createElement(ModAnswerCard, { mod: mod("passenger_seat_or_pegs"), answer: a, lang: "es" }));
    expect(es).toContain("No se revisaron las reglas para esta modificación ni sus multas en Texas.");
  });

  it("show the engine's reason under its NO", () => {
    const a = answerRide(MODS_DATA, mod("lights"), 2, 0, baseFacts(2, null, ANSWERED), ride("TX"));
    const html = renderToStaticMarkup(createElement(ModAnswerCard, { mod: mod("lights"), answer: a, lang: "en" }));
    expect(html).toContain("We need the motor watts printed on the label.");
  });

  it("have no California-only banner left in the page's words", () => {
    for (const text of [...Object.values(MODS_TEXT.en), ...Object.values(MODS_TEXT.es)]) expect(text).not.toMatch(/California law only|Other states are not covered/);
    expect(modsText("en", "notChecked", { where: "in Ohio" })).toBe("Rules for this mod and its penalties in Ohio were not checked.");
  });
});

describe("links between the checker and the mods check", () => {
  it("carries the state, places, other picks, class and age from any state", () => {
    const facts = { ...emptyFacts(), classes: [2 as const] };
    const district = { id: "d-0631530", kind: "district" } as PlaceEntry;
    expect(modsHref("en", "TX", [], [district], facts, 15)).toBe("/mods?state=TX&class=2&age=15&pick=d-0631530");
    expect(modsHref("es", "CA", ["city_of_san_diego", "sduhsd_campuses"], [], emptyFacts(), null)).toBe("/mods?lang=es&state=CA&place=city_of_san_diego%2Csduhsd_campuses");
  });

  it("reads them back, with SDUHSD as the district's own pick", () => {
    expect(linkedRide("?state=tx&pick=d-0631530")).toEqual({ state: "TX", places: [], pickIds: ["d-0631530"] });
    expect(linkedRide("?state=CA&place=city_of_san_diego,sduhsd_campuses")).toEqual({ state: "CA", places: ["city_of_san_diego", "sduhsd_campuses"], pickIds: ["d-0634380"] });
    expect(linkedRide("?state=ZZ").state).toBeNull();
  });

  it("picks the state itself when the link names no place", () => {
    const texas = { id: "s-TX", name: "Texas", kind: "state", source: "state", state: "TX", counties: [], geoid: null, rank: 0, keys: ["texas"] } as PlaceEntry;
    expect(withLinkedRide({ state: null, picks: [] }, "TX", [], texas).picks.map((p) => p.id)).toEqual(["s-TX"]);
  });
});

describe("the app's header and copy", () => {
  it("counts the places and school districts the search covers, from the place files", () => {
    const places = JSON.parse(readFileSync(join(__dirname, "..", "public", "places", "us-places.json"), "utf8")) as { counts: { rows: number } };
    const districts = JSON.parse(readFileSync(join(__dirname, "..", "public", "places", "us-districts.json"), "utf8")) as { counts: { rows: number } };
    const n = (x: number) => x.toLocaleString("en-US");
    for (const lang of ["en", "es"] as const) {
      expect(t(lang, "coverPlaces")).toContain(n(places.counts.rows));
      expect(t(lang, "coverDistricts")).toContain(n(districts.counts.rows));
    }
  });

  it("no longer heads the app with San Diego or California", () => {
    for (const lang of ["en", "es"] as const) {
      for (const key of ["tagline", "coverStates", "coverPlaces", "coverDistricts", "coverAccount", "howBody"] as const) expect(t(lang, key), key).not.toMatch(/San Diego|California/);
    }
  });
});
