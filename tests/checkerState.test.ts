// The checker's start state and its follow-up list, without a browser.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FollowUps } from "@/components/FollowUps";
import { Checker } from "@/components/Checker";
import { resultHint } from "@/components/PlaceSearch";
import { linkedPick } from "@/lib/places/linked";
import {
  answerShown,
  keepAsked,
  LAST_RIDE_DATE,
  msUntilNextDay,
  nextAsked,
  parseShareLink,
  rideDateFor,
  rideDateIn,
  sameWheelSize,
  withOneWheelSize,
  withWheelCount,
  withWheelSize,
  type AskedQuestions,
} from "@/lib/checkerState";
import { evaluate } from "@/lib/rules";
import { bottomLine } from "@/lib/rules/bottomLine";
import { emptyFacts, type BikeFacts, type QuestionId } from "@/lib/rules/types";
import { placeHint, placeName } from "@/lib/i18n/names";
import { callIfCurrent, type PedalCall } from "@/lib/photo/pedalRule";
import { classBike } from "./helpers";
import { mount, one, textOf } from "./hooks";

describe("share link and defaults", () => {
  it("ticks no place when the link names none, so the places covered are the family's own choice", () => {
    expect(parseShareLink("")).toEqual({ lang: null, state: "CA", places: [] });
    expect(parseShareLink("?lang=es&state=tx").places).toEqual([]);
  });

  it("ticks exactly the places a QR or shared link names, and drops unknown or repeated ones", () => {
    // Oceanside has had a record since Oct 20, 2026. Los Angeles has none.
    const link = parseShareLink("?state=CA&place=city_of_san_diego,sduhsd_campuses,los_angeles,oceanside,city_of_san_diego");
    expect(link.places).toEqual(["city_of_san_diego", "sduhsd_campuses", "oceanside"]);
  });

  it("reads the language and state, and falls back to California for an unknown state", () => {
    expect(parseShareLink("?lang=es&state=tx")).toMatchObject({ lang: "es", state: "TX" });
    expect(parseShareLink("?lang=fr&state=zz")).toMatchObject({ lang: null, state: "CA" });
  });
});

describe("follow-up questions stay on screen once asked", () => {
  const unanswered = classBike(2, { motorOver20: null, assistOver28: null, switchable: null });
  const ask = (facts: typeof unanswered) =>
    evaluate({ state: "CA", riderAge: 14, rideDate: "2026-10-19", facts, places: ["city_of_san_diego"] }).state.questions;

  it("keeps the fast-mode question after a 'not sure' answer, so it can be changed", () => {
    const first = ask(unanswered);
    expect(first).toEqual(["fast_mode"]);
    const afterNotSure = ask({ ...unanswered, unsure: ["fast_mode"] });
    expect(afterNotSure).toEqual([]);
    expect(keepAsked(first, afterNotSure)).toEqual(["fast_mode"]);
  });

  it("keeps a definite answer's question too, and adds new ones at the end", () => {
    expect(keepAsked(["fast_mode"], [])).toEqual(["fast_mode"]);
    expect(keepAsked(["fast_mode"], ["wheels", "fast_mode"])).toEqual(["fast_mode", "wheels"]);
  });

  it("still renders both fast-mode questions after a 'not sure' answer", () => {
    const facts = { ...unanswered, unsure: ["fast_mode" as const] };
    const html = renderToStaticMarkup(createElement(FollowUps, { lang: "en", questions: ["fast_mode"], facts, onChange: () => {} }));
    expect(html).toContain("In any mode, can the motor alone push it past 20 mph?");
    expect(html).toContain("In any mode, can pedal assist go past 28 mph?");
  });
});

describe("second review fixes: the ride date field", () => {
  // The latest record check: the 13 cities added on Oct 20, 2026.
  const TODAY = "2026-10-20";

  it("checks today and any date up to the last one the picker offers", () => {
    expect(rideDateIn(TODAY, TODAY)).toBe(TODAY);
    expect(rideDateIn("2027-05-05", TODAY)).toBe("2027-05-05");
    expect(rideDateIn(LAST_RIDE_DATE, TODAY)).toBe(LAST_RIDE_DATE);
  });

  it("refuses a typed past date, since the table keeps only the rules in force from now on", () => {
    expect(rideDateIn("2026-06-15", TODAY)).toBeNull();
    expect(rideDateIn("2015-06-01", TODAY)).toBeNull();
    expect(rideDateIn("2026-10-18", TODAY)).toBeNull();
  });

  it("refuses a typed date after the last one, and anything that isn't a date", () => {
    expect(rideDateIn("2031-01-01", TODAY)).toBeNull();
    expect(rideDateIn("2030-01-01", TODAY)).toBeNull();
    expect(rideDateIn("", TODAY)).toBeNull();
    expect(rideDateIn("06/15/2026", TODAY)).toBeNull();
  });
});

describe("second review fixes: a follow-up stays on screen when the state changes", () => {
  const facts: BikeFacts = classBike(1, { motorOver20: null, assistOver28: null, switchable: null });
  const ask = (state: string, f: BikeFacts): QuestionId[] => {
    const r = evaluate({ state, riderAge: 30, rideDate: "2026-10-19", facts: f, places: [] });
    return [...new Set([...r.state.questions, ...r.local.flatMap((v) => v.questions)])];
  };

  it("keeps an answered 'not sure' question through TX, CA and back to TX, so it can still be changed", () => {
    const round = 1;
    let shown: AskedQuestions = { round: -1, ids: [] };
    shown = nextAsked(shown, round, ask("TX", facts));
    expect(shown.ids).toEqual(["fast_mode"]);

    const unsure = { ...facts, unsure: ["fast_mode" as const] };
    shown = nextAsked(shown, round, ask("TX", unsure));
    expect(shown.ids).toEqual(["fast_mode"]);

    shown = nextAsked(shown, round, ask("CA", unsure));
    expect(ask("CA", unsure)).toEqual([]);
    expect(shown.ids).toEqual(["fast_mode"]);

    shown = nextAsked(shown, round, ask("TX", unsure));
    expect(shown.ids).toEqual(["fast_mode"]);
    const html = renderToStaticMarkup(createElement(FollowUps, { lang: "en", questions: shown.ids, facts: unsure, onChange: () => {} }));
    expect(html).toContain("In any mode, can the motor alone push it past 20 mph?");
  });

  it("starts the list over only when new bike facts come in", () => {
    const first = nextAsked({ round: -1, ids: [] }, 1, ["fast_mode"]);
    expect(nextAsked(first, 1, []).ids).toEqual(["fast_mode"]);
    expect(nextAsked(first, 2, []).ids).toEqual([]);
  });

  it("is the logic the checker runs, not a copy of it, along with the date check and the place picker", () => {
    const source = readFileSync(join(__dirname, "..", "components", "Checker.tsx"), "utf8");
    expect(source).toContain("nextAsked(asked, round, pending)");
    expect(source).not.toMatch(/askKey|stateCode}`/);
    expect(source).toContain("rideDateFor(pickDate, dateText, today)");
    // "Today" is state that a timer and the page coming back into view refresh, not a value read once.
    expect(source).toContain("const [today, setToday] = useState(");
    expect(source).toContain("msUntilNextDay(");
    expect(source).toContain('addEventListener("visibilitychange"');
    expect(source).toContain("<PlaceSearch");
  });
});

describe("second review fixes: typing a wheel size never picks the number of wheels", () => {
  const base = { ...classBike(1), wheelCount: null, wheelFrontIn: null, wheelRearIn: null };
  const card = (state: string, f: BikeFacts) => evaluate({ state, riderAge: 30, rideDate: "2026-10-19", facts: f, places: [] });

  it("leaves the count unknown, so the question stays open and the answer can't be YES", () => {
    const typed = withWheelSize(base, 18, true);
    expect(typed.wheelCount).toBeNull();
    expect(typed.wheelFrontIn).toBe(18);
    expect(typed.wheelRearIn).toBe(18);
    for (const [state, inches] of [["WA", 18], ["AL", 20], ["LA", 18]] as const) {
      const result = card(state, withWheelSize(base, inches, true));
      expect(result.state.status, state).toBe("need_info");
      expect(result.state.questions, state).toContain("wheels");
      expect(bottomLine(result, "2026-10-19").kind, state).toBe("no_unconfirmed");
    }
  });

  it("gives the two-wheeler and three-wheeler answers once the count is picked", () => {
    expect(card("WA", withWheelCount(withWheelSize(base, 18, true), 2)).state.status).toBe("yes");
    expect(card("WA", withWheelCount(withWheelSize(base, 18, true), 3)).state.status).toBe("not_ebike");
    expect(card("AL", withWheelCount(withWheelSize(base, 20, true), 3)).state.status).toBe("cant_confirm");
  });

  it("clears an earlier 'not sure' when a size or count is given", () => {
    const unsure = { ...base, unsure: ["wheels" as const] };
    expect(withWheelSize(unsure, 20, true).unsure).toEqual([]);
    expect(withWheelCount(unsure, 2).unsure).toEqual([]);
    expect(withWheelSize(emptyFacts(), 20, false).wheelRearIn).toBeNull();
  });
});

describe("second review fixes: the place picker", () => {
  it("ties the SDUHSD campus hint to its checkbox, so screen readers hear the CCA cue", () => {
    for (const lang of ["en", "es"] as const) {
      vi.stubGlobal("window", { location: { search: `?lang=${lang}&state=CA&place=city_of_san_diego,sduhsd_campuses` } });
      try {
        const m = mount(Checker, {}, { effects: false });
        const box = one(m.tree(), (e) => e.type === "input" && e.props["aria-label"] === placeName("sduhsd_campuses", lang), "campus box");
        expect(box.props.checked).toBe(true);
        const hint = one(m.tree(), (e) => e.type === "span" && e.props.id === box.props["aria-describedby"], "campus hint");
        expect(textOf(hint)).toBe(placeHint("sduhsd_campuses", lang));
      } finally {
        vi.unstubAllGlobals();
      }
    }
  });

  it("shows the CCA area cue under the City of San Diego and the unincorporated county in the search results", () => {
    for (const lang of ["en", "es"] as const) {
      const city = linkedPick("city_of_san_diego");
      const county = linkedPick("unincorporated_san_diego_county");
      if (!city || !county) throw new Error("no linked pick");
      expect(resultHint(city, lang)).toBe(placeHint("city_of_san_diego", lang));
      expect(resultHint(county, lang)).toBe(placeHint("unincorporated_san_diego_county", lang));
      const encinitas = linkedPick("encinitas");
      if (!encinitas) throw new Error("no Encinitas");
      expect(resultHint(encinitas, lang)).toBe("");
    }
  });

  it("names Canyon Crest Academy under the SDUHSD campus and the CCA area under the City", () => {
    expect(placeHint("sduhsd_campuses", "en")).toContain("Canyon Crest Academy");
    expect(placeHint("city_of_san_diego", "en")).toContain("CCA");
  });

  it("never lets a checkbox shrink when its label wraps", () => {
    const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
    const rule = /\.check input \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/flex:\s*none|flex-shrink:\s*0/);
  });
});

describe("third review fixes (Oct 19, 2026): the ride date follows the real today", () => {
  it("with no date picked, the ride date is the fresh today, not the day the page opened", () => {
    // Page opened Nov 18, used after midnight. The stored date text still says Nov 18.
    expect(rideDateFor(false, "2026-11-18", "2026-11-19")).toBe("2026-11-19");
    const stale = evaluate({ state: "CA", riderAge: 10, rideDate: "2026-11-18", facts: classBike(1), places: ["encinitas"] });
    const fresh = evaluate({ state: "CA", riderAge: 10, rideDate: rideDateFor(false, "2026-11-18", "2026-11-19") ?? "", facts: classBike(1), places: ["encinitas"] });
    expect(stale.local[0].status).toBe("yes");
    expect(fresh.local[0].reason.code).toBe("local_under_12_after_check");
    expect(bottomLine(fresh, "2026-11-19").kind).toBe("no_unconfirmed");
  });

  it("a picked date that today has passed gets no answer", () => {
    expect(rideDateFor(true, "2026-11-18", "2026-11-19")).toBeNull();
    expect(rideDateFor(true, "2026-12-01", "2026-11-19")).toBe("2026-12-01");
    expect(rideDateFor(false, "", "2030-01-01")).toBeNull();
  });

  it("re-reads today just after the next local midnight", () => {
    const ms = msUntilNextDay(new Date(2026, 10, 18, 23, 59, 0));
    expect(ms).toBe(61_000);
    expect(msUntilNextDay(new Date(2026, 10, 19, 0, 0, 0, 500))).toBeGreaterThan(23 * 3600 * 1000);
  });
});

describe("third review fixes (Oct 19, 2026): what the follow-up card shows", () => {
  const render = (questions: QuestionId[], facts: BikeFacts) =>
    renderToStaticMarkup(createElement(FollowUps, { lang: "en", questions, facts, onChange: () => undefined }));
  const checkedRadios = (html: string) => (html.match(/type="radio"[^>]*checked=""/g) ?? []).length;

  it("still shows 'not sure' picked when the card is shown again, matching the bottom line", () => {
    const facts = classBike(2, { motorOver20: null, assistOver28: null, switchable: null, weightOver100: null, weightLb: null, unsure: ["fast_mode", "weight"] });
    const html = render(["fast_mode", "weight"], facts);
    expect(checkedRadios(html)).toBe(3);
    expect(answerShown(null, true)).toBe("unsure");
    expect(answerShown(null, false)).toBeNull();
    expect(answerShown(false, true)).toBe("no");
    // An unanswered question still shows nothing picked.
    expect(checkedRadios(render(["fast_mode"], classBike(2, { motorOver20: null, assistOver28: null, switchable: null })))).toBe(0);
  });

  it("shows the rear field when the facts hold two wheel sizes, so no size is hidden", () => {
    const mixed = classBike(1, { wheelFrontIn: 12, wheelRearIn: 20 });
    expect(sameWheelSize(mixed)).toBe(false);
    expect(render(["wheels"], mixed)).toContain(">Rear (inches)</label>");
    expect(sameWheelSize(classBike(1))).toBe(true);
    expect(render(["wheels"], classBike(1))).not.toContain(">Rear (inches)</label>");
  });

  it("switching back to one wheel size copies the front size to the rear, so a 12 inch bike is judged as 12 inch", () => {
    const mixed = classBike(1, { wheelFrontIn: 12, wheelRearIn: 20 });
    const card = (f: BikeFacts) => evaluate({ state: "AL", riderAge: 30, rideDate: "2026-10-19", facts: f, places: [] }).state;
    expect(card(mixed).status).toBe("yes");
    const one = withOneWheelSize(mixed);
    expect(one.wheelRearIn).toBe(12);
    expect(card(one).status).toBe("not_ebike");
    expect(card(one).reason.code).toBe("caution_wheel_size");
    const source = readFileSync(join(__dirname, "..", "components", "FollowUps.tsx"), "utf8");
    expect(source).toContain("onChange(withOneWheelSize(facts))");
    expect(source).toContain("useState(sameWheelSize(facts))");
  });
});

describe("third review fixes (Oct 19, 2026): a slow photo check never fills in another bike", () => {
  it("drops the call when the card that asked for it has left the page", async () => {
    const calls: PedalCall[] = [];
    const run = async () => ({ call: "pedals" as const });
    expect(await callIfCurrent(run, () => false, (c) => calls.push(c))).toBeNull();
    expect(calls).toEqual([]);
    expect(await callIfCurrent(run, () => true, (c) => calls.push(c))).toBe("pedals");
    expect(calls).toEqual(["pedals"]);
  });

  it("is the guard the photo check runs", () => {
    const source = readFileSync(join(__dirname, "..", "components", "PedalPhotoCheck.tsx"), "utf8");
    expect(source).toContain("callIfCurrent(");
    expect(source).toContain("() => onPage.current");
    expect(source).toContain("onPage.current = false");
  });
});
