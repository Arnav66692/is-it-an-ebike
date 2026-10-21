import type { Metadata } from "next";
import { ModsApp } from "@/components/ClientOnly";
import { modsText } from "@/lib/i18n/mods";
import { MODS_DATA } from "@/lib/mods/data";

export const metadata: Metadata = {
  title: modsText("en", "metaTitle"),
  description: modsText("en", "metaDescription"),
};

/** The California mods check. The server reads the data files and sends the page only the view it shows. */
export default function ModsPage() {
  return (
    <main className="flex-1">
      <ModsApp data={MODS_DATA} />
    </main>
  );
}
