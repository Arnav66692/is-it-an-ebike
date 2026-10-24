"use client";

// The Map: a legal route and a battery estimate for the family's own bike. They type the model,
// read a label photo or a product link, or type the stats, then give the charge now. The bike is
// taken as legal for the rider, as the family asked, and every street is still checked for its
// class. A finished check on Check a bike hands its bike over too (lib/route/ride.ts).

import { useId, useState } from "react";
import { CATALOG } from "@/lib/bikes/catalog";
import { catalogFacts } from "@/lib/bikes/facts";
import { BIKE_MODELS, modelFacts } from "@/lib/bikes/models";
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
/** Every model the search knows: the checked catalog first, then the maker-page list, each name once. */
const MODELS: readonly { id: string; name: string; facts: () => BikeFacts; wh: number | null; url: string }[] = (() => {
  const all = [
    ...CATALOG.map((b) => ({ id: b.id, name: `${b.maker} ${b.model}`, facts: () => catalogFacts(b), wh: typeof b.battery_wh === "number" ? b.battery_wh : null, url: b.maker_url })),
    ...BIKE_MODELS.map((m) => ({ id: m.id, name: `${m.maker} ${m.model}`, facts: () => modelFacts(m), wh: m.battery_wh, url: m.source_url })),
  ];
  const seen = new Set<string>();
  return all.filter((m) => (seen.has(m.name.toLowerCase()) ? false : (seen.add(m.name.toLowerCase()), true)));
})();

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
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [batteryWh, setBatteryWh] = useState(() => batteryOf(handed?.bikeId ?? null));
  const [charge, setCharge] = useState("100");
  const [model, setModel] = useState("");
  const [gate] = useState(requestGate);
  const [today] = useState(() => checkerToday(localToday()));

  function onModel(text: string) {
    setModel(text);
    const hit = MODELS.find((m) => m.name.toLowerCase() === text.trim().toLowerCase());
    if (!hit) return;
    setFacts(hit.facts());
    setSource(hit.name);
    setSourceUrl(hit.url);
    setBatteryWh(hit.wh ? String(hit.wh) : "");
  }

  function onRead(extraction: Extraction) {
    setFacts(factsFromExtraction(extraction, emptyFacts()));
    setSource(routeText(lang, "bikeRead"));
    setSourceUrl(null);
  }

  function pickClass(c: ClassNum) {
    setFacts((f) => ({ ...(f ?? { ...emptyFacts(), hasPedals: true }), classes: [c] }));
  }

  function onManual() {
    setFacts({ ...emptyFacts(), hasPedals: true });
    setSource(null);
  }

  const wh = Number(batteryWh);
  const whOk = Number.isFinite(wh) && wh > 0 ? wh : null;
  const chargePct = Math.max(0, Math.min(100, Number(charge) || 0));
  const ready = facts !== null && facts.classes.length > 0;
  const typed = model.trim().toLowerCase();
  const notListed = typed.length >= 3 && !MODELS.some((m) => m.name.toLowerCase().includes(typed));

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
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
          <span className="help block">{routeText(lang, "bikeModelHelp")}</span>
        </label>
        {notListed ? <p className="note">{routeText(lang, "bikeNotListed", { model: model.trim() })}</p> : null}
        <p className="help">{routeText(lang, "bikeOrRead")}</p>
        <BikeInput lang={lang} onRead={onRead} onManual={onManual} gate={gate} />
        {/* Any bike works: a class and a battery size are all the route and the estimate need. */}
        {(
          <div className="space-y-4">
            {source ? (
              <p className="meta">
                {routeText(lang, "bikeFrom", { source })}
                {sourceUrl ? (
                  <>
                    {" "}
                    <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                      {routeText(lang, "readSource")}
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="space-y-2">
              <p className="field-label">{routeText(lang, "bikeClass")}</p>
              <div className="route-seg" role="group" aria-label={routeText(lang, "bikeClass")}>
                {CLASSES.map((c) => (
                  <button key={c} type="button" aria-pressed={facts?.classes.includes(c) ?? false} onClick={() => pickClass(c)}>
                    {routeText(lang, "bikeClass")} {c}
                  </button>
                ))}
              </div>
              {!facts || facts.classes.length === 0 ? <p className="note">{routeText(lang, "bikeNeedClass")}</p> : null}
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
