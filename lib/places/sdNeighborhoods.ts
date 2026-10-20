// The City of San Diego's own neighborhoods, so a family that types "Carmel Valley" or "La Jolla"
// gets the City of San Diego record. The list is the City's community planning areas, each one
// a part of the City, exactly as the City's planning page names them.

export const SD_NEIGHBORHOODS_SOURCE = {
  title: "General Plan and Community Plans, City of San Diego Planning Department",
  url: "https://www.sandiego.gov/planning/community-plans",
  read: "2026-10-20",
  note:
    "Each name is a community planning area the City lists on this page, with the page's own link slug as its id. " +
    "A community plan covers City land only. The existing place hint for the City of San Diego (Carmel Valley, " +
    "Pacific Highlands Ranch) is on the list. Names joined by a slash or a hyphen on the page are also findable by each part.",
} as const;

export interface SdNeighborhood {
  /** The slug in the City's link, like "carmel-valley" for /planning/community-plans/carmel-valley. */
  slug: string;
  /** The name as the City's page shows it. */
  name: string;
  /** Parts of a joined name, or the short form inside the name, that people also type. */
  alsoKnownAs?: string[];
}

export const SD_NEIGHBORHOODS: readonly SdNeighborhood[] = [
  { slug: "barrio-logan", name: "Barrio Logan" },
  { slug: "black-mountain-ranch", name: "Black Mountain Ranch" },
  { slug: "carmel-mountain-ranch", name: "Carmel Mountain Ranch" },
  { slug: "carmel-valley", name: "Carmel Valley" },
  { slug: "encanto", name: "Chollas Valley/Encanto Neighborhoods", alsoKnownAs: ["Chollas Valley", "Encanto"] },
  { slug: "city-heights", name: "City Heights" },
  { slug: "clairemont-mesa", name: "Clairemont Mesa", alsoKnownAs: ["Clairemont"] },
  { slug: "college-area", name: "College Area" },
  { slug: "del-mar-mesa", name: "Del Mar Mesa" },
  { slug: "east-elliott", name: "East Elliott" },
  { slug: "eastern-area", name: "Eastern Area" },
  { slug: "fairbanks-ranch-country-club", name: "Fairbanks Ranch Country Club" },
  { slug: "greater-golden-hill", name: "Greater Golden Hill", alsoKnownAs: ["Golden Hill"] },
  { slug: "kearny-mesa", name: "Kearny Mesa" },
  { slug: "kensington-talmadge", name: "Kensington-Talmadge", alsoKnownAs: ["Kensington", "Talmadge"] },
  { slug: "la-jolla", name: "La Jolla" },
  { slug: "linda-vista", name: "Linda Vista" },
  { slug: "midway-pacific-highway", name: "Midway-Pacific Highway", alsoKnownAs: ["Midway"] },
  { slug: "miramar-ranch-north", name: "Miramar Ranch North" },
  { slug: "mira-mesa", name: "Mira Mesa" },
  { slug: "mission-beach", name: "Mission Beach" },
  { slug: "mission-valley", name: "Mission Valley" },
  { slug: "navajo", name: "Navajo" },
  { slug: "normal-heights", name: "Normal Heights" },
  { slug: "north-city-future-urbanizing-area", name: "North City Future Urbanizing Area (NCFUA)", alsoKnownAs: ["North City Future Urbanizing Area", "NCFUA"] },
  { slug: "north-park", name: "North Park" },
  { slug: "ocean-beach", name: "Ocean Beach" },
  { slug: "old-town", name: "Old Town San Diego", alsoKnownAs: ["Old Town"] },
  { slug: "otay-mesa", name: "Otay Mesa" },
  { slug: "otay-mesa-nestor", name: "Otay Mesa-Nestor", alsoKnownAs: ["Nestor"] },
  { slug: "pacific-beach", name: "Pacific Beach" },
  { slug: "pacific-highlands-ranch", name: "Pacific Highlands Ranch" },
  { slug: "peninsula", name: "Peninsula" },
  { slug: "rancho-bernardo", name: "Rancho Bernardo" },
  { slug: "rancho-encantada", name: "Rancho Encantada" },
  { slug: "rancho-penasquitos", name: "Rancho Penasquitos" },
  { slug: "sabre-springs", name: "Sabre Springs" },
  { slug: "san-pasqual-valley", name: "San Pasqual Valley" },
  { slug: "san-ysidro", name: "San Ysidro" },
  { slug: "scripps-miramar-ranch", name: "Scripps Miramar Ranch" },
  { slug: "serra-mesa", name: "Serra Mesa" },
  { slug: "skyline-paradise-hills", name: "Skyline/Paradise Hills", alsoKnownAs: ["Skyline", "Paradise Hills"] },
  { slug: "southeastern-san-diego", name: "Southeastern San Diego" },
  { slug: "tierrasanta", name: "Tierrasanta" },
  { slug: "tijuana-river-valley", name: "Tijuana River Valley" },
  { slug: "torrey-highlands", name: "Torrey Highlands" },
  { slug: "torrey-hills", name: "Torrey Hills" },
  { slug: "torrey-pines", name: "Torrey Pines" },
  { slug: "university", name: "University" },
  { slug: "uptown", name: "Uptown" },
  { slug: "via-de-la-valle", name: "Via de la Valle" },
];

/** The id a neighborhood has in the place search. */
export function neighborhoodId(slug: string): string {
  return `n-${slug}`;
}
