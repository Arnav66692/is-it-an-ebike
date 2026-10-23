"use client";

// The route on a Leaflet map, each piece colored by what the legal check found: legal, not legal,
// can't confirm, or state law only where a place's own rules weren't read. Colors come from the
// theme through CSS classes, and the dashes differ too, so the answer never rests on color alone.
// The list beside the map says the same thing in words. Loaded in the browser only.

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { CheckedPiece, PieceStatus } from "@/lib/route/legal";
import type { RoutePlan } from "@/lib/route/types";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const MAX_ZOOM = 19;
const FIT_PAD = L.point(28, 28);

/** Solid for a clear answer, dashed for one the check can't confirm, dotted for state law only. */
const DASH: Record<PieceStatus, string | undefined> = { allowed: undefined, banned: undefined, unclear: "10 8", unchecked: "2 8" };
const WEIGHT: Record<PieceStatus, number> = { allowed: 6, banned: 8, unclear: 7, unchecked: 6 };

/** How long the page takes to settle after the route appears, so the second fit sees the final size. */
const SETTLE_MS = 300;

/**
 * Fits the whole route on screen whenever a new route arrives. The map can be made before its box
 * has its final size, and Leaflet would then fit to the wrong size, so it measures again and refits
 * once the page settles.
 */
function FitRoute({ plan }: { plan: RoutePlan }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(plan.points.map((p) => [p.lat, p.lon] as [number, number]));
    if (!bounds.isValid()) return;
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: FIT_PAD, animate: false });
    };
    fit();
    const timer = window.setTimeout(fit, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [map, plan]);
  return null;
}

interface Props {
  plan: RoutePlan;
  pieces: readonly CheckedPiece[];
  label: string;
}

export default function RouteMap({ plan, pieces, label }: Props) {
  const lines = useMemo(
    () =>
      pieces.map((p) => ({
        key: `${p.index}-${p.status}`,
        status: p.status,
        positions: plan.points.slice(p.segment.from, p.segment.to + 1).map((pt) => [pt.lat, pt.lon] as [number, number]),
      })),
    [plan, pieces],
  );
  const start = plan.points[0];
  const end = plan.points[plan.points.length - 1];
  if (!start || !end) return null;
  // Problem pieces draw last, so a short illegal stretch is never hidden under a legal one.
  const order: PieceStatus[] = ["allowed", "unchecked", "unclear", "banned"];
  return (
    <div className="map-frame route-map-frame">
      <MapContainer center={[start.lat, start.lon]} zoom={14} maxZoom={MAX_ZOOM} className="map-canvas" scrollWheelZoom={false} aria-label={label}>
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={MAX_ZOOM} />
        <FitRoute plan={plan} />
        {order.flatMap((status) =>
          lines
            .filter((l) => l.status === status && l.positions.length > 1)
            .map((l) => (
              <Polyline
                key={l.key}
                positions={l.positions}
                pathOptions={{ className: `route-piece route-piece-${status}`, weight: WEIGHT[status], dashArray: DASH[status], lineCap: "round", lineJoin: "round", interactive: false }}
              />
            )),
        )}
        <CircleMarker center={[start.lat, start.lon]} radius={7} pathOptions={{ className: "route-end route-start", weight: 3, fillOpacity: 1, interactive: false }} />
        <CircleMarker center={[end.lat, end.lon]} radius={8} pathOptions={{ className: "route-end route-finish", weight: 3, fillOpacity: 1, interactive: false }} />
      </MapContainer>
    </div>
  );
}
