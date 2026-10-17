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

Not run yet.
