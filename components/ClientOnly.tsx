"use client";

import dynamic from "next/dynamic";

// These pages read the URL, the device's date and saved language, so they render in the browser.
export const CheckerApp = dynamic(() => import("./Checker").then((m) => m.Checker), {
  ssr: false,
  loading: () => <p className="page app-title">Is it an e-bike?</p>,
});

export const FlyerApp = dynamic(() => import("./Flyer").then((m) => m.Flyer), {
  ssr: false,
  loading: () => <p className="page app-title">Is it an e-bike?</p>,
});
