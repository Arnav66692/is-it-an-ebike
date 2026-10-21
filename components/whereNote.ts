// The status line about the places a family picked: one added, removed or already there, or a move
// to another state's law. Shared by the checker and the bike finder.

import { stateLaw, stateOf, stateWhere, type Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import type { PickLabels } from "@/lib/places/linked";

/**
 * A status line about the places: one added, removed or already there, or a move to another
 * state's law. A move to another state is shown on the page, not only read out, and so is the
 * SDUHSD campus choice it removes.
 */
export interface WhereNote {
  key: "whereAdded" | "whereRemoved" | "whereAlready" | "whereStartedOver" | "whereStateSwitched" | "whereAddedNewState" | "whereNewState";
  place?: PickLabels;
  from?: string;
  to?: string;
  /** The SDUHSD campus was ticked and the move to another state removed it. */
  campusRemoved?: boolean;
}

/**
 * The status line's words. States are named the way the answers name them, so Spanish says
 * "en el Distrito de Columbia" and "la ley del Distrito de Columbia", with the article.
 */
export function whereNoteText(note: WhereNote | null, lang: Lang): string {
  if (!note) return "";
  const from = note.from ?? "";
  const to = note.to ?? "";
  const main = t(lang, note.key, {
    place: note.place?.[lang].text ?? "",
    inTo: stateWhere(to, lang),
    placesFrom: lang === "es" ? stateOf(from, lang) : stateWhere(from, lang),
    lawTo: stateLaw(to, lang, "inline"),
  });
  return note.campusRemoved ? `${main} ${t(lang, "whereCampusRemoved")}` : main;
}

/** True when the note says the answer moved to another state's law, so it is shown, not only read out. */
export function whereNoteShown(note: WhereNote | null): boolean {
  return note !== null && (note.to !== undefined || note.campusRemoved === true);
}

