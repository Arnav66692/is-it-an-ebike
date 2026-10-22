"use client";

import dynamic from "next/dynamic";
import { mapText } from "@/lib/i18n/map";
import { SectionSkeleton } from "./Skeletons";

// The map renders in the browser only, since Leaflet needs the window. Its own module, so only
// the map page carries Leaflet and these words.
export const MapApp = dynamic(() => import("./BikeMap").then((m) => m.BikeMap), {
  ssr: false,
  loading: () => <SectionSkeleton title={{ en: mapText("en", "title"), es: mapText("es", "title") }} />,
});
