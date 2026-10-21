// Shrinks a phone photo before it is read on the device. iPhone photos are large, and some iOS
// Safari versions can't build an ImageBitmap from every photo, so a plain image element is the
// fallback decoder. The photo never leaves the device.

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  done: () => void;
}

async function decodeWithBitmap(file: Blob): Promise<Decoded> {
  const bitmap = await createImageBitmap(file);
  return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
}

function decodeWithImage(file: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo could not be opened."));
    };
    img.src = url;
  });
}

/** The photo with its longest side at most maxSide pixels, as a new image of the given type. */
export async function shrinkPhoto(file: Blob, maxSide: number, type: "image/jpeg" | "image/png", quality?: number): Promise<Blob> {
  let decoded: Decoded;
  try {
    decoded = await decodeWithBitmap(file);
  } catch {
    decoded = await decodeWithImage(file);
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), type, quality));
  } finally {
    decoded.done();
  }
}
