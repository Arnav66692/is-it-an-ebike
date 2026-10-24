import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import { RouteAppLoader } from "@/components/RouteAppLoader";

export const metadata: Metadata = {
  title: "Map | Is it an e-bike?",
  description: "Plan a legal e-bike route for one rider and one bike. Every street is checked against state and city rules, with the hills and a battery estimate.",
};

/** The Map: a legal route for the rider and bike the last check handed over. All of it runs in the browser. */
export default function RoutePage() {
  return (
    <main className="flex-1">
      <RouteAppLoader />
    </main>
  );
}
