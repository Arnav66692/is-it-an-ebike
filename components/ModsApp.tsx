"use client";

import dynamic from "next/dynamic";
import { modsText } from "@/lib/i18n/mods";
import { SectionSkeleton } from "./Skeletons";

// The mods check renders in the browser, since it reads the URL and the device's date. Its own
// module, so only the mods page carries these words.
export const ModsApp = dynamic(() => import("./ModsCheck").then((m) => m.ModsCheck), {
  ssr: false,
  loading: () => <SectionSkeleton title={{ en: modsText("en", "title"), es: modsText("es", "title") }} />,
});
