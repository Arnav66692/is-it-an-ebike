# Place search data

The "Where do they ride?" search box loads `public/places/us-places.json` the first time it is used, with the school districts and ZIP codes described at the end of this page. `lib/places/load.ts` fetches it from the app's own origin, so the page makes no outside request. Every count below is read from that file's `counts`, `states`, `aliases` and `notCountyLand` fields, build of 2026-10-20.

## What is in it

- 41,766 rows. 3,144 counties and county equivalents, 32,071 places (cities, towns, villages, boroughs and census designated places, called CDPs), and 6,551 towns and townships.
- The 50 states and DC are added in code from the file's state list, and from `lib/places/sdNeighborhoods.ts` the 52 City of San Diego community planning areas and 71 everyday neighborhood names for parts of the City.
- San Diego County is also found by the name the answer gives its record, "Unincorporated San Diego County", in English and Spanish (`lib/places/sanDiego.ts`).
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

The City of San Diego community planning areas are from the City's [General Plan and Community Plans page](https://www.sandiego.gov/planning/community-plans), read 2026-10-20. Downtown is on that page too, with a link to its community profile. Each one is a part of the City, so it maps to the City of San Diego record. Clairemont, Golden Hill and San Pasqual, the short names the City Council district pages use, also find Clairemont Mesa, Greater Golden Hill and San Pasqual Valley.

The everyday neighborhood names are from other City of San Diego pages, read 2026-10-20: the community lists of the nine City Council district pages ([District 1](https://www.sandiego.gov/citycouncil/cd1/communities) through [District 9](https://www.sandiego.gov/citycouncil/cd9/communities)), the neighborhoods the Peninsula, Eastern Area and City Heights community plan pages name, Del Mar Heights, which the Mira Mesa community plan page says joined the City in the same 1958 annexation as Mira Mesa, and, for Del Sur and Santaluz, the communities inside Black Mountain Ranch that [Planning Commission Report PC-09-024](https://www.sandiego.gov/sites/default/files/legacy/planning-commission/pdf/pcreports/2009/09024.pdf) names. Each entry lists its page. A name is left out when it is already a planning area or one of its other names, when a San Diego County community has it, when a city, town, village, borough or township elsewhere with that name is one of the 2,500 biggest places in the index (like Middletown, Stockton or Mountain View), or when a city elsewhere in California has it (like San Carlos, Lomita or El Cerrito). A test in `tests/placesSearch.test.ts` checks every entry against those rules.

## How a pick maps to the rules

`lib/places/resolve.ts` maps a pick by its Census GEOID, state and county, never by name alone.

- All 18 incorporated cities in San Diego County map to their own records, each by its GEOID: San Diego, Carlsbad, Chula Vista, Coronado, Del Mar, El Cajon, Encinitas, Escondido, Imperial Beach, La Mesa, Lemon Grove, National City, Oceanside, Poway, San Marcos, Santee, Solana Beach and Vista. The 13 added on Oct 20, 2026 got their GEOIDs from the one city row in county 06073 with each name in `public/places/us-places.json`.
- A City of San Diego community planning area, like Carmel Valley or La Jolla, or a neighborhood name from a City page, like Hillcrest, maps to the City of San Diego record.
- San Diego County, and every CDP wholly inside it, maps to the unincorporated San Diego County record.
- Three San Diego County CDPs are mostly base or reservation land, which county ordinances don't govern, so they get California law only. The build measured Camp Pendleton Mainside at 100 percent and Camp Pendleton South at 98 percent on Marine Corps Base Camp Pendleton, and Pala at 94.3 percent on the Pala Reservation. It samples a 120 by 120 grid of points over each CDP and stops if the list in `lib/places/sanDiego.ts` no longer matches.
- Every other place uses its state's law, and the answer says that place's own rules were not checked.

## Rebuilding

Put the eight files above in one folder, check that `df -h ~` shows at least 5 GB free first, then run:

```bash
npx tsx scripts/build-places.ts <folder> --built YYYY-MM-DD
```

The build stops when a checked city's GEOID no longer names that city in San Diego County, when the base and reservation list changes, when the Census states don't match the rules table, or when a place kind or county is one it doesn't know. Then run `npm test`.

# School districts

The same search box also finds every operating public school district in the 50 states and DC. `lib/places/load.ts` fetches `public/places/us-districts.json` with the place index, the first time the box is used, from the app's own origin. `scripts/build-districts.mjs` builds it, build of 2026-10-21.

## What is in it

- 19,430 districts, every one the NCES 2025-26 directory lists as operating (open, new, added, changed boundary or reopened). The directory has 19,711 records. 268 are closed, inactive or future, and 13 are in the outlying areas, which the rules table doesn't cover.
- 174 Bureau of Indian Education schools are kept, each under the state it is in.
- Each row has the NCES ID (LEAID), name, state, county, office city and NCES type. Names and cities are as NCES publishes them, some in capitals.
- The county is where the district office was in the 2024-25 geocodes. A district can reach into other counties. It is blank for 141 districts, 133 new since those geocodes and 8 with an office in another state.
- Types 1 and 2 are regular districts. The search names every other type: supervisory union, service agency, state agency, federal agency, charter district, other education agency or specialized district.
- 124 districts share a name with another district in the same state, ignoring case, so every result shows its office city and county. Five pairs share a name, city and county too. Four of them differ in type, and both districts of every pair stay in the list. The fifth pair, the two Excel Academy Charter Districts in Irvine (0602487 and 0602500), match in type as well, so their labels add the NCES ID.
- A district's office city after a comma finds it, like "San Dieguito Union High, Encinitas".
- San Dieguito Union High is also found as "SDUHSD". A district whose name doesn't say "district" is also found with "school district" after its name.

The file is about 1.44 MB, 340 KB gzipped. A test keeps it under 1.6 MB. If it fails to load or can't be read, the search keeps working for states, counties and places, and tries the districts again the next time it loads.

## Sources

| File | Vintage | Used for |
| --- | --- | --- |
| [ccd_lea_029_2526_w_0a_050626.zip](https://nces.ed.gov/ccd/data/zip/ccd_lea_029_2526_w_0a_050626.zip) | Common Core of Data, LEA directory, school year 2025-26, preliminary version 0a, data as of May 6, 2026 | Every district, its NCES ID, name, state, office city, type and status |
| [EDGE_GEOCODE_PUBLICLEA_2425.zip](https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICLEA_2425.zip) | EDGE public school district geocodes, school year 2024-25 | The county of each district office |

Both are public domain, from the National Center for Education Statistics, read Oct 21, 2026. The 2025-26 geocode file returned 404 that day, so counties come from 2024-25. The build checks the directory's status counts against Table 1.1 of the [2025-26 preliminary release notes](https://nces.ed.gov/ccd/doc/SY_2025-26_Preliminary_Data_Release_CCD_Nonfiscal_Release_Notes.docx) and stops if they differ.

## How a district maps to the rules

`lib/places/resolve.ts` maps a district by its NCES ID only.

- San Dieguito Union High School District, LEAID 0634380, turns on the checked SDUHSD campus record. Picking it ticks the SDUHSD campus box instead of adding a chip.
- Every other district adds a chip and uses its state's law. The answer names it: "Campus rules for Poway Unified were not checked."
- A district in another state starts over in that state, like any other place, and the page says so.
- "Check this bike" in the bike finder carries every unchecked district and city in `?pick=`, so the checker names them as not checked too. Until the checker finds them in the search file, its answer says city and county rules were not checked.
- `lib/places/districts.ts` refuses a file that marks any district but SDUHSD as checked, and a test checks all 19,429 others map to no record.

## Rebuilding

Put the two files above in one folder, check that `df -h ~` shows at least 5 GB free first, then run:

```bash
node scripts/build-districts.mjs <folder> --built YYYY-MM-DD
```

The build checks every county against `public/places/us-places.json` and stops when SDUHSD is no longer LEAID 0634380 in San Diego County. Then run `npm test`.

# ZIP codes

The same search box also finds every US ZIP code in the 50 states and DC. Typing digits, like `92130` or just `921`, lists the ZIP codes that start with them. `lib/places/load.ts` fetches `public/places/us-zips.json` with the place index and the districts, the first time the box is used, from the app's own origin. `scripts/build-zips.ts` builds it, build of 2026-10-22. Every count below is read from that file's `counts`.

## What is in it

- 33,642 ZIP Code Tabulation Areas (ZCTAs), the Census areas that stand for ZIP codes. 149 in Puerto Rico and the other territories were left out, because the rules table doesn't cover them. A ZCTA is close to a ZIP code but not the same, and a ZIP used only for PO boxes or one building has no ZCTA, so it is not in the search.
- Each row has the ZIP, its counties with the most land first, and the place it maps to when there is one.
- 288 Connecticut ZIPs name only their state, since Connecticut's 2020 counties are planning regions in the place index.
- Each result reads like "92130, ZIP code, San Diego County, CA".

The file is about 620 KB, 140 KB gzipped. A test keeps it under 700 KB. If it fails to load or can't be read, the search keeps working for names, and tries the ZIP file again the next time it loads.

## Sources

| File | Vintage | Used for |
| --- | --- | --- |
| [tab20_zcta520_county20_natl.txt](https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt) | 2020 Census relationship files | The counties each ZIP lies in, by land area |
| [tab20_zcta520_place20_natl.txt](https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_place20_natl.txt) | 2020 Census relationship files | The cities, towns and CDPs each ZIP lies in, by land area, and its land in no place |

Both are from the US Census Bureau and are public domain, read Oct 22, 2026. They are not in the repo.

## How a ZIP maps to the rules

A ZIP never guesses a city. `lib/places/zips.ts` decides, and `placeHolding` there is the only way a ZIP gets a place.

- When one incorporated place or CDP holds at least 99 percent of the ZIP's land, picking the ZIP adds that place, so its checked record applies when it has one. 4,502 ZIPs map this way, 52 of them to a checked San Diego County record. 92130 maps to the City of San Diego. 5 more ZIPs had such a place in 2020 that is not in the place index, so they don't map to one.
- When the ZIP is split across places and touches San Diego County, the only county with checked records, picking it adds nothing. It lists the places it covers, each with its county and state, and "The unincorporated parts" of each county where some of its land is in no place, so the family picks the exact one. 92067 lists Rancho Santa Fe, Fairbanks Ranch, the City of San Diego and the unincorporated parts of San Diego County. 64 ZIPs work this way.
- When less than 99 percent of the ZIP's land is in one state, picking it lists its counties in each state, so the family picks the state too. 117 ZIPs work this way.
- Every other split ZIP is entirely outside San Diego County. Picking it adds the ZIP itself, which uses its state's law, and the answer says "City and county rules for ZIP code 59001 were not checked." 28,959 ZIPs work this way.
- A ZIP itself never has a checked record. A test checks every ZIP against these rules.

## Rebuilding

Put the two files above in one folder outside the repo, check that `df -h ~` shows at least 5 GB free first, then run:

```bash
npx tsx scripts/build-zips.ts <folder> --built YYYY-MM-DD
```

The build checks every county and place against `public/places/us-places.json`, so rebuild the place index first when it changes. It stops when a county is one the index doesn't list, when a split ZIP in San Diego County covers a place the index doesn't list, or when 92130 or 92067 no longer map the way this page says. Then run `npm test`.
