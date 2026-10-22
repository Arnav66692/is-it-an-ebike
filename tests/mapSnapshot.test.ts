import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSnapshot, clearSpotCache, fetchSpots, insideSnapshot, SNAPSHOT_BOUNDS } from "@/lib/map/fetchSpots";
import { countSpots, parseOverpass } from "@/lib/map/osm";

const FILE = JSON.parse(readFileSync(join(process.cwd(), "public/map/san-diego.json"), "utf8"));
const CARMEL_VALLEY = { south: 32.94, west: -117.3, north: 33.06, east: -117.2 };

describe("San Diego County map snapshot", () => {
  beforeEach(() => {
    clearSnapshot();
    clearSpotCache();
  });

  it("holds the county's racks, shops and repair stations with its source and license", () => {
    const counts = countSpots(parseOverpass(FILE));
    expect(counts.rack).toBeGreaterThan(1000);
    expect(counts.shop).toBeGreaterThan(30);
    expect(FILE.about).toContain("OpenStreetMap");
    expect(FILE.about).toContain("ODbL");
    expect(FILE.bbox).toEqual(SNAPSHOT_BOUNDS);
  });

  it("answers a San Diego view from the snapshot without asking the live service", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === "/map/san-diego.json") return new Response(JSON.stringify(FILE));
      throw new Error(`unexpected call to ${String(url)}`);
    }) as unknown as typeof fetch;
    const answer = await fetchSpots(CARMEL_VALLEY, undefined, fetcher);
    expect(answer.spots.length).toBeGreaterThan(10);
    for (const s of answer.spots) {
      expect(s.lat).toBeGreaterThanOrEqual(CARMEL_VALLEY.south);
      expect(s.lat).toBeLessThanOrEqual(CARMEL_VALLEY.north);
    }
    expect((fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls.every((c) => String(c[0]) === "/map/san-diego.json")).toBe(true);
  });

  it("asks the live route for a view outside the county", () => {
    expect(insideSnapshot({ south: 30.2, west: -97.8, north: 30.3, east: -97.7 })).toBe(false);
    expect(insideSnapshot(CARMEL_VALLEY)).toBe(true);
  });
});
