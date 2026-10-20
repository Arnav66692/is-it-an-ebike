import type { Metadata } from "next";
import { AccuracyView } from "@/components/AccuracyView";
import { ACCURACY_TEXT } from "@/lib/i18n/accuracy";

export const metadata: Metadata = {
  title: ACCURACY_TEXT.es.metaTitle,
  description: ACCURACY_TEXT.es.metaDescription,
};

export default function AccuracyPageEs() {
  return <AccuracyView lang="es" />;
}
