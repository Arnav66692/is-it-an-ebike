"use client";

// The Leaflet map itself: OpenStreetMap tiles, one mark per rack, shop or repair station, and a
// popup with what is known about it. It runs only in the browser (components/MapApp.tsx loads
// the page with ssr off). The page drives it with commands and hears back the view on screen.

import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Lang } from "@/lib/i18n/names";
import { kindText, mapText } from "@/lib/i18n/map";
import { US_CENTER, US_ZOOM, type Bounds, type LatLon, type Spot, type SpotKind } from "@/lib/map/osm";
import { PIN_SIZE, pinSvg } from "@/lib/map/pins";
import { SpotFacts } from "./SpotFacts";

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
  /** A spot whose popup opens once the map is there. */
  openId?: string;
  /** Move keyboard focus to the map, so the arrow keys pan it right away. */
  focus?: boolean;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const MAX_ZOOM = 19;

const ICONS: Record<SpotKind, L.DivIcon> = {
  rack: icon("rack"),
  shop: icon("shop"),
  repair: icon("repair"),
};

function icon(kind: SpotKind): L.DivIcon {
  const half = PIN_SIZE / 2;
  return L.divIcon({ className: `map-pin map-pin-${kind}`, html: pinSvg(kind), iconSize: [PIN_SIZE, PIN_SIZE], iconAnchor: [half, half], popupAnchor: [0, -12] });
}

function viewOf(map: L.Map): MapViewState {
  const b = map.getBounds();
  const c = map.getCenter();
  return { bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, center: { lat: c.lat, lon: c.lng }, zoom: map.getZoom() };
}

/** Tells the page what is on screen, once on load and after every move or zoom. */
function ViewReporter({ onView }: { onView: (view: MapViewState) => void }) {
  const map = useMapEvents({ moveend: () => onView(viewOf(map)) });
  useEffect(() => {
    onView(viewOf(map));
    // Only on load. Later views come from moveend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

/** Runs the page's commands on the map. */
function Commander({ command, markers }: { command: MapCommand | null; markers: React.RefObject<Map<string, L.Marker>> }) {
  const map = useMap();
  useEffect(() => {
    if (!command) return;
    map.setView([command.center.lat, command.center.lon], command.zoom, { animate: false });
    if (command.openId) markers.current.get(command.openId)?.openPopup();
    if (command.focus) map.getContainer().focus({ preventScroll: true });
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

interface Props {
  lang: Lang;
  spots: readonly Spot[];
  command: MapCommand | null;
  onView: (view: MapViewState) => void;
}

export default function MapView({ lang, spots, command, onView }: Props) {
  const markers = useRef<Map<string, L.Marker>>(new Map());
  return (
    <MapContainer center={[US_CENTER.lat, US_CENTER.lon]} zoom={US_ZOOM} maxZoom={MAX_ZOOM} className="map-canvas" scrollWheelZoom worldCopyJump={false}>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={MAX_ZOOM} />
      <ViewReporter onView={onView} />
      <Commander command={command} markers={markers} />
      <MapLabel label={mapText(lang, "mapLabel")} />
      {spots.map((spot) => (
        <Marker
          key={spot.id}
          position={[spot.lat, spot.lon]}
          icon={ICONS[spot.kind]}
          title={spot.name ?? kindText(lang, spot.kind)}
          // The list under the map is the keyboard path, so hundreds of marks don't each take a tab stop.
          keyboard={false}
          ref={(m) => {
            if (m) markers.current.set(spot.id, m);
            else markers.current.delete(spot.id);
          }}
        >
          <Popup>
            <div className="spot-pop" lang={lang}>
              <SpotFacts spot={spot} lang={lang} />
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
