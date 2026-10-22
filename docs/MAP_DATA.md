# Map data

The map at `/map` shows bike racks, bike shops and repair stations, so a rider can see where to lock up an e-bike and where to get it fixed. Everything comes from OpenStreetMap through its free public services. No API keys, no paid services and no server of our own sit in between. The browser talks to each service directly.

## Sources

| What | Service | When it is asked |
| --- | --- | --- |
| Map tiles | OpenStreetMap standard tiles, `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Whenever the map is drawn |
| Racks, shops, repair stations | Overpass API, `https://overpass-api.de/api/interpreter` (POST) | After the map rests for 0.7 seconds at zoom 13 or closer |
| Place search | Nominatim, `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=5&q=...` | Only when the rider submits the place box, never on each key |
| Rider's location | The browser's own geolocation | Only when the rider taps "Use my location" |

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
- **Busy service.** The public Overpass server is shared and is sometimes full. A 429 rate limit, a 502, 503 or 504, or no answer after 35 seconds shows "The free map data service is busy. Wait a minute, then move the map a little to try again." Any other failure shows a plain "didn't load" line. In testing on Oct 22, 2026 the server was often at capacity, so the demo may see this message.
- **Memory only.** Answers are kept in memory by rounded view for this visit, up to 40 views, so panning back doesn't ask again. Nothing is written to storage, and the rider's location and searches are never saved.
- **US only.** The place search is limited to the US, like the rest of the app. The map itself works anywhere.

## Code

| Path | What it does |
| --- | --- |
| `lib/map/osm.ts` | The Overpass query, the answer parser, the distance sort, links and the Nominatim URL |
| `lib/map/fetchSpots.ts` | The two network calls, the in-memory cache and the busy and failed errors |
| `lib/map/pins.ts` | The marks as inline SVG, a square for a rack, a circle for a shop and a diamond for a repair station |
| `components/BikeMap.tsx`, `components/MapView.tsx`, `components/SpotFacts.tsx` | The page, the Leaflet map and what one spot shows |
| `lib/i18n/map.ts` | Every line on the page in English and Spanish |
| `tests/map.test.ts` | The query, the parser, the sort, the fetch errors and the header link |
