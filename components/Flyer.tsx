"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";
import { FlyerSheet } from "./FlyerSheet";

/** The flyer page's language, from ?lang=es on its link. The flyer itself is in both languages. */
export function flyerLang(search: string): Lang {
  return new URLSearchParams(search).get("lang") === "es" ? "es" : "en";
}

/** Printable flyer for bike shops and school offices. The QR opens the checker in San Diego mode. */
export function Flyer() {
  const [base] = useState(() => process.env.NEXT_PUBLIC_SITE_URL || window.location.origin);
  // Back and Print follow the language the family chose on the checker.
  const [lang] = useState<Lang>(() => flyerLang(window.location.search));
  const [qr, setQr] = useState("");
  const url = base.replace(/^https?:\/\//, "");

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const target = `${base}/?state=CA&place=city_of_san_diego,sduhsd_campuses`;
    QRCode.toDataURL(target, { width: 640, margin: 1, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(""));
  }, [base]);

  return (
    <div className="page">
      <div className="no-print flex items-center justify-between">
        <Link href={lang === "es" ? "/?lang=es" : "/"} className="link-btn back-link inline-flex items-center gap-2">
          <span aria-hidden="true">&larr;</span>
          <span>{t(lang, "flyerBack")}</span>
        </Link>
        <button type="button" className="btn btn-quiet" onClick={() => window.print()}>
          {t(lang, "flyerPrint")}
        </button>
      </div>
      <FlyerSheet qr={qr} url={url} />
    </div>
  );
}
