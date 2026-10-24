"use client";

import dynamic from "next/dynamic";

// The world, the intro and the sound run in the browser only, so the server's pages stay the same.
export const ExperienceLoader = dynamic(() => import("./Experience").then((m) => m.Experience), { ssr: false });
