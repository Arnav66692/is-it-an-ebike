"use client";

import dynamic from "next/dynamic";
import { modsText } from "@/lib/i18n/mods";
import { CheckerSkeleton, FlyerSkeleton, SectionSkeleton } from "./Skeletons";

// These pages read the URL, the device's date and saved language, so they render in the browser.
// Until their scripts arrive, each shows a frame of the same shape, in the page's language.
export const CheckerApp = dynamic(() => import("./Checker").then((m) => m.Checker), {
  ssr: false,
  loading: () => <CheckerSkeleton />,
});

export const FlyerApp = dynamic(() => import("./Flyer").then((m) => m.Flyer), {
  ssr: false,
  loading: () => <FlyerSkeleton />,
});

export const ModsApp = dynamic(() => import("./ModsCheck").then((m) => m.ModsCheck), {
  ssr: false,
  loading: () => <SectionSkeleton title={{ en: modsText("en", "title"), es: modsText("es", "title") }} />,
});
