// The safety gates for the school districts, the mods check and the bike finder, run by
// tests/featureGates.test.ts and written into RESULTS.md by scripts/build-results.ts. Each gate
// counts answers that must never happen, so every one must be 0.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModAnswerCard } from "../components/ModsCheck";
import { CATALOG } from "../lib/bikes/catalog";
import { catalogExtraction, catalogFacts } from "../lib/bikes/facts";
import { finderLine } from "../lib/bikes/finder";
import { factsFromExtraction } from "../lib/extract/merge";
import { answerMod, modApplies, outcomesFor, type ModChoice } from "../lib/mods/answer";
import { FROM_2027, MODS_DATA, MODS_SOURCE } from "../lib/mods/data";
import { SDUHSD_LEAID, withDistricts, type DistrictIndexFile } from "../lib/places/districts";
import { parsePlaceIndex } from "../lib/places/parse";
import { resolvePlace } from "../lib/places/resolve";
import type { PlaceIndexFile } from "../lib/places/types";
import { fromRead, unconfirmedFields } from "../lib/provenance";
import { bottomLine, evaluate, PLACE_IDS, STATE_CODES } from "../lib/rules";
import type { ClassNum, PlaceId } from "../lib/rules/types";

const ROOT = join(__dirname, "..");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;

export interface DistrictGates {
  districts: number;
  /** SDUHSD maps to the SDUHSD campus record. */
  sduhsd_mapped: boolean;
  /** Any other district mapped to a checked record. */
  other_checked: number;
}

export function districtGates(): DistrictGates {
  const index = withDistricts(parsePlaceIndex(readJson<PlaceIndexFile>("public/places/us-places.json")), readJson<DistrictIndexFile>("public/places/us-districts.json"));
  const districts = index.entries.filter((e) => e.kind === "district");
  const sduhsd = districts.find((d) => d.geoid === SDUHSD_LEAID);
  return {
    districts: districts.length,
    sduhsd_mapped: sduhsd !== undefined && resolvePlace(sduhsd).localRecord === "sduhsd_campuses",
    other_checked: districts.filter((d) => d.geoid !== SDUHSD_LEAID && resolvePlace(d).checked).length,
  };
}

export interface ModGates {
  mods: number;
  answers: number;
  yes: number;
  /** YES for an outcome the source doesn't read as the same class or a new class. */
  yes_beyond_source: number;
  /** YES with no outcome picked, or "something else". */
  yes_unanswered: number;
  /** Rendered reasons, rules, dates and penalties that are not a string in the data. */
  claims_not_in_data: number;
  claims: number;
}

const MOD_DATES = ["2026-10-21", "2026-12-31", FROM_2027, "2029-01-01", "2029-12-31"];

function strings(value: unknown, out: Set<string>): Set<string> {
  if (typeof value === "string") out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

function claimsOf(html: string): string[] {
  return [...html.matchAll(/data-claim=""[^>]*>([^<]*)</g)].map((m) =>
    m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
  );
}

export function modGates(): ModGates {
  const source = strings(readJson<unknown>("data/mods/ca-mods.json"), new Set());
  const gates: ModGates = { mods: MODS_DATA.mods.length, answers: 0, yes: 0, yes_beyond_source: 0, yes_unanswered: 0, claims_not_in_data: 0, claims: 0 };
  const rendered = new Set<string>();
  for (const mod of MODS_DATA.mods) {
    const raw = MODS_SOURCE.mods.find((m) => m.mod_id === mod.id);
    for (const cls of [1, 2, 3] as ClassNum[]) {
      if (!modApplies(mod, cls)) continue;
      const choices: ModChoice[] = [null, "other", ...outcomesFor(mod, cls).map((o) => o.index)];
      for (const choice of choices) {
        for (const date of MOD_DATES) {
          for (const city of [false, true]) {
            const answer = answerMod(MODS_DATA, mod, cls, choice, date, city);
            gates.answers += 1;
            if (!answer.yes) continue;
            gates.yes += 1;
            const index = typeof choice === "number" ? choice : outcomesFor(mod, cls).length === 1 && !mod.ask ? outcomesFor(mod, cls)[0].index : null;
            if (index === null) gates.yes_unanswered += 1;
            const effect = index === null ? null : raw?.outcomes[index]?.legal_effect;
            if (effect !== "same_class" && effect !== "different_class") gates.yes_beyond_source += 1;
          }
        }
      }
      for (const choice of choices) {
        const answer = answerMod(MODS_DATA, mod, cls, choice, MOD_DATES[2], true);
        const key = JSON.stringify(answer);
        if (rendered.has(key)) continue;
        rendered.add(key);
        for (const lang of ["en", "es"] as const) {
          for (const claim of claimsOf(renderToStaticMarkup(createElement(ModAnswerCard, { mod, answer, lang })))) {
            gates.claims += 1;
            if (!source.has(claim)) gates.claims_not_in_data += 1;
          }
        }
      }
    }
  }
  return gates;
}

export interface FinderGates {
  bikes: number;
  rides: number;
  yes: number;
  /** YES where the engine, on the maker's facts alone, says the ride is not allowed. */
  yes_engine_refuses: number;
  /** YES for a pedal-less e-moto, or a bike whose pages don't say it has pedals. */
  yes_without_pedals: number;
  /** YES in the checker for a bike sent by Check this bike before its facts are checked. */
  yes_before_checked: number;
}

const FINDER_AGES = [3, 5, 8, 10, 12, 13, 14, 15, 16, 17, 18, 21, 30, 65, 100];
const CA_PLACE_SETS: PlaceId[][] = [[], ...PLACE_IDS.map((p) => [p]), ["city_of_san_diego", "sduhsd_campuses"]];
const TODAY = "2026-10-21";

export function finderGates(): FinderGates {
  const gates: FinderGates = { bikes: CATALOG.length, rides: 0, yes: 0, yes_engine_refuses: 0, yes_without_pedals: 0, yes_before_checked: 0 };
  for (const state of STATE_CODES) {
    for (const places of state === "CA" ? CA_PLACE_SETS : [[]]) {
      for (const age of FINDER_AGES) {
        for (const otherPlaces of [false, true]) {
          const ride = { state, places, age, otherPlaces, rideDate: TODAY };
          for (const bike of CATALOG) {
            gates.rides += 1;
            const line = finderLine(bike, ride);
            if (line.kind !== "yes") continue;
            gates.yes += 1;
            const plain = bottomLine(evaluate({ state, riderAge: age, rideDate: TODAY, facts: catalogFacts(bike), places, otherPlaces }), TODAY);
            if (plain.kind === "no_illegal") gates.yes_engine_refuses += 1;
            if (bike.pedals !== true || bike.vehicle_type !== "e-bike") gates.yes_without_pedals += 1;
            const read = fromRead(factsFromExtraction(catalogExtraction(bike)), "text");
            const checker = bottomLine(evaluate({ state, riderAge: age, rideDate: TODAY, facts: read.facts, places, otherPlaces }), TODAY, unconfirmedFields(read.checks));
            if (checker.kind === "yes") gates.yes_before_checked += 1;
          }
        }
      }
    }
  }
  return gates;
}
