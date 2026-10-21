"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/ui";

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
      <article className="card flyer" lang="en">
        <div className="space-y-2">
          <h1 className="app-title text-[2.25rem]">Is it an e-bike?</h1>
          <p className="text-2xl font-bold text-muted" lang="es">
            ¿Es una bicicleta eléctrica?
          </p>
        </div>
        {qr ? (
          <div className="qr-frame">
            {/* A data URL made here from our own address, not user content. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code that opens the Is it an e-bike checker" className="mx-auto w-64 max-w-full" />
          </div>
        ) : (
          <div className="qr-frame">
            <div className="h-64 w-64 max-w-full rounded-xl bg-sunk" aria-hidden="true" />
          </div>
        )}
        <div className="space-y-2">
          <p className="text-lg font-semibold">Scan to check one bike for one rider and get a plain YES or NO.</p>
          <p className="help">Class label, product link or type it in.</p>
        </div>
        <div className="space-y-2" lang="es">
          <p className="text-lg font-semibold">Escanea para revisar una bicicleta para una persona y recibir un SÍ o un NO claro.</p>
          <p className="help">Etiqueta, enlace o escribe los datos.</p>
        </div>
        <p className="url-pill">{url}</p>
        <div className="space-y-1 border-t border-line pt-4">
          <p className="meta">Free. No account. Label photos stay on your phone. General information, not legal advice.</p>
          <p className="meta" lang="es">
            Gratis. Sin cuenta. Las fotos se quedan en tu teléfono. Información general, no asesoría legal.
          </p>
        </div>
      </article>
    </div>
  );
}
