// The California mods check: the data and its answer notes, the YES or NO for every mod, outcome,
// class, date and place, and that every reason, rule and penalty on the page is the data's own words.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { answerHead, linkedClass, ModAnswerCard, modsRideDate, modsToday } from "@/components/ModsCheck";
import { pageHref } from "@/components/SiteHeader";
import { kindText, MODS_KEYS, MODS_TEXT, modsText } from "@/lib/i18n/mods";
import { t, UI_KEYS } from "@/lib/i18n/ui";
import { answerMod, inEffect, modApplies, outcomesFor, overallYes, YES_KINDS, type AnswerKind, type ModChoice } from "@/lib/mods/answer";
import { buildModsData, FROM_2027, MODS_ANSWERS, MODS_DATA, MODS_SOURCE, type AnswersFile, type ModView } from "@/lib/mods/data";
import type { ClassNum } from "@/lib/rules/types";

const ROOT = join(__dirname, "..");
const SOURCE_TEXT = readFileSync(join(ROOT, "data", "mods", "ca-mods.json"), "utf8");
const SOURCE = JSON.parse(SOURCE_TEXT) as Record<string, unknown>;
const CLASSES: ClassNum[] = [1, 2, 3];
const DATES = ["2026-10-21", "2026-12-31", FROM_2027, "2028-06-01", "2029-01-01", "2029-12-31"];

/** Every string anywhere in the source file. */
function allStrings(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

const SOURCE_STRINGS = allStrings(SOURCE);

function mod(id: string): ModView {
  const found = MODS_DATA.mods.find((m) => m.id === id);
  if (!found) throw new Error(`no mod ${id}`);
  return found;
}

/** Every choice the page can offer for this mod on this class, and no choice at all. */
function choicesFor(m: ModView, cls: ClassNum): ModChoice[] {
  return [null, "other", ...outcomesFor(m, cls).map((o) => o.index)];
}

function unescape(html: string): string {
  return html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** The text of every element the card marks as a claim from the data. */
function claims(html: string): string[] {
  return [...html.matchAll(/data-claim=""[^>]*>([^<]*)</g)].map((m) => unescape(m[1]));
}

/** Every combination the page can show, once. */
function* everyAnswer() {
  for (const m of MODS_DATA.mods) {
    for (const cls of CLASSES) {
      if (!modApplies(m, cls)) continue;
      for (const choice of choicesFor(m, cls)) {
        for (const date of DATES) {
          for (const city of [false, true]) yield { m, cls, choice, date, city, answer: answerMod(MODS_DATA, m, cls, choice, date, city) };
        }
      }
    }
  }
}

describe("the mods data", () => {
  it("has the 18 verified mods, each checked by the second reader", () => {
    expect(MODS_DATA.mods).toHaveLength(18);
    const reader = SOURCE.second_reader as { mods_verified: number; mods_total: number };
    expect(reader.mods_verified).toBe(18);
    expect(reader.mods_total).toBe(18);
    for (const m of MODS_SOURCE.mods as unknown as { second_reader: { verified: boolean } }[]) expect(m.second_reader.verified).toBe(true);
  });

  it("carries the second reader's corrections", () => {
    const kit = MODS_SOURCE.mods.find((m) => m.mod_id === "speed_unlock_kit");
    const twelveB = kit?.penalties.find((p) => p.for.includes("VC 12500(b)"));
    expect(twelveB?.penalty_as_written).toContain("it is an infraction under VC 40000.1");
    expect(twelveB?.penalty_as_written).not.toContain("misdemeanor under Penal Code 17(d)");
    const battery = MODS_SOURCE.mods.find((m) => m.mod_id === "higher_voltage_battery");
    expect(battery?.selling_rule?.summary).toContain("unless it is sold or leased secondhand");
  });

  it("gives every rule and penalty a link to its source", () => {
    for (const m of MODS_DATA.mods) {
      for (const r of [...m.rules, ...m.sanDiego, ...m.notEbike, ...m.from2027, ...m.penalties]) expect(r.url, `${m.id} ${r.section}`).toMatch(/^https:\/\//);
    }
  });

  it("dates every 2027 change Jan 1, 2027 or later", () => {
    for (const m of MODS_DATA.mods) for (const r of m.from2027) expect(r.effective && r.effective >= FROM_2027, `${m.id} ${r.section}`).toBe(true);
  });

  it("refuses an answer note that reads an outcome as more than the source says", () => {
    const bad = structuredClone(MODS_ANSWERS) as AnswersFile;
    bad.mods.throttle_past_20_mph.outcomes[0].result = "same_class";
    expect(() => buildModsData(MODS_SOURCE, bad)).toThrow(/reads not_an_ebike as same_class/);
    const unresolved = structuredClone(MODS_ANSWERS) as AnswersFile;
    unresolved.mods.add_throttle_class1_or_class3.outcomes[1].result = "becomes_class_2";
    expect(() => buildModsData(MODS_SOURCE, unresolved)).toThrow(/reads unresolved as becomes_class_2/);
  });

  it("refuses a broken rule that is not one of the mod's rules", () => {
    const bad = structuredClone(MODS_ANSWERS) as AnswersFile;
    bad.mods.remove_brake_motor_cutoff.outcomes[0].breaks = "VC 99999";
    expect(() => buildModsData(MODS_SOURCE, bad)).toThrow(/not one of its rules/);
  });

  it("sends the page much less than the whole file", () => {
    expect(JSON.stringify(MODS_DATA).length).toBeLessThan(SOURCE_TEXT.length / 1.5);
  });
});

describe("every answer", () => {
  it("is YES only for an outcome the source reads as the same class or a new class, with no rule broken", () => {
    let yes = 0;
    let total = 0;
    for (const { m, choice, answer } of everyAnswer()) {
      total += 1;
      expect(answer.yes).toBe(YES_KINDS.includes(answer.kind));
      if (!answer.yes) continue;
      yes += 1;
      const outcome = m.outcomes.find((o) => o.index === (typeof choice === "number" ? choice : outcomesFor(m, 1)[0]?.index));
      expect(outcome, m.id).toBeDefined();
      const effect = MODS_SOURCE.mods.find((s) => s.mod_id === m.id)?.outcomes[outcome?.index ?? -1]?.legal_effect;
      expect(["same_class", "different_class"], `${m.id} ${effect}`).toContain(effect);
      expect(answer.breaks).toBeNull();
    }
    expect(total).toBeGreaterThan(1000);
    expect(yes).toBeGreaterThan(0);
  });

  it("is never YES for no answer, something else, an unsettled outcome or one that is not an e-bike", () => {
    const never: AnswerKind[] = ["unanswered", "other", "unresolved", "unclear_until_2027", "depends_on_result", "not_an_ebike", "breaks_rule", "sd_breaks", "sd_unresolved"];
    for (const { answer } of everyAnswer()) if (never.includes(answer.kind)) expect(answer.yes).toBe(false);
    for (const { m, cls, date, city } of everyAnswer()) {
      if (!m.ask) continue;
      expect(answerMod(MODS_DATA, m, cls, null, date, city).yes).toBe(false);
      expect(answerMod(MODS_DATA, m, cls, "other", date, city).yes).toBe(false);
    }
  });

  it("shows the 2027 changes only on or after Jan 1, 2027", () => {
    for (const { date, answer } of everyAnswer()) {
      if (date < FROM_2027) expect(answer.from2027).toEqual([]);
      for (const r of [...answer.rules, ...answer.from2027, ...answer.sanDiego, ...answer.notEbike]) expect(inEffect(r, date)).toBe(true);
    }
    expect(answerMod(MODS_DATA, mod("throttle_past_20_mph"), 2, null, FROM_2027, false).from2027.length).toBeGreaterThan(0);
  });

  it("leaves the motor vehicle penalties off a bike that stays an e-bike", () => {
    for (const { answer } of everyAnswer()) {
      if (answer.classAfter === null) continue;
      for (const p of answer.penalties) expect(MODS_DATA.notEbikePenaltyFors).not.toContain(p.for);
    }
  });
});

describe("the answers the research settles", () => {
  const TODAY = "2026-10-21";

  it("says a throttle past 20 mph ends e-bike status, with the towing penalty", () => {
    const a = answerMod(MODS_DATA, mod("throttle_past_20_mph"), 2, null, TODAY, false);
    expect(a.yes).toBe(false);
    expect(a.kind).toBe("not_an_ebike");
    expect(a.effects).toEqual(["not_an_ebike"]);
    expect(a.penalties.map((p) => p.section)).toContain("VC 22651.08(a)(1), (c)");
    expect(a.notEbike.length).toBeGreaterThan(0);
  });

  it("says a Class 1 bike unlocked to 28 mph with pedaling only becomes Class 3", () => {
    const kit = mod("speed_unlock_kit");
    const a = answerMod(MODS_DATA, kit, 1, 3, TODAY, false);
    expect(a.yes).toBe(true);
    expect(a.kind).toBe("becomes_class_3");
    expect(a.classAfter).toBe(3);
    expect(outcomesFor(kit, 2).map((o) => o.index)).not.toContain(3);
  });

  it("says assist past 28 mph is not settled before 2027 and not an e-bike from Jan 1, 2027", () => {
    const kit = mod("speed_unlock_kit");
    expect(answerMod(MODS_DATA, kit, 3, 2, "2026-12-31", false).kind).toBe("unclear_until_2027");
    const later = answerMod(MODS_DATA, kit, 3, 2, FROM_2027, false);
    expect(later.kind).toBe("not_an_ebike");
    expect(later.yes).toBe(false);
  });

  it("says a throttle on a Class 3 bike is not settled, and offers the throttle mod only for Class 1 and 3", () => {
    const throttle = mod("add_throttle_class1_or_class3");
    expect(modApplies(throttle, 2)).toBe(false);
    const a = answerMod(MODS_DATA, throttle, 3, 1, TODAY, false);
    expect(a.kind).toBe("unresolved");
    expect(a.yes).toBe(false);
    expect(answerMod(MODS_DATA, throttle, 1, 0, TODAY, false).kind).toBe("becomes_class_2");
  });

  it("says a passenger seat is fine under state law and barred in the City of San Diego while its rule is in effect", () => {
    const seat = mod("passenger_seat_or_pegs");
    expect(answerMod(MODS_DATA, seat, 2, 0, TODAY, false).yes).toBe(true);
    const city = answerMod(MODS_DATA, seat, 2, 0, TODAY, true);
    expect(city.kind).toBe("sd_breaks");
    expect(city.yes).toBe(false);
    expect(city.reasons[0]).toContain("designed and made to carry more than one person");
    expect(answerMod(MODS_DATA, seat, 2, 0, "2029-12-31", true).yes).toBe(true);
    const pegs = answerMod(MODS_DATA, seat, 2, 1, TODAY, false);
    expect(pegs.kind).toBe("breaks_rule");
    expect(pegs.breaks?.section).toBe("VC 21204(b)");
  });

  it("reads the City's passenger rule first in each San Diego list", () => {
    for (const m of MODS_DATA.mods) if (m.sanDiego.length > 0) expect(m.sanDiego[0].section, m.id).toBe("SDMC 84.21(b)");
  });

  it("never calls a child trailer allowed in the City of San Diego", () => {
    const a = answerMod(MODS_DATA, mod("kid_trailer"), 1, null, TODAY, true);
    expect(a.kind).toBe("sd_unresolved");
    expect(a.yes).toBe(false);
    expect(answerMod(MODS_DATA, mod("kid_trailer"), 1, null, TODAY, false).yes).toBe(true);
  });

  it("says a disconnected brake cutoff breaks VC 24016(a)(2) though the class stays", () => {
    const a = answerMod(MODS_DATA, mod("remove_brake_motor_cutoff"), 1, null, TODAY, false);
    expect(a.kind).toBe("breaks_rule");
    expect(a.classAfter).toBe(1);
    expect(answerHead(a, "en")).toBe("Still Class 1, but riding it this way breaks VC 24016(a)(2).");
  });

  it("asks before calling lights or a child seat fine", () => {
    for (const id of ["lights", "kid_seat", "raised_handlebars"]) {
      expect(mod(id).ask).toBe(true);
      expect(answerMod(MODS_DATA, mod(id), 2, null, TODAY, false).kind).toBe("unanswered");
    }
  });

  it("is YES for the whole bike only when every mod is YES", () => {
    const yes = answerMod(MODS_DATA, mod("horn_or_bell"), 2, null, TODAY, false);
    const no = answerMod(MODS_DATA, mod("remove_pedals"), 2, null, TODAY, false);
    expect(overallYes([])).toBeNull();
    expect(overallYes([yes])).toBe(true);
    expect(overallYes([yes, no])).toBe(false);
  });
});

describe("every claim on the page is the data's own words", () => {
  it("draws each reason, rule, date line and penalty from data/mods/ca-mods.json", () => {
    let checked = 0;
    const seen = new Set<string>();
    for (const { m, answer } of everyAnswer()) {
      const key = JSON.stringify(answer);
      if (seen.has(key)) continue;
      seen.add(key);
      for (const lang of ["en", "es"] as const) {
        const html = renderToStaticMarkup(createElement(ModAnswerCard, { mod: m, answer, lang }));
        for (const text of claims(html)) {
          expect(SOURCE_STRINGS.has(text), `${m.id}: "${text}"`).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(2000);
  }, 60_000);

  it("shows the penalty text exactly as the data gives it", () => {
    const a = answerMod(MODS_DATA, mod("passenger_seat_or_pegs"), 2, 0, "2026-10-21", false);
    const html = renderToStaticMarkup(createElement(ModAnswerCard, { mod: mod("passenger_seat_or_pegs"), answer: a, lang: "es" }));
    const raw = MODS_SOURCE.mods.find((s) => s.mod_id === "passenger_seat_or_pegs")?.penalties[0].penalty_as_written ?? "";
    expect(claims(html)).toContain(raw);
  });
});

describe("the page's words", () => {
  it("has every key in English and Spanish", () => {
    for (const key of MODS_KEYS) {
      expect(MODS_TEXT.es[key], key).toBeDefined();
      if (key !== "englishNote") expect(MODS_TEXT.en[key], key).not.toBe("");
    }
    for (const kind of [...YES_KINDS, "not_an_ebike", "unresolved", "other", "unclear_until_2027", "depends_on_result", "breaks_rule", "sd_breaks", "sd_unresolved", "unanswered"] as AnswerKind[]) {
      expect(kindText("en", kind, { n: 2, section: "VC 1" })).not.toMatch(/\{/);
      expect(kindText("es", kind, { n: 2, section: "VC 1" })).not.toMatch(/\{/);
    }
  });

  it("has a Spanish name, example and condition for every mod", () => {
    for (const m of MODS_DATA.mods) {
      expect(m.name.es).not.toBe(m.name.en);
      expect(m.examples.es).not.toBe("");
      for (const o of m.outcomes) expect(o.if.es, `${m.id} ${o.index}`).not.toBe("");
    }
  });

  it("uses only periods and commas, no em dashes or semicolons, in the app's own words", () => {
    const own = [
      ...Object.values(MODS_TEXT.en),
      ...Object.values(MODS_TEXT.es),
      ...MODS_DATA.mods.flatMap((m) => [m.name.es, m.examples.es, ...m.outcomes.map((o) => o.if.es)]),
      ...(["navLabel", "navCheck", "navMods", "navFind", "checkMods"] as const).flatMap((k) => [t("en", k), t("es", k)]),
    ];
    for (const s of own) expect(s, s).not.toMatch(/[—–;:]/);
    expect(UI_KEYS).toContain("checkMods");
  });

  it("keeps the not legal advice line", () => {
    expect(t("en", "notLegalAdvice")).toContain("General information, not legal advice.");
    // The mods check covers every state now, so the California-only line is gone.
    expect(MODS_KEYS as string[]).not.toContain("caOnly");
    for (const text of [...Object.values(MODS_TEXT.en), ...Object.values(MODS_TEXT.es)]) expect(text).not.toMatch(/California law only|Solo la ley de California/);
  });
});

describe("links and dates", () => {
  it("reads the class a link names", () => {
    expect(linkedClass("?class=2&lang=es")).toBe(2);
    expect(linkedClass("?class=4")).toBeNull();
    expect(linkedClass("")).toBeNull();
  });

  it("keeps the language in links between the parts of the app", () => {
    expect(pageHref("/mods", "es", { class: "1" })).toBe("/mods?lang=es&class=1");
    expect(pageHref("/mods", "en")).toBe("/mods");
  });

  it("never answers for a date before the law was read or after the last date", () => {
    expect(modsToday("2026-01-01", "2026-10-21")).toBe("2026-10-21");
    expect(modsRideDate(false, "", "2026-10-21")).toBe("2026-10-21");
    expect(modsRideDate(true, "2026-10-20", "2026-10-21")).toBeNull();
    expect(modsRideDate(true, "2030-01-01", "2026-10-21")).toBeNull();
    expect(modsRideDate(true, "2027-03-01", "2026-10-21")).toBe("2027-03-01");
  });
});
