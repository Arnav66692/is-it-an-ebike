import "leaflet/dist/leaflet.css";
import { CheckerApp } from "@/components/ClientOnly";

export default function Home() {
  return (
    <main className="flex-1">
      <CheckerApp />
    </main>
  );
}
