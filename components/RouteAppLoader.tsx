"use client";

import dynamic from "next/dynamic";
import { routeText } from "@/lib/i18n/route";
import { SectionSkeleton } from "./Skeletons";

// The Map reads this tab's stored ride and draws with Leaflet, so it renders in the browser only.
export const RouteAppLoader = dynamic(() => import("./RouteApp").then((m) => m.RouteApp), {
  ssr: false,
  loading: () => <SectionSkeleton title={{ en: routeText("en", "pageTitle"), es: routeText("es", "pageTitle") }} />,
});
