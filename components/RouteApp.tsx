"use client";

// The Map: a legal route and a battery estimate for the family's own bike. They type the model,
// read a label photo or a product link, or type the stats, then give the charge now. The bike is
// taken as legal for the rider, as the family asked, and every street is still checked for its
// class. A finished check on Check a bike hands its bike over too (lib/route/ride.ts).

import { useId, useState } from "react";
import { CATALOG } from "@/lib/bikes/catalog";
import { catalogFacts } from "@/lib/bikes/facts";
import { checkerToday, requestGate } from "@/lib/checkerState";
import { factsFromExtraction } from "@/lib/extract/merge";
import type { Extraction } from "@/lib/extract/parse";
import { routeText } from "@/lib/i18n/route";
import { t } from "@/lib/i18n/ui";
import { readRide } from "@/lib/route/ride";
import { emptyFacts, type BikeFacts, type ClassNum } from "@/lib/rules";
import { localToday } from "@/lib/rules/dates";
import { BikeInput } from "./BikeInput";
import { RoutePlanner } from "./RoutePlanner";
import { SiteHeader, useLang } from "./SiteHeader";

/** The Map doesn't ask the rider's age, since the bike is taken as legal. The engine never reads this there. */
const UNUSED_AGE = 18;
const CLASSES: readonly ClassNum[] = [1, 2, 3];
const MODELS = CATALOG.map((bike) => ({ name: `${bike.maker} ${bike.model}`, bike }));

function batteryOf(bikeId: string | null): string {
  const wh = bikeId ? CATALOG.find((b) => b.id === bikeId)?.battery_wh : null;
  return typeof wh === "number" && wh > 0 ? String(wh) : "";
}

export function RouteApp() {
  const [lang, switchLang] = useLang();
  const listId = useId();
  const [handed] = useState(readRide);
  const [facts, setFacts] = useState<BikeFacts | null>(handed?.facts ?? null);
  const [source, setSource] = useState<string | null>(handed ? t(lang, "navCheck") : null);
  const [batteryWh, setBatteryWh] = useState(() => batteryOf(handed?.bikeId ?? null));
  const [charge, setCharge] = useState("100");
  const [model, setModel] = useState("");
  const [gate] = useState(requestGate);
  const [today] = useState(() => checkerToday(localToday()));

  function onModel(text: string) {
    setModel(text);
    const hit = MODELS.find((m) => m.name.toLowerCase() === text.trim().toLowerCase());
    if (!hit) return;
    setFacts(catalogFacts(hit.bike));
    setSource(hit.name);
    setBatteryWh(batteryOf(hit.bike.id));
  }

  function onRead(extraction: Extraction) {
    setFacts(factsFromExtraction(extraction, emptyFacts()));
    setSource(routeText(lang, "bikeRead"));
  }

  function onManual() {
    setFacts({ ...emptyFacts(), hasPedals: true });
    setSource(null);
  }

  const wh = Number(batteryWh);
  const whOk = Number.isFinite(wh) && wh > 0 ? wh : null;
  const chargePct = Math.max(0, Math.min(100, Number(charge) || 0));
  const ready = facts !== null && facts.classes.length > 0;

  return (
    <div className="page page-route">
      <SiteHeader lang={lang} current="route" title={routeText(lang, "pageTitle")} onSwitchLang={switchLang}>
        <p className="tagline">{routeText(lang, "pageTagline")}</p>
      </SiteHeader>

      <section className="card space-y-4" aria-label={routeText(lang, "bikeTitle")}>
        <h2 className="card-title">{routeText(lang, "bikeTitle")}</h2>
        <label className="block space-y-2">
          <span className="field-label">{routeText(lang, "bikeModel")}</span>
          <input className="field" list={listId} value={model} onChange={(e) => onModel(e.target.value)} autoComplete="off" />
          <datalist id={listId}>
            {MODELS.map((m) => (
              <option key={m.bike.id} value={m.name} />
            ))}
          </datalist>
          <span className="help block">{routeText(lang, "bikeModelHelp")}</span>
        </label>
        <p className="help">{routeText(lang, "bikeOrRead")}</p>
        <BikeInput lang={lang} onRead={onRead} onManual={onManual} gate={gate} />
        {facts ? (
          <div className="space-y-4">
            {source ? <p className="meta">{routeText(lang, "bikeFrom", { source })}</p> : null}
            <div className="space-y-2">
              <p className="field-label">{routeText(lang, "bikeClass")}</p>
              <div className="route-seg" role="group" aria-label={routeText(lang, "bikeClass")}>
                {CLASSES.map((c) => (
                  <button key={c} type="button" aria-pressed={facts.classes.includes(c)} onClick={() => setFacts({ ...facts, classes: [c] })}>
                    {routeText(lang, "bikeClass")} {c}
                  </button>
                ))}
              </div>
              {facts.classes.length === 0 ? <p className="note">{routeText(lang, "bikeNeedClass")}</p> : null}
            </div>
            <div className="route-range-grid">
              <label className="route-range-field">
                <span className="field-label">{routeText(lang, "rangeBattery")}</span>
                <input className="field" type="number" inputMode="decimal" min={0} value={batteryWh} onChange={(e) => setBatteryWh(e.target.value)} />
                <span className="help">{routeText(lang, "rangeBatteryHelp")}</span>
              </label>
              <label className="route-range-field">
                <span className="field-label">{routeText(lang, "batteryNow")}</span>
                <input className="field" type="number" inputMode="decimal" min={0} max={100} value={charge} onChange={(e) => setCharge(e.target.value)} />
              </label>
            </div>
          </div>
        ) : (
          <p className="note">{routeText(lang, "bikeNeed")}</p>
        )}
      </section>

      {ready && facts ? (
        <RoutePlanner
          lang={lang}
          facts={facts}
          riderAge={UNUSED_AGE}
          rideDate={today}
          sduhsdCampus={false}
          bikeId={null}
          step={null}
          assumeBikeLegal
          batteryWh={whOk}
          chargePct={chargePct}
        />
      ) : null}

      <footer className="site-foot">
        <p className="meta">{t(lang, "notLegalAdvice")}</p>
      </footer>
    </div>
  );
}
