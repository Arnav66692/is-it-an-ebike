# Is it an e-bike?

A free phone page that checks one e-bike for one rider. Pick the state and the rider's age, then show it the bike's class label, paste the product link, or type the facts in. It answers in English or Spanish, with the law behind every line. In San Diego County it also checks the City of San Diego, Carlsbad, Encinitas, Solana Beach, Del Mar, unincorporated county areas and SDUHSD campuses.

Built for Neighborhood Hacks 2026 (Oct 16 to 23, 2026).

## Why

The City of San Diego could start citing riders under its new e-bike rules on Oct 12, 2026, after 60 days of warnings. Riders under 12 can no longer ride Class 1 or 2 e-bikes there, SDUHSD now admits only tagged Class 1 and 2 e-bikes, and stores sell pedal-less e-motos under "kids e-bikes." Families have to sort out state law, city law and school rules for one specific bike. Guides explain the rules. This gives a verdict for one bike and one rider.

## How it decides

The AI only reads. A fixed rules table decides.

1. **Reading the bike.** A label photo is read by Tesseract OCR right in the phone's browser, so the photo never leaves the phone. A product link is fetched once on the server. Then a fixed-rules parser pulls out the class, watts, speeds, throttle and pedals. It reports a value only when it finds it written in the text, and it shows the exact words it used. If the user isn't sure whether the bike has pedals, an optional photo check can look at a side photo of the whole bike. It runs a free detector, OWLv2, on the phone with WebGPU, downloads 194 MB once and only after the user agrees, and only fills the pedals answer. On a close call it asks instead.
2. **Checking the facts.** The "what I read" card shows every fact so the user can fix it before anything is decided.
3. **Deciding.** A deterministic TypeScript engine (`lib/rules/`) applies the rules table in `data/rules/`. Every sentence on a verdict card comes from a template in `lib/i18n/verdicts.ts`, in both languages. No model writes legal text.
4. **Saying "can't confirm."** If a fact the law depends on is missing, the engine asks a quick follow-up question (wheel size, fast modes, weight) or says it can't confirm. It never guesses toward "legal."
5. **The bottom line.** Under every card, one strict YES or NO covers the whole ride: state law, every San Diego place picked, and the SDUHSD campus if picked, on the ride date. The rule lives in `lib/rules/bottomLine.ts`, apart from the page, so it is tested on its own.
   - **YES** only if every card says allowed, every follow-up question is answered (a "not sure" fast-mode answer counts as open), and every rule behind the cards was read in enacted text. That means statute-verified state rules and `primary_verified` San Diego records. It lists what the rider must still do, merged with duplicates removed, and says it covers streets and bike lanes, since sidewalks, parks, beaches and trails have their own rules.
   - **NO, not allowed** if any card says not allowed or not an e-bike. It names each place and the reason.
   - **NO, not confirmed** if nothing is illegal but something is open, can't be confirmed, or rests on rules that weren't read in enacted text. It says exactly what is missing. Uncertainty never becomes a YES.
   - No place is ticked unless a QR code or shared link names one, so the places an answer covers are always the family's own pick. If no city or county is picked, the rider also rides somewhere else, or the state has no local layer, the answer says those rules were not checked. There is never a bare YES for an unchecked place.
   - Local rules end on their own dates. The City of San Diego's under-12 ban ends Jan 1, 2029 with the state law behind it. Carlsbad's code gives its ban no end date, so from that day a Carlsbad answer for a rider under 12 is can't confirm, never YES.

The San Diego records are held to a reference standard. On Oct 19, 2026 an independent skeptic pass reread each one against enacted ordinance, code, resolution, board and statute text, and only changes it confirmed from that text went in. Each record in `data/rules/san_diego_local.json` carries a `verification_level` and its `primary_sources` (number, link, effective date and quote). Six places are `primary_verified`. SDUHSD is `primary_partial`. Its helmet rule is in Administrative Regulation 5142, but its class, tag and course rules are only on the district's web page and the Board has not voted on them, so a campus answer can be NO, not allowed, but never YES.

The costly mistake is calling a bike legal when it isn't, so the engine is built around that:

- Never "legal" in Alaska, Kentucky or South Carolina, where the law doesn't clearly cover e-bikes.
- The watt line is read per state. A 750 W label passes in the 24 states that say "750 watts or less" and can't be confirmed in the 19 that say "less than 750."
- Every `verdict_cautions` condition in the table is checked, with three-valued logic, so a fact the label can't show becomes a question instead of a guess.
- Rules switch on their effective dates (Hawaii Nov 12, 2026, North Carolina Dec 1, 2026, California, Colorado, Illinois, New Jersey and Oregon Jan 1, 2027, Utah May 5, 2027). Pick a future ride date to see them.
- Class 2 verdicts carry a caution in the 18 states whose law also says the motor must stop when the rider stops pedaling. Reviewers kept Class 2 legal there, and so does this app, but no court has settled it.

## Accuracy

See `RESULTS.md` and the in-app accuracy page, in English at `/accuracy` and Spanish at `/accuracy/es`. The headline: on 371,200 generated cases (every state, class, age band, caution condition and switch date, plus bikes with pedals unknown or missing, no class, two classes, or facts that disagree), checked against an independent reading of the raw table in `tests/oracle.ts`, the engine gave **zero false-legal results** and never refused a case the table allows.

The bottom line has its own gates. On 435,200 generated cases, including every San Diego place alone, all of them and none, with and without "Somewhere else", it never said YES when the independent checker listed a reason against it, and never refused when it listed none. It said "NO, not allowed" exactly when the checker found a rule that says no. The line naming unchecked places is checked on the real rendered card, in both languages.

Those tests prove the engine matches the table, not that the table matches the law. The state table was checked against statute text on Oct 16, 2026 in two verifier rounds (`data/rules/verification_report.md`, `data/rules/corrections.json`). The San Diego records were checked against enacted text on Oct 19, 2026, as described above.

The pilot in `PILOT.md` set pass bars before each run. A free CLIP model caught every pedal-less e-moto but called 4 of 8 real e-bikes pedal-less, so whole-bike photos were cut from the app. A second, part-focused try was built on 47 photos and run once on 24 fresh ones. It caught only 9 of 12 no-pedal machines and got 18 of 24 overall against a bar of 22. A third try used OWLv2, a free open-vocabulary detector, with one rule picked on 71 photos. Before its single run on 24 fresh photos, the expected result was written down as 88.7%. It passed every bar, with 12 of 12 no-pedal machines and 23 of 24 overall, so whole-bike photos are back as an optional pedal check, never a verdict.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

```bash
npm test
```

```bash
npm run results
```

`npm run results` reruns every test and rewrites `RESULTS.md` and `data/results/accuracy.json`.

## Code map

| Path | What it is |
|---|---|
| `data/rules/` | The verified rules table: 50 states plus DC, and 7 San Diego records with their primary sources |
| `data/overlay.json` | Dated rule changes, supervision exceptions and a few definition rules from the verified notes, each pointing back to its source line |
| `lib/rules/` | The engine: conditions, facts, state rules, San Diego layer, and the bottom line |
| `lib/extract/` | Text parser for labels and listings, and the listing fetcher |
| `lib/photo/` | The tested whole-bike pedal rule and the on-device photo check |
| `lib/i18n/` | Every sentence the app shows, in English and Spanish |
| `components/`, `app/` | The phone interface, accuracy page and QR flyer |
| `tests/` | Golden cases, the generated matrix, the independent checker, parser and translation tests |
| `PILOT.md`, `pilot/` | Pass bars committed before each pilot run, and the results |

## Privacy

No accounts and no database. Label photos are read on the device and never uploaded. The optional pedal photo check also runs on the device, and its model comes once from Hugging Face and jsDelivr. A product link is fetched once and nothing is stored. The listing route refuses private and internal addresses.

## AI disclosure

This project was built during Neighborhood Hacks 2026 with AI help, as the rules allow when disclosed.

- **Claude (Anthropic), through Claude Code**, wrote the code, tests and Spanish text, and ran the research that gathered and double-checked the state rules table. I didn't hand-write the code.
- **My part.** I picked the problem from what I've seen around my school, chose the scope (every state, with a San Diego layer), and made the policy calls recorded in `data/overlay.json` and `PILOT.md`, including the Class 2 caution and using no paid AI. The pilot pass bars come from the research report and were committed before any run.
- **Inside the product**, the only AI is open-source and free. Tesseract OCR reads label photos on the phone. For whole-bike photos, CLIP models failed two preregistered tests, then OWLv2 passed a third. OWLv2 runs on the phone only when the user taps it, and it only answers whether the bike has pedals. No paid AI API is used.
- **Data.** State e-bike statutes (linked on every card), San Diego County city and county codes, ordinances and council records, SDUHSD board regulations and its Bike Safety page.
- **Libraries.** Next.js, React, Tailwind CSS, tesseract.js, transformers.js (loaded from jsDelivr only for the photo check), qrcode, Vitest.

The Spanish text still needs a check by a fluent speaker.

## Not legal advice

This is general information. Laws change. Confirm with your city or police department before riding.
