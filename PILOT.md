# Pilot

Committed before any pilot run, on Sat Oct 17, 2026, around 12:15 AM PT. The git history is the proof that these bars came before the results. Nothing below the Results heading may change the bars.

## What changed from the research report

The report planned to test Claude Haiku 5.5 against Claude Sonnet 5.5. On Oct 16 Arnav decided not to pay for any model calls. So this pilot tests free, open-source tools that run inside the phone's browser, with no API key and no photo upload.

| Job | Tool | Version |
|---|---|---|
| Read the text on a class label photo | Tesseract OCR through tesseract.js, English LSTM model | tesseract.js 7.0.0 |
| Pull class, watts, speeds, throttle and pedals out of label text or listing text | Our own fixed-rules parser, `lib/extract/parse.ts` | this repo |
| Say whether a whole-bike photo shows pedals | CLIP ViT-B/32 zero-shot image classification through Transformers.js | `Xenova/clip-vit-base-patch32` quantized, `@huggingface/transformers` 4.3.1 |

The two CLIP labels are fixed now and will not be tuned after seeing results.

1. `a photo of an electric bicycle with pedals and a chain`
2. `a photo of an electric dirt bike or motorcycle with foot pegs and no pedals`

The call is whichever label scores higher. The parser never guesses. It only reports a class, watt or speed value when it finds that value written in the text, and it returns the exact words it matched.

## Inputs

1. **The 12 research photos.** The list, with source pages, licenses and the pedal answer key, is in `pilot/photos.csv`. The answer key comes from each product's own page (four are pedal-less e-motos: photos 02, 08, 10 and 12). The images are not in this repo, because store photos are copyrighted and the two Wikimedia Commons photos carry attribution licenses.
2. **20 listings from Arnav's listing audit** (Sat Oct 17, about 5 PM). The URLs and Arnav's hand-written answer key go into `pilot/listings.csv` before the parser runs on them.
3. **Label photos from the bike shop visit** (Sun Oct 18). Their answer key, the class printed on each label, is written down before the photos are run.

Dev data note. The parser was written and tested against the store listings behind the research photos. If any of Arnav's 20 audit listings are the same products, those results are reported separately.

## Pass bars (from the research report, unchanged)

| Input | Check | Pass bar |
|---|---|---|
| 12 research photos | Pedal-less machines | All 4 called "no pedals" |
| 12 research photos | Pedal call overall | Right on at least 11 of 12 |
| 12 research photos | Invented facts | Zero class, watt or speed values reported when no label is visible |
| 20 audit listings | False legal | Zero "legal e-bike" results for any listing whose stated specs exceed a class, such as a 28 mph throttle |
| 20 audit listings | Grounding | Every extracted value appears in the listing text |
| 20 audit listings | Usefulness | The stated class comes back for all but at most one listing that states a class, and any miss reads "can't confirm," never a wrong class |
| Label photos (Sunday) | Label reading | Class read correctly or "can't confirm" on every photo, never a wrong class |

"Legal e-bike" means the rules engine returns "yes" for an adult rider in California on the pilot date.

## What happens on a fail (from the research report)

- **Any photo check fails.** Cut whole-bike photos from the MVP. Ship label photos, product links and typed input.
- **A listing check fails.** Show the extracted facts for the user to confirm before any verdict appears. The app's "what I read" card already does this.
- **The label check fails.** Fall back to a guided form where the user types the three label facts beside a picture of where the label sits near the cranks.

## Arnav's predictions

Write these before reading any survey answers or pilot results.

- Share of e-bike and e-moto riders in the survey who cannot name their bike's class: ______ %
- How many of the 12 research photos CLIP will call right: ______ of 12

## Results

### Photo checks (run Sat Oct 17, 2026, about 12:35 AM PT)

| Check | Pass bar | Result | Pass? |
|---|---|---|---|
| Pedal-less machines | All 4 called "no pedals" | 4 of 4 | Yes |
| Pedal call overall | Right on at least 11 of 12 | 8 of 12 | **No** |
| Invented facts | Zero class, watt or speed values with no label visible | 0 of 12 photos | Yes |

CLIP called four real e-bikes pedal-less. Two are moto-styled Super73s (photos 04 and 09), one is an Aventon electric mountain bike (photo 03) and one is a moto-styled 72 V Ariel Rider (photo 11). It looks at the overall shape, so anything that looks like a motorcycle reads as "no pedals," which is exactly the case families need help with. Full scores are in `pilot/results/photos-clip.json`, and the OCR run is in `pilot/results/photos-ocr.json`.

**Decision, by the rule above: whole-bike photos are cut from the MVP.** The app ships label photos, product links and typed input. The OCR side passed, so label photos stay in, pending the Sunday label check.

How it ran. The CLIP check ran in a real browser, the way it would on a phone. The model, version and labels match this file. One fix was needed before it could load at all. The package's default CDN file is the Node build, so the page loaded the same 4.3.1 release through jsDelivr's browser build instead. No result was seen before that change.

### Listing checks

Waiting on Arnav's 20-listing audit. Method, fixed before the run:

- Arnav writes the answer key in `pilot/listings.csv` by hand from each listing page before the script runs (steps in `docs/LISTING_AUDIT.md`).
- `scripts/pilot-listings.ts` fetches each page, runs the parser, then runs the engine for an adult in California on Oct 17, 2026. It plays a trusting user: pedals answered from the key when the text doesn't say, and "no" to both fast-mode questions. So a false legal can only be avoided if the parser itself catches the spec that rules the bike out.
- False legal counts a yes for any row Arnav marked `exceeds_class = yes`. Grounding checks that every snippet is in the text and every number is in its snippet. Usefulness compares the classes read with the class Arnav wrote down.
- Listings a store blocks are reported as not fetched, outside the bars.

### Label photo check

Waiting on the Sunday bike shop photos.
