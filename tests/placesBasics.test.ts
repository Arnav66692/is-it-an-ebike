// The small pieces under the place search: name keys, the San Diego lists and the Census readers.

import { describe, expect, it } from "vitest";
import { normalizeName, queryVariants } from "@/lib/places/normalize";
import { CHECKED_CITIES, NOT_COUNTY_LAND, NOT_COUNTY_LAND_SHARE, SD_COUNTY_FIPS } from "@/lib/places/sanDiego";
import { neighborhoodId, SD_NEIGHBORHOODS, SD_NEIGHBORHOODS_SOURCE } from "@/lib/places/sdNeighborhoods";
import { PLACE_IDS } from "@/lib/rules/local";
import { readAcsPopulation, readTable } from "@/scripts/places/census";

describe("normalizeName", () => {
  it("drops accents, punctuation and case", () => {
    expect(normalizeName("Rancho Peñasquitos")).toBe("rancho penasquitos");
    expect(normalizeName("Carmel-by-the-Sea")).toBe("carmel by the sea");
    expect(normalizeName("  O'Fallon ")).toBe("ofallon");
    expect(normalizeName("Sčilíp")).toBe("scilip");
  });

  it("writes Saint, Mount and Fort one way", () => {
    expect(normalizeName("St. Louis")).toBe(normalizeName("Saint Louis"));
    expect(normalizeName("Mount Helix")).toBe("mt helix");
    expect(normalizeName("Fort Worth")).toBe("ft worth");
  });

  it("keeps a slash or ampersand from joining words", () => {
    expect(normalizeName("Skyline/Paradise Hills")).toBe("skyline paradise hills");
    expect(normalizeName("Louisville/Jefferson County")).toBe("louisville jefferson county");
    expect(normalizeName("A&B")).toBe("a and b");
  });
});

describe("queryVariants", () => {
  it("is empty for blank or punctuation-only text", () => {
    expect(queryVariants("")).toEqual([]);
    expect(queryVariants(" ,. ")).toEqual([]);
  });

  it("tries a half-typed last word both ways", () => {
    expect(queryVariants("fort")).toEqual(["ft", "fort"]);
    expect(queryVariants("Fort Wo")).toEqual(["ft wo"]);
    expect(queryVariants("carmel")).toEqual(["carmel"]);
  });
});

describe("the checked San Diego cities", () => {
  it("names each city record once, all in San Diego County", () => {
    const records = CHECKED_CITIES.map((c) => c.record);
    expect(new Set(records).size).toBe(records.length);
    for (const c of CHECKED_CITIES) {
      expect(PLACE_IDS).toContain(c.record);
      expect(c.geoid).toMatch(/^06\d{5}$/);
    }
    expect(SD_COUNTY_FIPS).toBe("06073");
  });

  it("never lists the county or the campus record as a city", () => {
    const records: string[] = CHECKED_CITIES.map((c) => c.record);
    expect(records).not.toContain("unincorporated_san_diego_county");
    expect(records).not.toContain("sduhsd_campuses");
  });

  it("keeps only communities that are mostly base or reservation land off the county record", () => {
    for (const p of NOT_COUNTY_LAND) {
      expect(p.share).toBeGreaterThan(NOT_COUNTY_LAND_SHARE);
      expect(p.geoid).toMatch(/^06\d{5}$/);
    }
  });
});

describe("the City of San Diego neighborhoods", () => {
  it("lists every community planning area once, with the City's page as the source", () => {
    expect(SD_NEIGHBORHOODS).toHaveLength(51);
    const slugs = SD_NEIGHBORHOODS.map((n) => n.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(SD_NEIGHBORHOODS_SOURCE.url).toBe("https://www.sandiego.gov/planning/community-plans");
  });

  it("includes the areas families near CCA name", () => {
    const names = SD_NEIGHBORHOODS.map((n) => n.name);
    for (const name of ["Carmel Valley", "Pacific Highlands Ranch", "Torrey Pines", "La Jolla", "Del Mar Mesa", "Rancho Penasquitos"]) {
      expect(names).toContain(name);
    }
  });

  it("gives each neighborhood an id the share link can carry", () => {
    expect(neighborhoodId("carmel-valley")).toBe("n-carmel-valley");
    for (const n of SD_NEIGHBORHOODS) expect(neighborhoodId(n.slug)).toMatch(/^n-[a-z-]+$/);
  });
});

describe("the Census readers", () => {
  it("reads a pipe table with padded cells", () => {
    const rows = readTable("USPS|GEOID|NAME   \nCA|0611194|Carlsbad city   \n\n");
    expect(rows).toEqual([{ USPS: "CA", GEOID: "0611194", NAME: "Carlsbad city" }]);
  });

  it("reads a tab table and stops on a short row", () => {
    expect(readTable("A\tB\n1\t2\n")).toEqual([{ A: "1", B: "2" }]);
    expect(() => readTable("A|B\n1\n")).toThrow(/Row 2/);
  });

  it("reads ACS population by summary level, with the county parts of each place", () => {
    const acs = readAcsPopulation(
      [
        "GEO_ID|B01003_E001|B01003_M001",
        "0400000US06|39000000|-555555555",
        "0500000US06073|3300000|-555555555",
        "1600000US0611194|114373|20",
        "1550000US0611194073|114373|20",
        "0600000US3400112345|5000|100",
        "1600001US0611194|1|1",
      ].join("\n"),
    );
    expect(acs.state.get("06")).toBe(39000000);
    expect(acs.county.get("06073")).toBe(3300000);
    expect(acs.place.get("0611194")).toBe(114373);
    expect(acs.cousub.get("3400112345")).toBe(5000);
    expect(acs.placeCounty.get("0611194")).toEqual([{ county: "06073", population: 114373 }]);
  });

  it("stops on a row with no number", () => {
    expect(() => readAcsPopulation("GEO_ID|B01003_E001\n0400000US06|n/a\n")).toThrow(/Bad ACS row/);
  });
});
