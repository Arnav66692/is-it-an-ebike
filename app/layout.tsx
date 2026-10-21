import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PAGE_LANG_SCRIPT } from "@/lib/pageLang";
import "./globals.css";
import "./features.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Is it an e-bike?",
  description:
    "Check one e-bike for one rider in any US state, with San Diego County local rules. Every answer shows the law behind it. Free, no account.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f0f0f" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The script sets lang before the first paint, so the server's "en" can differ from the page's. React leaves it.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* Our own fixed code, no user input: it sets the page's language (lib/pageLang.ts). */}
        <script dangerouslySetInnerHTML={{ __html: PAGE_LANG_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
