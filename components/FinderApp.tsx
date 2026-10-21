"use client";

import dynamic from "next/dynamic";
import { finderText } from "@/lib/i18n/finder";
import { SectionSkeleton } from "./Skeletons";

// The bike finder renders in the browser, since it reads the device's date and saved language. Its
// own module, so only the finder page carries these words.
export const FinderApp = dynamic(() => import("./BikeFinder").then((m) => m.BikeFinder), {
  ssr: false,
  loading: () => <SectionSkeleton title={{ en: finderText("en", "title"), es: finderText("es", "title") }} />,
});
