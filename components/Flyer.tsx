"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** Printable flyer for bike shops and school offices. The QR opens the checker in San Diego mode. */
export function Flyer() {
  const [base] = useState(() => process.env.NEXT_PUBLIC_SITE_URL || window.location.origin);
  const [qr, setQr] = useState("");
  const url = base.replace(/^https?:\/\//, "");

  useEffect(() => {
    const target = `${base}/?state=CA&place=city_of_san_diego,sduhsd_campuses`;
    QRCode.toDataURL(target, { width: 640, margin: 1, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(""));
  }, [base]);

  return (
    <div className="page">
      <div className="no-print flex items-center justify-between">
        <Link href="/" className="link-btn inline-flex items-center gap-2">
          <span aria-hidden="true">&larr;</span>
          Back
        </Link>
        <button type="button" className="btn btn-quiet" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <article className="card flyer">
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
