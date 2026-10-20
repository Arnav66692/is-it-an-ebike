// A NO can rest on a fact read from a link or photo that the family hasn't checked, like pedals
// read as missing. The NO stays a NO, since it only ever errs toward NO, but the bottom line names
// those facts in one line that says the answer could change once they are checked, in both
// languages. A NO, not confirmed already names them first under What's missing, so it gets no
// second line.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { announcement, BottomLineCard } from "@/components/BottomLineCard";
import { evaluate } from "@/lib/rules";
import { bottomLine, uncheckedFactsNote, type BottomLine } from "@/lib/rules/bottomLine";
import { READ_FIELDS, type BikeFacts, type PlaceId, type ReadField } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { READ_FIELD_NAMES, renderLine } from "@/lib/i18n/verdicts";
import { classBike } from "./helpers";

const DAY = "2026-10-19";

function line(age: number, facts: BikeFacts, places: PlaceId[], unconfirmed: readonly ReadField[] = []): BottomLine {
  return bottomLine(evaluate({ state: "CA", riderAge: age, rideDate: DAY, facts, places }), DAY, unconfirmed);
}

/** An 11-year-old on a Class 2 in the City of San Diego, which bans riders under 12. */
const UNDER_12 = { age: 11, facts: classBike(2), places: ["city_of_san_diego"] as PlaceId[] };

/** The card's visible text, one piece per line, with quotes put back. */
function render(bl: BottomLine, lang: Lang): string[] {
  return renderToStaticMarkup(createElement(BottomLineCard, { line: bl, lang, stateCode: "CA" }))
    .replace(/<[^>]+>/g, "\n")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("uncheckedFactsNote", () => {
  it("is null for a YES, and for a NO, not confirmed, which names the facts under What's missing", () => {
    expect(uncheckedFactsNote("yes", ["hasPedals"])).toBeNull();
    expect(uncheckedFactsNote("no_unconfirmed", ["hasPedals"])).toBeNull();
  });

  it("is null for a NO, not allowed once every read fact is checked", () => {
    expect(uncheckedFactsNote("no_illegal", [])).toBeNull();
  });

  it("names each unchecked fact once, in the order the facts card shows them", () => {
    expect(uncheckedFactsNote("no_illegal", ["weightLb", "hasPedals", "classes", "hasPedals"])).toEqual({
      code: "bl_no_unchecked_facts",
      params: { fields: "hasPedals,classes,weightLb" },
    });
  });

  it("names all of them when nothing read was checked, not only the facts a card used", () => {
    const all = [...READ_FIELDS].reverse();
    expect(uncheckedFactsNote("no_illegal", all)?.params?.fields).toBe(READ_FIELDS.join(","));
  });
});

describe("a NO, not allowed with read facts unchecked", () => {
  it("stays the same NO, with the same reasons, and adds the line", () => {
    const typed = line(UNDER_12.age, UNDER_12.facts, UNDER_12.places);
    const read = line(UNDER_12.age, UNDER_12.facts, UNDER_12.places, ["classes", "weightLb"]);
    expect(typed.kind).toBe("no_illegal");
    expect(read.kind).toBe("no_illegal");
    expect(read.blocked).toEqual(typed.blocked);
    expect(read.notEbikeOnly).toBe(typed.notEbikeOnly);
    expect(read.missing).toEqual([]);
    expect(typed.factsNote).toBeNull();
    expect(read.factsNote).toEqual({ code: "bl_no_unchecked_facts", params: { fields: "classes,weightLb" } });
  });

  it("drops the line once the last fact is checked, and the NO stays", () => {
    const checked = line(UNDER_12.age, UNDER_12.facts, UNDER_12.places, []);
    expect(checked.kind).toBe("no_illegal");
    expect(checked.factsNote).toBeNull();
  });

  it("does the same for a NO, not an e-bike", () => {
    const bl = line(30, classBike(2, { hasPedals: false }), [], ["hasPedals"]);
    expect(bl.kind).toBe("no_illegal");
    expect(bl.notEbikeOnly).toBe(true);
    expect(bl.factsNote).toEqual({ code: "bl_no_unchecked_facts", params: { fields: "hasPedals" } });
  });

  it("leaves a NO, not confirmed with its one facts item first under What's missing, and no second line", () => {
    const bl = line(15, classBike(1), ["sduhsd_campuses"], ["classes"]);
    expect(bl.kind).toBe("no_unconfirmed");
    expect(bl.missing[0]).toEqual({ kind: "facts", where: [], line: { code: "bl_unconfirmed_facts", params: { fields: "classes" } } });
    expect(bl.missing.filter((m) => m.kind === "facts")).toHaveLength(1);
    expect(bl.factsNote).toBeNull();
  });

  it("never sets the line on a YES", () => {
    const bl = line(13, classBike(1), ["encinitas"]);
    expect(bl.kind).toBe("yes");
    expect(bl.factsNote).toBeNull();
  });
});

describe("the words a family reads", () => {
  const note = (fields: string, lang: Lang) => renderLine({ code: "bl_no_unchecked_facts", params: { fields } }, lang, "California");

  it("names one fact and says the answer could change once it is checked, in English and Spanish", () => {
    expect(note("hasPedals", "en")).toBe(
      'You haven\'t checked the pedals against the bike yet. A fact read from a link or photo can be wrong, so this answer could change once you check it. Look at the bike and tick "It matches the bike" under it in "Here\'s what I read" above, or fix it.',
    );
    expect(note("hasPedals", "es")).toBe(
      'Todavía no comparaste con la bicicleta los pedales. Un dato leído de un enlace o una foto puede estar mal, así que esta respuesta podría cambiar cuando lo compares. Mira la bicicleta y marca "Coincide con la bicicleta" debajo de ese dato en "Esto es lo que leí", arriba, o corrige el dato.',
    );
  });

  it("names several facts and says the answer could change once they are checked, in English and Spanish", () => {
    expect(note("classes,weightLb", "en")).toBe(
      'You haven\'t checked the class and the weight against the bike yet. Facts read from a link or photo can be wrong, so this answer could change once you check them. Look at the bike and tick "It matches the bike" under each one in "Here\'s what I read" above, or fix any that are wrong.',
    );
    expect(note("classes,weightLb", "es")).toBe(
      'Todavía no comparaste con la bicicleta la clase y el peso. Los datos leídos de un enlace o una foto pueden estar mal, así que esta respuesta podría cambiar cuando los compares. Mira la bicicleta y marca "Coincide con la bicicleta" debajo de cada uno en "Esto es lo que leí", arriba, o corrige los que estén mal.',
    );
  });

  it("quotes the facts card's own words, so the family can find the box", () => {
    for (const lang of ["en", "es"] as const) {
      for (const fields of ["hasPedals", "classes,weightLb"]) {
        expect(note(fields, lang)).toContain(`"${t(lang, "readMatches")}"`);
        expect(note(fields, lang)).toContain(`"${t(lang, "step3")}"`);
      }
    }
  });

  it("names every fact by its plain name, never a raw id, and uses periods and commas only", () => {
    for (const lang of ["en", "es"] as const) {
      for (const field of READ_FIELDS) {
        const text = note(field, lang);
        expect(text, `${lang} ${field}`).toContain(READ_FIELD_NAMES[lang][field]);
        expect(text, `${lang} ${field}`).not.toContain(field);
      }
      for (const text of [note(READ_FIELDS.join(","), lang), t(lang, "blToCheck"), t(lang, "blFactsCouldChange")]) {
        expect(text, text).not.toMatch(/[—–;:]/);
        expect(text, text).not.toMatch(/undefined|NaN|\{|\}/);
      }
    }
  });
});

describe("the bottom-line card", () => {
  const read = line(UNDER_12.age, UNDER_12.facts, UNDER_12.places, ["classes", "weightLb"]);

  it("shows the line once, under Still to check, right after the reasons, in both languages", () => {
    for (const lang of ["en", "es"] as const) {
      const text = render(read, lang);
      const sentence = renderLine(read.factsNote!, lang, "California");
      expect(text.filter((s) => s === sentence)).toHaveLength(1);
      const why = text.indexOf(t(lang, "blWhy"));
      const toCheck = text.indexOf(t(lang, "blToCheck"));
      expect(why).toBeGreaterThan(-1);
      expect(toCheck).toBeGreaterThan(why);
      expect(text.indexOf(sentence)).toBeGreaterThan(toCheck);
      expect(text[toCheck + 1]).toBe(t(lang, "blFactsWhere"));
      expect(text).not.toContain(t(lang, "blMissing"));
      expect(text).toContain(t(lang, "notLegalAdvice"));
    }
  });

  it("shows no Still to check section once every fact is checked", () => {
    const checked = line(UNDER_12.age, UNDER_12.facts, UNDER_12.places, []);
    for (const lang of ["en", "es"] as const) expect(render(checked, lang)).not.toContain(t(lang, "blToCheck"));
  });

  it("never names the facts twice on a NO, not confirmed", () => {
    const bl = line(15, classBike(1), ["sduhsd_campuses"], ["classes"]);
    for (const lang of ["en", "es"] as const) {
      const text = render(bl, lang);
      expect(text).not.toContain(t(lang, "blToCheck"));
      const missing = renderLine({ code: "bl_unconfirmed_facts", params: { fields: "classes" } }, lang, "California");
      const note = renderLine({ code: "bl_no_unchecked_facts", params: { fields: "classes" } }, lang, "California");
      expect(text.filter((s) => s === missing)).toHaveLength(1);
      expect(text).not.toContain(note);
    }
  });

  it("tells screen readers a NO, not allowed could change, and stops once the facts are checked", () => {
    expect(announcement(read, "en")).toBe(
      "Bottom line: NO. Not allowed. At least one rule we checked says no. This answer could change once you check the facts read from a link or photo against the bike.",
    );
    expect(announcement(read, "es")).toBe(
      "En resumen: NO. No permitida. Al menos una regla que revisamos dice que no. Esta respuesta podría cambiar cuando compares con la bicicleta los datos leídos de un enlace o una foto.",
    );
    const checked = line(UNDER_12.age, UNDER_12.facts, UNDER_12.places, []);
    expect(announcement(checked, "en")).toBe("Bottom line: NO. Not allowed. At least one rule we checked says no.");
  });
});
