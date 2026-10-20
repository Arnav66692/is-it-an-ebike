# Place search data

The "Where do they ride?" search box loads one file, `public/places/us-places.json`, the first time it is used. `lib/places/load.ts` fetches it from the app's own origin, so the page makes no outside request. Every count below is read from that file's `counts`, `states`, `aliases` and `notCountyLand` fields, build of 2026-10-20.

## What is in it

- 41,766 rows. 3,144 counties and county equivalents, 32,071 places (cities, towns, villages, boroughs and census designated places, called CDPs), and 6,551 towns and townships.
- The 51 states and DC are added in code from the file's state list, and the 51 City of San Diego community planning areas from `lib/places/sdNeighborhoods.ts`.
- Towns and townships come from the 12 states where the Census says they are general-purpose local governments: CT, ME, MA, MI, MN, NH, NJ, NY, PA, RI, VT and WI. 1,808 were left out because a place with the same name in the same county is already in the file.
- 59 places the ACS table doesn't place got their county from their Gazetteer internal point inside the 2025 county boundaries.
- 292 Puerto Rico places were left out, because the rules table has no Puerto Rico record.
- 12 consolidated city and county governments also match their city name, so "Louisville" finds Louisville/Jefferson County.

The file is about 1.26 MB. A test keeps it under 1.5 MB.

## Sources

All files are from the US Census Bureau and are public domain. They were read in place, without unzipping.

| File | Vintage | Used for |
| --- | --- | --- |
| [2026_Gaz_counties_national.zip](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_counties_national.zip) | 2026 Gazetteer Files | Counties, their names and states |
| [2026_Gaz_place_national.zip](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_place_national.zip) | 2026 Gazetteer Files | Places, their kind and internal point |
| [2026_Gaz_cousubs_national.zip](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_cousubs_national.zip) | 2026 Gazetteer Files | Towns and townships |
| [acsdt5y2024-b01003.dat](https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b01003.dat) | 2020-2024 ACS 5-year estimates, table B01003 | Population for ranking, and the counties each place lies in |
| [cb_2025_us_county_500k.zip](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip) | 2025 cartographic boundary files | The county of a place the ACS table doesn't place |
| [cb_2025_06_place_500k.zip](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_06_place_500k.zip) | 2025 cartographic boundary files | San Diego County community shapes |
| [cb_2025_us_aiannh_500k.zip](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_aiannh_500k.zip) | 2025 cartographic boundary files | Reservation land |
| [tl_2025_us_mil.zip](https://www2.census.gov/geo/tiger/TIGER2025/MIL/tl_2025_us_mil.zip) | 2025 TIGER/Line Shapefiles | Military base land |

The 12 town states are from the county subdivision entry of the [Census glossary](https://www.census.gov/programs-surveys/geography/about/glossary.html).

The City of San Diego community planning areas are from the City's [General Plan and Community Plans page](https://www.sandiego.gov/planning/community-plans), read 2026-10-20. Each one is a part of the City, so it maps to the City of San Diego record.

## How a pick maps to the rules

`lib/places/resolve.ts` maps a pick by its Census GEOID, state and county, never by name alone.

- All 18 incorporated cities in San Diego County map to their own records, each by its GEOID: San Diego, Carlsbad, Chula Vista, Coronado, Del Mar, El Cajon, Encinitas, Escondido, Imperial Beach, La Mesa, Lemon Grove, National City, Oceanside, Poway, San Marcos, Santee, Solana Beach and Vista. The 13 added on Oct 20, 2026 got their GEOIDs from the one city row in county 06073 with each name in `public/places/us-places.json`.
- A City of San Diego community planning area, like Carmel Valley or La Jolla, maps to the City of San Diego record.
- San Diego County, and every CDP wholly inside it, maps to the unincorporated San Diego County record.
- Three San Diego County CDPs are mostly base or reservation land, which county ordinances don't govern, so they get California law only. The build measured Camp Pendleton Mainside at 100 percent and Camp Pendleton South at 98 percent on Marine Corps Base Camp Pendleton, and Pala at 94.3 percent on the Pala Reservation. It samples a 120 by 120 grid of points over each CDP and stops if the list in `lib/places/sanDiego.ts` no longer matches.
- Every other place uses its state's law, and the answer says that place's own rules were not checked.

## Rebuilding

Put the eight files above in one folder, check that `df -h ~` shows at least 5 GB free first, then run:

```bash
npx tsx scripts/build-places.ts <folder> --built YYYY-MM-DD
```

The build stops when a checked city's GEOID no longer names that city in San Diego County, when the base and reservation list changes, when the Census states don't match the rules table, or when a place kind or county is one it doesn't know. Then run `npm test`.
