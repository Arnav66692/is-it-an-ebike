// The City of San Diego's own neighborhoods, so a family that types "Carmel Valley", "La Jolla" or
// "Hillcrest" gets the City of San Diego record. The first list is the City's community planning
// areas, each one a part of the City, exactly as the City's planning page names them. The second
// is the everyday neighborhood names the City's own pages give for parts of the City.

export const SD_NEIGHBORHOODS_SOURCE = {
  title: "General Plan and Community Plans, City of San Diego Planning Department",
  url: "https://www.sandiego.gov/planning/community-plans",
  read: "2026-10-20",
  note:
    "Each name is a community planning area the City lists on this page, with the last part of the page's own link as its id " +
    "(Downtown links to /planning/community/profiles/downtown, the others to /planning/community-plans/<id>). " +
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
  { slug: "downtown", name: "Downtown", alsoKnownAs: ["Downtown San Diego"] },
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

const COUNCIL = (district: number) => `https://www.sandiego.gov/citycouncil/cd${district}/communities`;
const PLAN = (slug: string) => `https://www.sandiego.gov/planning/community-plans/${slug}`;
/** City of San Diego Planning Commission Report PC-09-024 (2009), Black Mountain Ranch North Village. */
const BLACK_MOUNTAIN_RANCH_REPORT = "https://www.sandiego.gov/sites/default/files/legacy/planning-commission/pdf/pcreports/2009/09024.pdf";

export const SD_CITY_NEIGHBORHOODS_SOURCE = {
  title: "City Council district community pages and community plan pages, City of San Diego",
  url: "https://www.sandiego.gov/citycouncil/cd1/communities",
  read: "2026-10-20",
  note:
    "Each name is a neighborhood a City of San Diego page lists as part of the City: a City Council district's community list " +
    "(/citycouncil/cd1/communities to cd9), the neighborhoods a community plan page names, or, for Del Sur and Santaluz, the " +
    "communities Planning Commission Report PC-09-024 names inside Black Mountain Ranch. A name is left out when it is a " +
    "planning area or one of its other names above, when a San Diego County community has it, when a city, town, village, " +
    "borough or township elsewhere with that name is one of the 2,500 biggest places in the index, or when a city elsewhere " +
    "in California has it, so a family there typing their own town's name doesn't get a San Diego neighborhood first.",
} as const;

/** An everyday name for a part of the City of San Diego, and the City page that names it. */
export interface SdCityNeighborhood {
  slug: string;
  name: string;
  alsoKnownAs?: string[];
  /** The page of the City of San Diego that names it as part of the City. */
  source: string;
}

export const SD_CITY_NEIGHBORHOODS: readonly SdCityNeighborhood[] = [
  { slug: "university-city", name: "University City", source: COUNCIL(1) },
  { slug: "mission-bay", name: "Mission Bay", source: COUNCIL(2) },
  { slug: "point-loma", name: "Point Loma", source: COUNCIL(2) },
  { slug: "balboa-park", name: "Balboa Park", source: COUNCIL(3) },
  { slug: "bankers-hill-park-west", name: "Bankers Hill/Park West", alsoKnownAs: ["Bankers Hill", "Park West"], source: COUNCIL(3) },
  { slug: "hillcrest", name: "Hillcrest", source: COUNCIL(3) },
  { slug: "little-italy", name: "Little Italy", source: COUNCIL(3) },
  { slug: "mission-hills", name: "Mission Hills", source: COUNCIL(3) },
  { slug: "south-park", name: "South Park", source: COUNCIL(3) },
  { slug: "university-heights", name: "University Heights", source: COUNCIL(3) },
  { slug: "alta-vista", name: "Alta Vista", source: COUNCIL(4) },
  { slug: "broadway-heights", name: "Broadway Heights", source: COUNCIL(4) },
  { slug: "chollas-view", name: "Chollas View", source: COUNCIL(4) },
  { slug: "emerald-hills", name: "Emerald Hills", source: COUNCIL(4) },
  { slug: "jamacha", name: "Jamacha", source: COUNCIL(4) },
  { slug: "north-bay-terraces", name: "North Bay Terraces", source: COUNCIL(4) },
  { slug: "ofarrell", name: "O'Farrell", source: COUNCIL(4) },
  { slug: "ridgeview", name: "Ridgeview", source: COUNCIL(4) },
  { slug: "south-bay-terraces", name: "South Bay Terraces", source: COUNCIL(4) },
  { slug: "valencia-park", name: "Valencia Park", source: COUNCIL(4) },
  { slug: "webster", name: "Webster", source: COUNCIL(4) },
  { slug: "scripps-ranch", name: "Scripps Ranch", source: COUNCIL(6) },
  { slug: "sorrento-valley", name: "Sorrento Valley", source: COUNCIL(6) },
  { slug: "allied-gardens", name: "Allied Gardens", source: COUNCIL(7) },
  { slug: "del-cerro", name: "Del Cerro", source: COUNCIL(7) },
  { slug: "grantville", name: "Grantville", source: COUNCIL(7) },
  { slug: "egger-highlands", name: "Egger Highlands", source: COUNCIL(8) },
  { slug: "grant-hill", name: "Grant Hill", source: COUNCIL(8) },
  { slug: "logan-heights", name: "Logan Heights", source: COUNCIL(8) },
  { slug: "memorial", name: "Memorial", source: COUNCIL(8) },
  { slug: "ocean-view-hills", name: "Ocean View Hills", source: COUNCIL(8) },
  { slug: "otay-mesa-east", name: "Otay Mesa East", source: COUNCIL(8) },
  { slug: "otay-mesa-west", name: "Otay Mesa West", source: COUNCIL(8) },
  { slug: "shelltown", name: "Shelltown", source: COUNCIL(8) },
  { slug: "sherman-heights", name: "Sherman Heights", source: COUNCIL(8) },
  { slug: "southcrest", name: "Southcrest", source: COUNCIL(8) },
  { slug: "alvarado-estates", name: "Alvarado Estates", source: COUNCIL(9) },
  { slug: "college-view-estates", name: "College View Estates", source: COUNCIL(9) },
  { slug: "mission-valley-east", name: "Mission Valley East", source: COUNCIL(9) },
  { slug: "mount-hope", name: "Mt. Hope", alsoKnownAs: ["Mount Hope"], source: COUNCIL(9) },
  { slug: "redwood-village", name: "Redwood Village", source: COUNCIL(9) },
  { slug: "rolando-park", name: "Rolando Park", source: COUNCIL(9) },
  { slug: "rolando-village", name: "Rolando Village", source: COUNCIL(9) },
  { slug: "ocean-beach-highlands", name: "Ocean Beach Highlands", source: PLAN("peninsula") },
  { slug: "point-loma-highlands", name: "Point Loma Highlands", source: PLAN("peninsula") },
  { slug: "loma-alta", name: "Loma Alta", source: PLAN("peninsula") },
  { slug: "loma-palisades", name: "Loma Palisades", source: PLAN("peninsula") },
  { slug: "loma-portal", name: "Loma Portal", source: PLAN("peninsula") },
  { slug: "fleetridge", name: "Fleetridge", source: PLAN("peninsula") },
  { slug: "sunset-cliffs", name: "Sunset Cliffs", source: PLAN("peninsula") },
  { slug: "la-playa", name: "La Playa", source: PLAN("peninsula") },
  { slug: "liberty-station", name: "Liberty Station", source: PLAN("peninsula") },
  { slug: "el-cerrito-heights", name: "El Cerrito Heights", source: PLAN("eastern-area") },
  { slug: "rolando", name: "Rolando", source: PLAN("eastern-area") },
  { slug: "darnall", name: "Darnall", source: PLAN("eastern-area") },
  { slug: "azalea-park", name: "Azalea Park", source: PLAN("city-heights") },
  { slug: "bayridge", name: "Bayridge", source: PLAN("city-heights") },
  { slug: "cherokee-point", name: "Cherokee Point", source: PLAN("city-heights") },
  { slug: "chollas-creek", name: "Chollas Creek", source: PLAN("city-heights") },
  { slug: "colina-park", name: "Colina Park", source: PLAN("city-heights") },
  { slug: "fairmount-park", name: "Fairmount Park", source: PLAN("city-heights") },
  { slug: "fairmount-village", name: "Fairmount Village", source: PLAN("city-heights") },
  { slug: "fox-canyon", name: "Fox Canyon", source: PLAN("city-heights") },
  { slug: "hollywood-park", name: "Hollywood Park", source: PLAN("city-heights") },
  { slug: "islenair", name: "Islenair", source: PLAN("city-heights") },
  { slug: "swan-canyon", name: "Swan Canyon", source: PLAN("city-heights") },
  { slug: "teralta-east", name: "Teralta East", source: PLAN("city-heights") },
  { slug: "teralta-west", name: "Teralta West", source: PLAN("city-heights") },
  { slug: "del-sur", name: "Del Sur", source: BLACK_MOUNTAIN_RANCH_REPORT },
  { slug: "santaluz", name: "Santaluz", source: BLACK_MOUNTAIN_RANCH_REPORT },
];

/** The id a neighborhood has in the place search. */
export function neighborhoodId(slug: string): string {
  return `n-${slug}`;
}
