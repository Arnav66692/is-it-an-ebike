// Loads the place index the first time the search box needs it. The file is about a megabyte, so
// the page doesn't fetch it until the family starts typing, and fetches it only once.

import { DISTRICT_INDEX_URL, withDistricts, type DistrictIndexFile } from "./districts";
import { parsePlaceIndex } from "./parse";
import type { PlaceIndex, PlaceIndexFile } from "./types";

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

/**
 * The places and every US school district in one index, for the search box. Both files load the
 * first time the box is used, from the app's own origin. A failed load is forgotten, like the
 * place index's, so the next use tries again.
 */
export function loadSearchIndex(fetcher: Fetcher = (url) => fetch(url)): Promise<PlaceIndex> {
  if (!searchLoading) {
    const districts = fetcher(DISTRICT_INDEX_URL).then((response) => {
      if (!response.ok) throw new Error(`The district file did not load (HTTP ${response.status})`);
      return response.json();
    });
    searchLoading = Promise.all([loadPlaceIndex(fetcher), districts])
      .then(([places, file]) => withDistricts(places, file as DistrictIndexFile))
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
