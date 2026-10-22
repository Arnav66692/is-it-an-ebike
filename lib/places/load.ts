// Loads the place index the first time the search box needs it. The file is about a megabyte, so
// the page doesn't fetch it until the family starts typing, and fetches it only once.

import { DISTRICT_INDEX_URL, withDistricts, type DistrictIndexFile } from "./districts";
import { parsePlaceIndex } from "./parse";
import type { PlaceIndex, PlaceIndexFile } from "./types";
import { withZips, ZIP_INDEX_URL, type ZipIndexFile } from "./zips";

/** Where the build puts the index, served from public/ on the app's own origin. */
export const PLACE_INDEX_URL = "/places/us-places.json";

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let loading: Promise<PlaceIndex> | null = null;

/**
 * The place index, fetched and parsed once. A failed load is forgotten, so the next call tries
 * again, and the page can fall back to the state picker meanwhile.
 */
export function loadPlaceIndex(fetcher: Fetcher = (url) => fetch(url)): Promise<PlaceIndex> {
  if (!loading) {
    loading = fetcher(PLACE_INDEX_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`The place index did not load (HTTP ${response.status})`);
        return response.json();
      })
      .then((file) => parsePlaceIndex(file as PlaceIndexFile))
      .catch((error: unknown) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

/** Forgets a loaded index. For tests. */
export function resetPlaceIndex(): void {
  loading = null;
}

let searchLoading: Promise<PlaceIndex> | null = null;

/** An optional file for the search. Null when it fails to load, so the search keeps working without it. */
function optional<T>(fetcher: Fetcher, url: string): Promise<T | null> {
  return fetcher(url)
    .then((response) => {
      if (!response.ok) throw new Error(`${url} did not load (HTTP ${response.status})`);
      return response.json() as Promise<T>;
    })
    .catch(() => null);
}

/** The index with one optional file added, or the index as it was when the file is missing or can't be read. */
function tryAdd<T>(index: PlaceIndex, file: T | null, add: (index: PlaceIndex, file: T) => PlaceIndex): { index: PlaceIndex; ok: boolean } {
  if (file === null) return { index, ok: false };
  try {
    return { index: add(index, file), ok: true };
  } catch {
    return { index, ok: false };
  }
}

/**
 * The places, every US school district and every US ZIP code in one index, for the search box.
 * All three files load the first time the box is used, from the app's own origin. A failed load is
 * forgotten, like the place index's, so the next use tries again. When only the district or ZIP
 * file fails, the rest still works from what loaded, and the next use tries the missing file again.
 */
export function loadSearchIndex(fetcher: Fetcher = (url) => fetch(url)): Promise<PlaceIndex> {
  if (!searchLoading) {
    const districts = optional<DistrictIndexFile>(fetcher, DISTRICT_INDEX_URL);
    const zips = optional<ZipIndexFile>(fetcher, ZIP_INDEX_URL);
    searchLoading = Promise.all([loadPlaceIndex(fetcher), districts, zips])
      .then(([places, districtFile, zipFile]) => {
        const withD = tryAdd(places, districtFile, withDistricts);
        const withZ = tryAdd(withD.index, zipFile, withZips);
        if (!withD.ok || !withZ.ok) searchLoading = null;
        return withZ.index;
      })
      .catch((error: unknown) => {
        searchLoading = null;
        throw error;
      });
  }
  return searchLoading;
}

/** Forgets the loaded search index and place index. For tests. */
export function resetSearchIndex(): void {
  searchLoading = null;
  loading = null;
}
