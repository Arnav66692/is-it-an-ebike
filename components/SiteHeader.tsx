"use client";

// The header band and the links between the three parts of the app: the e-bike checker, the
// mods check and the bike finder. Each page passes its own title and lines.

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { BikeIcon } from "./BikeIcon";
import { TitleWords } from "./Hero";

export type NavPage = "check" | "mods" | "find";

const NAV: readonly { page: NavPage; path: string; key: "navCheck" | "navMods" | "navFind" }[] = [
  { page: "check", path: "/", key: "navCheck" },
  { page: "mods", path: "/mods", key: "navMods" },
  { page: "find", path: "/find", key: "navFind" },
];

/** A link to one part of the app that keeps the page's language. */
export function pageHref(path: string, lang: Lang, params: Record<string, string> = {}): string {
  const query = new URLSearchParams({ ...(lang === "es" ? { lang } : {}), ...params }).toString();
  return query ? `${path}?${query}` : path;
}

/** The links between the parts of the app. The page the family is on is marked for screen readers. */
export function SiteNav({ lang, current }: { lang: Lang; current: NavPage }) {
  return (
    <nav className="site-nav no-print" aria-label={t(lang, "navLabel")}>
      <ul role="list">
        {NAV.map((item) => (
          <li key={item.page}>
            <Link href={pageHref(item.path, lang)} aria-current={item.page === current ? "page" : undefined}>
              {t(lang, item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function readStoredLang(): Lang | null {
  try {
    const v = window.localStorage.getItem("lang");
    return v === "es" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

/** The page's language: ?lang=, then the one saved on this device, then the browser's, the same order as the checker. */
export function initialLang(search: string = window.location.search): Lang {
  const asked = new URLSearchParams(search).get("lang");
  if (asked === "en" || asked === "es") return asked;
  return readStoredLang() ?? (navigator.language.startsWith("es") ? "es" : "en");
}

/** The page's language and a switch that saves it on this device. */
export function useLang(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>(() => initialLang());
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  function toggle() {
    const next: Lang = lang === "en" ? "es" : "en";
    setLang(next);
    try {
      window.localStorage.setItem("lang", next);
    } catch {
      // Private windows can block storage. The page works without it.
    }
  }
  return [lang, toggle];
}

interface HeaderProps {
  lang: Lang;
  current: NavPage;
  title: string;
  onSwitchLang: () => void;
  children?: ReactNode;
}

/** The dark header band of the mods check and the bike finder. */
export function SiteHeader({ lang, current, title, onSwitchLang, children }: HeaderProps) {
  return (
    <header className="app-head hero">
      <div className="app-bar">
        <Link href={pageHref("/", lang)} className="brand-mark" aria-label={t(lang, "appName")}>
          <BikeIcon />
        </Link>
        <SiteNav lang={lang} current={current} />
        <button type="button" className="lang-btn" onClick={onSwitchLang} aria-label={t(lang, "switchLangLabel")} lang={lang === "en" ? "es" : "en"}>
          {t(lang, "switchLang")}
        </button>
      </div>
      <h1 className="app-title">
        <TitleWords text={title} />
      </h1>
      {children}
    </header>
  );
}
