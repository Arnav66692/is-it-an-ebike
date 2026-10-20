// The checker's start state and its follow-up list, without a browser.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FollowUps } from "@/components/FollowUps";
import { keepAsked, parseShareLink } from "@/lib/checkerState";
import { evaluate } from "@/lib/rules";
import { classBike } from "./helpers";

describe("share link and defaults", () => {
  it("ticks no place when the link names none, so the places covered are the family's own choice", () => {
    expect(parseShareLink("")).toEqual({ lang: null, state: "CA", places: [] });
    expect(parseShareLink("?lang=es&state=tx").places).toEqual([]);
  });

  it("ticks exactly the places a QR or shared link names, and drops unknown or repeated ones", () => {
    const link = parseShareLink("?state=CA&place=city_of_san_diego,sduhsd_campuses,oceanside,city_of_san_diego");
    expect(link.places).toEqual(["city_of_san_diego", "sduhsd_campuses"]);
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
