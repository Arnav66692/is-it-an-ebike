# Bike finder data

The bike finder at `/find` asks about the rider, where they ride, what the bike is for, the budget and colors they like, then lists the catalog bikes in the budget, best fit first. Each one gets a YES or NO from the rules engine for this rider in these places.

## The catalog

`data/bikes/catalog.json` has 29 models, 25 e-bikes and 4 pedal-less e-motos, from Aventon, Rad Power Bikes, Lectric, SUPER73, Velotric, Hiboy, GOTRAX, Ride1Up, Jetson, Specialized and Tern. Every record was read from the maker's own product page on Oct 21, 2026, Pacific time, and reopened and checked field by field by a second reader the same day. 48 fields were corrected and no model was removed. A field is null when the maker's page doesn't say it. The `derived` block in each record is our own sorting, like use tags, not a maker claim.

Prices are the maker's own prices on Oct 21, 2026, from $549 to $2,999. Several were short sales or pre-orders, and each record's price note says so. Stock and prices change.

The research could not read Trek's pages, which load their specs in the browser only, and found no readable US maker page for Sur-Ron, Talaria or Segway e-motos. They are not in the catalog.

## How a bike gets its YES or NO

`lib/bikes/facts.ts` turns a record into the facts the checker uses.

- Pedals, throttle, rated and peak watts, throttle, assist and top speeds, weight and wheel size are taken as the page states them. A wheel line that disagrees with itself is left unknown.
- The class line is read for every class it names, so "Class 1, 2, or 3" is all three.
- A bike that names more than one class is checked in every class it names, the way the checker reads a listing. A speed it can be set to, like "adjustable to 25MPH", counts as its top speed. A label that names Class 3 next to a throttle can't be confirmed in its Class 3 mode, since no page here says the throttle turns off there, so the Ride1Up Portola and the Rad Radster Trail are NO. The checker reads the same facts the same way.
- The checker's two speed questions are answered only from the maker's stated top speed. Pedal assist can't pass 28 mph when the fastest stated speed is 28 or less. The motor alone can't pass 20 mph when the bike has no throttle, or its stated throttle or top speed is 20 or less. Otherwise the question stays unanswered, and the answer is NO, the maker's page doesn't settle it.

`lib/bikes/finder.ts` runs the rules engine with those facts for the rider's age, state and checked San Diego places, on today's date, and shows the engine's bottom line. A YES says it is on the maker's specs. A pedal-less e-moto is never YES. `tests/finder.test.ts` runs every bike for every state, 15 ages and every checked San Diego place set, more than 50,000 rides, and checks that no bike is YES where the engine on the page's facts alone says it is not allowed.

"Check this bike" opens the checker with the maker's facts and source wording available for review and editing. Read facts count the same as typed facts; there is no per-fact confirmation checkbox. The link carries the rider's age and selected places, including unchecked cities and school districts.

## Ranking

Only bikes in the budget are listed. A YES for this rider in these places comes first, then the closer fit: 3 points for each use that matches, 1 for a color they like, 1 for a height in the maker's fit range, and 10 off for a height outside it or an age outside the maker's own age rule. Ties go to the lower price, then a fixed number made from the bike's id (FNV-1a), which has no order of its own. No maker's name counts for or against a bike, and a test renames every maker and checks the order stays the same. Photos are available in an optional drawer, and no link earns a fee.

## Photos and buy links

Each bike has a "See a photo" drawer. The photo is the share image on the maker's own page (its og:image tag), read Oct 21, 2026 and checked to load over https (`data/bikes/photos.json`). It stays on the maker's server, loads only when the drawer is opened, and is never copied into this repo. The buy link goes straight to the maker's page, with no affiliate code.
