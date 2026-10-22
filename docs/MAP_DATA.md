# Map data

The map at `/map` shows bike racks, bike shops and repair stations, so a rider can see where to lock up an e-bike and where to get it fixed. Everything comes from OpenStreetMap through its free public services. No API keys and no paid services. The map asks our own server for racks and shops, and our server asks OpenStreetMap's Overpass servers and mirrors. Tiles and place search go from the browser to OpenStreetMap directly. Nothing is stored beyond a cache of map areas.

## Sources

| What | Service | When it is asked |
| --- | --- | --- |
| Map tiles | OpenStreetMap standard tiles, `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Whenever the map is drawn |
| Racks, shops, repair stations | Our route `GET /api/map?south=..&west=..&north=..&east=..`, which POSTs to the Overpass servers below | After the map rests for 0.7 seconds at zoom 13 or closer |
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

- Map data is © OpenStreetMap contributors, available under the Open Database License (ODbL). The map shows "© OpenStreetMap contributors" with a link to https://www.openstreetmap.org/copyright, as the license asks.
- Tiles follow the OpenStreetMap Foundation tile usage policy. This is a light, human-driven page, which the policy allows.
- Nominatim and Overpass follow their own usage policies. Nominatim allows at most one search a second, which a submit-only box keeps well under.
- Leaflet (BSD 2-Clause) and react-leaflet (Hippocratic License 2.1) draw the map.

## Limits

- **Volunteer data.** OpenStreetMap is mapped by volunteers. Racks are often missing, and a mapped rack can be gone or private. The page says so in one line under the map.
- **Zoom 13 or closer.** Wider views would make one query too big for a free shared service, so the page asks the rider to zoom in or pick a place first.
- **Caps.** Over 500 racks in view, the page shows the first 500 and says to zoom in. Shops and repair stations are capped at 100 each.
- **Busy service.** The public Overpass servers are shared and are sometimes full. When our route says busy (503), a 429 rate limit, a 502 or 504 from a gateway, or no answer after 50 seconds, the page shows "The free map data service is busy. Wait a minute, then move the map a little to try again." Any other failure shows a plain "didn't load" line. On Oct 22, 2026 the main server was often at capacity, which is why the route falls back to mirrors.
- **Cache only.** The page keeps answers in memory by rounded view for this visit, up to 40 views, so panning back doesn't ask again. Vercel's CDN keeps each rounded view's answer for a day. Nothing else is written anywhere, and the rider's location and searches are never saved. Our server sees only the box on screen, not the rider's location.
- **US only.** The place search and our map route are limited to the US, like the rest of the app. Outside the US the map still draws, but racks and shops don't load.

## Code

| Path | What it does |
| --- | --- |
| `lib/map/osm.ts` | The Overpass query, the answer parser, the distance sort, links and the Nominatim URL |
| `lib/map/fetchSpots.ts` | The page's two network calls (our `/api/map` route and Nominatim), the in-memory cache and the busy and failed errors |
| `app/api/map/route.ts`, `lib/map/overpassServer.ts` | The server route, the bounds check, the mirror fallback, the cache header and the rate limit |
| `lib/map/pins.ts` | The marks as inline SVG, a square for a rack, a circle for a shop and a diamond for a repair station |
| `components/BikeMap.tsx`, `components/MapView.tsx`, `components/SpotFacts.tsx` | The page, the Leaflet map and what one spot shows |
| `lib/i18n/map.ts` | Every line on the page in English and Spanish |
| `tests/map.test.ts` | The query, the parser, the sort, the fetch errors and the header link |
| `tests/mapRoute.test.ts` | The route's bounds check, the fallback order, all-busy and rounding |
