import type { Metadata } from "next";
import { FlyerApp } from "@/components/ClientOnly";

export const metadata: Metadata = {
  title: "QR flyer | Is it an e-bike?",
  description: "A printable flyer with a QR code that opens the e-bike checker.",
};

export default function QrPage() {
  return (
    <main className="flex-1">
      <FlyerApp />
    </main>
  );
}
