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
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-6 text-center">
      <div className="no-print flex justify-between text-sm">
        <Link href="/" className="underline">
          Back
        </Link>
        <button type="button" className="underline" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <h1 className="text-4xl font-extrabold">Is it an e-bike?</h1>
      <p className="text-2xl font-bold" lang="es">
        ¿Es una bicicleta eléctrica?
      </p>
      {qr ? (
        // A data URL made here from our own address, not user content.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR code that opens the Is it an e-bike checker" className="mx-auto w-72 max-w-full" />
      ) : (
        <div className="mx-auto h-72 w-72 rounded bg-sunk" aria-hidden="true" />
      )}
      <p className="text-lg">Scan to check one bike for one rider. Class label, product link or type it in.</p>
      <p className="text-lg" lang="es">
        Escanea para revisar una bicicleta para una persona. Etiqueta, enlace o escribe los datos.
      </p>
      <p className="font-mono text-lg">{url}</p>
      <p className="text-sm">
        Free. No account. Label photos stay on your phone. General information, not legal advice.
      </p>
      <p className="text-sm" lang="es">
        Gratis. Sin cuenta. Las fotos se quedan en tu teléfono. Información general, no asesoría legal.
      </p>
    </div>
  );
}
