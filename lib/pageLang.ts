// The page's language before its own script loads. The checker and the flyer render in the
// browser, so the server sends English markup. This picks the language the page will use, the
// same way the page does, and a script in app/layout.tsx sets it on <html> before the first paint,
// so the loading frame, the tab title and a screen reader all start in the right language.

import type { Lang } from "@/lib/i18n/names";

/**
 * The checker uses ?lang=, then the language saved on this device, then the browser's
 * (readInitial in components/Checker.tsx). The flyer uses ?lang= only (flyerLang in
 * components/Flyer.tsx). The accuracy pages have one language each. It uses nothing from outside
 * itself, since its source is also the inline script.
 */
export function pageLang(path: string, search: string, stored: string | null, browser: string): Lang {
  if (path === "/accuracy/es" || path.startsWith("/accuracy/es/")) return "es";
  if (path === "/accuracy" || path.startsWith("/accuracy/")) return "en";
  const asked = new URLSearchParams(search).get("lang");
  if (asked === "en" || asked === "es") return asked;
  if (path === "/qr" || path.startsWith("/qr/")) return "en";
  if (stored === "en" || stored === "es") return stored;
  return browser.startsWith("es") ? "es" : "en";
}

/** The inline script that sets <html lang> from pageLang before the first paint. Storage can be blocked, so it is read in a try. */
export const PAGE_LANG_SCRIPT = `(function(){try{var s=null;try{s=window.localStorage.getItem("lang")}catch(e){}document.documentElement.lang=(${pageLang.toString()})(location.pathname,location.search,s,navigator.language||"")}catch(e){}})();`;
