import type { Metadata } from "next";
import { FinderApp } from "@/components/ClientOnly";
import { CATALOG, CATALOG_META } from "@/lib/bikes/catalog";
import { finderText } from "@/lib/i18n/finder";

export const metadata: Metadata = {
  title: finderText("en", "metaTitle"),
  description: finderText("en", "metaDescription"),
};

/** The bike finder. The server reads the catalog and sends the page only the fields it uses. */
export default function FindPage() {
  return (
    <main className="flex-1">
      <FinderApp catalog={CATALOG} meta={CATALOG_META} />
    </main>
  );
}
