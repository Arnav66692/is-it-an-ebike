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

Waiting on the Sunday bike shop photos. Method, fixed before the run: write the class printed on each label into `pilot/labels.csv` (columns `file,printed_class`, for example `shop_01.jpg,2`), keep the photos outside the repo, then run `npx tsx scripts/pilot-labels.ts <photo folder> <cache folder>`. A photo counts as right only if the classes read match exactly, and as can't confirm if no class is read. Any other class counts as wrong.

## Photo pilot v2

Committed before the v2 test run, on Sat Oct 17, 2026, in the afternoon PT. Everything above this heading is v1 and stays as it was.

### Why there is a v2

Arnav asked for one more try at whole-bike photos, by the same rules as v1. The bars are fixed first, the method is built only on photos it will not be tested on, it runs once on a held-out set, and the result is reported whatever it is.

### Data

- A separate agent built two new photo sets, with each label taken from the maker's own spec page, before any model ran on them. Sources, licenses, hashes and overlap checks are in `pilot/v2/DATA_README.txt`, `pilot/v2/train.csv` and `pilot/v2/test.csv`. No image is in this repo.
- **Dev set, 47 photos:** the 35 `train/` photos and the 12 v1 photos. 28 have pedals, 19 don't. The method was built and tuned only on these.
- **Test set, 24 held-out photos:** 12 with pedals (10 hard cases, 8 of them moto-styled) and 12 without. `pilot/v2/test.csv` was committed unchanged before any v2 method work (commit `b31d958`, sha256 `7c8919d1a5f37f235eb5077b4ae3c2a89d8fbb23bddb32da5b187560c9ed3910`).
- **What I saw of the test set before the run.** The data README names a few test products and styles in its notes, for example which test photos are real-world and that one is an electric balance bike. I did not open, view or run anything on the test images, and I did not read `test.csv`. Nothing in the method came from the test set.

### The frozen method (`pilot/v2/method.json`, sha256 `f15c2e4d80e62a7a21a182ace9a577636ca9095a535cd4aaff94c63bfa8f4f65`)

- **Model.** CLIP ViT-B/32 image encoder, `Xenova/clip-vit-base-patch32`, file `onnx/vision_model_quantized.onnx` (89.1 MB, q8), run with `@huggingface/transformers` 4.3.1 in the browser.
- **Part check, no trained weights.** The photo is cut into 12 zoomed tiles over the lower bike, a 4 by 3 grid of one-third-size crops (x starts 0, 0.22, 0.45 and 0.67, y starts 0.3, 0.5 and 0.67). For each tile, its similarity to "an electric bicycle with pedals and a chain" minus its similarity to "an electric dirt bike with foot pegs and no pedals". The photo's score is the highest tile. The two text embeddings are stored in `method.json`, so no text model is needed at run time.
- **Threshold 0.0141026.** "Pedals" if the score is above it, "no pedals" at or below it. It sits halfway between the highest dev no-pedal machine (0.013396, the Hiboy DM14 kids e-moto) and the next pedal bike above it (0.014809). The method never abstains.
- **Speed.** About 5.8 seconds per photo in the browser on this Mac (12 crops at about 0.49 s each). The app would download the 89.1 MB model once.

### How it was chosen (dev photos only)

Each idea was scored on the 47 dev photos by AUC and by the number of pedal bikes at or below the highest no-pedal machine. The second number matters most, because the bar needs every no-pedal machine caught.

| Idea | Dev AUC | Pedal bikes missed (of 28) when every no-pedal machine is caught |
|---|---|---|
| v1's two prompts on the whole photo | 0.915 | 23 |
| Part prompts on the whole photo | 0.910 | 19 |
| Part prompts, mean over larger crops | 0.945 | 10 |
| Linear probes on CLIP embeddings, trained correctly | 0.904 to 0.932 | 18 to 25 |
| Kernel ridge on CLIP embeddings | 0.915 to 0.959 | 10 to 25 |
| A learned "pedal tile" (multiple-instance) | 0.551 to 0.889 | 18 to 24 |
| Probe plus tile score | 0.964 to 0.976 | 5 to 9 |
| **Zero-shot tile score (chosen)** | **0.953** | **4** |

At the threshold, the chosen method gets 43 of 47 dev photos right: all 19 no-pedal machines, 24 of 28 pedal bikes, 18 of 22 hard cases and 9 of 11 real-world photos. The four misses are a real-world fat-tire bike and three moto-styled bikes, one with its pedals only partly visible. These dev numbers are optimistic, because the prompt pair, the tile grid and the threshold were all picked on these same photos.

Things that failed or were dropped along the way:

- **OWL-ViT**, a free part detector, would not load in the browser. Its q8 file uses a quantized Cast node the browser runtime doesn't support.
- **CLIP ViT-B/16** helped a little in early tests, but it is about four times slower per crop, and those tests used the flawed probe training below.
- **A probe plus tile candidate was discarded before any test run.** The dev pipeline check showed its probe misclassified photos it had been trained on. The cause was a gradient step about 20 times too large, so the training oscillated instead of converging. With correct training the probes scored lower, and the training-free tile score won.
- **New downloads for v2 came to 396.5 MB**, under the 400 MB cap. That's CLIP B/32 image and text (153.6 MB), OWL-ViT q8 (155.4 MB, which never ran) and CLIP B/16 image (87.5 MB). Free disk never fell below 4 GB.

My expectation before the run, so it's on record: a fail is likely. Four of 28 dev pedal bikes fall below the line, the dev margin is thin, and the test set holds 8 moto-styled pedal bikes plus a kids' balance bike.

### Bars (v1 scaled to 24 photos, no looser)

| Check | Pass bar |
|---|---|
| No-pedal machines | All 12 called "no pedals" |
| Pedal call overall | Right on at least 22 of 24 (91.7%, the same as 11 of 12) |
| Invented facts | Zero class, watt or speed values reported when no label is visible |

An abstain would count as wrong, and the method has none. Hard cases (the 10 hard pedal bikes) and real-world photos (10) are reported separately, along with the dev numbers above.

### The single run

1. Copy the 24 test photos next to `pilot/v2/run.html` and open `run.html?set=test` once in a real browser, the in-app Chromium browser, as in v1. Its raw output is committed as `pilot/v2/test-results.json`.
2. Run `npx tsx scripts/pilot-v2-ocr.ts` on the same 24 photos for the invented-facts check. Its output is committed as `pilot/v2/test-ocr.json`.
3. Score with `npx tsx scripts/pilot-v2-score.ts`, which writes `pilot/v2/results.json`.

No second test run after seeing the result.

### What happens on each outcome

- **Fail.** Whole-bike photos stay cut, and RESULTS.md says so plainly.
- **Pass.** Whole-bike photos come back as a pedals or no-pedals sorter only, never a legal verdict by itself. When the score is close to the line, the app asks "Does it have pedals?". That is product behavior and isn't counted in the bar.

### Results (single run, Sat Oct 17, 2026, in the afternoon PT)

| Check | Pass bar | Result | Pass? |
|---|---|---|---|
| No-pedal machines | All 12 called "no pedals" | 9 of 12 | **No** |
| Pedal call overall | Right on at least 22 of 24 | 18 of 24 | **No** |
| Invented facts | Zero class, watt or speed values with no label visible | 0 of 24 photos | Yes |

Reported separately: pedal bikes 9 of 12, hard cases 7 of 10, real-world photos 7 of 10, studio photos 11 of 14. The run took about 5.5 seconds per photo. Raw output is in `pilot/v2/test-results.json` (sha256 `a85120a2d14e821ac6b0e5fdecbf357c361c4002ad000cc01504aa737dfbf39b`), the OCR check is in `pilot/v2/test-ocr.json`, and the scored rows are in `pilot/v2/results.json`.

The six misses:

- Three no-pedal machines were called "pedals." The SUPER73-K1D kids' balance bike, which is styled like a Super73 e-bike, landed just over the line (0.0142 against 0.0141). The Stark VARG and Cake Kalk were both photographed indoors at a show or shop. The Cake Kalk scored very high, probably from bicycles elsewhere in the frame.
- Three pedal bikes were called "no pedals": the SUPER73-ZX in a street photo, the moto-styled Macfox X7 and the Lectric XPeak2 mountain bike.

**Decision, by the rule above: whole-bike photos stay cut.** The app keeps label photos, product links and typed input. A zero-shot model that looks at zoomed tiles still sees overall shape more than the pedal itself, and it gets confused by backgrounds in real photos. I did no second test run after seeing this result.
