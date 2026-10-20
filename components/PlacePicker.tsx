"use client";

import { useId } from "react";
import { PLACE_IDS } from "@/lib/rules/local";
import type { PlaceId } from "@/lib/rules/types";
import { placeHint, placeName, type Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";

interface Props {
  lang: Lang;
  places: PlaceId[];
  otherPlaces: boolean;
  onTogglePlace: (place: PlaceId) => void;
  onOtherPlaces: (on: boolean) => void;
}

/**
 * The San Diego places the bottom line covers. Each hint, like the CCA area under the City of
 * San Diego, is tied to its checkbox with aria-describedby, so screen readers hear it too.
 */
export function PlacePicker({ lang, places, otherPlaces, onTogglePlace, onOtherPlaces }: Props) {
  const hintId = useId();
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-semibold">{t(lang, "whereSD")}</legend>
      <p className="text-sm text-muted">{t(lang, "whereSDHelp")}</p>
      {PLACE_IDS.map((p) => {
        const hint = placeHint(p, lang);
        const id = `${hintId}-${p}`;
        return (
          <label key={p} className="check">
            <input
              type="checkbox"
              aria-label={placeName(p, lang)}
              aria-describedby={hint ? id : undefined}
              checked={places.includes(p)}
              onChange={() => onTogglePlace(p)}
            />
            <span>
              {placeName(p, lang)}
              {hint ? (
                <span id={id} className="block text-sm text-muted">
                  {hint}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
      <label className="check">
        <input type="checkbox" aria-label={t(lang, "otherPlaces")} checked={otherPlaces} onChange={(e) => onOtherPlaces(e.target.checked)} />
        <span>{t(lang, "otherPlaces")}</span>
      </label>
    </fieldset>
  );
}
