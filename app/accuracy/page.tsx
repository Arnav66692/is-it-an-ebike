import type { Metadata } from "next";
import { AccuracyView } from "@/components/AccuracyView";
import { ACCURACY_TEXT } from "@/lib/i18n/accuracy";

export const metadata: Metadata = {
  title: ACCURACY_TEXT.en.metaTitle,
  description: ACCURACY_TEXT.en.metaDescription,
};

export default function AccuracyPage() {
  return <AccuracyView lang="en" />;
}
