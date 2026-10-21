// A place card never says YES while the bottom line right above it says NO because of that same
// card. Four rides that once showed "✓ YES" on a card under "✕ NO" on the bottom line: a "Not
// sure" fast-mode answer in Texas, read facts left unchecked, a ride past the state check, and an
// SDUHSD campus whose rules come only from the district's web page. Each card now answers NO with
// the same reason as the bottom line, and the engine's own call is unchanged.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BottomLineCard } from "@/components/BottomLineCard";
import { cardAnswer, heldBack, VerdictCard } from "@/components/VerdictCard";
import type { Lang } from "@/lib/i18n/names";
import { fromRead, unconfirmedFields } from "@/lib/provenance";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import type { BikeFacts, PlaceId, ReadField, Verdict } from "@/lib/rules/types";
import { headlineProblems, hedgeProblems, shownAnswer, visibleLines } from "./answerWords";
import { classBike } from "./helpers";

const TODAY = "2026-10-20";

interface Ride {
  state: string;
  age: number;
  facts: BikeFacts;
  places?: PlaceId[];
  date?: string;
  unconfirmed?: ReadField[];
}

function show(ride: Ride, lang: Lang = "en") {
  const date = ride.date ?? TODAY;
  const result = evaluate({ state: ride.state, riderAge: ride.age, rideDate: date, facts: ride.facts, places: ride.places ?? [] });
  const unconfirmed = ride.unconfirmed ?? [];
  const bl = bottomLine(result, date, unconfirmed);
  const cards = [result.state, ...result.local].map((v: Verdict) => {
    const html = renderToStaticMarkup(createElement(VerdictCard, { verdict: v, lang, stateCode: ride.state, rideDate: date, unconfirmed }));
    return { id: v.id, status: v.status, html, ...shownAnswer(html) };
  });
  const bottom = shownAnswer(renderToStaticMarkup(createElement(BottomLineCard, { line: bl, lang, stateCode: ride.state })));
  return { result, bl, cards, bottom, date, unconfirmed };
}

const notSure = classBike(1, { motorOver20: null, assistOver28: null, switchable: null, unsure: ["fast_mode"] });

describe("a place card answers NO when the bottom line can't confirm that same place", () => {
  it("Texas with fast modes answered Not sure: the bottom line and the Texas card both say NO, naming Texas", () => {
    const s = show({ state: "TX", age: 30, facts: notSure });
    expect(s.result.state.status).toBe("yes");
    expect(s.bottom).toEqual({ word: "NO", mark: "✕", line: "We can't confirm it's legal in Texas." });
    expect(s.cards.map(({ id, word, mark, line }) => ({ id, word, mark, line }))).toEqual([
      { id: "TX", word: "NO", mark: "✕", line: "We can't confirm it's legal in Texas." },
    ]);
    // The card says why, in the same words as the bottom line, and keeps the rule's own reason folded away.
    const lines = visibleLines(s.cards[0].html);
    expect(lines).toContain('You answered "not sure" about fast modes. A mode over 20 mph on the motor alone, or over 28 mph with pedal assist, would make it not a legal e-bike.');
    expect(lines).toContain("What the rule says for these facts");
    expect(headlineProblems(s.cards[0].html, "en", "no")).toEqual([]);
    expect(hedgeProblems(lines)).toEqual([]);
  });

  it("the same in Spanish", () => {
    const s = show({ state: "TX", age: 30, facts: notSure }, "es");
    expect(s.cards[0]).toMatchObject({ word: "NO", mark: "✕", line: "No podemos confirmar que sea legal en Texas." });
    expect(headlineProblems(s.cards[0].html, "es", "no")).toEqual([]);
  });

  it("states with no fast-mode rule of their own show NO on the state card for a Not sure answer", () => {
    const yesUnderNo: string[] = [];
    let held = 0;
    for (const state of ["AL", "AR", "AZ", "DC", "FL", "GA", "TX", "WI", "WY", "NY", "PA", "OH"]) {
      const s = show({ state, age: 30, facts: notSure });
      if (s.result.state.status === "yes") held += 1;
      for (const c of s.cards) if (c.word === "YES" && s.bottom.word === "NO") yesUnderNo.push(`${state} ${c.id}`);
    }
    expect(held).toBeGreaterThan(5);
    expect(yesUnderNo).toEqual([]);
  });

  it("read facts left unchecked: California and Encinitas say NO until the facts are checked, then YES", () => {
    const read = fromRead(classBike(2), "text");
    const unconfirmed = unconfirmedFields(read.checks);
    expect(unconfirmed.length).toBeGreaterThan(0);
    const s = show({ state: "CA", age: 11, facts: read.facts, places: ["encinitas"], unconfirmed });
    expect(s.bottom.word).toBe("NO");
    for (const c of s.cards) {
      expect(c, c.id).toMatchObject({ status: "yes", word: "NO", mark: "✕", line: "We can't say YES until you check the facts read from a link or photo against the bike." });
    }
    const checked = show({ state: "CA", age: 11, facts: read.facts, places: ["encinitas"], unconfirmed: [] });
    expect(checked.bottom.word).toBe("YES");
    expect(checked.cards.map((c) => c.word)).toEqual(["YES", "YES"]);
  });

  it("a ride after Nov 15, 2026, past the state check: the California card says NO with the bottom line", () => {
    const s = show({ state: "CA", age: 30, facts: classBike(2), date: "2026-12-20" });
    expect(s.result.state.status).toBe("yes");
    expect(s.bottom).toEqual({ word: "NO", mark: "✕", line: "We can't confirm it's legal in California." });
    expect(s.cards[0]).toMatchObject({ word: "NO", line: "We can't confirm it's legal in California." });
    expect(visibleLines(s.cards[0].html).some((l) => l.includes("Nov 15, 2026"))).toBe(true);
    // Inside the horizon the same ride is YES on both.
    const inside = show({ state: "CA", age: 30, facts: classBike(2), date: "2026-11-15" });
    expect([inside.bottom.word, ...inside.cards.map((c) => c.word)]).toEqual(["YES", "YES"]);
  });

  it("the QR flyer ride, City of San Diego plus an SDUHSD campus: the campus card says NO with the bottom line", () => {
    const s = show({ state: "CA", age: 15, facts: classBike(1), places: ["city_of_san_diego", "sduhsd_campuses"] });
    expect(s.bottom.word).toBe("NO");
    const campus = s.cards.find((c) => c.id === "sduhsd_campuses");
    expect(campus).toMatchObject({ status: "yes", word: "NO", line: "We can't confirm it's legal on an SDUHSD campus." });
    // The City of San Diego record was read in enacted text and allows it, so its own card stays YES.
    expect(s.cards.find((c) => c.id === "city_of_san_diego")?.word).toBe("YES");
  });

  it("an allowed card with nothing held back is YES, and a card that is not allowed is never held back", () => {
    const yes = evaluate({ state: "CA", riderAge: 30, rideDate: TODAY, facts: classBike(1), places: [] }).state;
    expect(heldBack(yes, TODAY)).toBeNull();
    expect(cardAnswer(yes, TODAY)).toBe("yes");
    const no = evaluate({ state: "CA", riderAge: 14, rideDate: TODAY, facts: classBike(3), places: [] }).state;
    expect(no.status).toBe("no");
    expect(heldBack(no, TODAY, ["classes"])).toBeNull();
    expect(cardAnswer(no, TODAY)).toBe("no");
  });
});
