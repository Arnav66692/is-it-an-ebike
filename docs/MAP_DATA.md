# Map data

The map at `/map` shows bike racks, bike shops and repair spots, so a rider can see where to lock up an e-bike, where to buy one and where to get it fixed. The data comes from OpenStreetMap and Overture Maps, both open data. No API keys and no paid services. The page reads saved files from this site, one per state (`public/map/states/`). Every state, DC and Puerto Rico has its racks, public repair stations, bike shops and repair shops saved, so a US view answers at once with no live call. Only when a saved file fails to load does the page ask our own server, and our server asks OpenStreetMap's Overpass servers and mirrors. Tiles and place search go from the browser to OpenStreetMap directly. Nothing is stored beyond a cache of map areas.

## Sources

| What | Service | When it is asked |
| --- | --- | --- |
| Map tiles | OpenStreetMap standard tiles, `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Whenever the map is drawn |
| Racks, repair stations, shops and repair shops in every state (saved) | `public/map/states/index.json`, then each state file the view touches, such as `public/map/states/VA.json` or `public/map/states/CA-sd.json` | The index on the first view, each state file once per visit |
| Racks, shops and repair stations (live fallback) | Everything in the view when the index or a saved file fails to load, or when the view is off every state's box. Our route `GET /api/map?south=..&west=..&north=..&east=..`, which POSTs to the Overpass servers below | On the first view at zoom 13 or closer, on landing after a place pick or "Use my location", and when the rider taps "Search this area" or "Try again". A pan or zoom never asks on its own |
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

- OpenStreetMap data is © OpenStreetMap contributors, available under the Open Database License (ODbL). This covers the tiles, the live answers and the racks, stations and OpenStreetMap shops in the saved files. The saved ones were read through the public QLever endpoint, which serves the planet file as it is.
- Overture Maps Places is published by the Overture Maps Foundation under CDLA Permissive 2.0. Rows Overture took from OpenStreetMap stay under ODbL. Overture asks for attribution to the Overture Maps Foundation, https://docs.overturemaps.org/attribution/.
- The map shows "© OpenStreetMap contributors, Overture Maps Foundation", with each name linked, in the corner of the map. `public/map/states/index.json` repeats both licenses in its `about` line.
- Tiles follow the OpenStreetMap Foundation tile usage policy. This is a light, human-driven page, which the policy allows.
- Nominatim and Overpass follow their own usage policies. Nominatim allows at most one search a second, which a submit-only box keeps well under.
- Leaflet (BSD 2-Clause) and react-leaflet (Hippocratic License 2.1) draw the map.

## Limits

- **Volunteer data.** OpenStreetMap is mapped by volunteers. Racks are often missing, and a mapped rack can be gone or private. The page says so in one line under the map.
- **Shops can be out of date.** Overture rows come from business listings and can keep a shop that moved or closed. Rows under 0.5 confidence and rows marked closed are left out, and every shop or repair shop popup says "Shop details may be outdated, so call ahead."
- **Saved racks are a snapshot.** Racks, stations and OpenStreetMap shops come from the OpenStreetMap planet file of Sep 21, 2026, read through QLever on Oct 23, 2026. San Diego County's come from an Overpass read on Oct 22, 2026. A rack mapped after that shows after the next build. The live route is only a fallback now, so a busy Overpass server matters only when a saved file fails to load. The shops-only path, with its line "Shops are on the map, but the rack data didn't load. Try again in a minute.", stays in the code for a file marked `racksSaved` false, and no file is marked that way now.
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
| `scripts/map/*.py` | The data build: `qlever_racks.py` (racks, stations and OpenStreetMap shops for every state from QLever), `overpass_states.py` (the older per-state Overpass read), `overture_places.py` (the query), `overture_states.py` (the resumable national read, one box per state), `build_states.py`, `states.py`, `test_build_states.py` for the merge rules, and `test_qlever_racks.py` for the centroid, the answer cells and one state per spot |
| `app/api/map/route.ts`, `lib/map/overpassServer.ts` | The server route, the bounds check, the mirror fallback, the cache header and the rate limit |
| `lib/map/pins.ts` | The marks as inline SVG, a square for a rack, a circle for a shop and a diamond for a repair station |
| `lib/map/mapState.ts` | The filter chips and their counts, the grid clusters, the nearest list, the picked spot and when "Search this area" shows |
| `components/BikeMap.tsx`, `components/MapView.tsx`, `components/MapParts.tsx`, `components/SpotFacts.tsx` | The page, the Leaflet map with its clusters, the chips, floating buttons, state card and list, and what one spot shows |
| `lib/i18n/map.ts` | Every line on the page in English and Spanish |
| `tests/map.test.ts` | The query, the parser, the sort, the fetch errors and the header link |
| `tests/mapState.test.ts` | The filters and chip counts, the clusters, the list and the picked spot, and "Search this area" |
| `tests/mapRoute.test.ts` | The route's bounds check, the fallback order, all-busy and rounding |
| `tests/mapStates.test.ts` | The saved file parser, the choice of files, the repair flag, the live fallback, saved racks in Arlington, downtown Austin and Manhattan with no live call, and a check of the saved data |

## Saved state files

`scripts/map/build_states.py` writes one compact file per state, or per tile when a state's file would pass 3 MB, plus `index.json`. The index lists each file with its box, counts, sources, read dates, size and `racksSaved`, which is false for a file that holds shops only. No file holds shops only since the QLever build. It lists every state with no file under `missing`, which is empty since the national build. Its `osm` entry names the OpenStreetMap source and read date, and the San Diego County seed's.

**Which files answer a view** (`chooseAreas` in `lib/map/stateData.ts`). When the middle of the view is inside a saved area, every saved area the view touches is loaded and filtered to the view, with racks capped at 500 as before. When the middle is inside a state listed as missing, the live route answers. Off every state's box, such as out at sea, the saved areas the view touches answer, and the live route only when there are none. A file that fails to load also falls back to the live route, and is tried again on the next view. When a file the view touches holds shops only and the view's middle is not in an area with saved racks, `fetchSpots` hands the saved spots to the page at once and then asks the live route for the view. From that answer it keeps only racks and public repair stations, and none inside an area whose racks are saved, since the saved files already list the shops. While the racks load the page says "Shops are on the map. Still looking for racks here."

**Format, version 1.** Coordinates have 5 decimals, about a meter.

- `r`: racks as `[lat, lon, capacity or 0, flags]`. Flags: 1 covered, 2 not covered, 4 private, no or customers only.
- `p`: places. `k` kind (`s` bike shop, `r` repair shop, `st` public repair station), `y` lat, `x` lon, `n` name, `a` short address, `p` phone, `w` website, `h` opening hours, `f` 1 when a bike shop also repairs, `c` 1 when private, `s` source (`o` OpenStreetMap, `v` Overture, `ov` both).

**Kinds.** OpenStreetMap `amenity=bicycle_parking` is a rack. `shop=bicycle` is a bike shop, and with `service:bicycle:repair=yes` it also repairs. Any other place tagged `service:bicycle:repair=yes` is a repair shop. `amenity=bicycle_repair_station` is a public repair station. Overture `bike_store` is a bike shop, and `bike_repair_maintenance` is a repair shop. The Repair chip shows repair shops, public stations and bike shops that also repair, and its count includes all three.

**Merging.** An Overture row and an OpenStreetMap shop are one shop when they are within 75 m with similar names (shared words after dropping words like bike, shop and cycles, or one name inside the other), within 150 m with the same name, within 30 m sharing any word, within 25 m when one has no name, or within 5 km with the same phone number, which catches a shop listed at an old and a new address. OpenStreetMap's point and fields come first and Overture fills the gaps. Overture rows that repeat a shop already listed are dropped, keeping the surer one. Before that, OpenStreetMap shops are folded among themselves by the same rules less the phone rule, since one shop is sometimes mapped twice, as a point and as its building, or once with a name and once without, while two branches can share a phone number. The national build folded 54 such pairs. Overture rows whose address names a country other than the US or Puerto Rico are dropped too, since the state boxes reach into Tijuana, Ciudad Juarez and Toronto.

**What is saved now (built Oct 23, 2026, OpenStreetMap planet of Sep 21, 2026 through QLever, Overture release `2026-10-21.0`, San Diego County from Overpass on Oct 22, 2026).**

| Area | Bike shops | Repair shops and stations | Racks | Files | Size | Gzipped |
| --- | --- | --- | --- | --- | --- | --- |
| All 50 states, DC and Puerto Rico | 10,736 | 5,764, of them 4,876 public stations | 122,259 | 53 | 5.26 MB, plus a 17 KB index | 1.48 MB, plus a 3 KB index |
| California (`CA.json` and `CA-sd.json`) | 1,688 | 585 | 16,323 | 2 | 741 KB | 205 KB |
| Florida (`FL.json`) | 740 | 291 | 3,548 | 1 | 228 KB | 65 KB |
| New York (`NY.json`) | 662 | 194 | 11,167 | 1 | 398 KB | 109 KB |
| Texas (`TX.json`) | 478 | 301 | 5,731 | 1 | 245 KB | 71 KB |
| Virginia (`VA.json`) | 216 | 161 | 2,343 | 1 | 107 KB | 31 KB |
| San Diego County (`CA-sd.json`) | 193 | 56, of them 40 public stations | 1,253 | 1 | 67 KB | 18 KB |

- Sizes are bytes on disk, and gzipped is `gzip -9` of each file, summed. The largest file is `CA.json` at 674 KB, 187 KB gzipped, under the 3 MB line, so no state needed tiles. The fewest racks are Puerto Rico's 37 and the fewest bike shops North Dakota's 16. `index.json` has the counts for every file.
- The views the tests check. Arlington, Virginia (38.85 to 38.91 N, 77.13 to 77.05 W) has 386 racks, 18 bike shops and 10 repair shops and stations. Downtown Austin (30.26 to 30.28 N, 97.75 to 97.73 W) has 112 racks. Midtown Manhattan (40.74 to 40.77 N, 74.00 to 73.97 W) has 707 racks, so the page shows the first 500 and says to zoom in.
- The same five city boxes as the shops-only build. New York City (40.49 to 40.92 N, 74.26 to 73.70 W) has 9,930 racks, 339 bike shops and 49 repair shops and stations. Los Angeles (33.70 to 34.34 N, 118.67 to 118.15 W) has 1,622, 268 and 62. Chicago (41.64 to 42.03 N, 87.94 to 87.52 W) has 2,722, 136 and 51. Houston (29.52 to 30.11 N, 95.79 to 95.01 W) has 1,121, 82 and 39. Phoenix (33.29 to 33.92 N, 112.32 to 111.93 W) has 593, 88 and 15.
- The Overture read asked one box per state, 52 boxes, and got 18,051 rows. The boxes overlap, so that is 13,066 different places, 11,842 `bike_store` and 1,224 `bike_repair_maintenance`. 939 were under 0.5 confidence, 304 were closed and 702 were in Mexico or Canada. 853 repeated another Overture row.
- The San Diego County file is the same, byte for byte, as in the shops-only build. Its racks, stations and OpenStreetMap shops still come from `public/map/san-diego.json`, read Oct 22, 2026 through overpass.kumi.systems, and the California file leaves its box out, so no spot is listed twice. In the shops-only build it lost 6 Overture shops in Tijuana that sat inside its box.
- Licenses are the same as above. Racks, stations and OpenStreetMap shops are OpenStreetMap under ODbL, read through QLever. The other shops are Overture Maps Places under CDLA Permissive 2.0, with ODbL for rows Overture took from OpenStreetMap.

**Data used.** The read ran on Oct 22, 2026 from 11:09 to 11:35 AM PT on a phone hotspot. The Mac received 2,605 MB during the 52 box reads, by its network counters, which also count any other traffic in those minutes. That is more than the 1.3 to 1.6 GB estimate, because the generous state boxes overlap and read some row groups twice. Every box worked on its first try.

**Racks for every state, from QLever.** `scripts/map/qlever_racks.py` reads OpenStreetMap from the public QLever SPARQL endpoint over the whole planet, `https://qlever.dev/api/osm-planet`, with no key. It sends one POST per layer with the form field `query` and `Accept: text/tab-separated-values`, and follows redirects. Each query joins a spot to the relation tagged `ISO3166-2` `US-XX` that contains it (`ogc:sfContains`), so a spot gets its state from OpenStreetMap's own boundaries and lands in exactly one state file. A check query found every rack inside the USA relation (148838, which takes in Puerto Rico) in exactly one such relation, none in two and none in none. The 5 racks in Guam and the US Minor Outlying Islands, and 2 shops in territories, are left out, since those have no file. With each spot it reads `capacity`, `covered` and `access` for racks, and the name, address, phone, website, hours and access for stations and shops. Nodes come back as `POINT(lon lat)`. Ways and relations come back as polygons or lines, so the script takes the area centroid of a polygon's outer rings, or the mean vertex of a line, since `geo:hasCentroid` does not work on this endpoint. Raw answers are cached in `/private/tmp/claude-501/mapdata/qlever/`, one `.tsv` per layer with a `.json` beside it holding the query, time and size, so a rerun works offline.

| Layer | OpenStreetMap tags | Rows | Kept | Time | Answer |
| --- | --- | --- | --- | --- | --- |
| Racks | `amenity=bicycle_parking` | 122,282 | 122,277 | 37.9 s | 12.8 MB |
| Public repair stations | `amenity=bicycle_repair_station` | 4,877 | 4,877 | 7.6 s | 0.5 MB |
| Shops | `shop=bicycle`, or any place with `service:bicycle:repair=yes` | 6,355 | 4,713, of them 4,488 bike shops | 13.8 s | 1.6 MB |

- The endpoint serves the planet file of Sep 21, 2026 (`planet-260921.osm.pbf`, from its `?cmd=stats`). The read ran on Oct 23, 2026 at 11:00 AM PT and took about a minute.
- The shop answer repeats 1,640 rows, 1,342 for shops listed once for each tag and 298 for repair stations the stations layer already holds. The script keeps each spot once. Of the 131,867 spots kept, 9,419 are ways and 102 are relations, the rest nodes.
- Two racks at the Canadian border near Blaine sit just north of 49.0 N inside Washington's boundary, so Washington's box now reaches 49.01 N. Every saved spot lies inside its file's box.
- Inside the San Diego County box the QLever read had 1,271 racks, against 1,253 in the Oct 22 Overpass read that the box keeps.

**Why not Overpass.** At 11:09 AM PT on Oct 22, 2026 the build tried Alabama, Alaska and Arizona once on each Overpass server, 20 seconds each. overpass-api.de answered 406 at once, even with a descriptive User-Agent, and overpass.kumi.systems and overpass.private.coffee timed out. Live rack views outside San Diego County then failed, and the page said "Shops are on the map, but the rack data didn't load." The QLever read on Oct 23 replaced them.

**To build the national files**, on a connection without a data cap:

```
D=/private/tmp/claude-501/mapdata
python3 -m venv $D/venv && $D/venv/bin/pip install duckdb
cd scripts/map
nohup $D/venv/bin/python overture_states.py $D/overture-us $D/overture-us.jsonl 2026-10-21.0 \
  > $D/overture.log 2>&1 &          # resumable, one file per state box, safe to run again
python3 qlever_racks.py --cache $D/qlever    # racks, stations and shops, about a minute, cached, --refresh to read again
mkdir $D/states-build
python3 build_states.py --osm $D/qlever/osm --overture $D/overture-us.jsonl \
  --overture-region us --overture-release 2026-10-21.0 --seed ../../public/map/san-diego.json --out $D/states-build
cp $D/states-build/*.json ../../public/map/states/
python3 -m unittest test_build_states.py test_qlever_racks.py
```

`build_states.py` refuses a folder that already has files, so it builds into an empty one and the files are copied over. A file from an older build that the new index no longer lists, such as a tile, has to be removed by hand. `build_states.py` also takes the per-state Overpass answers that `overpass_states.py` writes, in the same folder format. A state with no OpenStreetMap answer gets a shops-only file with live racks. If QLever is down, a Geofabrik state extract filtered with `osmium tags-filter` gives the same tags.
