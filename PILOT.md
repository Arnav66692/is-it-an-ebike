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

## Photo pilot v3: speed check

Committed before any timing, on Sat Oct 17, 2026, PT. This is step 1 of v3 only. Arnav approved v3 with OWLv2 on one condition: it has to run fast enough on the Mac.

- **Model.** `Xenova/owlv2-base-patch16-ensemble`, file `onnx/model_quantized.onnx` (155,312,754 bytes), with the same `@huggingface/transformers` 4.3.1 jsDelivr browser build as v2, through the zero-shot-object-detection pipeline.
- **Queries.** "bicycle pedal", "pedal crank arm", "bicycle chain" and "motorcycle foot peg".
- **Backend: WebGPU.** The in-app Chromium (Chrome 152) on this Mac exposes `navigator.gpu` and returns an Apple Metal 3 adapter with shader-f16 support, checked before any model was loaded. So WebGPU is the backend the v3 pilot will use.
- **Timing.** The mean per-photo inference time over three dev photos, `train_01`, `train_02` and `train_03` from `photo-pilot-v2/train/`, measured after one warm-up run on `train_01`. The one-time download and model load are timed separately and don't count.
- **Stop rule.** If the WebGPU mean is over 15 seconds per photo, v3 stops.
- **Phone worst case.** If WASM also runs, its time is recorded as a phone worst case, outside the stop rule.

### Result (Sat Oct 17, 2026, about 11:08 AM PT)

**The approved file doesn't load, so nothing could be timed.**

- **WebGPU.** Session creation failed with "Provider type for Cast node with name '/class_head/Cast' is not set." This attempt also did the one-time download (155,312,754 bytes, now cached in the browser). It failed about 40 seconds after it started.
- **WASM.** With the model cached, session creation failed after about 2 seconds with "Could not find an implementation for Cast(13) node with name '/class_head/Cast'." That's the same node that stopped OWL-ViT in v2.
- **Per-photo time.** None. No warm-up or timed run happened on either backend, so the 15-second rule could not be checked.
- **Raw records.** `pilot/v3/speed-webgpu.json` and `pilot/v3/speed-wasm.json`. The timing page is `pilot/v3/owl-speed.html`.

**Decision.** v3 can't go ahead with this file. The quantized class head uses a Cast step the browser runtime can't run on either backend. Other files exist for the same model: fp16 307.9 MB, q4f16 128.4 MB, q4 194.0 MB, bnb4 186.2 MB and uint8 163.2 MB. Each would be a new download and a new speed check, so none was tried without Arnav's OK.

### Retry with other files (Arnav approved: q4f16 first, fp16 only if q4f16 fails to load, then stop)

- **Attempt A, committed before it ran.** File `onnx/model_q4f16.onnx` from `Xenova/owlv2-base-patch16-ensemble` (128,434,817 bytes), dtype q4f16, backend WebGPU. The timing method and the stop rule are the same as above: the mean over `train_01` to `train_03` after one warm-up on `train_01`, with download and load not counted, and v3 stops if the mean is over 15 seconds. If it loads and the mean is over 15 seconds, v3 stops and fp16 is not tried.
- **Attempt A result.** It failed to load on WebGPU with the same error as q8: "Provider type for Cast node with name '/class_head/Cast' is not set." This attempt did the one-time download (128,434,817 bytes). No per-photo time exists. Raw record: `pilot/v3/speed-q4f16-webgpu.json`.
- **Attempt B, committed before it ran.** File `onnx/model_fp16.onnx` from `Xenova/owlv2-base-patch16-ensemble` (307,904,711 bytes), dtype fp16, backend WebGPU. The timing method and the 15-second stop rule are the same as above. If it also fails to load, v3 stops.
- **Attempt B result.** It failed to load on WebGPU, at a different node: "Provider type for Where node with name '/class_head/Where' is not set." This attempt did the one-time download. No per-photo time exists. Raw record: `pilot/v3/speed-fp16-webgpu.json`. Under the rule above, v3 stopped here.
- **Arnav said "Try again" after he saw this error, so the speed check continues.** No tuning and no test-set work.
- **Attempt B retry, committed before it ran.** The same file, dtype, backend, library and settings, run once more from the browser cache. The q8 WASM record already shows a missing kernel ("Could not find an implementation for Cast(13) node with name '/class_head/Cast'"), so the same error is expected. Raw record: `pilot/v3/speed-fp16-webgpu-retry.json`.
- **Attempt B retry result.** The same error, loaded from the browser cache. Raw record: `pilot/v3/speed-fp16-webgpu-retry.json`.
- **Why it fails.** The onnxruntime-web build that transformers.js 4.3.1 pins (1.31.0-dev.20260914-8d85527a0) has no CPU kernel for these class_head nodes, as the q8 WASM error shows, and WebGPU doesn't take them either. So the next tries change only the library version. The two files, the backend, the timing method and the 15-second stop rule stay the same. Both files are already in the browser cache, so there are no new model downloads. The page now records the exact onnxruntime-web files it fetched (`pilot/v3/owl-speed.html`).
- **Attempts C and D, committed before any of them ran.** Each one runs only if every earlier one failed to load.
  1. C1 is `onnx/model_q4f16.onnx` (128,434,817 bytes), dtype q4f16, backend WebGPU, with transformers.js 4.2.0 (onnxruntime-web 1.26.0-dev.20260416-b7804b056c).
  2. C2 is `onnx/model_fp16.onnx` (307,904,711 bytes), dtype fp16, backend WebGPU, with transformers.js 4.2.0.
  3. D1 is `onnx/model_q4f16.onnx`, dtype q4f16, backend WebGPU, with transformers.js 3.8.1 (onnxruntime-web 1.22.0-dev.20250409-89f8206ba4).
  4. D2 is `onnx/model_fp16.onnx`, dtype fp16, backend WebGPU, with transformers.js 3.8.1.

  The first one that loads is timed, and it is the only one timed. If its mean is over 15 seconds, v3 stops and nothing else is tried. If all four fail to load, v3 stops. If one loads, WASM runs once with the same library and file as the phone worst case, outside the stop rule.

- **C1 result.** Failed to load, with the same Cast error under onnxruntime-web 1.26.0-dev. Raw record: `pilot/v3/speed-q4f16-webgpu-tjs4.2.0.json`.
- **C2 result.** Failed to load, with the same Where error. Raw record: `pilot/v3/speed-fp16-webgpu-tjs4.2.0.json`.
- **D1 result.** Failed to load. onnxruntime threw a bare number (267935216) about 2 seconds in, before the load finished, so there is no error message. Raw record: `pilot/v3/speed-q4f16-webgpu-tjs3.8.1.json`.
- **D2 result, the one timed run.** It loaded on WebGPU from the browser cache in 6,427 ms. The warm-up on `train_01` took 13,536 ms. The three timed photos took 5,531, 5,617 and 5,953 ms, a mean of 5,700 ms. That is under 15 seconds, so the stop rule did not trip. Raw record: `pilot/v3/speed-fp16-webgpu-tjs3.8.1.json`.
- **D2's scores look broken.** Every top score on all three photos is 1.0 or 0.99999994, for all four queries, including "motorcycle foot peg." The same file on WASM gave ordinary scores between 0.13 and 0.43. So fp16 on WebGPU in this runtime most likely overflows somewhere. D2 measures the speed, but its scores can't be used as they are. A fix would need another file or runtime, which is outside what Arnav approved. Nothing was tuned.
- **D2 timing conditions.** The Browser pane was hidden, so the page ran as a background tab. That can slow a page down but not speed it up, so 5.7 seconds is at worst too high. The record's start and finish clock times are 17 minutes apart while its timed steps add up to about 37 seconds. The cause of that gap is unknown.
- **Disk.** Free disk fell from 3.6 GB to 258 MB during attempts C and D, below the 2 GB floor, so I stopped the first WASM try right after it started. The likely cause is swap, which shares the disk and was at about 20 GB. After I closed old pilot tabs, free disk came back to 20 GB, most likely from macOS clearing purgeable space, and WASM then ran once.
- **WASM result, the phone worst case, outside the stop rule.** The same file and library, on one thread because the page isn't cross-origin isolated. It loaded from the cache in 6,065 ms. The warm-up took 97,373 ms. The three photos took 68,542, 68,410 and 68,295 ms, a mean of 68,416 ms. Its clock times match its timed steps. Raw record: `pilot/v3/speed-fp16-wasm-tjs3.8.1.json`.
- **Where the speed check ends.** The stop rule did not trip. OWLv2 fp16 takes about 5.7 seconds a photo on this Mac's WebGPU and about 68 seconds on one CPU thread. But the WebGPU scores are saturated, so the method can't be tuned on this setup as it is. Nothing past the speed check was done, so there is no third test set and no tuning on the dev photos.
- **Arnav said "Try again" a second time, after the saturated D2 scores.** So there is one more try, aimed at scores that aren't saturated, with no new download. No tuning and no test-set work.
- **Attempt E, committed before it ran.** File `onnx/model_quantized.onnx` from the same repo (155,312,754 bytes, the q8 file Arnav first approved for v3, already in the browser cache), dtype q8, backend WebGPU, with transformers.js 3.8.1. q8 keeps fp32 activations, so it shouldn't overflow the way fp16 did. The timing method and the 15-second stop rule are the same as above. Its scores count as saturated if any top score is 0.999 or higher, which is how D2 failed. If it loads with unsaturated scores and a mean of 15 seconds or less, the speed check passes with this file. If it fails to load, or its mean is over 15 seconds, or its scores are saturated, it fails, and any next try needs a new file, which needs Arnav's OK first. If it loads on WebGPU, WASM runs once with the same file and library as the phone worst case, outside the stop rule.
- **Attempt E result.** It loaded on WebGPU from the browser cache in 5,594 ms. The warm-up took 40,999 ms. The three photos took 40,261, 41,535 and 37,712 ms, a mean of 39,836 ms. That is over 15 seconds, so E fails the stop rule. Its scores are also broken, in a way the saturation check didn't cover. Every top score is exactly 0.5, which is a raw logit of zero, with 9,564 detections on each photo. Raw record: `pilot/v3/speed-q8-webgpu-tjs3.8.1.json`.
- **Attempt E WASM, the phone worst case, outside the stop rule.** The same file and library on one thread. It loaded in 1,961 ms. The warm-up took 75,859 ms. The three photos took 75,628, 73,092 and 73,252 ms, a mean of 73,991 ms. Its scores look ordinary, between 0.12 and 0.40. Raw record: `pilot/v3/speed-q8-wasm-tjs3.8.1.json`.
- **What the runs show together.** On WASM both files give ordinary scores, at about 68 to 74 seconds a photo on one thread of this Mac. On WebGPU both files give broken scores, all 1.0 for fp16 and all 0.5 for q8. The one fast run, fp16 on WebGPU at 5.7 seconds, is one of the broken ones. So no setup so far is both fast enough and correct.
- **The one option left.** `onnx/model_q4.onnx` (193,982,426 bytes) keeps fp32 activations and uses 4-bit weights that WebGPU runs directly, so it could avoid both failures. It is a new download and needs Arnav's OK. Without it, v3 stops here.
- **Attempt F, from the coordinating session, committed before it ran.** After D2, Arnav told the coordinating session to "keep on working it." That session named this attempt E, but E is already used above, so it is F here. It needs no new download. File `onnx/model_quantized.onnx` (155,312,754 bytes, q8, in the browser cache), transformers.js 3.8.1 with its pinned onnxruntime-web, backend WASM with `numThreads` set to `navigator.hardwareConcurrency`. The page is served cross-origin isolated (COOP same-origin, COEP credentialless, `pilot/v3/coi_server.py`) so WASM threads can run, and the record must show `cross_origin_isolated` true and the thread count. The timing method and the 15-second stop rule are the same as above. The scores are unusable if every top score on every timed photo is 0.999 or higher, as in D2, or exactly 0.5, as in E. If F loads, takes 15 seconds or less and has usable scores, the speed check passes. If it loads but takes over 15 seconds, or its scores are unusable, v3 stops. If the threads don't start (isolation false or a worker error), that is a setup fault, not a load failure. It gets fixed once and rerun, and it doesn't trigger F2.
- **Attempt F2, committed with F.** The same setup with `onnx/model_fp16.onnx` (307,904,711 bytes). It runs only if F fails to load. If both fail to load, v3 stops.
- **Conditions before F.** This Mac is an Apple M4 with 10 cores, 4 performance and 6 efficiency. Other apps were busy, with a load average of about 6 to 10, and they compete with WASM threads. The Browser pane is hidden because this session isn't open in a window, so the page runs as a background tab. Free disk was 16 GB and swap was 19.1 GB.
- **Attempt F result.** It loaded with `cross_origin_isolated` true and 10 threads (`navigator.hardwareConcurrency` is 10). Browser cache is kept per origin, and the isolated page ran on a new port, so it downloaded the same q8 file again (155,312,754 bytes). The plan line above that says no new download was wrong. The load took 106,484 ms, including that download, and isn't counted. The warm-up took 25,804 ms. The three photos took 27,130, 25,483 and 31,718 ms, a mean of 28,110 ms. That is over 15 seconds, so F fails the stop rule. Its scores are usable and match the one-thread q8 run to four decimals. Raw record: `pilot/v3/speed-q8-wasm-tjs3.8.1-mt.json`.
- **F conditions.** The page used about 3.8 cores' worth of CPU while the load average was about 26, from other apps plus the 10 WASM threads. The Browser pane was hidden. Both can only slow a run, so a quieter Mac might do better, but the committed rule decides. Threads cut the q8 time from 73,991 ms to 28,110 ms.
- **F2 did not run**, because F loaded.
- **v3 stops here, under the committed rule.** No tuning and no test-set work was done. The only untried option is still `onnx/model_q4.onnx` on WebGPU. Trying it would mean Arnav reopens v3 and approves that download.
- **Arnav reopened v3 for one try, in his words.** "Reopen v3 for one try. Download model_q4.onnx (194 MB), run it once on WebGPU with transformers.js 3.8.1, same 15 second rule and score checks. If it fails, v3 stays stopped."
- **Attempt G, committed before it ran.** File `onnx/model_q4.onnx` from `Xenova/owlv2-base-patch16-ensemble` (193,982,426 bytes, a new download), dtype q4, backend WebGPU, with transformers.js 3.8.1 (onnxruntime-web 1.22.0-dev.20250409-89f8206ba4). q4 keeps fp32 activations with 4-bit weights. The timing method and the 15-second stop rule are the same as above. The scores are unusable if every top score on every timed photo is 0.999 or higher, as in D2, or exactly 0.5, as in E. If G loads, takes 15 seconds or less and has usable scores, the speed check passes. If it fails to load, takes over 15 seconds or has unusable scores, v3 stays stopped. It runs once, on WebGPU only. Its scores will be shown next to the WASM q8 and fp16 scores on the same photos, for information only.
- **Conditions before G.** Free disk was 13 GB and swap was 21.3 GB. Other apps were busy, with a load average of about 24 before the run. The Browser pane is hidden, so the page runs as a background tab.
- **Attempt G result.** It downloaded the file (193,982,426 bytes) and loaded on WebGPU in 24,369 ms, including the download, which isn't counted. The warm-up took 11,876 ms. The three photos took 9,750, 9,823 and 9,544 ms, a mean of 9,706 ms. That is under 15 seconds. The scores pass both checks, since they are neither all 0.999 or higher nor all exactly 0.5. So the speed check passes with q4 on WebGPU. Raw record: `pilot/v3/speed-q4-webgpu-tjs3.8.1.json`.
- **G's scores next to WASM, for information only.** q4 on WebGPU found fewer boxes above the pipeline's default 0.1 threshold, 5, 10 and 0 on the three photos, against 51, 51 and 23 for q8 on WASM and 28, 43 and 11 for fp16 on WASM. Its top scores that clear 0.1 are in the same range as the WASM runs, 0.14 to 0.19. A 0 in the record means nothing cleared 0.1. So q4 runs fast and isn't broken, but it may carry less signal than the bigger files. The tuning step will show whether it can sort pedals from no pedals.
- **G conditions.** The load average was about 24 from other apps, and the Browser pane was hidden. Free disk fell to 9.2 GB during the run, with swap at about 23 GB.
- **Where v3 stands.** The speed check passes with `onnx/model_q4.onnx` on WebGPU and transformers.js 3.8.1. Nothing past the speed check was done, so there is no third test set and no tuning yet.

### v3 step 2, tuning on the 71 dev photos (Oct 17, evening PT)

- **What ran.** OWLv2 `onnx/model_q4.onnx` on WebGPU with transformers.js 3.8.1, once over all 71 dev photos, with 20 queries. The dev photos are the 12 v1 photos, the 35 v2 train photos and the 24 spent v2 test photos. The page hashed the cached model file and got `8a2995ee3f01c053a8d7e99d109848622004df5c51ffb8d5718f93921cdb7445`, the published hash. It saved each query's best score over all 3,600 boxes, so there is no detection threshold to tune. Tuning ran offline on those scores (`pilot/v3/tune_v3.py`). The v3 test folder was never opened.
- **The run stopped once,** when the Claude app restarted at 23 photos. It resumed from the saved scores in a fresh page. Scores don't depend on the page, so nothing was rerun. Raw scores: `pilot/v3/dev-raw-v3.json`. Labels and hashes: `pilot/v3/dev-labels.json`.
- **Rule family, 1,140 rules.** A pedal-part score (the best logit over pedal, crank or chain queries) minus a foot-peg score, in three forms, with an optional bicycle minus motorcycle term. The first 170 rules were fixed before any scores existed. The rest were added after a dry run on 44 photos, and the nested leave-one-out below covers that. The threshold sits halfway between the highest no-pedal score and the next pedal score above it.
- **Chosen rule.** The best logit for "chain", plus the best logit for "bicycle" or "electric bicycle", minus the best logit for "motorcycle" or "dirt bike". It calls pedals at -0.105 or above. Leave-one-out picked this same rule 69 times out of 71.
- **Dev results in sample.** 66 of 71 right (93.0%). No-pedal machines 31 of 31. Pedal bikes 35 of 40. Hard pedal cases (v2 photos) 22 of 27. Real-world photos (v2) 14 of 19. The spent v2 test photos 21 of 24.
- **Dev results, nested leave-one-out.** 63 of 71 right (88.7%). No-pedal machines 29 of 31. Pedal bikes 34 of 40. Hard pedal cases 21 of 27. Real-world photos 14 of 19. The spent v2 test photos 19 of 24. Full output: `pilot/v3/dev-tune-v3.json`.
- **Why the in-sample pass is thin.** The two highest no-pedal machines (79Bike Lynx and Razor MX125 Dirt Rocket) sit only 0.019 and 0.024 logit units below the threshold, and four sit within 0.18 of it. All 5 pedal misses are real-world photos of moto-styled or fat-tire bikes, so real-world pedal bikes were right only 5 of 10.
- **Time.** 9,388 ms a photo on average for photos up to 1,024 px, and 10,077 ms over all 71, with 20 queries. The chosen rule needs only 5 queries, so it is no slower. The first page slowed to about 20 seconds a photo before the restart, and the fresh page was back near 10 seconds.
- **Verdict.** In sample, dev just clears the stop check (no no-pedal miss, 93.0% right). Every honest view falls short. Leave-one-out misses 2 no-pedal machines and gets 88.7%, and the spent v2 test photos score 21 and 19 of 24 against a bar of 22. So the preregistration was not written, and the held-out set stays unspent. My recommendation is to stop v3 here.

## Photo pilot v3 preregistration

Committed before the v3 test run, on Sat Oct 17, 2026, in the evening PT. After the dev results above, Arnav chose to go ahead, in his words: "Write the v3 preregistration with the chosen rule and the same bars, commit it, and wait for the test set hash and the go."

### Data

- **Dev set, 71 photos:** the 12 v1 photos, the 35 v2 train photos and the 24 spent v2 test photos. 40 have pedals and 31 don't. The method was built and tuned only on these.
- **Test set, 24 held-out photos,** built by the coordinating session in `photo-pilot-v3/`. I have not opened, listed, viewed or run anything in that folder. At the go, its `test.csv` is checked against the hash the coordinating session sends and committed unchanged as `pilot/v3/test.csv` before the run.

### The frozen method (`pilot/v3/method.json`, sha256 `ac6711ba7c42e5018b9922beecaec3387fef7c20a145e94853b8ee6f791a5174`)

- **Model.** OWLv2, `Xenova/owlv2-base-patch16-ensemble`, file `onnx/model_q4.onnx` (193,982,426 bytes, sha256 `8a2995ee3f01c053a8d7e99d109848622004df5c51ffb8d5718f93921cdb7445`), dtype q4, on WebGPU with `@huggingface/transformers` 3.8.1 (onnxruntime-web 1.22.0-dev.20250409-89f8206ba4).
- **One model call per photo,** on the whole photo. The OWLv2 processor pads it to a square and resizes it to 960 px. The text batch is the same 20 queries as the dev run, so each score is computed exactly as on dev. Only 5 of them enter the rule.
- **Score.** L("chain"), plus the larger of L("bicycle") and L("electric bicycle"), minus the larger of L("motorcycle") and L("dirt bike"). L(q) is the highest class logit for query q over all 3,600 boxes.
- **Threshold -0.10474.** "Pedals" if the score is at or above it, "no pedals" below it. It sits halfway between the highest dev no-pedal machine (-0.1234, the 79Bike Lynx) and the next pedal bike above it (-0.0860, the Juiced Scrambler). The method never abstains, and a photo with no score counts as wrong.
- **Speed.** About 9.4 seconds per photo on this Mac for dev photos up to 1,024 px. The app would download the 194 MB model once, and it needs WebGPU.
- **Frozen files.** The test page `pilot/v3/owl-test.html` (sha256 `f1c6ae1c8810d91351ec9ffc6ea8e0779066acdd4139c505bf9df5591462d8de`) is the dev page with only its photo list, output file and labels changed. The scorer `scripts/pilot-v3-score.ts` (sha256 `6b7d79ea2d02daa51e362ab891ffac5e14a1ebc81c7681f8c932db388457f712`) applies `method.json`, and on the dev scores it reproduces every dev call and score.

### How it was chosen (dev photos only)

The details are in "v3 step 2" above. 1,140 rules were searched, and nested leave-one-out reran the whole search with each photo held out.

| | In sample | Nested leave-one-out |
|---|---|---|
| Overall | 66 of 71 (93.0%) | 63 of 71 (88.7%) |
| No-pedal machines | 31 of 31 | 29 of 31 |
| Hard pedal cases (v2) | 22 of 27 | 21 of 27 |
| Real-world photos (v2) | 14 of 19 | 14 of 19 |
| Spent v2 test photos | 21 of 24 | 19 of 24 |

Every in-sample miss is a real-world photo of a moto-styled or fat-tire pedal bike. All 40 v2 studio photos were right.

My expectation before the run, so it's on record: a fail is likely, roughly two chances in three. The threshold is only 0.019 above the top two dev no-pedal machines, leave-one-out missed 2 of 31 no-pedal machines, and real-world pedal bikes were right only 5 of 10.

**Expected result, from the dev leave-one-out estimate:** about 88.7% right, with 29 of 31 no-pedal machines caught. On 24 photos that is about 21 right and about 11 of 12 no-pedal machines, both short of the bars. Arnav gave the go after seeing these numbers, in his words: "Run it anyway. Preregister the chosen rule and the same bars, commit the fresh test labels, then run the fresh set once and report whatever happens." The go message gives the threshold as -0.105, which is -0.10474 rounded. The exact value in `method.json` decides.

### Bars (the same as v2)

| Check | Pass bar |
|---|---|
| No-pedal machines | All 12 called "no pedals" |
| Pedal call overall | Right on at least 22 of 24 |
| Invented facts | Zero class, watt or speed values reported when no label is visible |

Any abstain or missing result counts as wrong. Hard cases, real-world photos, studio photos and time per photo are reported separately.

### The single run

1. At the go, check `photo-pilot-v3/test.csv` against the hash from the coordinating session, copy it unchanged to `pilot/v3/test.csv` and commit it. Copy the 24 photos next to `owl-test.html` and check each one against its sha256 in `test.csv`.
2. Open `owl-test.html` once in the in-app browser. Its raw output is committed as `pilot/v3/test-raw-v3.json`.
3. Run `npx tsx scripts/pilot-v2-ocr.ts` on the same 24 photos for the invented-facts check. Its output is committed as `pilot/v3/test-ocr.json`.
4. Score with `npx tsx scripts/pilot-v3-score.ts`, which writes `pilot/v3/results.json`.

No second test run after seeing the result. If the page crashes partway, it resumes from its own saved scores, so it is still one pass.

### What happens on each outcome

- **Fail.** Whole-bike photos stay cut for good, and RESULTS.md says so plainly.
- **Pass.** Whole-bike photos come back as a pedals or no-pedals sorter only, never a legal verdict by itself, on phones with WebGPU. When the score is close to the line, the app asks "Does it have pedals?". That is product behavior and isn't counted in the bar.

### Results (single run, Sat Oct 17, 2026, about 5:25 PM PT)

| Check | Pass bar | Result | Pass? |
|---|---|---|---|
| No-pedal machines | All 12 called "no pedals" | 12 of 12 | Yes |
| Pedal call overall | Right on at least 22 of 24 | 23 of 24 | Yes |
| Invented facts | Zero class, watt or speed values with no label visible | 0 of 24 photos | Yes |

Reported separately: pedal bikes 11 of 12, hard cases 9 of 10, real-world photos 9 of 10, studio photos 14 of 14. The run took 6,089 ms per photo on average, 8,844 ms at the slowest, after a 6,623 ms warm-up, with no resume and no error. The page checked the model file hash again before the run. Raw output is in `pilot/v3/test-raw-v3.json` (sha256 `26517ec92e5e8ad08be72b2a2f245149d0b1b295fec43049bd55ba7edfef40e6`), the OCR check is in `pilot/v3/test-ocr.json`, and the scored rows are in `pilot/v3/results.json`.

- **The one miss.** The Specialized Turbo Levo (2018), an electric mountain bike in a real-world photo, scored -0.279 and was called "no pedals."
- **The closest calls.** The CAKE Ösa, a no-pedal e-moto in a real-world photo, scored -0.151, only 0.046 under the line. The nearest pedal bike, the EUNORAU FLASH 2.0, scored 0.061, 0.166 over it.
- **It beat the prior.** The dev leave-one-out estimate was 88.7% with 29 of 31 no-pedal machines, and I expected a fail. One set of 24 photos can't pin accuracy closely. 23 of 24 fits a true rate anywhere from 78.9% to 99.9% (exact 95% interval), and 12 of 12 fits anything above 73.5%. So the dev estimate is still the better guide to everyday accuracy.

**Decision, by the rule above: whole-bike photos come back as an optional pedals or no-pedals sorter, never a legal verdict by itself.** It loads only when tapped, after showing the 194 MB download, and it asks "Does it have pedals?" when the score is close to the line. I did no second test run.
