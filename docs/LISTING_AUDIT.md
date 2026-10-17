# Listing audit (Sat Oct 17, about 5 PM, 1 hour)

This audit is both evidence for the write-up and the input for the pilot's listing checks.

## Pick 20 listings

Search "e-bike for teens," "kids electric bike" and "electric dirt bike for kids" on Amazon, Walmart and a few brand sites (Super73, Hiboy, Rad, Aventon, Jetson, Gotrax, Razor). Take the top results people would actually click. Include a few pedal-less e-motos sold as kids' e-bikes.

## Write the answer key by hand, before running anything

Fill one row per listing in `pilot/listings.csv`. Do this from the listing page itself, before you run the script. That is what keeps the test honest.

| Column | What to write |
|---|---|
| `url` | The product page link |
| `product` | Brand and model |
| `has_pedals` | `yes` or `no`, from the photos |
| `states_class` | The class the listing states: `1`, `2`, `3`, or `2|3` if it says it can switch. Leave it blank if no class is stated |
| `exceeds_class` | `yes` if a stated spec rules out every e-bike class in California, for example a throttle over 20 mph, pedal assist over 28 mph, a motor over 750 W rated, or no pedals. Otherwise `no` |
| `notes` | Anything odd, like "sold as kids e-bike but has foot pegs" or "watts only as peak" |

Save a screenshot of each listing's spec section in a folder outside the repo. Store pages are copyrighted, so they don't go in the public repo.

## Run the check

```bash
npx tsx scripts/pilot-listings.ts
```

It writes `pilot/results/listings.json` and prints the three bars from `PILOT.md`. If a store blocks the fetch, the row shows `fetched: false`. Note those in `PILOT.md`, since in the app a user would paste the spec text instead.

## For the write-up

Count how many listings state a class, how many give only peak watts, how many list an age range, and how many pedal-less machines are sold as e-bikes. Those counts are your own evidence that sellers blur the line.
