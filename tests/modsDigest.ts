// A fingerprint of every California mods answer from the mods data alone, so a gate can show the
// California answers are the same as before the mods check covered every state. The grid is every
// mod, class and choice, six ride dates, in and out of the City of San Diego, and six rider ages.

import { createHash } from "node:crypto";
import { answerMod, modApplies, outcomesFor, type ModChoice } from "../lib/mods/answer";
import type { ModsData } from "../lib/mods/types";
import type { ClassNum } from "../lib/rules/types";

/** The fingerprint of answerMod before the change, on Oct 21, 2026, from the commit before it. */
export const CA_ANSWERS_BEFORE = { n: 14328, sha: "5dc43024f402ef1e9c7af7dd7efa8c7554c01d8d17fd594c86b4b03fe36b3f13" };

export const DIGEST_DATES = ["2026-10-21", "2026-11-15", "2026-12-31", "2027-01-01", "2029-01-01", "2029-12-31"];
export const DIGEST_AGES: (number | null)[] = [null, 10, 14, 15, 16, 30];

export function caAnswersDigest(data: ModsData): { n: number; sha: string } {
  const out: unknown[] = [];
  for (const mod of data.mods) {
    for (const cls of [1, 2, 3] as ClassNum[]) {
      if (!modApplies(mod, cls)) continue;
      const choices: ModChoice[] = [null, "other", ...outcomesFor(mod, cls).map((o) => o.index)];
      for (const choice of choices) {
        for (const date of DIGEST_DATES) {
          for (const city of [false, true]) {
            for (const age of DIGEST_AGES) out.push(answerMod(data, mod, cls, choice, date, city, age));
          }
        }
      }
    }
  }
  return { n: out.length, sha: createHash("sha256").update(JSON.stringify(out)).digest("hex") };
}
