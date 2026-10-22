"use client";

// The map of bike racks, bike shops and repair stations. The rider picks where to look, by place
// name or by their own location, and the page asks our own server, which asks OpenStreetMap's
// Overpass servers, for what is in view. After that first look the page waits for "Search this
// area", so a pan never fires a request on its own. Chips above the map show or hide each kind,
// and a list beside it names the nearest ones, so the page works without seeing the map. Nothing
// the rider types or where they are is stored.

import { useEffect, useId, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { t } from "@/lib/i18n/ui";
import { mapCountLine, mapText } from "@/lib/i18n/map";
import { fetchSpots, MapFetchError, searchPlaces } from "@/lib/map/fetchSpots";
import {
  ALL_KINDS,
  AREA_START,
  areaReducer,
  canSearchArea,
  chipCounts,
  filterSpots,
  listSpots,
  moveToSpot,
  selectReducer,
  toggleKind,
  type AreaState,
  type KindFilter,
} from "@/lib/map/mapState";
import { countSpots, inBounds, MAX_RACKS, MIN_DATA_ZOOM, zoomForPlace, type FoundPlace, type LatLon, type Spot, type SpotKind } from "@/lib/map/osm";
import { SiteHeader, useLang } from "./SiteHeader";
import MapView, { prefersReducedMotion, type MapCommand, type MapViewState } from "./MapView";
import { FilterChips, MapControls, MapStateCard, NearestList, type MapCardTone } from "./MapParts";

type DataStatus = "idle" | "loading" | "ready" | "rate" | "failed";

/** How many of the nearest spots the list names. */
const LIST_SIZE = 10;
/** How close the map goes for the rider's location. */
const LOCATE_ZOOM = 16;
const GEO_TIMEOUT_MS = 10_000;

type Note = { key: "placeSearching" | "placeNone" | "placeResults" | "placeMoved"; q: string } | { key: "placeFailed" | "placeBusy" | "locating" | "located" | "locateDenied" | "locateFailed" | "locateUnsupported" };

function noteText(note: Note | null, lang: "en" | "es"): string {
  if (!note) return "";
  if ("q" in note) return note.key === "placeMoved" ? mapText(lang, "placeMoved", { place: note.q }) : mapText(lang, note.key, { q: note.q });
  return mapText(lang, note.key);
}

interface Answer {
  /** The search this answer is for. */
  nonce: number;
  spots: Spot[];
  capped: boolean;
  status: Exclude<DataStatus, "idle" | "loading">;
}

const NO_SPOTS: Spot[] = [];

/**
 * Asks for the searched area each time the search nonce goes up, and drops an answer that a
 * newer search replaced. While a new search loads, the last marks stay on the map.
 */
function useSpots(area: AreaState): { spots: Spot[]; capped: boolean; status: DataStatus } {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const { searched, nonce } = area;
  useEffect(() => {
    if (!searched) return;
    const controller = new AbortController();
    fetchSpots(searched, controller.signal)
      .then((got) => setAnswer({ nonce, spots: got.spots, capped: got.capped, status: "ready" }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const status = err instanceof MapFetchError && err.failure === "rate" ? "rate" : "failed";
        setAnswer((cur) => ({ nonce, spots: cur?.spots ?? NO_SPOTS, capped: false, status }));
      });
    return () => controller.abort();
  }, [searched, nonce]);
  if (!searched) return { spots: NO_SPOTS, capped: false, status: "idle" };
  if (!answer) return { spots: NO_SPOTS, capped: false, status: "loading" };
  if (answer.nonce !== nonce) return { spots: answer.spots, capped: answer.capped, status: "loading" };
  return answer;
}

interface Home {
  center: LatLon;
  zoom: number;
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
  const [area, dispatchArea] = useReducer(areaReducer, AREA_START);
  const [filter, setFilter] = useState<KindFilter>(ALL_KINDS);
  const [selectedId, dispatchSelect] = useReducer(selectReducer, null);
  const [home, setHome] = useState<Home | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const nonce = useRef(0);
  const { spots, capped, status } = useSpots(area);

  useEffect(() => () => searchAbort.current?.abort(), []);

  const shown = useMemo(() => filterSpots(spots, filter), [spots, filter]);
  const inView = useMemo(() => (view ? spots.filter((s) => inBounds(s, view.bounds)) : []), [spots, view]);
  const shownInView = useMemo(() => filterSpots(inView, filter), [inView, filter]);
  const rows = useMemo(() => (view ? listSpots(shownInView, view.center, LIST_SIZE, selectedId) : []), [shownInView, view, selectedId]);
  const chips = chipCounts(inView, filter, status === "ready" || spots.length > 0);

  function move(center: LatLon, zoom: number, extra: Partial<MapCommand> = {}) {
    nonce.current += 1;
    setCommand({ nonce: nonce.current, center, zoom, ...extra });
  }

  /** A jump the rider asked for by place or location, which searches by itself when it lands. */
  function jumpTo(center: LatLon, zoom: number) {
    dispatchArea({ type: "autoNext" });
    setHome({ center, zoom });
    move(center, zoom, { focus: true });
  }

  function goTo(place: FoundPlace) {
    setFound([]);
    setNote({ key: "placeMoved", q: place.label });
    jumpTo({ lat: place.lat, lon: place.lon }, zoomForPlace(place));
  }

  function onView(next: MapViewState) {
    setView(next);
    dispatchArea({ type: "view", view: next });
  }

  function onToggle(kind: SpotKind) {
    const next = toggleKind(filter, kind);
    setFilter(next);
    dispatchSelect({ type: "prune", ids: new Set(filterSpots(spots, next).map((s) => s.id)) });
  }

  function onPick(spot: Spot) {
    dispatchSelect({ type: "pick", id: spot.id });
    const to = moveToSpot(spot, view?.zoom ?? 0, prefersReducedMotion());
    move(to.center, to.zoom, { openId: to.openId, animate: to.animate });
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
        jumpTo({ lat: pos.coords.latitude, lon: pos.coords.longitude }, LOCATE_ZOOM);
      },
      (err) => setNote({ key: err.code === err.PERMISSION_DENIED ? "locateDenied" : "locateFailed" }),
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 60_000 },
    );
  }

  function onRecenter() {
    if (home) move(home.center, home.zoom, { animate: !prefersReducedMotion() });
  }

  const zoomedOut = !view || view.zoom < MIN_DATA_ZOOM;
  const problem = status === "rate" || status === "failed";
  const tone: MapCardTone | null =
    status === "idle" ? "empty" : status === "loading" ? "loading" : problem ? "busy" : shownInView.length === 0 && !zoomedOut ? "none" : null;
  const stateText =
    status === "idle"
      ? mapText(lang, "emptyState")
      : status === "loading"
        ? mapText(lang, "loading")
        : status === "rate"
          ? mapText(lang, "rateLimited")
          : status === "failed"
            ? mapText(lang, "failed")
            : mapText(lang, "noneHere");
  const statusLine = tone === null ? mapCountLine(lang, countSpots(shownInView)) : stateText;
  const showCapped = status === "ready" && capped;
  const offerSearch = status !== "loading" && canSearchArea(area, view, capped);
  const offerZoom = zoomedOut && area.searched !== null;

  return (
    <div className="page page-map">
      <SiteHeader lang={lang} current="map" title={mapText(lang, "title")} onSwitchLang={switchLang}>
        <p className="tagline">{mapText(lang, "tagline")}</p>
      </SiteHeader>

      <section className="card map-find" aria-labelledby={`${placeId}-head`}>
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
        <p role="status" className={note ? "note" : "sr-only"}>
          {noteText(note, lang)}
        </p>
        <p className="help">{mapText(lang, "privacy")}</p>
      </section>

      <section className="map-block" aria-label={mapText(lang, "title")}>
        <FilterChips lang={lang} chips={chips} onToggle={onToggle} />
        <p role="status" className="sr-only">
          {statusLine}
          {showCapped ? ` ${mapText(lang, "capped", { n: MAX_RACKS })}` : ""}
        </p>
        <div className="map-main">
          <div className="map-frame">
            <MapView
              lang={lang}
              spots={shown}
              command={command}
              selectedId={selectedId}
              onView={onView}
              onSelect={(id) => dispatchSelect({ type: "pick", id })}
              onClose={(id) => dispatchSelect({ type: "close", id })}
            />
            {offerSearch ? (
              <button type="button" className="map-float map-search-area" onClick={() => view && dispatchArea({ type: "search", view })}>
                {mapText(lang, "searchArea")}
              </button>
            ) : offerZoom ? (
              <p className="map-float map-zoom-hint" aria-hidden="true">
                {mapText(lang, "zoomToSearch")}
              </p>
            ) : null}
            <MapControls lang={lang} canRecenter={home !== null} onLocate={onLocate} onRecenter={onRecenter} />
            {tone !== null && !(tone === "empty" && offerZoom) ? (
              <MapStateCard lang={lang} tone={tone} text={stateText} onRetry={() => dispatchArea({ type: "retry" })} />
            ) : null}
          </div>
          <NearestList lang={lang} rows={rows} selectedId={selectedId} onPick={onPick} />
        </div>
        {showCapped ? <p className="meta">{mapText(lang, "capped", { n: MAX_RACKS })}</p> : null}
        <p className="meta map-note">{mapText(lang, "dataNote")}</p>
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
