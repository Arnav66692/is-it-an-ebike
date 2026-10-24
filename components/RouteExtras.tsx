"use client";

// The parts around a checked route: the numbers at a glance, the hills, what the route rides on,
// what to do along the way, and a battery estimate. Each reads the route plan and the check's
// answer. Nothing here decides what is legal.

import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@/lib/i18n/names";
import { kindText, routeText } from "@/lib/i18n/route";
import { distanceMeters, formatDistance } from "@/lib/map/osm";
import type { CheckedPiece, PieceStatus } from "@/lib/route/legal";
import { ASSIST_LEVELS, estimateRange, OPTIMISTIC, PESSIMISTIC, type AssistLevel, type RangeAssumptions, type Wind } from "@/lib/route/range";
import type { RoutePlan, WayKind } from "@/lib/route/types";
import type { BikeFacts } from "@/lib/rules";

const FEET_PER_METER = 3.28084;
const KG_PER_LB = 0.45359237;
const MPS_PER_MPH = 0.44704;
/** The profile draws at most this many points, so a long route stays light. */
const PROFILE_POINTS = 160;
const PROFILE_W = 300;
const PROFILE_H = 80;
/** Rounding the route's middle to one decimal sends Open-Meteo an area about 10 km across, not a home. */
const WIND_DECIMALS = 1;
const DEFAULT_RIDER_LB = 150;
const DEFAULT_BIKE_LB = 60;

/** Distance, time and climb, at a glance. */
export function RouteStats({ plan, lang }: { plan: RoutePlan; lang: Lang }) {
  const minutes = Math.max(1, Math.round(plan.seconds / 60));
  const items = [
    { key: "d", label: routeText(lang, "statDistance"), value: formatDistance(plan.meters) },
    { key: "t", label: routeText(lang, "statTime"), value: routeText(lang, "statTimeValue", { minutes }) },
    ...(plan.climbMeters !== null ? [{ key: "c", label: routeText(lang, "statClimb"), value: routeText(lang, "statClimbValue", { feet: Math.round(plan.climbMeters * FEET_PER_METER) }) }] : []),
  ];
  return (
    <dl className="route-stats">
      {items.map((i) => (
        <div key={i.key}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Heights against distance, thinned to at most PROFILE_POINTS. Null when there are too few heights. */
function profileOf(plan: RoutePlan): { x: number; h: number }[] | null {
  if (!plan.heights) return null;
  const rows: { x: number; h: number }[] = [];
  let x = 0;
  plan.points.forEach((p, i) => {
    if (i > 0) x += distanceMeters(plan.points[i - 1], p);
    const h = plan.heights?.[i];
    if (h !== null && h !== undefined) rows.push({ x, h });
  });
  if (rows.length < 2) return null;
  const step = Math.max(1, Math.ceil(rows.length / PROFILE_POINTS));
  const thin = rows.filter((_, i) => i % step === 0);
  if (thin[thin.length - 1] !== rows[rows.length - 1]) thin.push(rows[rows.length - 1]);
  return thin;
}

/** The hills along the route as a small area chart, with its lowest and highest points. */
export function ElevationProfile({ plan, lang }: { plan: RoutePlan; lang: Lang }) {
  const rows = useMemo(() => profileOf(plan), [plan]);
  if (!rows) return null;
  const total = rows[rows.length - 1].x || 1;
  const low = Math.min(...rows.map((r) => r.h));
  const high = Math.max(...rows.map((r) => r.h));
  const span = Math.max(high - low, 10);
  const pt = (r: { x: number; h: number }) => `${((r.x / total) * PROFILE_W).toFixed(1)},${(PROFILE_H - 4 - ((r.h - low) / span) * (PROFILE_H - 12)).toFixed(1)}`;
  const line = rows.map((r, i) => `${i === 0 ? "M" : "L"}${pt(r)}`).join(" ");
  const area = `${line} L${PROFILE_W},${PROFILE_H} L0,${PROFILE_H} Z`;
  const lowFt = Math.round(low * FEET_PER_METER);
  const highFt = Math.round(high * FEET_PER_METER);
  return (
    <figure className="route-profile">
      <figcaption className="eyebrow">{routeText(lang, "profileTitle")}</figcaption>
      <svg viewBox={`0 0 ${PROFILE_W} ${PROFILE_H}`} preserveAspectRatio="none" role="img" aria-label={routeText(lang, "profileLabel", { low: lowFt, high: highFt })}>
        <path className="route-profile-area" d={area} />
        <path className="route-profile-line" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="route-profile-scale meta" aria-hidden="true">
        <span>{lowFt} ft</span>
        <span>{highFt} ft</span>
      </div>
    </figure>
  );
}

type MixKey = "mix_lanes" | "mix_paths" | "mix_streets" | "mix_walks" | "mix_trails" | "mix_other";

const MIX_GROUPS: { key: MixKey; kinds: WayKind[] }[] = [
  { key: "mix_lanes", kinds: ["bike_lane", "separated_bikeway"] },
  { key: "mix_paths", kinds: ["bike_path"] },
  { key: "mix_streets", kinds: ["road", "crossing"] },
  { key: "mix_walks", kinds: ["sidewalk", "footway"] },
  { key: "mix_trails", kinds: ["trail"] },
  { key: "mix_other", kinds: ["ferry", "other"] },
];

/** How much of the route is on bike lanes, paths, streets and the rest, by distance. */
export function MixBar({ plan, lang }: { plan: RoutePlan; lang: Lang }) {
  const total = plan.segments.reduce((sum, s) => sum + s.meters, 0);
  if (total <= 0) return null;
  const groups = MIX_GROUPS.map((g) => ({ key: g.key, meters: plan.segments.filter((s) => g.kinds.includes(s.kind)).reduce((sum, s) => sum + s.meters, 0) }))
    .filter((g) => g.meters > 0)
    .map((g) => ({ ...g, pct: (100 * g.meters) / total }));
  return (
    <div className="route-mix">
      <p className="eyebrow">{routeText(lang, "mixTitle")}</p>
      <div className="route-mix-bar" aria-hidden="true">
        {groups.map((g) => (
          <span key={g.key} className={`route-mix-${g.key}`} style={{ width: `${g.pct}%` }} />
        ))}
      </div>
      <ul className="route-mix-legend">
        {groups.map((g) => (
          <li key={g.key}>
            <span className={`route-mix-dot route-mix-${g.key}`} aria-hidden="true" />
            {routeText(lang, g.key)} {Math.max(1, Math.round(g.pct))}%
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_KEY: Record<PieceStatus, "legendAllowed" | "legendBanned" | "legendUnclear" | "legendUnchecked"> = {
  allowed: "legendAllowed",
  banned: "legendBanned",
  unclear: "legendUnclear",
  unchecked: "legendUnchecked",
};

const DO_KEY: Partial<Record<PieceStatus, "doBanned" | "doUnclear" | "doUnchecked">> = { banned: "doBanned", unclear: "doUnclear", unchecked: "doUnchecked" };

/** The route in words, street by street, with what to do where a piece isn't plainly legal. */
export function AlongTheWay({ pieces, lang }: { pieces: readonly CheckedPiece[]; lang: Lang }) {
  const rows: { status: PieceStatus; kind: WayKind; name: string | null; meters: number; key: string }[] = [];
  for (const p of pieces) {
    const last = rows[rows.length - 1];
    if (last && last.status === p.status && last.kind === p.segment.kind && last.name === p.segment.name) last.meters += p.segment.meters;
    else rows.push({ status: p.status, kind: p.segment.kind, name: p.segment.name, meters: p.segment.meters, key: `${p.index}` });
  }
  return (
    <details className="route-pieces">
      <summary>{routeText(lang, "alongTitle")}</summary>
      <ol className="route-steps">
        {rows.map((r) => {
          const action = DO_KEY[r.status];
          return (
            <li key={r.key} data-status={r.status}>
              <span className={`route-step-dot route-swatch-${r.status}`} aria-hidden="true" />
              <div>
                <p className="route-step-name">{r.name ?? routeText(lang, "unnamed")}</p>
                <p className="meta">
                  {routeText(lang, STATUS_KEY[r.status])}, {kindText(lang, r.kind)}, {formatDistance(r.meters)}
                </p>
                {action ? <p className="route-step-do">{routeText(lang, action)}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function positive(text: string): number | null {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const pct = (n: number) => Math.max(0, Math.min(100, n));

function howText(lang: Lang, lo: RangeAssumptions, hi: RangeAssumptions): string {
  const p = (n: number) => Math.round(n * 100);
  return routeText(lang, "rangeHowBody", {
    crrLo: lo.crr,
    cdaLo: lo.cda,
    effLo: p(lo.efficiency),
    useLo: p(lo.usable),
    stopLo: p(lo.stopGo - 1),
    crrHi: hi.crr,
    cdaHi: hi.cda,
    effHi: p(hi.efficiency),
    useHi: p(hi.usable),
    stopHi: p(hi.stopGo - 1),
  });
}

/** Today's wind near the route, from Open-Meteo, for an area about 10 km across. */
function useWind(plan: RoutePlan, on: boolean): Wind | "failed" | null {
  const [wind, setWind] = useState<{ key: string; value: Wind | "failed" } | null>(null);
  const mid = plan.points[Math.floor(plan.points.length / 2)];
  const key = mid ? `${mid.lat.toFixed(WIND_DECIMALS)},${mid.lon.toFixed(WIND_DECIMALS)}` : "";
  useEffect(() => {
    if (!on || !key) return;
    const controller = new AbortController();
    const [lat, lon] = key.split(",");
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { current?: { wind_speed_10m?: unknown; wind_direction_10m?: unknown } } | null) => {
        const speed = json?.current?.wind_speed_10m;
        const from = json?.current?.wind_direction_10m;
        const ok = typeof speed === "number" && Number.isFinite(speed) && typeof from === "number" && Number.isFinite(from);
        setWind({ key, value: ok ? { speedMps: speed, fromDeg: from } : "failed" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setWind({ key, value: "failed" });
      });
    return () => controller.abort();
  }, [on, key]);
  return on && wind?.key === key ? wind.value : null;
}

interface RangeProps {
  plan: RoutePlan;
  lang: Lang;
  facts: BikeFacts;
  /** The battery size from the bike's catalog page, when the bike came from the finder. */
  catalogWh: number | null;
  /** The charge now, when the page above already asked for it, along with catalogWh as the battery size. */
  chargePct?: number;
}

/** A battery estimate for this route, from the rider's own numbers. */
export function RangeCard({ plan, lang, facts, catalogWh, chargePct: givenCharge }: RangeProps) {
  const class3 = facts.classes.includes(3);
  const cap = facts.assistMph ?? (class3 ? 28 : 20);
  const [whText, setWhText] = useState<string | null>(null);
  const [charge, setCharge] = useState("100");
  const [rider, setRider] = useState(String(DEFAULT_RIDER_LB));
  const [bikeLb, setBikeLb] = useState<string | null>(null);
  const [speed, setSpeed] = useState(String(Math.min(class3 ? 18 : 15, cap)));
  const [assist, setAssist] = useState<AssistLevel>("medium");
  const [windOn, setWindOn] = useState(true);
  const wind = useWind(plan, windOn);

  const shownWh = whText ?? (catalogWh ? String(catalogWh) : "");
  const shownBike = bikeLb ?? String(facts.weightLb ?? DEFAULT_BIKE_LB);
  const batteryWh = positive(shownWh);
  const riderLb = positive(rider);
  const bikeWeight = positive(shownBike);
  const mph = positive(speed);
  const asked = givenCharge !== undefined;
  const chargePct = pct(asked ? givenCharge : Number(charge) || 0);
  const estimate = useMemo(() => {
    if (batteryWh === null || riderLb === null || bikeWeight === null || mph === null) return null;
    return estimateRange(plan.points, plan.heights, {
      batteryWh,
      chargePct,
      massKg: (riderLb + bikeWeight) * KG_PER_LB,
      speedMps: mph * MPS_PER_MPH,
      assist,
      wind: wind && wind !== "failed" ? wind : null,
    });
  }, [plan, batteryWh, chargePct, riderLb, bikeWeight, mph, assist, wind]);

  const field = (label: string, value: string, set: (v: string) => void, extra: { help?: string; max?: number } = {}) => (
    <label className="route-range-field">
      <span className="field-label">{label}</span>
      <input className="field" type="number" inputMode="decimal" min={0} max={extra.max} value={value} onChange={(e) => set(e.target.value)} />
      {extra.help ? <span className="help">{extra.help}</span> : null}
    </label>
  );

  return (
    <section className="card route-range space-y-4" aria-label={routeText(lang, "rangeTitle")}>
      <div className="space-y-1">
        <h4 className="card-title">{routeText(lang, "rangeTitle")}</h4>
        <p className="help">{routeText(lang, "rangeIntro")}</p>
      </div>
      <div className="route-range-grid">
        {asked ? null : field(routeText(lang, "rangeBattery"), shownWh, setWhText, { help: routeText(lang, "rangeBatteryHelp") })}
        {asked ? null : field(routeText(lang, "rangeCharge"), charge, setCharge, { max: 100 })}
        {field(routeText(lang, "rangeRider"), rider, setRider)}
        {field(routeText(lang, "rangeBike"), shownBike, setBikeLb)}
        {field(routeText(lang, "rangeSpeed"), speed, setSpeed, { max: cap })}
      </div>
      <div className="space-y-2">
        <p className="field-label">{routeText(lang, "rangeAssist")}</p>
        <div className="route-seg" role="group" aria-label={routeText(lang, "rangeAssist")}>
          {ASSIST_LEVELS.filter((a) => a !== "throttle" || facts.hasThrottle !== false).map((a) => (
            <button key={a} type="button" aria-pressed={assist === a} onClick={() => setAssist(a)}>
              {routeText(lang, `assist_${a}`)}
            </button>
          ))}
        </div>
      </div>
      <label className="route-campus">
        <input type="checkbox" checked={windOn} onChange={(e) => setWindOn(e.target.checked)} />
        <span>{routeText(lang, "rangeWind")}</span>
      </label>
      {windOn && wind === "failed" ? <p className="meta">{routeText(lang, "rangeWindFailed")}</p> : null}
      {windOn && wind && wind !== "failed" ? (
        <p className="meta">{routeText(lang, "rangeWindNow", { mph: Math.round(wind.speedMps / MPS_PER_MPH), dir: routeText(lang, `dir_${Math.round(wind.fromDeg / 45) % 8}` as "dir_0") })}</p>
      ) : null}
      {estimate ? (
        <div className="route-range-result" data-fit={estimate.roundTrip} aria-live="polite">
          <p className="route-range-big">{routeText(lang, "rangeUses", { low: Math.floor(estimate.usedPct[0]), high: Math.ceil(estimate.usedPct[1]) })}</p>
          <p>{routeText(lang, "rangeLeft", { low: Math.floor(estimate.leftPct[0]), high: Math.ceil(estimate.leftPct[1]) })}</p>
          <p className="font-semibold">{routeText(lang, estimate.roundTrip === "fits" ? "rangeFits" : estimate.roundTrip === "tight" ? "rangeTight" : "rangeShort")}</p>
          <p>
            {routeText(lang, "rangeFlat", { speed: mph ?? "", assist: routeText(lang, `assist_${assist}`), low: Math.round(estimate.flatMiles[0]), high: Math.round(estimate.flatMiles[1]) })}
          </p>
          {estimate.climbs[0] ? (
            <p>
              {routeText(lang, "rangeClimb", {
                length: formatDistance(estimate.climbs[0].meters),
                grade: Math.round(estimate.climbs[0].grade * 100),
                at: formatDistance(estimate.climbs[0].atM),
              })}
            </p>
          ) : null}
          {estimate.assumedFlat ? <p className="meta">{routeText(lang, "rangeFlatAssumed")}</p> : null}
        </div>
      ) : (
        <p className="note">{routeText(lang, "rangeNeedBattery")}</p>
      )}
      <p className="meta">{routeText(lang, "rangeCaveat")}</p>
      <details className="route-law">
        <summary>{routeText(lang, "rangeHow")}</summary>
        <p>{howText(lang, OPTIMISTIC, PESSIMISTIC)}</p>
        <p className="meta">{routeText(lang, "rangeWindNote")}</p>
      </details>
    </section>
  );
}
