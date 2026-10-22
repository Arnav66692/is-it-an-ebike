"use client";

// The pieces around the map: the filter chips with their counts, the buttons that float on the
// map, the empty and busy card, and the nearest list that lights up the picked spot.

import { useEffect, useId, useRef } from "react";
import type { Lang } from "@/lib/i18n/names";
import { mapText, spotKindText } from "@/lib/i18n/map";
import type { ChipCount } from "@/lib/map/mapState";
import { formatDistance, type NearSpot, type Spot, type SpotKind } from "@/lib/map/osm";
import { pinSvg } from "@/lib/map/pins";
import { SpotDetails, spotTitle } from "./SpotFacts";
import { prefersReducedMotion } from "./MapView";

/** A fixed SVG from lib/map/pins.ts, never data from the map. */
function Pin({ kind, className }: { kind: SpotKind; className: string }) {
  return <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: pinSvg(kind) }} />;
}

export function FilterChips({ lang, chips, onToggle }: { lang: Lang; chips: readonly ChipCount[]; onToggle: (kind: SpotKind) => void }) {
  return (
    <div className="map-chips" role="group" aria-label={mapText(lang, "filterLabel")}>
      {chips.map((c) => (
        <button key={c.kind} type="button" className="map-chip" aria-pressed={c.on} onClick={() => onToggle(c.kind)}>
          <Pin kind={c.kind} className="map-chip-pin" />
          <span>{mapText(lang, `chip_${c.kind}`)}</span>
          {c.count !== null ? <span className="map-chip-count">{c.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

interface ControlsProps {
  lang: Lang;
  canRecenter: boolean;
  onLocate: () => void;
  onRecenter: () => void;
}

/** My location and back to the picked place, floating at the map's top right. */
export function MapControls({ lang, canRecenter, onLocate, onRecenter }: ControlsProps) {
  return (
    <div className="map-ctls" role="group" aria-label={mapText(lang, "mapControls")}>
      <button type="button" className="map-ctl" onClick={onLocate} title={mapText(lang, "locate")}>
        <span className="map-ctl-icon map-ctl-locate" aria-hidden="true" />
        <span className="map-ctl-text">{mapText(lang, "locate")}</span>
      </button>
      {canRecenter ? (
        <button type="button" className="map-ctl" onClick={onRecenter} title={mapText(lang, "recenter")}>
          <span className="map-ctl-icon map-ctl-recenter" aria-hidden="true" />
          <span className="map-ctl-text">{mapText(lang, "recenterShort")}</span>
        </button>
      ) : null}
    </div>
  );
}

export type MapCardTone = "empty" | "loading" | "busy" | "none";

/**
 * The card on the map for an empty, loading or busy map. Its words are also in the page's
 * status line, so here they are hidden from screen readers and only the button is reachable.
 */
export function MapStateCard({ lang, tone, text, onRetry }: { lang: Lang; tone: MapCardTone; text: string; onRetry: () => void }) {
  return (
    <div className="map-state" data-tone={tone}>
      {tone === "loading" ? <span className="map-state-bar" aria-hidden="true" /> : null}
      <p aria-hidden="true">{text}</p>
      {tone === "busy" ? (
        <button type="button" className="btn btn-quiet map-retry" onClick={onRetry}>
          {mapText(lang, "tryAgain")}
        </button>
      ) : null}
    </div>
  );
}

interface ListProps {
  lang: Lang;
  rows: readonly NearSpot[];
  selectedId: string | null;
  onPick: (spot: Spot) => void;
}

/** Scrolls the list box, never the page, so the picked row is in sight. */
function scrollRowIntoBox(box: HTMLElement, row: HTMLElement) {
  const top = row.offsetTop - box.offsetTop;
  const bottom = top + row.offsetHeight;
  if (top >= box.scrollTop && bottom <= box.scrollTop + box.clientHeight) return;
  box.scrollTo({ top: Math.max(0, top - 8), behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

export function NearestList({ lang, rows, selectedId, onPick }: ListProps) {
  const headId = useId();
  const box = useRef<HTMLDivElement>(null);
  const order = rows.map((r) => r.spot.id).join(",");

  useEffect(() => {
    const el = box.current;
    if (!el || !selectedId) return;
    const row = el.querySelector<HTMLElement>(`[data-spot="${CSS.escape(selectedId)}"]`);
    if (row) scrollRowIntoBox(el, row);
  }, [selectedId, order]);

  return (
    <section className="map-near" aria-labelledby={headId}>
      <h2 id={headId} className="map-near-title">
        {mapText(lang, "nearestTitle")}
      </h2>
      <div className="map-near-box" ref={box}>
        {rows.length === 0 ? (
          <p className="help map-near-empty">{mapText(lang, "nearestEmpty")}</p>
        ) : (
          <ol className="map-list" role="list">
            {rows.map(({ spot, meters }) => {
              const picked = spot.id === selectedId;
              const detailsId = `${headId}-${spot.id.replace(/\W/g, "-")}`;
              return (
                <li key={spot.id} className="map-row" data-spot={spot.id} data-picked={picked || undefined}>
                  <button type="button" className="map-row-pick" aria-expanded={picked} aria-controls={picked ? detailsId : undefined} onClick={() => onPick(spot)}>
                    <Pin kind={spot.kind} className="map-row-pin" />
                    <span className="map-row-text">
                      <span className="map-row-name">{spotTitle(spot, lang)}</span>
                      <span className="map-row-meta">
                        {spot.name ? `${spotKindText(lang, spot)}, ` : ""}
                        {formatDistance(meters)}
                      </span>
                    </span>
                  </button>
                  {picked ? (
                    <div id={detailsId} className="map-row-details">
                      <SpotDetails spot={spot} lang={lang} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
