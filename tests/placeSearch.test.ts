// The map's place search (lib/map/fetchSpots.ts): Nominatim first, then Photon when Nominatim
// finds nothing or doesn't answer. Nominatim matches words exactly, so "scripps ranch highschool"
// found nothing on Oct 23, 2026, while Photon found Scripps Ranch High School.

import { describe, expect, it, vi } from "vitest";
import { MapFetchError, searchPlaces } from "@/lib/map/fetchSpots";
import { parsePhoton } from "@/lib/map/osm";

/** Photon's real answer for "scrips ranch high" on Oct 23, 2026, trimmed, plus a place outside the US. */
const PHOTON = {
  features: [
    { geometry: { coordinates: [2.35, 48.85] }, properties: { name: "Lycée", countrycode: "FR", osm_type: "N", osm_id: 1 } },
    {
      geometry: { coordinates: [-117.1120743, 32.9087993] },
      properties: { name: "Scripps Ranch High School", city: "San Diego", state: "California", countrycode: "US", osm_type: "W", osm_id: 2, extent: [-117.1147386, 32.91146, -117.1096016, 32.906132] },
    },
  ],
};

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("finding any place in America", () => {
  it("reads Photon's US matches with their boxes, and drops places outside the US", () => {
    expect(parsePhoton(PHOTON)).toEqual([
      { id: "photon-W2", label: "Scripps Ranch High School, San Diego, California", lat: 32.9087993, lon: -117.1120743, bounds: { west: -117.1147386, north: 32.91146, east: -117.1096016, south: 32.906132 } },
    ]);
    expect(parsePhoton({})).toEqual([]);
  });

  it("asks Photon when Nominatim finds nothing, and keeps Nominatim's answer when it has one", async () => {
    const empty = vi.fn(async (url: string | URL | Request) => (String(url).includes("photon") ? reply(200, PHOTON) : reply(200, [])));
    const found = await searchPlaces("scripps ranch highschool", "en", undefined, empty as unknown as typeof fetch);
    expect(found.map((p) => p.label)).toEqual(["Scripps Ranch High School, San Diego, California"]);
    expect(empty).toHaveBeenCalledTimes(2);

    const nominatim = [{ place_id: 9, lat: "32.9", lon: "-117.1", display_name: "Scripps Ranch High School, San Diego", boundingbox: ["32.9", "32.91", "-117.12", "-117.1"] }];
    const hit = vi.fn(async () => reply(200, nominatim));
    expect((await searchPlaces("Scripps Ranch High School", "en", undefined, hit as unknown as typeof fetch))[0].label).toBe("Scripps Ranch High School, San Diego");
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it("asks Photon when Nominatim is busy, and fails only when both do", async () => {
    const busy = vi.fn(async (url: string | URL | Request) => (String(url).includes("photon") ? reply(200, PHOTON) : reply(429, {})));
    expect(await searchPlaces("scripps ranch high", "en", undefined, busy as unknown as typeof fetch)).toHaveLength(1);
    const down = vi.fn(async () => reply(429, {}));
    await expect(searchPlaces("x", "en", undefined, down as unknown as typeof fetch)).rejects.toBeInstanceOf(MapFetchError);
  });
});
