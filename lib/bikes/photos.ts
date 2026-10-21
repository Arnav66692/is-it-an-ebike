// Each catalog bike's photo, the share image on the maker's own page, read Oct 21, 2026
// (data/bikes/photos.json). The photo stays on the maker's server and loads only when opened.

import photoFile from "@/data/bikes/photos.json";

interface PhotoRecord {
  image_url: string;
  source_page: string;
}

const PHOTOS = (photoFile as { photos: Record<string, PhotoRecord> }).photos;

/** The bike's photo address, or null when there is none or it isn't https. */
export function photoFor(id: string): string | null {
  const url = PHOTOS[id]?.image_url;
  return url && url.startsWith("https://") ? url : null;
}

/** The store's name for a buy link, like "aventon.com" from https://www.aventon.com/products/... */
export function storeName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
