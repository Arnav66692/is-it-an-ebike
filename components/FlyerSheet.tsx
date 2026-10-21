// The printed part of the QR flyer, in English and Spanish. The flyer page draws it with its QR
// code, and the loading frame draws it with the code's empty square, so nothing moves when the
// page's script arrives.

interface Props {
  /** The QR code as a data URL, or empty while it is made. */
  qr: string;
  /** The app's address without https://, or empty before it is known. */
  url: string;
}

export function FlyerSheet({ qr, url }: Props) {
  return (
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
        <p className="flyer-line text-lg font-semibold">Scan to check one bike for one rider and get a plain YES or NO.</p>
        <p className="help">Class label, product link or type it in.</p>
      </div>
      <div className="space-y-2" lang="es">
        <p className="flyer-line text-lg font-semibold">Escanea para revisar una bicicleta para una persona y recibir un SÍ o un NO claro.</p>
        <p className="help">Etiqueta, enlace o escribe los datos.</p>
      </div>
      <p className="url-pill" data-empty={url === "" ? "true" : undefined}>
        {url}
      </p>
      <div className="space-y-1 border-t border-line pt-4">
        <p className="meta flyer-line">Free. No account. Label photos stay on your phone. General information, not legal advice.</p>
        <p className="meta flyer-line" lang="es">
          Gratis. Sin cuenta. Las fotos se quedan en tu teléfono. Información general, no asesoría legal.
        </p>
      </div>
    </article>
  );
}
