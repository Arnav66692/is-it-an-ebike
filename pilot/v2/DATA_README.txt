photo-pilot-v2: labeled photo sets for the "does this two-wheeler have pedals?" pilot
Built 2026-10-17 (PT) for the student app "Is it an e-bike?".
This folder holds images, labels and sources only. No classifier or model was run on any image.


WHAT IS HERE

test/test_01.jpg ... test_24.jpg   24 photos. Hold-out set. The agent that improves the method must not look at it before its single final run.
train/train_01.jpg ... train_35.jpg   35 photos for building the method.
train/rejected/   2 photos that were dropped from train (see "Replaced or dropped photos"). Not part of either set.
test.csv, train.csv   One row per photo. Columns: file, product, brand, style, setting, pedals, pedals_visible_in_photo, source_page_url, image_url, license, key_source_url, key_quote, sha256.

File numbers were assigned in a fixed random order (seed 20261017), so a file's number says nothing about its label.


COUNTS

TEST, 24 photos: pedals yes 12, pedals no 12.
  Pedals yes by style: moto_styled 8, fat_tire 1, mtb 1, commuter 1, cargo 1.
  Hard cases (moto_styled, fat_tire, mtb): 10 of the 12 pedal bikes.
  Pedals no by style: emoto 6 (adult e-motos and electric dirt bikes), kids_dirt_bike 6.
  Setting: real_world 10 (5 yes, 5 no), studio 14 (7 yes, 7 no).
  The 10 real_world photos: 7 outdoors (test_03, 04, 08, 09, 14, 20, 23), 3 indoors at a shop, event or museum (test_18, 19, 22).
  pedals_visible_in_photo: yes 12, no 12. Every test pedal bike shows at least one pedal.
  Licenses: 10 openly licensed Wikimedia Commons photos (CC BY 4.0 x3, CC BY-SA 4.0 x6, CC BY-SA 3.0 x1), 14 store or maker photos.

TRAIN, 35 photos: pedals yes 20, pedals no 15.
  Pedals yes by style: moto_styled 10, fat_tire 5, mtb 2, cargo 2, commuter 1.
  Hard cases (moto_styled, fat_tire, mtb): 17 of the 20 pedal bikes.
  Pedals no by style: emoto 6, kids_dirt_bike 9.
  Setting: real_world 9 (5 yes, 4 no), studio 26 (15 yes, 11 no).
  The 9 real_world photos: 6 outdoors (train_02, 03, 08, 10, 28, 30), 3 indoors (train_01, 07, 34).
  pedals_visible_in_photo: yes 16, partly 4 (train_15, 21, 29, 34), no 15.
  Licenses: 9 openly licensed photos (7 Commons, 2 Flickr: CC BY 2.0 x2, CC BY 4.0 x2, CC BY-SA 4.0 x3, CC BY-SA 3.0 x1, CC BY-NC-ND 2.0 x1), 26 store or maker photos.

Size: 59 dataset images, 11,727,021 bytes in total. Largest file 392,023 bytes. Long side at most 1024 px.


COLUMN DEFINITIONS

pedals: yes if the product has working pedals, no if it has none, taken from the text in key_quote. Never from the picture.
style:
  moto_styled = e-bike styled like a motorcycle, moped or board-track bike (includes the Ruff Cycles Ruffian cruiser, test_03).
  mtb = electric mountain or trail bike. fat_tire = fat-tire e-bike that is not mainly moto-styled.
  commuter, cargo = ordinary city and cargo e-bikes.
  emoto = adult electric motorcycle or electric dirt bike with no pedals.
  kids_dirt_bike = kids' or youth electric dirt bike or motorcycle with no pedals. Three of these are electric balance bikes with footrests rather than dirt bikes: test_12 SUPER73-K1D, train_06 STACYC 12eDRIVE, train_20 Hiboy BK1. test_01 Razor RSF650 is a kids' street-style electric motorcycle.
setting: studio = product shot on a plain or graphic studio background. real_world = everything else, outdoors or indoors.
pedals_visible_in_photo: yes = at least one pedal body is visible. partly = the pedal is mostly hidden or only the crank arm shows. no = no pedal visible (always no for machines without pedals). This column was filled by looking at the final image. It is a property of the photo, not the label.
license: CC license of the photo page, or "store photo, copyrighted" for maker and store images.
key_source_url, key_quote: the page and the exact words (25 words or fewer) that settle the pedals label. Fragments joined with "..." come from the same page.
sha256: hash of the JPEG in this folder.


HOW THE ANSWER KEY WAS CHECKED

Every key page was saved during the build and a script confirmed that each key_quote appears word for word on it (ignoring case, spacing, HTML escaping, curly quotes and dash style). All 59 quotes passed. All quotes are 25 words or fewer.

Where the keys come from: maker product or parts pages 48, archived maker pages on the Wayback Machine 5, maker support pages 3, Commons photo description pages 3.

Strength of the key (not a CSV column):
  explicit, 44 rows: the quote names pedals, pedal assist, pedelec, footpegs, or a balance bike.
  drivetrain, 2 rows: test_08 Zero FX and train_30 Zero X. The maker describes a motor driving the rear wheel by belt or chain, with nothing else.
  class, 12 rows: the maker or the photo page only calls the machine a motorcycle, dirt bike or mini-cross bike. No pedal or footpeg wording was found. These are test_04 KTM Freeride E-XC, test_18 Hiboy DK1, test_19 Cake Kalk, and train_01, 03, 04, 05, 07, 09, 26, 27, 31.
  implicit, 1 row: train_10 CUBE Reaction Hybrid Pro 500. The photo description says the owner uses the motor for only 10% of the ride.
Caution on class keys: one maker sells an "R19 Electric Dirt Bike" that has pedal assist (train_15, Coswheel). Names like "dirt bike" are weaker evidence than pedal or footpeg wording. If a stricter standard is needed, re-check the 12 class rows first.

Notes on specific keys:
  SUPER73-ZX (test_23), SUPER73-R Adventure (train_34), SUPER73-R Brooklyn (train_19): Super73's product pages only say "Class-2". The key is Super73's own help-center article that lists which models have pedal assist.
  Monday Motorbikes Anza (test_14) and Piezo (test_20): keys are archived 2022 and 2023 Monday pages for those models. The current Anza page is a newer V4.
  Stromer ST5 (train_28): the current page is the ST5 Pinion version. The photo is an ST5 at a 2024 expo.
  Ruff Cycles Ruffian (test_03): the key is the current Ruffian Steel page. The photo shows an earlier Ruffian.
  E Ride Pro PRO SS 3.0 (test_17), SR (test_05), MINI R (train_22): keys are E Ride Pro's own replacement-part pages for the footpeg mounts that fit those models.
  SONDORS Original (train_02): the key is an archived 2019 Sondors page. The company's live site is gone.


OVERLAP CHECKS

1. Product names. No product model appears in both sets (exact names and normalized model names compared). Near-twins were also kept out of the other set: Razor SX125 and SX350 share frames with test MX125 and MX350, E Ride Pro PRO-S and PRO SS 2.0 share the frame of test PRO SS 3.0, Hiboy DK2 is a sibling of test DK1, Macfox X1S is nearly identical to test X7, Rad Radster Trail is a sibling of test Radster Road, Ariel Rider X-Class 60V PPB is a version of test X-Class, and Stark VARG EX, other KTM Freeride E-XC photos and other Zero FX photos were not used.
2. First pilot. None of the 12 pilot products or their named variants appear: Aventon Level 3, Talaria Sting Pro, Aventon Ramblas ADV, SUPER73-S2 SE, Jasion EB5 Roamer ST, Lectric XP4 750, Rad Power RadRunner Plus, Hiboy DM14, SUPER73-Z Miami, the pilot's Sur-Ron photo, Ariel Rider Grizzly 72V, MotoTec 48v Pro 1800W. Sur-Ron and Talaria were left out entirely. No source page URL or image URL is shared with the pilot (the Flickr original of the pilot's Sur-Ron photo was also skipped).
3. File hashes. sha256 of all 59 final files and of every raw download was compared with the 12 pilot files in research_notes/.../ebike_photos/. No match. No duplicate hash within or between the new sets. The sha256 values in the CSVs were re-checked against the files.
4. Near-duplicate images. 64-bit and 256-bit difference hashes (simple pixel-gradient fingerprints, not a model) were computed for all new and pilot images. The 64-bit hash flags many pairs that only share a layout (side view on white), so the 256-bit hash decided. Closest new-vs-pilot pair: 30 of 256 bits (test_15 Lectric XPeak2 vs pilot photo_01 Aventon Level 3, different bikes, checked by eye). Closest test-vs-train pair: 35 of 256 bits (test_12 SUPER73-K1D vs train_19 SUPER73-R Brooklyn, same studio template, different products). No pair was 20 bits apart or closer.


IMAGE NOTES

test_18 Hiboy DK1 is in a bike shop, with pedal bicycles in the background.
test_22 Stark VARG has a second electric dirt bike partly visible at the left edge.
test_14, test_20, train_08 and train_28 are expo photos with people or other bikes in the background. train_28 has a second Stromer partly visible.
train_06 STACYC keeps the maker's graphic banner.
train_07 Torrot T10 is in a museum, with parts of other bikes at the edges.
train_03 Zero MX is mid-jump and small in the frame.


REPLACED OR DROPPED PHOTOS

Dropped after being placed in train (now in train/rejected/): Lectric XPress2 and Cyrusher Path. They were removed to keep the class balance and the moto-styled emphasis after two moto-styled pedal bikes were added (Coswheel R19, HOVSCO HovGtrs). The rest of train was rebuilt with the same images. The earlier copies are in the scratch folder, not deleted.
Re-encoded: train_34 was first written at 402,491 bytes, so it was re-encoded at lower JPEG quality. The first version is in the scratch folder.
Considered and not used:
  Commons "Electric Bicycle.jpg": the description names a Himiway Zebra but the photo shows a different, converted bike.
  Flickr "Electric dirt bike" (user 29982308@N00): the title does not name the product.
  Flickr "Surron Storm Bee": no Sur-Ron spec page could be read to key it.
  Commons KTM group photo (three bikes), Brammo Engage (two bikes), the first Torrot T10 photo (a bike behind it), GasGas E-Kids (bikes behind them): not one machine.
  Bultaco Brinco (on a hitch rack or overlapping a museum bike, no readable spec page), Vtuvia Reindeer (that version's page has no pedal wording), Cyclotricity Stealth, Nicolai S14, S-Works Turbo Levo 4, Heybike Galaxy T, Lapierre Overvolt: no readable key page.
  JackRabbit XG: a pedal-less micro bike outside the requested no-pedal categories.
  Store images with text overlays or infographics were swapped for clean shots (Lectric XPeak2, Lectric XPedition2). Jansno X60 was dropped because its images carry insets and infographics. STACYC lifestyle shots were not side views.
  79Bike Falcon Lite: its page only had a product-type field, and it looks like the Falcon Pro.


NOT FOUND

Sur-Ron Ultra Bee or Storm Bee, Talaria XXX or MX, Segway X160 or X260: the maker pages are script-rendered or have no pedal or footpeg wording, so no key could be quoted.
Juiced Scorpion and HyperScorpion pages are gone, only the Juiced Scrambler is still listed. Himiway's site refused connections. fucare.com now belongs to an unrelated company. Onyx product pages did not load.


LICENSES AND USE

Commons and Flickr photos keep the CC license listed in each row. Attribution details are on each source page.
Store and maker photos are copyrighted. They are only for this internal test and must not be published or committed.


IMAGE PROCESSING

macOS sips converted each image to JPEG, with the long side at most 1024 px (never upscaled) and JPEG quality lowered step by step until the file was under 400,000 bytes.
Working files (downloads, saved key pages, manifest, scripts) are in this session's scratch folder, /private/tmp/claude-501/-Users-arnavsingh-Desktop-Competitions/68561184-2840-4421-bb5f-ff2d01f19292/scratchpad/ (photo_sets/ and scripts/). That folder is temporary.
