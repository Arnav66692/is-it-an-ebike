"use client";

// The Map: a legal route for the rider and bike a finished check handed over (lib/route/ride.ts).
// Without one it sends the family to Check a bike first, since a route is only legal for one
// rider on one bike.

import { useState } from "react";
import { formatDate, type Lang } from "@/lib/i18n/names";
import { routeText } from "@/lib/i18n/route";
import { t } from "@/lib/i18n/ui";
import { readRide, type StoredRide } from "@/lib/route/ride";
import { RoutePlanner } from "./RoutePlanner";
import { pageHref, SiteHeader, useLang } from "./SiteHeader";

/** The bike in a few words, like "Class 2 e-bike, 350 W rated". */
function bikeWords(ride: StoredRide, lang: Lang): string {
  const { classes, ratedWatts } = ride.facts;
  const kind = classes.length > 0 ? routeText(lang, "rideBikeClass", { classes: classes.join(lang === "es" ? " o " : " or ") }) : routeText(lang, "rideBikeNoClass");
  return ratedWatts !== null ? `${kind}, ${routeText(lang, "rideWatts", { watts: ratedWatts })}` : kind;
}

export function RouteApp() {
  const [lang, switchLang] = useLang();
  const [ride] = useState(readRide);
  return (
    <div className="page page-route">
      <SiteHeader lang={lang} current="route" title={routeText(lang, "pageTitle")} onSwitchLang={switchLang}>
        <p className="tagline">{routeText(lang, "pageTagline")}</p>
      </SiteHeader>
      {ride ? (
        <>
          <section className="card space-y-1" aria-label={routeText(lang, "rideTitle")}>
            <h2 className="card-title">{routeText(lang, "rideTitle")}</h2>
            <p>{routeText(lang, "rideLine", { bike: bikeWords(ride, lang), age: ride.riderAge, date: formatDate(ride.rideDate, lang) })}</p>
            <p className="meta">
              <a href={pageHref("/", lang)}>{routeText(lang, "rideChange")}</a>. {routeText(lang, "rideKept")}
            </p>
          </section>
          <RoutePlanner lang={lang} facts={ride.facts} riderAge={ride.riderAge} rideDate={ride.rideDate} sduhsdCampus={ride.sduhsdCampus} bikeId={ride.bikeId} step={null} />
        </>
      ) : (
        <section className="card space-y-3">
          <h2 className="card-title">{routeText(lang, "needCheckTitle")}</h2>
          <p>{routeText(lang, "needCheck")}</p>
          <a className="btn btn-go" href={pageHref("/", lang)}>
            {routeText(lang, "goCheck")}
          </a>
        </section>
      )}
      <footer className="site-foot">
        <p className="meta">{t(lang, "notLegalAdvice")}</p>
      </footer>
    </div>
  );
}
