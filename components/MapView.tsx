"use client";

// The Leaflet map itself: OpenStreetMap tiles, one mark per rack, shop or repair station, square
// bubbles where marks crowd together, and a popup with what is known about each spot. It runs
// only in the browser (components/MapApp.tsx loads the page with ssr off). The page drives it
// with commands and hears back the view on screen and the spot the rider picked.

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { Lang } from "@/lib/i18n/names";
import { mapText } from "@/lib/i18n/map";
import { boundsOf, CLUSTER_CELL_PX, CLUSTER_OFF_ZOOM, clusterGrid, clusterSize, type Cluster } from "@/lib/map/mapState";
import { fitView, US_CENTER, US_ZOOM, type Bounds, type LatLon, type Spot, type SpotKind } from "@/lib/map/osm";
import { PIN_SIZE, pinSvg } from "@/lib/map/pins";
import { SpotCard, spotTitle } from "./SpotFacts";

export interface MapViewState {
  bounds: Bounds;
  center: LatLon;
  zoom: number;
}

/** A move the page asks for. The nonce makes a repeat of the same move run again. */
export interface MapCommand {
  nonce: number;
  center: LatLon;
  zoom: number;
  /** A place's box to fit whole, in place of center and zoom, so a state search shows the state. */
  bounds?: Bounds;
  /** A spot whose popup opens once the map is there. */
  openId?: string;
  /** Move keyboard focus to the map, so the arrow keys pan it right away. */
  focus?: boolean;
  /** Glide there instead of jumping. Off when the rider asked for less motion. */
  animate?: boolean;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
/** Map tiles and racks come from OpenStreetMap (ODbL), and many shops from Overture Maps (CDLA Permissive 2.0). */
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://docs.overturemaps.org/attribution/">Overture Maps Foundation</a>';
const MAX_ZOOM = 19;
const FLY_SECONDS = 0.6;
/** An opened popup stays below the zoom buttons, the search button and the control bar. */
const POPUP_PAD_TOP_LEFT = L.point(12, 112);
const POPUP_PAD_BOTTOM_RIGHT = L.point(12, 32);
const POPUP_WIDTH = 300;
/** The popup's side margins and its close button, around the content width Leaflet sets. */
const POPUP_CHROME_PX = 96;
const CLUSTER_PX = { s: 44, m: 52, l: 60 } as const;

function pinIcon(kind: SpotKind, picked: boolean): L.DivIcon {
  const half = PIN_SIZE / 2;
  return L.divIcon({
    className: `map-pin map-pin-${kind}${picked ? " is-picked" : ""}`,
    html: pinSvg(kind),
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [half, half],
    popupAnchor: [0, -12],
  });
}

const ICONS: Record<SpotKind, L.DivIcon> = { rack: pinIcon("rack", false), shop: pinIcon("shop", false), repair: pinIcon("repair", false) };
const PICKED: Record<SpotKind, L.DivIcon> = { rack: pinIcon("rack", true), shop: pinIcon("shop", true), repair: pinIcon("repair", true) };

const clusterIcons = new Map<number, L.DivIcon>();

/** A square bubble with the count, built once per count. The count is a number, never map data. */
function clusterIcon(count: number): L.DivIcon {
  const hit = clusterIcons.get(count);
  if (hit) return hit;
  const size = clusterSize(count);
  const px = CLUSTER_PX[size];
  const made = L.divIcon({ className: `map-cluster map-cluster-${size}`, html: `<span>${count}</span>`, iconSize: [px, px], iconAnchor: [px / 2, px / 2] });
  clusterIcons.set(count, made);
  return made;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function viewOf(map: L.Map): MapViewState {
  const b = map.getBounds();
  const c = map.getCenter();
  return { bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, center: { lat: c.lat, lon: c.lng }, zoom: map.getZoom() };
}

/** Tells the page what is on screen, once on load and after every move or zoom. */
function ViewReporter({ onView }: { onView: (view: MapViewState) => void }) {
  const map = useMap();
  const latest = useRef(onView);
  useEffect(() => {
    latest.current = onView;
  }, [onView]);
  useEffect(() => {
    const report = () => latest.current(viewOf(map));
    report();
    map.on("moveend", report);
    return () => {
      map.off("moveend", report);
    };
  }, [map]);
  return null;
}

/** Runs the page's commands on the map. A popup opens once the map has arrived. */
function Commander({ command, markers }: { command: MapCommand | null; markers: React.RefObject<Map<string, L.Marker>> }) {
  const map = useMap();
  useEffect(() => {
    if (!command) return;
    const open = () => {
      if (command.openId) markers.current.get(command.openId)?.openPopup();
    };
    const fit = command.bounds ? fitView(command.bounds, map.getSize()) : null;
    const center = fit?.center ?? command.center;
    const zoom = fit?.zoom ?? command.zoom;
    const target = L.latLng(center.lat, center.lon);
    if (command.animate) {
      map.once("moveend", open);
      map.flyTo(target, zoom, { duration: FLY_SECONDS });
    } else {
      map.setView(target, zoom, { animate: false });
      open();
    }
    if (command.focus) map.getContainer().focus({ preventScroll: true });
    return () => {
      map.off("moveend", open);
    };
  }, [command, map, markers]);
  return null;
}

/** Keeps the map label in the page's language. */
function MapLabel({ label }: { label: string }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", label);
  }, [map, label]);
  return null;
}

interface MarksProps {
  lang: Lang;
  spots: readonly Spot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  markers: React.RefObject<Map<string, L.Marker>>;
}

/** The marks, grouped into bubbles by a pixel grid until the map is close in. */
function Marks({ lang, spots, selectedId, onSelect, onClose, markers }: MarksProps) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  // One listener for the map's life. A listener swapped on every render can miss a zoom that a
  // command runs in the same commit, and the bubbles would stay grouped for the old zoom.
  useEffect(() => {
    const sync = () => setZoom(map.getZoom());
    sync();
    map.on("zoomend", sync);
    return () => {
      map.off("zoomend", sync);
    };
  }, [map]);

  const popupWidth = Math.min(POPUP_WIDTH, map.getSize().x - POPUP_CHROME_PX);
  const byId = useMemo(() => new Map(spots.map((s) => [s.id, s])), [spots]);
  const grouped = useMemo(() => {
    if (zoom >= CLUSTER_OFF_ZOOM) return { singles: spots.map((s) => s.id), clusters: [] as Cluster[] };
    const points = spots.map((s) => {
      const p = map.project(L.latLng(s.lat, s.lon), zoom);
      return { id: s.id, x: p.x, y: p.y };
    });
    return clusterGrid(points, CLUSTER_CELL_PX, new Set(selectedId ? [selectedId] : []));
  }, [spots, zoom, selectedId, map]);

  function zoomInto(cluster: Cluster) {
    const box = boundsOf(cluster.ids.map((id) => byId.get(id)).filter((s): s is Spot => s !== undefined));
    if (!box) return;
    map.fitBounds(
      [
        [box.south, box.west],
        [box.north, box.east],
      ],
      { padding: [56, 56], maxZoom: CLUSTER_OFF_ZOOM, animate: !prefersReducedMotion() },
    );
  }

  return (
    <>
      {grouped.clusters.map((c) => (
        <Marker
          key={c.key}
          position={map.unproject(L.point(c.x, c.y), zoom)}
          icon={clusterIcon(c.ids.length)}
          title={mapText(lang, "clusterTitle", { n: c.ids.length })}
          keyboard={false}
          eventHandlers={{ click: () => zoomInto(c) }}
        />
      ))}
      {grouped.singles.map((id) => {
        const spot = byId.get(id);
        if (!spot) return null;
        const picked = id === selectedId;
        return (
          <Marker
            key={id}
            position={[spot.lat, spot.lon]}
            icon={picked ? PICKED[spot.kind] : ICONS[spot.kind]}
            zIndexOffset={picked ? 1000 : 0}
            title={spotTitle(spot, lang)}
            // The list beside the map is the keyboard path, so hundreds of marks don't each take a tab stop.
            keyboard={false}
            eventHandlers={{ popupopen: () => onSelect(id), popupclose: () => onClose(id) }}
            ref={(m) => {
              if (m) markers.current.set(id, m);
              else markers.current.delete(id);
            }}
          >
            <Popup autoPanPaddingTopLeft={POPUP_PAD_TOP_LEFT} autoPanPaddingBottomRight={POPUP_PAD_BOTTOM_RIGHT} maxWidth={popupWidth} minWidth={popupWidth}>
              <SpotCard spot={spot} lang={lang} />
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

interface Props {
  lang: Lang;
  spots: readonly Spot[];
  command: MapCommand | null;
  selectedId: string | null;
  onView: (view: MapViewState) => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export default function MapView({ lang, spots, command, selectedId, onView, onSelect, onClose }: Props) {
  const markers = useRef<Map<string, L.Marker>>(new Map());
  // Read once when the map is made. Leaflet takes these options only at the start.
  const [calm] = useState(prefersReducedMotion);
  return (
    <MapContainer
      center={[US_CENTER.lat, US_CENTER.lon]}
      zoom={US_ZOOM}
      maxZoom={MAX_ZOOM}
      className="map-canvas"
      scrollWheelZoom
      worldCopyJump={false}
      zoomAnimation={!calm}
      markerZoomAnimation={!calm}
      fadeAnimation={!calm}
      inertia={!calm}
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={MAX_ZOOM} />
      <ViewReporter onView={onView} />
      <MapLabel label={mapText(lang, "mapLabel")} />
      <Marks lang={lang} spots={spots} selectedId={selectedId} onSelect={onSelect} onClose={onClose} markers={markers} />
      {/* After the marks, so a mark that just left its bubble is on the map before its popup opens. */}
      <Commander command={command} markers={markers} />
    </MapContainer>
  );
}
