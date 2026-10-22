# Map data

The map at `/map` shows bike racks, bike shops and repair spots, so a rider can see where to lock up an e-bike, where to buy one and where to get it fixed. The data comes from OpenStreetMap and Overture Maps, both open data. No API keys and no paid services. The page first reads saved files from this site, one per state (`public/map/states/`). Every state, DC and Puerto Rico has saved bike shops and repair shops, so they show at once. Racks and public repair stations are saved for San Diego County only. Everywhere else the page shows the saved shops first, then asks our own server for the racks, and our server asks OpenStreetMap's Overpass servers and mirrors. Tiles and place search go from the browser to OpenStreetMap directly. Nothing is stored beyond a cache of map areas.

## Sources

| What | Service | When it is asked |
| --- | --- | --- |
| Map tiles | OpenStreetMap standard tiles, `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Whenever the map is drawn |
| Shops and repair shops in every state, racks and stations in San Diego County (saved) | `public/map/states/index.json`, then each state file the view touches, such as `public/map/states/TX.json` or `public/map/states/CA-sd.json` | The index on the first view, each state file once per visit |
| Racks and repair stations (live) | Racks and stations where the saved file holds shops only, everything in a state with no saved file, and everything when a saved file fails to load: our route `GET /api/map?south=..&west=..&north=..&east=..`, which POSTs to the Overpass servers below | On the first view at zoom 13 or closer, on landing after a place pick or "Use my location", and when the rider taps "Search this area" or "Try again". A pan or zoom never asks on its own |
| Place search | Nominatim, `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=5&q=...` | Only when the rider submits the place box, never on each key |
| Rider's location | The browser's own geolocation | Only when the rider taps "Use my location" |

## Our map route

The browser never calls Overpass itself. A busy Overpass server answers 502, 406 or nothing, and its error pages carry no CORS headers, so a browser only sees "Failed to fetch" and can't tell busy from broken. `app/api/map/route.ts` (logic in `lib/map/overpassServer.ts`) does this instead:

1. Reads `south`, `west`, `north` and `east`. The page rounds them out to two decimals, so nearby views share one URL. A value that is missing or not a number, a box outside the US (latitude 15 to 72, longitude -180 to -60), a flipped box, or a box over 0.75 degrees a side gets a 400.
2. Tries these servers in order, 12 seconds each, and moves on after a network error, any status but 200, a remark error or an answer without elements:
   1. `https://overpass-api.de/api/interpreter`
   2. `https://overpass.private.coffee/api/interpreter`
   3. `https://maps.mail.ru/osm/tools/overpass/api/interpreter`
   4. `https://overpass.kumi.systems/api/interpreter`
3. Sends `User-Agent: is-it-an-ebike map (https://is-it-an-ebike.vercel.app)` and `Accept: application/json`, as the Overpass usage policy asks.
4. On success returns `{ elements }` from Overpass with `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`, so Vercel's CDN keeps each rounded view for a day and can serve it stale for a week while it refreshes. An `x-map-source` header names the server that answered.
5. When every server fails it returns 503 `{ "error": "busy" }` with `Cache-Control: no-store`. More than 60 uncached asks from one address in 10 minutes get a 429. That limit is best effort and resets when the server restarts.

The route runs on the default Node.js runtime with a 60 second `maxDuration`. With `cacheComponents` on, Next.js does not allow a `runtime` export, so the file has none.

## The query

The Overpass query (`lib/map/osm.ts`) asks for the view on screen, rounded out to a 0.01 degree grid:

- racks, `amenity=bicycle_parking`, nodes and ways, with each way's center point, at most 500
- bike shops, `shop=bicycle`, nodes and ways, at most 100
- repair stations, `amenity=bicycle_repair_station`, at most 100

Each popup and list row shows the kind, the name if tagged, `capacity`, `covered`, and for shops `opening_hours`, `phone` (or `contact:phone`) and `website` (or `contact:website`). A rack tagged `access=private`, `no` or `customers` says to check the signs. A website is shown only when it is a plain http or https link. "Open in Maps" opens the spot on openstreetmap.org, where directions are one tap away.

## Licenses

- OpenStreetMap data is © OpenStreetMap contributors, available under the Open Database License (ODbL). This covers the tiles, the live answers and the racks, stations and OpenStreetMap shops in the saved files.
- Overture Maps Places is published by the Overture Maps Foundation under CDLA Permissive 2.0. Rows Overture took from OpenStreetMap stay under ODbL. Overture asks for attribution to the Overture Maps Foundation, https://docs.overturemaps.org/attribution/.
- The map shows "© OpenStreetMap contributors, Overture Maps Foundation", with each name linked, in the corner of the map. `public/map/states/index.json` repeats both licenses in its `about` line.
- Tiles follow the OpenStreetMap Foundation tile usage policy. This is a light, human-driven page, which the policy allows.
- Nominatim and Overpass follow their own usage policies. Nominatim allows at most one search a second, which a submit-only box keeps well under.
- Leaflet (BSD 2-Clause) and react-leaflet (Hippocratic License 2.1) draw the map.

## Limits

- **Volunteer data.** OpenStreetMap is mapped by volunteers. Racks are often missing, and a mapped rack can be gone or private. The page says so in one line under the map.
- **Shops can be out of date.** Overture rows come from business listings and can keep a shop that moved or closed. Rows under 0.5 confidence and rows marked closed are left out, and every shop or repair shop popup says "Shop details may be outdated, so call ahead."
- **Racks are saved for San Diego County only.** Every state has saved shops and repair shops from Overture, but racks and public repair stations outside San Diego County still come from the live route, so they wait on the Overpass servers and fail when those are busy. The page then keeps the shops on screen and says "Shops are on the map, but the rack data didn't load. Try again in a minute." Outside San Diego County the saved shops come from Overture alone, and live shops are not added, so a shop that only OpenStreetMap lists is missing there until that state's OpenStreetMap read is saved.
- **Zoom 13 or closer.** Wider views would make one query too big for a free shared service, so the page asks the rider to zoom in or pick a place first.
- **Caps.** Over 500 racks in view, the page shows the first 500 and says to zoom in. Shops and repair stations are capped at 100 each.
- **Busy service.** The public Overpass servers are shared and are sometimes full. When our route says busy (503), a 429 rate limit, a 502 or 504 from a gateway, or no answer after 50 seconds, the page shows "The free map data service is busy. Wait a minute, then try again." on the map with a Try again button, and keeps the last marks on screen. Any other failure shows a plain "didn't load" line. On Oct 22, 2026 the main server was often at capacity, which is why the route falls back to mirrors.
- **Cache only.** The page keeps answers in memory by rounded view for this visit, up to 40 views, so panning back doesn't ask again. Vercel's CDN keeps each rounded view's answer for a day. Nothing else is written anywhere, and the rider's location and searches are never saved. Our server sees only the box on screen, not the rider's location.
- **US only.** The place search and our map route are limited to the US, like the rest of the app. Outside the US the map still draws, but racks and shops don't load.

## Code

| Path | What it does |
| --- | --- |
| `lib/map/osm.ts` | The Overpass query, the answer parser, the distance sort, links and the Nominatim URL |
| `lib/map/stateData.ts` | The saved file format, its parser, the index parser and which files answer a view |
| `lib/map/fetchSpots.ts` | The page's network calls (saved files, our `/api/map` route and Nominatim), the in-memory caches and the busy and failed errors |
| `scripts/map/*.py` | The data build: `overpass_states.py`, `overture_places.py` (the query), `overture_states.py` (the resumable national read, one box per state), `build_states.py`, `states.py`, and `test_build_states.py` for the merge rules |
| `app/api/map/route.ts`, `lib/map/overpassServer.ts` | The server route, the bounds check, the mirror fallback, the cache header and the rate limit |
| `lib/map/pins.ts` | The marks as inline SVG, a square for a rack, a circle for a shop and a diamond for a repair station |
| `lib/map/mapState.ts` | The filter chips and their counts, the grid clusters, the nearest list, the picked spot and when "Search this area" shows |
| `components/BikeMap.tsx`, `components/MapView.tsx`, `components/MapParts.tsx`, `components/SpotFacts.tsx` | The page, the Leaflet map with its clusters, the chips, floating buttons, state card and list, and what one spot shows |
| `lib/i18n/map.ts` | Every line on the page in English and Spanish |
| `tests/map.test.ts` | The query, the parser, the sort, the fetch errors and the header link |
| `tests/mapState.test.ts` | The filters and chip counts, the clusters, the list and the picked spot, and "Search this area" |
| `tests/mapRoute.test.ts` | The route's bounds check, the fallback order, all-busy and rounding |
| `tests/mapStates.test.ts` | The saved file parser, the choice of files, the repair flag, the live fallback and a check of the saved data |

## Saved state files

`scripts/map/build_states.py` writes one compact file per state, or per tile when a state's file would pass 3 MB, plus `index.json`. The index lists each file with its box, counts, sources, read dates, size and `racksSaved`, which is false for a file that holds shops only. It lists every state with no file under `missing`, which is empty since the national build.

**Which files answer a view** (`chooseAreas` in `lib/map/stateData.ts`). When the middle of the view is inside a saved area, every saved area the view touches is loaded and filtered to the view, with racks capped at 500 as before. When the middle is inside a state listed as missing, the live route answers. Off every state's box, such as out at sea, the saved areas the view touches answer, and the live route only when there are none. A file that fails to load also falls back to the live route, and is tried again on the next view. When a file the view touches holds shops only and the view's middle is not in an area with saved racks, `fetchSpots` hands the saved spots to the page at once and then asks the live route for the view. From that answer it keeps only racks and public repair stations, and none inside an area whose racks are saved, since the saved files already list the shops. While the racks load the page says "Shops are on the map. Still looking for racks here."

**Format, version 1.** Coordinates have 5 decimals, about a meter.

- `r`: racks as `[lat, lon, capacity or 0, flags]`. Flags: 1 covered, 2 not covered, 4 private, no or customers only.
- `p`: places. `k` kind (`s` bike shop, `r` repair shop, `st` public repair station), `y` lat, `x` lon, `n` name, `a` short address, `p` phone, `w` website, `h` opening hours, `f` 1 when a bike shop also repairs, `c` 1 when private, `s` source (`o` OpenStreetMap, `v` Overture, `ov` both).

**Kinds.** OpenStreetMap `amenity=bicycle_parking` is a rack. `shop=bicycle` is a bike shop, and with `service:bicycle:repair=yes` it also repairs. Any other place tagged `service:bicycle:repair=yes` is a repair shop. `amenity=bicycle_repair_station` is a public repair station. Overture `bike_store` is a bike shop, and `bike_repair_maintenance` is a repair shop. The Repair chip shows repair shops, public stations and bike shops that also repair, and its count includes all three.

**Merging.** An Overture row and an OpenStreetMap shop are one shop when they are within 75 m with similar names (shared words after dropping words like bike, shop and cycles, or one name inside the other), within 150 m with the same name, within 30 m sharing any word, within 25 m when one has no name, or within 5 km with the same phone number, which catches a shop listed at an old and a new address. OpenStreetMap's point and fields come first and Overture fills the gaps. Overture rows that repeat a shop already listed are dropped, keeping the surer one. Overture rows whose address names a country other than the US or Puerto Rico are dropped too, since the state boxes reach into Tijuana, Ciudad Juarez and Toronto.

**What is saved now (built Oct 22, 2026, Overture release `2026-10-21.0`).**

| Area | Bike shops | Repair shops and stations | Racks | Files | Size |
| --- | --- | --- | --- | --- | --- |
| All 50 states, DC and Puerto Rico | 9,422 | 900 | 1,253, San Diego County only | 53 | 1.7 MB, plus an 18 KB index |
| California (`CA.json` and `CA-sd.json`) | 1,503 | 168 | 1,253 | 2 | 295 KB |
| Florida (`FL.json`) | 694 | 57 | live | 1 | 120 KB |
| New York (`NY.json`) | 552 | 42 | live | 1 | 93 KB |
| Texas (`TX.json`) | 439 | 47 | live | 1 | 79 KB |
| San Diego County (`CA-sd.json`) | 193 | 56, of them 40 public stations | 1,253 | 1 | 67 KB |

- The largest file is `CA.json` at 228 KB, 67 KB gzipped, so no state needed tiles. The smallest state is North Dakota with 14 bike shops. `index.json` has the counts for every file.
- Five big cities, counted in boxes set before the build. New York City (40.49 to 40.92 N, 74.26 to 73.70 W) has 272 bike shops and 24 repair shops. Los Angeles (33.70 to 34.34 N, 118.67 to 118.15 W) has 233 and 21. Chicago (41.64 to 42.03 N, 87.94 to 87.52 W) has 109 and 14. Houston (29.52 to 30.11 N, 95.79 to 95.01 W) has 78 and 11. Phoenix (33.29 to 33.92 N, 112.32 to 111.93 W) has 78 and 5.
- The Overture read asked one box per state, 52 boxes, and got 18,051 rows. The boxes overlap, so that is 13,066 different places, 11,842 `bike_store` and 1,224 `bike_repair_maintenance`. 939 were under 0.5 confidence, 304 were closed and 702 were in Mexico or Canada. 853 repeated another Overture row.
- The San Diego County file lost 6 Overture shops in Tijuana that sat inside its box. Two OpenStreetMap shops in Tecate, Mexico, also inside the box, stay but no longer get Overture's details. The rest is the same as before. Its racks, stations and OpenStreetMap shops still come from `public/map/san-diego.json`, read Oct 22, 2026 through overpass.kumi.systems.
- Licenses are the same as above. The shops are Overture Maps Places under CDLA Permissive 2.0, with ODbL for rows Overture took from OpenStreetMap, and the San Diego County racks and stations are OpenStreetMap under ODbL.

**Data used.** The read ran on Oct 22, 2026 from 11:09 to 11:35 AM PT on a phone hotspot. The Mac received 2,605 MB during the 52 box reads, by its network counters, which also count any other traffic in those minutes. That is more than the 1.3 to 1.6 GB estimate, because the generous state boxes overlap and read some row groups twice. Every box worked on its first try.

**Why racks are saved only for San Diego County.** At 11:09 AM PT on Oct 22, 2026 the build tried Alabama, Alaska and Arizona once on each Overpass server, 20 seconds each. overpass-api.de answered 406 at once, even with a descriptive User-Agent, and overpass.kumi.systems and overpass.private.coffee timed out. Since the first three states failed everywhere, no other state was tried, and no Geofabrik extract was used.

**To build the national files**, on a connection without a data cap:

```
python3 -m venv /tmp/mapdata/venv && /tmp/mapdata/venv/bin/pip install duckdb
cd scripts/map
nohup /tmp/mapdata/venv/bin/python overture_states.py /tmp/mapdata/overture-us /tmp/mapdata/overture-us.jsonl 2026-10-21.0 \
  > /tmp/mapdata/overture.log 2>&1 &          # resumable, one file per state box, safe to run again
/tmp/mapdata/venv/bin/python overpass_states.py /tmp/mapdata/osm        # resumable, logs failures to failed.txt
mkdir /tmp/mapdata/states-build
/tmp/mapdata/venv/bin/python build_states.py --osm /tmp/mapdata/osm --overture /tmp/mapdata/overture-us.jsonl \
  --overture-region us --overture-release 2026-10-21.0 --seed ../../public/map/san-diego.json --out /tmp/mapdata/states-build
cp /tmp/mapdata/states-build/*.json ../../public/map/states/
/tmp/mapdata/venv/bin/python -m unittest test_build_states.py
```

`build_states.py` refuses a folder that already has files, so it builds into an empty one and the files are copied over. A file from an older build that the new index no longer lists, such as a tile, has to be removed by hand. A state whose Overpass read fails keeps its shops-only file and live racks. If a state keeps failing, a Geofabrik state extract filtered with `osmium tags-filter` gives the same tags.
