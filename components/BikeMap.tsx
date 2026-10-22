"use client";

// The map of bike racks, bike shops and repair stations. The rider picks where to look, by place
// name or by their own location, and the page asks OpenStreetMap's Overpass API for what is in
// view once the map is close enough. A list under the map names the nearest ones, so the page
// works without seeing the map. Nothing the rider types or where they are is stored.

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { t } from "@/lib/i18n/ui";
import { kindText, mapCountLine, mapText } from "@/lib/i18n/map";
import { fetchSpots, MapFetchError, searchPlaces } from "@/lib/map/fetchSpots";
import {
  boundsKey,
  countSpots,
  formatDistance,
  inBounds,
  MAX_RACKS,
  MIN_DATA_ZOOM,
  MOVE_DEBOUNCE_MS,
  nearestSpots,
  SPOT_KINDS,
  zoomForPlace,
  type FoundPlace,
  type LatLon,
  type Spot,
} from "@/lib/map/osm";
import { pinSvg } from "@/lib/map/pins";
import { SpotFacts } from "./SpotFacts";
import { SiteHeader, useLang } from "./SiteHeader";
import MapView, { type MapCommand, type MapViewState } from "./MapView";

type DataStatus = "zoom" | "loading" | "ready" | "rate" | "failed";

/** How many of the nearest spots the list names. */
const LIST_SIZE = 10;
/** How close the map goes for the rider's location or a spot picked from the list. */
const LOCATE_ZOOM = 16;
const SPOT_ZOOM = 17;
const GEO_TIMEOUT_MS = 10_000;

type Note = { key: "placeSearching" | "placeNone" | "placeResults" | "placeMoved"; q: string } | { key: "placeFailed" | "placeBusy" | "locating" | "located" | "locateDenied" | "locateFailed" | "locateUnsupported" };

function noteText(note: Note | null, lang: "en" | "es"): string {
  if (!note) return "";
  if ("q" in note) return note.key === "placeMoved" ? mapText(lang, "placeMoved", { place: note.q }) : mapText(lang, note.key, { q: note.q });
  return mapText(lang, note.key);
}

interface Answer {
  /** The rounded view this answer is for. */
  key: string;
  spots: Spot[];
  capped: boolean;
  status: Exclude<DataStatus, "zoom" | "loading">;
}

const NO_SPOTS: Spot[] = [];

/**
 * Fetches what is in view after the map rests, and drops an answer that a newer move replaced.
 * While a new view loads, the last marks stay on the map.
 */
function useSpots(view: MapViewState | null): { spots: Spot[]; capped: boolean; status: DataStatus } {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const key = view && view.zoom >= MIN_DATA_ZOOM ? boundsKey(view.bounds) : null;
  useEffect(() => {
    if (!view || view.zoom < MIN_DATA_ZOOM) return;
    const viewKey = boundsKey(view.bounds);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchSpots(view.bounds, controller.signal)
        .then((got) => setAnswer({ key: viewKey, spots: got.spots, capped: got.capped, status: "ready" }))
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          const status = err instanceof MapFetchError && err.failure === "rate" ? "rate" : "failed";
          setAnswer((cur) => ({ key: viewKey, spots: cur?.spots ?? NO_SPOTS, capped: false, status }));
        });
    }, MOVE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [view]);
  if (key === null) return { spots: NO_SPOTS, capped: false, status: "zoom" };
  if (!answer) return { spots: NO_SPOTS, capped: false, status: "loading" };
  if (answer.key !== key) return { spots: answer.spots, capped: false, status: "loading" };
  return answer;
}

export function BikeMap() {
  const [lang, switchLang] = useLang();
  const placeId = useId();
  const helpId = useId();
  const [view, setView] = useState<MapViewState | null>(null);
  const [command, setCommand] = useState<MapCommand | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundPlace[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);
  const nonce = useRef(0);
  const { spots, capped, status } = useSpots(view);

  useEffect(() => () => searchAbort.current?.abort(), []);

  const inView = useMemo(() => (view ? spots.filter((s) => inBounds(s, view.bounds)) : []), [spots, view]);
  const nearest = useMemo(() => (view && status !== "zoom" ? nearestSpots(inView, view.center, LIST_SIZE) : []), [inView, view, status]);

  function move(center: LatLon, zoom: number, extra: Partial<MapCommand> = {}) {
    nonce.current += 1;
    setCommand({ nonce: nonce.current, center, zoom, ...extra });
  }

  function goTo(place: FoundPlace) {
    setFound([]);
    setNote({ key: "placeMoved", q: place.label });
    move({ lat: place.lat, lon: place.lon }, zoomForPlace(place), { focus: true });
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setBusy(true);
    setFound([]);
    setNote({ key: "placeSearching", q });
    try {
      const places = await searchPlaces(q, lang, controller.signal);
      if (places.length === 0) setNote({ key: "placeNone", q });
      else if (places.length === 1) goTo(places[0]);
      else {
        setFound(places);
        setNote({ key: "placeResults", q });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setNote({ key: err instanceof MapFetchError && err.failure === "rate" ? "placeBusy" : "placeFailed" });
    } finally {
      if (searchAbort.current === controller) setBusy(false);
    }
  }

  function onLocate() {
    if (!("geolocation" in navigator)) {
      setNote({ key: "locateUnsupported" });
      return;
    }
    setFound([]);
    setNote({ key: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNote({ key: "located" });
        move({ lat: pos.coords.latitude, lon: pos.coords.longitude }, LOCATE_ZOOM, { focus: true });
      },
      (err) => setNote({ key: err.code === err.PERMISSION_DENIED ? "locateDenied" : "locateFailed" }),
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 60_000 },
    );
  }

  const statusLine =
    status === "zoom"
      ? mapText(lang, "zoomIn")
      : status === "loading"
        ? mapText(lang, "loading")
        : status === "rate"
          ? mapText(lang, "rateLimited")
          : status === "failed"
            ? mapText(lang, "failed")
            : inView.length === 0
              ? mapText(lang, "noneHere")
              : mapCountLine(lang, countSpots(inView));
  const problem = status === "rate" || status === "failed";

  return (
    <div className="page">
      <SiteHeader lang={lang} current="map" title={mapText(lang, "title")} onSwitchLang={switchLang}>
        <p className="tagline">{mapText(lang, "tagline")}</p>
      </SiteHeader>

      <section className="card space-y-4" aria-labelledby={`${placeId}-head`}>
        <h2 id={`${placeId}-head`} className="card-title">
          {mapText(lang, "findLegend")}
        </h2>
        <form className="space-y-2" onSubmit={onSearch} role="search">
          <label htmlFor={placeId} className="field-label">
            {mapText(lang, "placeLabel")}
          </label>
          <p id={helpId} className="help">
            {mapText(lang, "placeHelp")}
          </p>
          <div className="map-search">
            <input
              id={placeId}
              type="search"
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              enterKeyHint="search"
              aria-describedby={helpId}
            />
            <button type="submit" className="btn" disabled={busy || query.trim() === ""}>
              {mapText(lang, "placeGo")}
            </button>
          </div>
        </form>
        {found.length > 0 ? (
          <ul className="map-places" aria-label={noteText(note, lang)}>
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" className="map-place" onClick={() => goTo(p)}>
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="btn btn-quiet map-locate" onClick={onLocate}>
          {mapText(lang, "locate")}
        </button>
        <p role="status" className={note ? "note" : "sr-only"}>
          {noteText(note, lang)}
        </p>
        <p className="help">{mapText(lang, "privacy")}</p>
      </section>

      <section className="map-block" aria-label={mapText(lang, "title")}>
        <p role="status" className={problem ? "alert" : "map-status"}>
          {statusLine}
          {status === "ready" && capped ? ` ${mapText(lang, "capped", { n: MAX_RACKS })}` : ""}
        </p>
        <div className="map-frame">
          <MapView lang={lang} spots={spots} command={command} onView={setView} />
        </div>
        <div className="map-legend">
          <h2 className="eyebrow">{mapText(lang, "legendTitle")}</h2>
          <ul role="list">
            {SPOT_KINDS.map((kind) => (
              <li key={kind}>
                {/* A fixed SVG from lib/map/pins.ts, never data from the map. */}
                <span className="map-legend-pin" aria-hidden="true" dangerouslySetInnerHTML={{ __html: pinSvg(kind) }} />
                {kindText(lang, kind)}
              </li>
            ))}
          </ul>
        </div>
        <p className="meta">{mapText(lang, "dataNote")}</p>
      </section>

      <section className="card space-y-3" aria-labelledby={`${placeId}-near`}>
        <h2 id={`${placeId}-near`} className="card-title">
          {mapText(lang, "nearestTitle")}
        </h2>
        {nearest.length === 0 ? (
          <p className="help">{mapText(lang, "nearestEmpty")}</p>
        ) : (
          <ol className="map-list" role="list">
            {nearest.map(({ spot, meters }) => (
              <li key={spot.id} className="map-row">
                <SpotFacts spot={spot} lang={lang} distance={formatDistance(meters)} />
                <button type="button" className="btn btn-quiet map-show" onClick={() => move(spot, Math.max(view?.zoom ?? 0, SPOT_ZOOM), { openId: spot.id })}>
                  {mapText(lang, "showOnMap")}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="site-foot">
        <details className="more">
          <summary>{mapText(lang, "aboutTitle")}</summary>
          <div className="space-y-2 pb-2">
            <p>{mapText(lang, "about1")}</p>
            <p>{mapText(lang, "about2")}</p>
            <p>{mapText(lang, "privacy")}</p>
          </div>
        </details>
        <p className="meta">{t(lang, "notLegalAdvice")}</p>
      </footer>
    </div>
  );
}
