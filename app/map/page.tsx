import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import { MapApp } from "@/components/MapApp";
import { mapText } from "@/lib/i18n/map";

export const metadata: Metadata = {
  title: mapText("en", "metaTitle"),
  description: mapText("en", "metaDescription"),
};

/** The map of bike racks, bike shops and repair stations. All of it runs in the browser. */
export default function MapPage() {
  return (
    <main className="flex-1">
      <MapApp />
    </main>
  );
}
