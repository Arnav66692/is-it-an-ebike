// Keeps the app's key words in one piece at the end of a line. "e-bike" and "14-year-old" have a
// hyphen a browser may break after, so a bold answer line can end on "e-" with "bike" alone below.
// On screen their hyphens become non-breaking hyphens (U+2011), which Geist draws the same as a
// hyphen. Only what is drawn changes, never the sentences the app builds.

const NB_HYPHEN = "‑";

export function keepWords(text: string): string {
  return text
    .replace(/\b([eE])-(bikes?|motos?)\b/g, `$1${NB_HYPHEN}$2`)
    .replace(/\b(\d+)-year-olds?\b/g, (m) => m.replace(/-/g, NB_HYPHEN));
}
