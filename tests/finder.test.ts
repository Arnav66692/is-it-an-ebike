// The bike finder: the maker catalog, how its facts reach the rules engine, that no catalog bike is
// ever YES where the engine would refuse, the ranking, and the hand-off to the checker.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkHref, finderAge, FinderResultCard, noReasons } from "@/components/BikeFinder";
import { finderLink } from "@/components/Checker";
import { CATALOG, CATALOG_META, catalogBike } from "@/lib/bikes/catalog";
import { catalogExtraction, catalogFacts, statedClasses, statedSpeedAnswers, statedWheelInches, type CatalogBike } from "@/lib/bikes/facts";
import { colorsIn, findBikes, finderLine, heightsIn, inBudget, makerAges, maxHeight, type FinderQuiz } from "@/lib/bikes/finder";
import { factsFromExtraction } from "@/lib/extract/merge";
import { quoteText } from "@/lib/extract/parse";
import { FINDER_KEYS, FINDER_TEXT } from "@/lib/i18n/finder";
import { fromRead, readCount } from "@/lib/provenance";
import { bottomLine, evaluate, PLACE_IDS, STATE_CODES } from "@/lib/rules";
import type { PlaceId } from "@/lib/rules/types";
import { shownAnswer } from "./answerWords";

const ROOT = join(__dirname, "..");
const RAW = JSON.parse(readFileSync(join(ROOT, "data", "bikes", "catalog.json"), "utf8")) as { meta: Record<string, unknown>; bikes: (CatalogBike & { verified: boolean })[] };
const TODAY = "2026-10-21";
const AGES = [3, 5, 8, 10, 12, 13, 14, 15, 16, 17, 18, 21, 30, 65, 100];
const CA_PLACE_SETS: PlaceId[][] = [[], ...PLACE_IDS.map((p) => [p]), ["city_of_san_diego", "sduhsd_campuses"], ["encinitas", "carlsbad", "sduhsd_campuses"]];

function bike(id: string): CatalogBike {
  const found = catalogBike(id);
  if (!found) throw new Error(`no bike ${id}`);
  return found;
}

function quiz(over: Partial<FinderQuiz> = {}): FinderQuiz {
  return { age: 30, height: null, uses: [], budget: "any", colors: [], state: "CA", places: [], otherPlaces: false, rideDate: TODAY, ...over };
}

/** Every rider, state and place set this test can run cheaply. */
function* everyRide() {
  for (const state of STATE_CODES) {
    const placeSets = state === "CA" ? CA_PLACE_SETS : [[]];
    for (const places of placeSets) for (const age of AGES) for (const otherPlaces of [false, true]) yield { state, places, age, otherPlaces, rideDate: TODAY };
  }
}

describe("the catalog", () => {
  it("has the 29 verified models, 25 e-bikes and 4 pedal-less e-motos, read Oct 21, 2026", () => {
    expect(CATALOG).toHaveLength(29);
    expect(CATALOG.filter((b) => b.vehicle_type === "e-bike")).toHaveLength(25);
    expect(CATALOG.filter((b) => b.vehicle_type === "pedal-less e-moto")).toHaveLength(4);
    expect(CATALOG_META.readDate).toBe(TODAY);
    for (const b of RAW.bikes) {
      expect(b.verified, b.id).toBe(true);
      expect(b.read_date).toBe(TODAY);
    }
  });

  it("links each bike to its maker's own page, with no affiliate or tracking code", () => {
    for (const b of CATALOG) {
      const url = new URL(b.maker_url);
      expect(url.protocol).toBe("https:");
      expect(url.search, b.id).toBe("");
      expect(b.maker_url).not.toMatch(/ref=|aff|utm_|partner|amazon/i);
    }
  });

  it("sends the page each record without its evidence and checking notes", () => {
    for (const b of CATALOG) {
      expect(b).not.toHaveProperty("verification");
      expect(b).not.toHaveProperty("evidence_quotes");
    }
  });
});

describe("reading the maker's words", () => {
  it("reads every class line the catalog has", () => {
    expect(statedClasses("Class 2")).toEqual([2]);
    expect(statedClasses("Class 2 (Convertible to Class 3)")).toEqual([2, 3]);
    expect(statedClasses("Class 1 or 2 eBike")).toEqual([1, 2]);
    expect(statedClasses("Class 1, 2, or 3 eBike")).toEqual([1, 2, 3]);
    expect(statedClasses("Class switchable between 1 and 2. Ships in Class 2 status.")).toEqual([1, 2]);
    expect(statedClasses("Class switchable 1 to 3. Ships in Class 2 status.")).toEqual([1, 2, 3]);
    expect(statedClasses("Class 1-3")).toEqual([1, 2, 3]);
    expect(statedClasses("Class 1 / 2 / 3")).toEqual([1, 2, 3]);
    expect(statedClasses("Class 1/3")).toEqual([1, 3]);
    expect(statedClasses(null)).toEqual([]);
  });

  it("reads wheel sizes, and none when the page disagrees with itself", () => {
    expect(statedWheelInches("20 x 3.0 in")).toBe(20);
    expect(statedWheelInches("700 x 38C")).toBe(28);
    expect(statedWheelInches("Schwalbe Big Apple 55-406 tires. The 406 size is the 20 inch wheel.")).toBe(20);
    expect(statedWheelInches("12 inch pneumatic tires")).toBe(12);
    expect(statedWheelInches(bike("jetson-jax").wheel_size)).toBeNull();
  });

  it("reads the maker's age rules and fit heights", () => {
    expect(makerAges("Recommended age 13+")).toEqual({ min: 13, max: null });
    expect(makerAges("Recommended Age Over 12 years old")).toEqual({ min: 13, max: null });
    expect(makerAges("Recommended Age 3 ~ 7 years old")).toEqual({ min: 3, max: 7 });
    expect(makerAges("Built for ages 4-8")).toEqual({ min: 4, max: 8 });
    expect(makerAges("Must be 16 years of age or older to ride, per a page disclaimer")).toEqual({ min: 16, max: null });
    expect(makerAges("For riders 16 years of age and older")).toEqual({ min: 16, max: null });
    expect(heightsIn("Height 4'11\"-6'3\", one size")).toEqual([59, 75]);
    expect(maxHeight(bike("tern-quick-haul-d8"))).toBe(77);
  });

  it("leaves a fact the page doesn't state unknown", () => {
    const tern = catalogFacts(bike("tern-quick-haul-d8"));
    expect(tern.ratedWatts).toBeNull();
    expect(tern.hasThrottle).toBeNull();
    const jax = catalogFacts(bike("jetson-jax"));
    expect(jax.hasPedals).toBeNull();
  });

  it("answers the speed questions only from a stated top speed", () => {
    expect(statedSpeedAnswers(bike("rad-radrunner"))).toEqual({ motorOver20: false, assistOver28: false });
    expect(statedSpeedAnswers(bike("aventon-soltera-3-adv"))).toEqual({ motorOver20: false, assistOver28: false });
    expect(statedSpeedAnswers(bike("lectric-xp4"))).toEqual({ motorOver20: null, assistOver28: false });
    expect(statedSpeedAnswers(bike("specialized-globe-haul-st")).motorOver20).toBe(false);
  });
});

describe("no catalog bike is ever YES where the engine would refuse", () => {
  it("holds for every bike, state, age and checked San Diego place set", () => {
    let rides = 0;
    let yes = 0;
    for (const ride of everyRide()) {
      for (const b of CATALOG) {
        rides += 1;
        const line = finderLine(b, ride);
        // The engine on the page's read facts alone, with no speed answers.
        const plain = bottomLine(evaluate({ ...ride, riderAge: ride.age, facts: catalogFacts(b) }), ride.rideDate);
        if (line.kind !== "yes") continue;
        yes += 1;
        expect(plain.kind, `${b.id} ${ride.state} ${ride.age}`).not.toBe("no_illegal");
        expect(b.vehicle_type).toBe("e-bike");
        expect(b.pedals).toBe(true);
        expect(statedSpeedAnswers(b)).toEqual({ motorOver20: false, assistOver28: false });
        const rerun = bottomLine(evaluate({ ...ride, riderAge: ride.age, facts: { ...catalogFacts(b), ...statedSpeedAnswers(b) } }), ride.rideDate);
        expect(rerun.kind).toBe("yes");
      }
    }
    expect(rides).toBeGreaterThan(50_000);
    expect(yes).toBeGreaterThan(0);
  }, 240_000);

  it("never says YES for a pedal-less e-moto, and in California calls one with no pedals not an e-bike", () => {
    for (const ride of everyRide()) {
      for (const b of CATALOG.filter((x) => x.vehicle_type === "pedal-less e-moto")) {
        const line = finderLine(b, ride);
        expect(line.kind).not.toBe("yes");
        if (b.pedals === false && ride.state === "CA" && ride.places.length === 0) expect(line.kind === "no_illegal" && line.notEbikeOnly, `${b.id} ${ride.state}`).toBe(true);
      }
    }
  }, 120_000);

  it("says NO for a bike whose page leaves a needed fact out, and names it", () => {
    const tern = finderLine(bike("tern-quick-haul-d8"), quiz());
    expect(tern.kind).not.toBe("yes");
    expect(noReasons(tern, "en", "CA").length).toBeGreaterThan(0);
  });

  it("shows YES on the card only when the engine's bottom line is YES", () => {
    for (const r of findBikes(CATALOG, quiz({ age: 15 }))) {
      const html = renderToStaticMarkup(createElement(FinderResultCard, { result: r, lang: "en", age: 15, state: "CA", where: "California", places: [], unchecked: null, readDate: TODAY }));
      expect(shownAnswer(html).word).toBe(r.line.kind === "yes" ? "YES" : "NO");
    }
  });
});

describe("Check this bike", () => {
  it("opens the checker with the bike, the state, the checked places and the age", () => {
    const href = checkHref(bike("rad-radrunner"), "es", "CA", ["encinitas", "sduhsd_campuses"], 15);
    expect(href).toBe("/?lang=es&bike=rad-radrunner&state=CA&age=15&place=encinitas%2Csduhsd_campuses");
    expect(finderLink("?bike=rad-radrunner&age=15")).toEqual({ bike: "rad-radrunner", age: "15" });
    expect(finderLink("?bike=<x>&age=abc")).toEqual({ bike: null, age: "" });
  });

  it("loads the maker's facts as read facts, each with its line, and the checker answers the same as for the maker's facts", () => {
    for (const b of CATALOG) {
      const read = catalogExtraction(b);
      for (const list of Object.values(read.evidence)) for (const ev of list ?? []) expect(read.text.slice(ev.index, ev.index + ev.text.length)).toBe(quoteText(ev));
      const checked = fromRead(factsFromExtraction(read), "text");
      if (Object.keys(read.evidence).length > 0) expect(readCount(checked.checks)).toBeGreaterThan(0);
      for (const ride of [quiz({ age: 15 }), quiz({ age: 30, state: "TX" })]) {
        const line = bottomLine(evaluate({ ...ride, riderAge: ride.age, facts: checked.facts }), TODAY);
        if (line.kind === "yes") expect(bottomLine(evaluate({ ...ride, riderAge: ride.age, facts: catalogFacts(b) }), TODAY).kind, b.id).not.toBe("no_illegal");
      }
    }
  });
});

describe("ranking", () => {
  it("puts YES first, then the closer fit, and never favors a maker", () => {
    const q = quiz({ age: 15, uses: ["commute"], colors: ["black"] });
    const ranked = findBikes(CATALOG, q);
    const firstNo = ranked.findIndex((r) => !r.yes);
    if (firstNo >= 0) expect(ranked.slice(firstNo).every((r) => !r.yes)).toBe(true);
    const shuffled = findBikes([...CATALOG].reverse(), q);
    expect(shuffled.map((r) => r.bike.id)).toEqual(ranked.map((r) => r.bike.id));
    const renamed = findBikes(
      CATALOG.map((b) => ({ ...b, maker: "Same" })),
      q,
    );
    expect(renamed.map((r) => r.score)).toEqual(
      renamed.map((r) => ranked.find((x) => x.bike.id === r.bike.id)?.score),
    );
  });

  it("keeps only bikes in the budget", () => {
    for (const r of findBikes(CATALOG, quiz({ budget: "800" }))) expect(r.bike.price_usd ?? Infinity).toBeLessThanOrEqual(800);
    expect(inBudget(bike("tern-quick-haul-d8"), "2200")).toBe(false);
    expect(findBikes(CATALOG, quiz())).toHaveLength(29);
  });

  it("explains a fit by use, color and height, and a misfit by the maker's own limits", () => {
    const [r] = findBikes([bike("lectric-xp4")], quiz({ age: 14, height: 70, uses: ["folding"], colors: ["blue"] }));
    expect(r.fits.map((f) => f.kind)).toEqual(["use", "color", "height_fits"]);
    expect(r.misfits).toEqual([{ kind: "maker_age", text: bike("lectric-xp4").rider_age }]);
    expect(colorsIn(bike("lectric-xp4"), "blue").length).toBeGreaterThan(0);
    const [short] = findBikes([bike("aventon-aventure-3")], quiz({ height: 58 }));
    expect(short.misfits[0]).toEqual({ kind: "too_short", min: 63 });
  });
});

describe("the page's words", () => {
  it("has every key in English and Spanish, with periods and commas only", () => {
    for (const key of FINDER_KEYS) {
      expect(FINDER_TEXT.es[key], key).toBeTruthy();
      for (const lang of ["en", "es"] as const) expect(FINDER_TEXT[lang][key], `${lang} ${key}`).not.toMatch(/[—–;:]/);
    }
  });

  it("reads only a whole age from 3 to 100", () => {
    expect(finderAge("15")).toBe(15);
    expect(finderAge("2")).toBeNull();
    expect(finderAge("15.5")).toBeNull();
  });
});
