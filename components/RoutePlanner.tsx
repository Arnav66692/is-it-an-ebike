"use client";

// The legal route check, under the checker's answer. The family picks where the ride starts and
// ends. Our server finds a bike route and says what each piece runs on and where it is
// (app/api/route). The check itself runs here, on the phone, with the same bike facts, age and
// date as the answer above (lib/route/legal.ts), so the rider's details never leave the phone.
// "Find a legal route" asks the router to go around every piece that failed, and checks again.

import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { announcement } from "./BottomLineCard";
import { AlongTheWay, ElevationProfile, MixBar, RangeCard, RouteStats } from "./RouteExtras";
import { formatDate, joinList, type Lang } from "@/lib/i18n/names";
import { reasonText, routeText } from "@/lib/i18n/route";
import { MapFetchError, searchPlaces } from "@/lib/map/fetchSpots";
import { distanceMeters, formatDistance, type FoundPlace } from "@/lib/map/osm";
import { checkRoute, type PieceStatus, type RouteProblem, type RouteVerdict } from "@/lib/route/legal";
import { ROUTE_RULES } from "@/lib/route/ruleData";
import type { RoutePlan, RoutePoint, RouteRequest } from "@/lib/route/types";
import type { BikeFacts } from "@/lib/rules";

const RouteMap = dynamic(() => import("./RouteMap"), { ssr: false, loading: () => <div className="map-frame route-map-frame" aria-hidden="true" /> });

/** About 30 miles, a little under the server's own limit, so the message and the limit agree. */
const MAX_TRIP_METERS = 48_000;
const MAX_AVOID = 20;
const MAX_TRIES = 3;
const GEO_TIMEOUT_MS = 10_000;
const SDUHSD_LEAID = "0634380";

interface Picked {
  label: string;
  point: RoutePoint;
}

type FieldNote = { key: "searching" | "noPlace"; q: string } | { key: "searchFailed" | "locating" | "locateFailed" | "pickOne" } | null;

function fieldNoteText(note: FieldNote, lang: Lang): string {
  if (!note) return "";
  return "q" in note ? routeText(lang, note.key, { q: note.q }) : routeText(lang, note.key);
}

/** One place box: type and search, pick from the matches, or use the phone's location. */
function PlaceField({ lang, label, picked, onPick, allowLocate }: { lang: Lang; label: string; picked: Picked | null; onPick: (p: Picked | null) => void; allowLocate: boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundPlace[]>([]);
  const [note, setNote] = useState<FieldNote>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function search() {
    const q = query.trim();
    if (!q || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setFound([]);
    setNote({ key: "searching", q });
    try {
      const places = await searchPlaces(q, lang, controller.signal);
      if (places.length === 0) setNote({ key: "noPlace", q });
      else if (places.length === 1) pick(places[0]);
      else {
        setFound(places);
        setNote({ key: "pickOne" });
      }
    } catch (err) {
      if (!controller.signal.aborted) setNote({ key: err instanceof MapFetchError ? "searchFailed" : "searchFailed" });
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  }

  function pick(place: FoundPlace) {
    setFound([]);
    setNote(null);
    onPick({ label: place.label, point: { lat: place.lat, lon: place.lon } });
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setNote({ key: "locateFailed" });
      return;
    }
    setNote({ key: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNote(null);
        onPick({ label: routeText(lang, "myLocation"), point: { lat: pos.coords.latitude, lon: pos.coords.longitude } });
      },
      () => setNote({ key: "locateFailed" }),
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 60_000 },
    );
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void search();
    }
  }

  if (picked) {
    return (
      <div className="route-field">
        <p className="field-label">{label}</p>
        <p className="route-picked">
          <span>{routeText(lang, "picked", { place: picked.label })}</span>
          <button type="button" className="btn btn-quiet" onClick={() => onPick(null)}>
            {routeText(lang, "change")}
          </button>
        </p>
      </div>
    );
  }
  return (
    <div className="route-field space-y-2">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <p id={`${id}-help`} className="help">
        {routeText(lang, "placeHelp")}
      </p>
      <div className="map-search">
        <input id={id} type="search" className="field" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} autoComplete="off" enterKeyHint="search" aria-describedby={`${id}-help`} />
        <button type="button" className="btn" disabled={busy || query.trim() === ""} onClick={() => void search()}>
          {routeText(lang, "find")}
        </button>
      </div>
      {allowLocate ? (
        <button type="button" className="btn btn-quiet" onClick={locate}>
          {routeText(lang, "myLocation")}
        </button>
      ) : null}
      {found.length > 0 ? (
        <ul className="map-places" aria-label={routeText(lang, "pickOne")}>
          {found.map((p) => (
            <li key={p.id}>
              <button type="button" className="map-place" onClick={() => pick(p)}>
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status" className={note ? "note" : "sr-only"}>
        {fieldNoteText(note, lang)}
      </p>
    </div>
  );
}

class RouteError extends Error {
  constructor(readonly key: "busy" | "noRoute" | "failed") {
    super(key);
  }
}

/** Our server's route, checked for shape, since it comes over the network. */
async function fetchPlan(req: RouteRequest, signal: AbortSignal): Promise<RoutePlan> {
  let res: Response;
  try {
    res = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new RouteError("failed");
  }
  if (res.status === 429 || res.status === 503) throw new RouteError("busy");
  if (res.status === 404) throw new RouteError("noRoute");
  if (!res.ok) throw new RouteError("failed");
  const plan = (await res.json().catch(() => null)) as RoutePlan | null;
  if (!plan || !Array.isArray(plan.points) || !Array.isArray(plan.segments) || !Array.isArray(plan.crossed)) throw new RouteError("failed");
  return plan;
}

const KIND_RANK: Record<RouteVerdict["kind"], number> = { yes: 0, no_unconfirmed: 1, no_illegal: 2 };

/** A route is better when its answer is closer to YES, then when fewer meters fail. */
function better(a: RouteVerdict, b: RouteVerdict): boolean {
  if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] < KIND_RANK[b.kind];
  if (a.meters.banned !== b.meters.banned) return a.meters.banned < b.meters.banned;
  return a.meters.unclear < b.meters.unclear;
}

/** Old and new points to avoid, at most the server's limit, spread along the list. */
function mergeAvoid(old: readonly RoutePoint[], next: readonly RoutePoint[]): RoutePoint[] {
  const all = [...old, ...next];
  if (all.length <= MAX_AVOID) return all;
  const step = all.length / MAX_AVOID;
  return Array.from({ length: MAX_AVOID }, (_, i) => all[Math.floor(i * step)]);
}

/** Paths, sidewalks and trails are the usual problem, and streets with bike lanes the usual way around. */
function preferFor(v: RouteVerdict): RouteRequest["prefer"] {
  return v.problems.some((p) => ["bike_path", "sidewalk", "footway", "trail"].includes(p.reason.kind)) ? "roads" : "balanced";
}

interface Props {
  lang: Lang;
  facts: BikeFacts;
  riderAge: number;
  rideDate: string;
  /** The family picked an SDUHSD campus in the checker. */
  sduhsdCampus: boolean;
  /** The catalog bike the finder sent, so its battery size can fill the estimate. */
  bikeId: string | null;
}

type Phase = { kind: "idle" } | { kind: "loading"; legal: boolean } | { kind: "error"; key: "busy" | "noRoute" | "failed" | "tooFar" | "needBoth" } | { kind: "ready" };

export function RoutePlanner({ lang, facts, riderAge, rideDate, sduhsdCampus, bikeId }: Props) {
  const headId = useId();
  const [from, setFrom] = useState<Picked | null>(null);
  const [to, setTo] = useState<Picked | null>(null);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [legalNote, setLegalNote] = useState<"legalFound" | "noLegalFound" | null>(null);
  const [campus, setCampus] = useState(sduhsdCampus);
  const [style, setStyle] = useState<"balanced" | "roads">("balanced");
  const [avoidHills, setAvoidHills] = useState(false);
  const [catalogWh, setCatalogWh] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  // A bike from the finder carries its battery size, read from the maker's page.
  useEffect(() => {
    if (!bikeId) return;
    let live = true;
    void import("@/lib/bikes/catalog").then(({ catalogBike }) => {
      if (live) setCatalogWh(catalogBike(bikeId)?.battery_wh ?? null);
    });
    return () => {
      live = false;
    };
  }, [bikeId]);

  const endsInSduhsd = plan?.atEnd.some((j) => (j.layer === "school_secondary" || j.layer === "school_unified") && j.geoid === SDUHSD_LEAID) ?? false;
  const rider = useMemo(() => ({ riderAge, rideDate, facts, sduhsdCampus: campus && endsInSduhsd }), [riderAge, rideDate, facts, campus, endsInSduhsd]);
  // The answer follows the bike facts, age and date above, so editing them updates the route's answer too.
  const verdict = useMemo(() => (plan ? checkRoute(plan, rider, ROUTE_RULES) : null), [plan, rider]);

  function pickFrom(p: Picked | null) {
    setFrom(p);
    setPlan(null);
    setPhase({ kind: "idle" });
  }

  function pickTo(p: Picked | null) {
    setTo(p);
    setPlan(null);
    setPhase({ kind: "idle" });
  }

  async function run(legal: boolean) {
    if (!from || !to) {
      setPhase({ kind: "error", key: "needBoth" });
      return;
    }
    if (distanceMeters(from.point, to.point) > MAX_TRIP_METERS) {
      setPhase({ kind: "error", key: "tooFar" });
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ kind: "loading", legal });
    setLegalNote(null);
    try {
      if (!legal || !plan || !verdict) {
        setPlan(await fetchPlan({ from: from.point, to: to.point, prefer: style, avoidHills }, controller.signal));
        setPhase({ kind: "ready" });
        return;
      }
      let best = { plan, verdict };
      let avoid: RoutePoint[] = [];
      for (let i = 0; i < MAX_TRIES && best.verdict.kind !== "yes" && best.verdict.avoid.length > 0; i += 1) {
        avoid = mergeAvoid(avoid, best.verdict.avoid);
        const prefer = preferFor(best.verdict) === "roads" ? "roads" : style;
        const next = await fetchPlan({ from: from.point, to: to.point, avoid, prefer, avoidHills }, controller.signal);
        const nextVerdict = checkRoute(next, rider, ROUTE_RULES);
        if (!better(nextVerdict, best.verdict)) break;
        best = { plan: next, verdict: nextVerdict };
      }
      setPlan(best.plan);
      setLegalNote(best.verdict.kind === "yes" ? "legalFound" : "noLegalFound");
      setPhase({ kind: "ready" });
    } catch (err) {
      if (controller.signal.aborted) return;
      setPhase({ kind: "error", key: err instanceof RouteError ? err.key : "failed" });
    }
  }

  const loading = phase.kind === "loading";
  const canTryLegal = verdict !== null && verdict.kind !== "yes" && verdict.problems.length > 0 && !loading;

  return (
    <section className="card route-plan space-y-4" aria-labelledby={headId}>
      <h2 id={headId} className="card-title">
        <span aria-hidden="true" className="step">
          5
        </span>
        {routeText(lang, "title")}
      </h2>
      <p className="help">{routeText(lang, "intro")}</p>
      <div className="route-fields">
        <PlaceField lang={lang} label={routeText(lang, "fromLabel")} picked={from} onPick={pickFrom} allowLocate />
        <PlaceField lang={lang} label={routeText(lang, "toLabel")} picked={to} onPick={pickTo} allowLocate={false} />
      </div>
      <div className="route-options">
        <div className="space-y-2">
          <p className="field-label">{routeText(lang, "optStyle")}</p>
          <div className="route-seg" role="group" aria-label={routeText(lang, "optStyle")}>
            <button type="button" aria-pressed={style === "balanced"} onClick={() => setStyle("balanced")}>
              {routeText(lang, "optCalm")}
            </button>
            <button type="button" aria-pressed={style === "roads"} onClick={() => setStyle("roads")}>
              {routeText(lang, "optDirect")}
            </button>
          </div>
        </div>
        <label className="route-campus">
          <input type="checkbox" checked={avoidHills} onChange={(e) => setAvoidHills(e.target.checked)} />
          <span>{routeText(lang, "optHills")}</span>
        </label>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-go" disabled={loading} onClick={() => void run(false)}>
          {routeText(lang, "check")}
        </button>
      </div>
      <p role="status" className={phase.kind === "loading" || phase.kind === "error" ? "note" : "sr-only"}>
        {phase.kind === "loading" ? routeText(lang, phase.legal ? "tryingLegal" : "checking") : phase.kind === "error" ? routeText(lang, phase.key) : verdict ? headline(verdict, lang, rideDate) : ""}
      </p>
      {plan && verdict && phase.kind !== "loading" ? (
        <>
          {endsInSduhsd ? (
            <label className="route-campus">
              <input type="checkbox" checked={campus} onChange={(e) => setCampus(e.target.checked)} />
              <span>{routeText(lang, "campus")}</span>
            </label>
          ) : null}
          <RouteAnswer verdict={verdict} plan={plan} lang={lang} rideDate={rideDate} />
          {legalNote ? <p className="note">{routeText(lang, legalNote)}</p> : null}
          {canTryLegal ? (
            <div className="actions">
              <button type="button" className="btn btn-go" onClick={() => void run(true)}>
                {routeText(lang, "tryLegal")}
              </button>
            </div>
          ) : null}
          <Legend lang={lang} />
          <RouteMap plan={plan} pieces={verdict.pieces} label={routeText(lang, "mapLabel")} />
          <div className="route-insights">
            <ElevationProfile plan={plan} lang={lang} />
            <MixBar plan={plan} lang={lang} />
          </div>
          <AlongTheWay pieces={verdict.pieces} lang={lang} />
          <RangeCard plan={plan} lang={lang} facts={facts} catalogWh={catalogWh} />
        </>
      ) : null}
      <footer className="meta space-y-1">
        <p>{routeText(lang, "sources")}</p>
        <p>{routeText(lang, "privacy")}</p>
        <p>
          {routeText(lang, "osmCredit")}{" "}
          <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">
            {routeText(lang, "fixMap")}
          </a>
        </p>
      </footer>
    </section>
  );
}

function headline(v: RouteVerdict, lang: Lang, rideDate: string): string {
  if (v.kind === "yes") return routeText(lang, "yesLine", { date: formatDate(rideDate, lang) });
  if (v.kind === "no_illegal") return routeText(lang, v.rider.some((r) => r.line?.kind === "no_illegal") ? "noRiderLine" : "noIllegalLine");
  return routeText(lang, "noUnconfirmedLine");
}

function RouteAnswer({ verdict, plan, lang, rideDate }: { verdict: RouteVerdict; plan: RoutePlan; lang: Lang; rideDate: string }) {
  const headId = useId();
  const yes = verdict.kind === "yes";
  return (
    <section className="card bottom-line route-answer" data-kind={verdict.kind} aria-labelledby={headId}>
      <header className="bl-top">
        <h4 id={headId} className="eyebrow">
          {routeText(lang, "eyebrow")}
        </h4>
        <p className="bl-head" data-answer={yes ? "yes" : "no"}>
          <span className="bl-mark" aria-hidden="true">
            {yes ? "✓" : "✕"}
          </span>
          <span>{routeText(lang, yes ? "yes" : "no")}</span>
        </p>
        <p className="bl-reason">{headline(verdict, lang, rideDate)}</p>
        {verdict.unchecked.length > 0 && verdict.kind !== "no_illegal" ? (
          <p className="font-semibold">{routeText(lang, "uncheckedLine", { places: joinList(verdict.unchecked, lang) })}</p>
        ) : null}
        <RouteStats plan={plan} lang={lang} />
      </header>
      <div className="bl-body">
        {verdict.problems.length > 0 ? (
          <div className="space-y-2">
            <h5 className="eyebrow">{routeText(lang, "problemsTitle")}</h5>
            <ul className="route-problems space-y-3">
              {verdict.problems.map((p) => (
                <ProblemItem key={`${p.pieces[0]}-${p.reason.code}`} problem={p} lang={lang} />
              ))}
            </ul>
          </div>
        ) : null}
        <div className="space-y-1">
          <h5 className="eyebrow">{routeText(lang, "riderTitle")}</h5>
          {verdict.rider.map((r) => (
            <p key={r.state}>{r.line ? routeText(lang, "riderSame", { answer: announcement(r.line, lang) }) : routeText(lang, "r_state_no_rules", { state: r.state })}</p>
          ))}
        </div>
        <footer className="bl-foot meta">
          <p>{routeText(lang, "notAdvice")}</p>
        </footer>
      </div>
    </section>
  );
}

function ProblemItem({ problem, lang }: { problem: RouteProblem; lang: Lang }) {
  const r = problem.reason;
  return (
    <li>
      <p className="font-semibold">{reasonText(r, lang, problem.name)}</p>
      <p className="meta">{routeText(lang, "onWay", { distance: formatDistance(problem.meters), name: problem.name ?? routeText(lang, "unnamed") })}</p>
      {r.citation ? (
        <details className="route-law">
          <summary>{routeText(lang, "lawSays")}</summary>
          <p>{r.citation}</p>
          {r.quote ? <blockquote>{r.quote}</blockquote> : null}
          {r.url ? (
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              {routeText(lang, "readSource")}
            </a>
          ) : null}
        </details>
      ) : null}
    </li>
  );
}

const STATUS_KEY: Record<PieceStatus, "legendAllowed" | "legendBanned" | "legendUnclear" | "legendUnchecked"> = {
  allowed: "legendAllowed",
  banned: "legendBanned",
  unclear: "legendUnclear",
  unchecked: "legendUnchecked",
};

function Legend({ lang }: { lang: Lang }) {
  return (
    <ul className="route-legend" aria-hidden="true">
      {(Object.keys(STATUS_KEY) as PieceStatus[]).map((s) => (
        <li key={s}>
          <span className={`route-swatch route-swatch-${s}`} />
          {routeText(lang, STATUS_KEY[s])}
        </li>
      ))}
    </ul>
  );
}
