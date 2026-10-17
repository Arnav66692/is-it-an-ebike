// Builds the test matrix from the data: every state, class, age band, caution condition
// and switch date. Used by tests/engine.matrix.test.ts and scripts/engine-matrix.ts.

import { evaluate } from "@/lib/rules";
import { STATE_CODES } from "@/lib/rules/compile";
import { PLACE_IDS } from "@/lib/rules/local";
import { emptyFacts, type BikeFacts, type QuestionId, type Status } from "@/lib/rules/types";
import { localBlockers, stateBlockers, type OracleFacts } from "./oracle";

export const AGES = [7, 11, 12, 13, 14, 15, 16, 17, 18, 30];
export const DATES = [
  "2026-10-17",
  "2026-11-30",
  "2026-12-01",
  "2026-12-31",
  "2027-01-01",
  "2027-05-04",
  "2027-05-05",
  "2029-01-01",
];

type Variant = { name: string } & Partial<Omit<OracleFacts, "cls">>;

/** Each variant flips the facts one caution condition reads, including unknown answers. */
export const VARIANTS: Variant[] = [
  { name: "standard" },
  { name: "watts_745", watts: 745 },
  { name: "watts_746", watts: 746 },
  { name: "watts_750", watts: 750 },
  { name: "watts_1000", watts: 1000 },
  { name: "watts_1600", watts: 1600 },
  { name: "wheels_10", front: 10, rear: 10 },
  { name: "wheels_12", front: 12, rear: 12 },
  { name: "wheels_14", front: 14, rear: 14 },
  { name: "wheels_16", front: 16, rear: 16 },
  { name: "wheels_20_and_12", front: 20, rear: 12 },
  { name: "trike_16", wheelCount: 3, front: 16, rear: 16 },
  { name: "trike_20", wheelCount: 3, front: 20, rear: 20 },
  { name: "weight_120", weight: 120 },
  { name: "foot_pegs", pegs: true },
  { name: "pedal_kit", kit: true },
  { name: "motor_over_20", motorOver20: true },
  { name: "assist_over_28", assistOver28: true },
  { name: "wheels_unsure", front: null, rear: null, wheelCount: null, unsure: ["wheels"] },
  { name: "wheels_unasked", front: null, rear: null, wheelCount: null },
  { name: "fast_mode_unsure", motorOver20: null, assistOver28: null, unsure: ["fast_mode"] },
  { name: "fast_mode_unasked", motorOver20: null, assistOver28: null },
  { name: "weight_unsure", weight: null, unsure: ["weight"] },
  { name: "pegs_kit_unsure", pegs: null, kit: null, unsure: ["pegs_kit"] },
];

function oracleFacts(cls: 1 | 2 | 3, v: Variant): OracleFacts {
  return {
    cls,
    watts: v.watts ?? 500,
    front: v.front === undefined ? 20 : v.front,
    rear: v.rear === undefined ? 20 : v.rear,
    wheelCount: v.wheelCount === undefined ? 2 : v.wheelCount,
    weight: v.weight === undefined ? 60 : v.weight,
    pegs: v.pegs === undefined ? false : v.pegs,
    kit: v.kit === undefined ? false : v.kit,
    motorOver20: v.motorOver20 === undefined ? false : v.motorOver20,
    assistOver28: v.assistOver28 === undefined ? false : v.assistOver28,
    unsure: v.unsure ?? [],
  };
}

function engineFacts(o: OracleFacts): BikeFacts {
  return {
    ...emptyFacts(),
    hasPedals: true,
    classes: [o.cls],
    ratedWatts: o.watts,
    hasThrottle: o.cls === 2,
    throttleMph: o.cls === 2 ? 20 : null,
    assistMph: o.cls === 3 ? 28 : 20,
    motorOver20: o.motorOver20,
    assistOver28: o.assistOver28,
    switchable: o.motorOver20 === null && o.assistOver28 === null ? null : false,
    wheelCount: o.wheelCount,
    wheelFrontIn: o.front,
    wheelRearIn: o.rear,
    weightLb: o.weight,
    weightOver100: o.weight === null ? null : o.weight > 100,
    hasFootPegs: o.pegs,
    needsPedalKit: o.kit,
    unsure: o.unsure as QuestionId[],
  };
}

export interface MatrixCase {
  scope: string;
  state: string;
  cls: number;
  age: number;
  date: string;
  variant: string;
  status: Status;
  blockers: string[];
}

export interface MatrixSummary {
  cases: number;
  stateCases: number;
  localCases: number;
  byStatus: Record<Status, number>;
  falseLegal: MatrixCase[];
  missedYes: MatrixCase[];
}

export function runMatrix(): MatrixSummary {
  const byStatus: Record<Status, number> = { yes: 0, no: 0, not_ebike: 0, cant_confirm: 0, need_info: 0 };
  const falseLegal: MatrixCase[] = [];
  const missedYes: MatrixCase[] = [];
  let stateCases = 0;
  let localCases = 0;

  const check = (c: MatrixCase) => {
    byStatus[c.status] += 1;
    if (c.status === "yes" && c.blockers.length > 0) falseLegal.push(c);
    if (c.status !== "yes" && c.blockers.length === 0) missedYes.push(c);
  };

  for (const state of STATE_CODES) {
    for (const cls of [1, 2, 3] as const) {
      for (const variant of VARIANTS) {
        const of = oracleFacts(cls, variant);
        const facts = engineFacts(of);
        for (const age of AGES) {
          for (const date of DATES) {
            const places = state === "CA" ? PLACE_IDS : [];
            const result = evaluate({ state, riderAge: age, rideDate: date, facts, places });
            const blockers = stateBlockers(state, of, age, date);
            stateCases += 1;
            check({ scope: "state", state, cls, age, date, variant: variant.name, status: result.state.status, blockers });
            for (const v of result.local) {
              localCases += 1;
              check({
                scope: v.id,
                state,
                cls,
                age,
                date,
                variant: variant.name,
                status: v.status,
                blockers: [...blockers, ...localBlockers(v.id, of, age, date)],
              });
            }
          }
        }
      }
    }
  }
  return { cases: stateCases + localCases, stateCases, localCases, byStatus, falseLegal, missedYes };
}
