// Pure pieces of the checker's state, kept out of the component so tests can run them.

import { PLACE_IDS } from "@/lib/rules/local";
import { STATE_CODES } from "@/lib/rules/compile";
import type { PlaceId, QuestionId } from "@/lib/rules/types";
import type { Lang } from "@/lib/i18n/names";

export interface ShareLink {
  lang: Lang | null;
  state: string;
  /** Only the places the link names. With no link, nothing is ticked, so every place is the family's own choice. */
  places: PlaceId[];
}

/** Reads ?lang=, ?state= and ?place= from a QR or shared link. */
export function parseShareLink(search: string): ShareLink {
  const params = new URLSearchParams(search);
  const lang = params.get("lang");
  const state = params.get("state")?.toUpperCase();
  const places = (params.get("place") ?? "")
    .split(",")
    .filter((p): p is PlaceId => PLACE_IDS.includes(p as PlaceId));
  return {
    lang: lang === "en" || lang === "es" ? lang : null,
    state: state && STATE_CODES.includes(state) ? state : "CA",
    places: [...new Set(places)],
  };
}

/**
 * The follow-up questions to show. A question stays once it has been asked, so an answer of
 * "not sure", or a wrong click, can always be changed. New questions are added at the end.
 */
export function keepAsked(asked: readonly QuestionId[], pending: readonly QuestionId[]): QuestionId[] {
  return [...asked, ...pending.filter((q) => !asked.includes(q))];
}
