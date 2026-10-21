// Regression tests for the review of the school districts, the mods check and the bike finder.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkHref } from "@/components/BikeFinder";
import { uncheckedLine } from "@/components/BottomLineCard";
import { parseShareLink } from "@/lib/checkerState";
import { catalogBike } from "@/lib/bikes/catalog";
import type { CatalogBike } from "@/lib/bikes/facts";
import { finderLine } from "@/lib/bikes/finder";
import { withDistricts, type DistrictIndexFile } from "@/lib/places/districts";
import { linkedPickIds, linkedWhere, withLinkedPicks } from "@/lib/places/linked";
import { parsePlaceIndex } from "@/lib/places/parse";
import { addPick, NO_PICKS, rideWhere, uncheckedPicks, type PlacePicks } from "@/lib/places/picks";
import type { PlaceEntry, PlaceIndexFile } from "@/lib/places/types";
import { bottomLine, evaluate } from "@/lib/rules";
import { emptyFacts } from "@/lib/rules/types";
import { classBike } from "./helpers";

const TODAY = "2026-10-21";
const ROOT = join(__dirname, "..");
const INDEX = withDistricts(
  parsePlaceIndex(JSON.parse(readFileSync(join(ROOT, "public", "places", "us-places.json"), "utf8")) as PlaceIndexFile),
  JSON.parse(readFileSync(join(ROOT, "public", "places", "us-districts.json"), "utf8")) as DistrictIndexFile,
);

function entry(id: string): PlaceEntry {
  const found = INDEX.byId.get(id);
  if (!found) throw new Error(`no entry ${id}`);
  return found;
}

function picksOf(...ids: string[]): PlacePicks {
  return ids.reduce((cur, id) => addPick(cur, entry(id)).next, NO_PICKS);
}

/** What the checker rebuilds from a "Check this bike" link, once the search index has loaded. */
function checkerWhere(href: string): PlacePicks {
  const search = href.slice(href.indexOf("?"));
  const link = parseShareLink(search);
  const entries = linkedPickIds(search).map((id) => entry(id));
  return withLinkedPicks(linkedWhere(link.state, link.places).where, link.state, entries);
}

/** The checker's not-checked line for a YES bike in these picks. */
function checkerUnchecked(where: PlacePicks): string | null {
  const ride = rideWhere(where, "CA", false);
  const line = bottomLine(evaluate({ state: "CA", riderAge: 16, rideDate: TODAY, facts: classBike(1), places: ride.places, otherPlaces: ride.otherPlaces }), TODAY);
  expect(line.kind).toBe("yes");
  const notChecked = uncheckedPicks(where);
  return uncheckedLine(line, "en", notChecked.filter((p) => p.kind !== "district").map((p) => p.name), notChecked.filter((p) => p.kind === "district").map((p) => p.name));
}

function bike(id: string): CatalogBike {
  const found = catalogBike(id);
  if (!found) throw new Error(`no bike ${id}`);
  return found;
}

describe("a Class 3 mode next to a throttle", () => {
  it("is never YES in the finder when the page doesn't say the throttle turns off in Class 3", () => {
    for (const id of ["ride1up-portola-02", "rad-radster-trail"]) {
      for (const age of [16, 17, 18, 30]) {
        const line = finderLine(bike(id), { age, state: "CA", places: [], otherPlaces: false, rideDate: TODAY });
        expect(line.kind, `${id} ${age}`).not.toBe("yes");
      }
    }
  });

  it("is not confirmed by the engine for a Class 2 and 3 label with a 20 mph throttle", () => {
    const facts = { ...emptyFacts(), hasPedals: true, classes: [1, 2, 3] as (1 | 2 | 3)[], ratedWatts: 750, hasThrottle: true, throttleMph: 20, assistMph: 28, motorOver20: false, assistOver28: false };
    const result = evaluate({ state: "CA", riderAge: 30, rideDate: TODAY, facts, places: [], otherPlaces: false });
    expect(result.state.status).toBe("cant_confirm");
    expect(result.state.reason.code).toBe("class3_throttle_unclear");
    expect(bottomLine(result, TODAY).kind).not.toBe("yes");
  });
});

describe("Check this bike keeps every place the family picked", () => {
  const ENCINITAS = "p-0622678";
  const POWAY_UNIFIED = "d-0631530";
  const soltera = bike("aventon-soltera-2-5");

  function hrefFor(where: PlacePicks): string {
    const ride = rideWhere(where, "CA", false);
    return checkHref(soltera, "en", "CA", ride.places, 16, uncheckedPicks(where).map((p) => p.id));
  }

  it("carries an unchecked district, so the checker names its campus rules as not checked", () => {
    const where = picksOf(ENCINITAS, POWAY_UNIFIED);
    const href = hrefFor(where);
    expect(href).toContain("pick=d-0631530");
    const rebuilt = checkerWhere(href);
    expect(rebuilt.picks.map((p) => p.id).sort()).toEqual([ENCINITAS, POWAY_UNIFIED].sort());
    expect(checkerUnchecked(rebuilt)).toBe(checkerUnchecked(where));
    expect(checkerUnchecked(rebuilt)).toContain("Poway Unified");
  });

  it("carries a district that is the only pick", () => {
    const where = picksOf(POWAY_UNIFIED);
    const rebuilt = checkerWhere(hrefFor(where));
    expect(checkerUnchecked(rebuilt)).toContain("Poway Unified");
  });

  it("carries an unchecked city and keeps SDUHSD as the campus record", () => {
    const where = picksOf("p-0658520", "d-0634380");
    const href = hrefFor(where);
    expect(href).toContain("sduhsd_campuses");
    expect(href).not.toContain("d-0634380");
    const rebuilt = checkerWhere(href);
    expect(uncheckedPicks(rebuilt).map((p) => p.id)).toEqual(uncheckedPicks(where).map((p) => p.id));
  });

  it("reads only well-formed pick ids", () => {
    expect(linkedPickIds("?pick=d-0631530,<script>,p-0622678,d-0631530")).toEqual(["d-0631530", "p-0622678"]);
  });
});
