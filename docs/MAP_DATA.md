# Map data

The map at `/map` shows bike racks, bike shops and repair spots, so a rider can see where to lock up an e-bike, where to buy one and where to get it fixed. The data comes from OpenStreetMap and Overture Maps, both open data. No API keys and no paid services. The page first reads saved files from this site, one per state (`public/map/states/`), so a saved area answers at once. Only a view in a state with no saved file yet asks our own server, which asks OpenStreetMap's Overpass servers and mirrors. Tiles and place search go from the browser to OpenStreetMap directly. Nothing is stored beyond a cache of map areas.

## Sources

| What | Service | When it is asked |
| --- | --- | --- |
| Map tiles | OpenStreetMap standard tiles, `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Whenever the map is drawn |
| Racks, shops, repair spots (saved) | `public/map/states/index.json`, then each state file the view touches, such as `public/map/states/CA-sd.json` | The index on the first view, each state file once per visit |
| Racks, shops, repair stations (live) | Only for a state with no saved file, or when a saved file fails to load: our route `GET /api/map?south=..&west=..&north=..&east=..`, which POSTs to the Overpass servers below | On the first view at zoom 13 or closer, on landing after a place pick or "Use my location", and when the rider taps "Search this area" or "Try again". A pan or zoom never asks on its own |
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
- **Saved data covers San Diego County only for now.** See "Saved state files" below. Every other state still uses the live route until the national read runs.
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
| `scripts/map/*.py` | The data build: `overpass_states.py`, `overture_places.py`, `build_states.py`, `states.py`, and `test_build_states.py` for the merge rules |
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

`scripts/map/build_states.py` writes one compact file per state, or per tile when a state's file would pass 3 MB, plus `index.json`. The index lists each file with its box, counts, sources and read dates, and lists every state with no file yet under `missing`.

**Which files answer a view** (`chooseAreas` in `lib/map/stateData.ts`). When the middle of the view is inside a saved area, every saved area the view touches is loaded and filtered to the view, with racks capped at 500 as before. When the middle is inside a state listed as missing, the live route answers. Off every state's box, such as out at sea, the saved areas the view touches answer, and the live route only when there are none. A file that fails to load also falls back to the live route, and is tried again on the next view.

**Format, version 1.** Coordinates have 5 decimals, about a meter.

- `r`: racks as `[lat, lon, capacity or 0, flags]`. Flags: 1 covered, 2 not covered, 4 private, no or customers only.
- `p`: places. `k` kind (`s` bike shop, `r` repair shop, `st` public repair station), `y` lat, `x` lon, `n` name, `a` short address, `p` phone, `w` website, `h` opening hours, `f` 1 when a bike shop also repairs, `c` 1 when private, `s` source (`o` OpenStreetMap, `v` Overture, `ov` both).

**Kinds.** OpenStreetMap `amenity=bicycle_parking` is a rack. `shop=bicycle` is a bike shop, and with `service:bicycle:repair=yes` it also repairs. Any other place tagged `service:bicycle:repair=yes` is a repair shop. `amenity=bicycle_repair_station` is a public repair station. Overture `bike_store` is a bike shop, and `bike_repair_maintenance` is a repair shop. The Repair chip shows repair shops, public stations and bike shops that also repair, and its count includes all three.

**Merging.** An Overture row and an OpenStreetMap shop are one shop when they are within 75 m with similar names (shared words after dropping words like bike, shop and cycles, or one name inside the other), within 150 m with the same name, within 30 m sharing any word, within 25 m when one has no name, or within 5 km with the same phone number, which catches a shop listed at an old and a new address. OpenStreetMap's point and fields come first and Overture fills the gaps. Overture rows that repeat a shop already listed are dropped, keeping the surer one.

**What is saved now (built Oct 22, 2026).**

| Area | Racks | Bike shops | Repair shops | Public stations | Shops that also repair | Size |
| --- | --- | --- | --- | --- | --- | --- |
| San Diego County (`CA-sd.json`) | 1,253 | 199 | 16 | 40 | 14 | 68 KB, 19 KB gzipped |

- OpenStreetMap alone had 68 bike shops and 40 stations in the county (`public/map/san-diego.json`, read Oct 22, 2026 through overpass.kumi.systems). That file is kept as the build's source for the county.
- Overture release `2026-10-21.0` had 238 bike places in the county box (215 `bike_store`, 23 `bike_repair_maintenance`). 17 were under 0.5 confidence and 6 were closed. Of the 215 kept, 56 matched an OpenStreetMap shop and 12 repeated another Overture row.
- Carmel Valley (32.90 to 32.98 N, 117.18 to 117.27 W) went from 2 bike shops to 4. Downtown San Diego (32.70 to 32.73 N, 117.14 to 117.17 W) went from 2 to 5.
- All 52 other areas (49 states, DC, Puerto Rico, and the rest of California) are listed as missing, so they still use the live route.

**Why only San Diego County.** On Oct 22, 2026 the build machine was on a phone hotspot. The first national Overture read used an OR of four boxes, which DuckDB cannot use to skip row groups, so it read the whole world's columns and the 3 GB cap stopped it. The fixed script uses one plain box filter per query and turns prefetching off. Measured that way, San Diego County cost 61 MB (about 40 MB of that is the 16 file footers). From the row group sizes, California would be about 230 MB and the whole US 1.3 to 1.6 GB. The same day, every Overpass server refused or timed out: overpass-api.de answered 406 to this address, and overpass.kumi.systems, overpass.private.coffee and maps.mail.ru gave 504s or no answer, so no state could be read from OpenStreetMap.

**To build the national files**, on a connection without a data cap:

```
python3 -m venv /tmp/mapdata/venv && /tmp/mapdata/venv/bin/pip install duckdb
cd scripts/map
/tmp/mapdata/venv/bin/python overture_places.py 2026-10-21.0 /tmp/mapdata/overture-us.jsonl us 2000
/tmp/mapdata/venv/bin/python overpass_states.py /tmp/mapdata/osm        # resumable, logs failures to failed.txt
/tmp/mapdata/venv/bin/python build_states.py --osm /tmp/mapdata/osm --overture /tmp/mapdata/overture-us.jsonl \
  --overture-region us --overture-release 2026-10-21.0 --seed ../../public/map/san-diego.json --out ../../public/map/states
/tmp/mapdata/venv/bin/python -m unittest test_build_states.py
```

A state whose Overpass read fails stays under `missing` and keeps the live route. If a state keeps failing, a Geofabrik state extract filtered with `osmium tags-filter` gives the same tags.
