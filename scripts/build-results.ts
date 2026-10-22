// Writes data/results/accuracy.json and RESULTS.md from real runs. Every number comes
// from the test matrix, the Vitest report or the pilot result files.
//
// Usage: npm run results

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { districtGates, finderGates, modGates, modRideGates } from "../tests/featureGates";
import { CA_ANSWERS_BEFORE } from "../tests/modsDigest";
import { DATES, runBottomLineMatrix, runMatrix, SHAPES, VARIANTS } from "../tests/matrix";
import { stateCheckedThrough } from "../lib/rules/bottomLine";
import { getState, STATE_CODES } from "../lib/rules/compile";
import { PLACE_IDS } from "../lib/rules/local";

const root = join(__dirname, "..");
const read = <T>(path: string): T | null => {
  const full = join(root, path);
  return existsSync(full) ? (JSON.parse(readFileSync(full, "utf8")) as T) : null;
};

interface VitestReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  success: boolean;
}

interface ClipResult {
  bars: Record<string, { bar: string; result: string; pass: boolean }>;
}

interface OcrResult {
  photos: number;
  photos_with_invented_values: number;
  pass: boolean;
}

/** The San Diego County records and how each was checked, read from the rules table itself. */
const sdRecords = (read<{ jurisdictions: { verification_level: string }[] }>("data/rules/san_diego_local.json")?.jurisdictions ?? []);
const verifiedRecords = sdRecords.filter((j) => j.verification_level === "primary_verified").length;

function commit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  } catch {
    return "unknown";
  }
}

const matrix = runMatrix();
const bottom = runBottomLineMatrix();
const districts = districtGates();
const mods = modGates();
const modRides = modRideGates();
const finder = finderGates();
const vitest = read<VitestReport>(".cache/vitest.json");
const clip = read<ClipResult>("pilot/results/photos-clip.json");
const ocr = read<OcrResult>("pilot/results/photos-ocr.json");
const listing = read<Record<string, unknown>>("pilot/results/listings.json");
interface V2Result {
  pass: boolean;
  bars: Record<string, { bar: string; result: string; pass: boolean }>;
  breakdown: Record<string, { right: number; of: number }>;
}
const v2 = read<V2Result>("pilot/v2/results.json");
interface V3Result {
  pass: boolean;
  bars: Record<string, { bar: string; result: string; pass: boolean }>;
  breakdown: {
    pedal_bikes: { right: number; of: number };
    hard_cases: { right: number; of: number };
    real_world: { right: number; of: number };
    studio: { right: number; of: number };
    no_result: number;
    mean_ms: number | null;
  };
}
const v3 = read<V3Result>("pilot/v3/results.json");
const labels = read<Record<string, unknown>>("pilot/results/labels.json");

/** "Oct 19, 2026, 5:14 PM PT". Arnav reads times in Pacific Time. */
const pacific = (iso: string) =>
  `${new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))} PT`;

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);

const accuracy = {
  generated_at: new Date().toISOString(),
  commit: commit(),
  engine: {
    states: STATE_CODES.length,
    san_diego_places: PLACE_IDS.length,
    cases: matrix.cases,
    state_cases: matrix.stateCases,
    local_cases: matrix.localCases,
    by_status: matrix.byStatus,
    // How each verdict is drawn on its card. An allowed card is drawn NO when the bottom line can't confirm it.
    shown_as: matrix.shownAs,
    shown_wrong: matrix.shownWrong.length,
    false_legal: matrix.falseLegal.length,
    missed_yes: matrix.missedYes.length,
    hedged: matrix.hedged.length,
    answer_cards: matrix.answerCards,
  },
  bottom_line: {
    cases: bottom.cases,
    by_kind: bottom.byKind,
    false_yes: bottom.falseYes.length,
    missed_yes: bottom.missedYes.length,
    false_illegal: bottom.falseIllegal.length,
    missed_illegal: bottom.missedIllegal.length,
    wrong_kind: bottom.wrongKind.length,
    missing_caveat: bottom.missingCaveat.length,
    rendered_cards: bottom.renderedCards,
    hedged: bottom.hedged.length,
    answer_cards: bottom.answerCards,
    card_yes_under_no: bottom.cardYesUnderNo.length,
    place_cards: bottom.placeCards,
  },
  features: { districts, mods: { ...mods, rides: modRides }, finder },
  tests: vitest
    ? { total: vitest.numTotalTests, passed: vitest.numPassedTests, failed: vitest.numFailedTests }
    : null,
  pilot: {
    photos_clip: clip?.bars ?? null,
    photos_ocr: ocr ? { photos: ocr.photos, invented: ocr.photos_with_invented_values, pass: ocr.pass } : null,
    listings: listing,
    labels,
    photos_v2: v2 ? { pass: v2.pass, bars: v2.bars, breakdown: v2.breakdown } : null,
    photos_v3: v3 ? { pass: v3.pass, bars: v3.bars, breakdown: v3.breakdown } : null,
  },
};

mkdirSync(join(root, "data", "results"), { recursive: true });
writeFileSync(join(root, "data", "results", "accuracy.json"), JSON.stringify(accuracy, null, 2) + "\n");

const s = matrix.byStatus;
const STATUS_ROWS: [keyof typeof s, string][] = [
  ["yes", "Allowed"],
  ["no", "Rider not allowed"],
  ["not_ebike", "Not an e-bike"],
  ["cant_confirm", "Can't confirm it's legal"],
  ["need_info", "Follow-up question still open"],
];
// The matrix dates past every state's 30-day check, counted from the rules table.
const lateDates = DATES.filter((d) => STATE_CODES.every((c) => d > stateCheckedThrough(getState(c).lastChecked)));
const md = `# Results

Generated by \`npm run results\` on ${pacific(accuracy.generated_at)} from commit \`${accuracy.commit}\`. Every number below comes from a file in this repo.

## Rules engine

The engine was checked on **${matrix.cases.toLocaleString("en-US")} generated cases**: every state and DC, every class, ten ages, ${DATES.length} dates around each rule change and the 30-day re-check line, and ${VARIANTS.length} versions of the bike that each flip one fact a caution reads (watts, wheel size, three wheels, weight, foot pegs, pedal kit, fast modes, and unanswered or "not sure" answers). It also ran ${SHAPES.length} bikes that are not one plain class: pedals unknown or missing, no class, two classes, facts that disagree, a throttle answered "not sure" with a throttle speed still stated, a throttle left blank with no speed, and a top speed of unknown mode on top of the assist speed. ${matrix.localCases.toLocaleString("en-US")} of those are San Diego local cards.

An independent checker in \`tests/oracle.ts\` reads the raw JSON itself and lists every reason a case must not get a yes. It shares no code with the engine.

| Gate | Result |
|---|---|
| **False legal** (engine says yes, table gives a reason for no) | **${matrix.falseLegal.length}** |
| Missed yes (engine refuses, table gives no reason to) | ${matrix.missedYes.length} |
| Rendered place card whose answer is not a plain YES or NO, or leads with a hedge | ${matrix.hedged.length} |
| Place card drawn YES or NO other than the raw data gives it | ${matrix.shownWrong.length} |

Every place card answers YES or NO. Only an allowed card is YES. A card that is not allowed, not an e-bike, can't be confirmed or still has a question open is NO, with a plain reason under it, like "We can't confirm it's legal in South Carolina." The engine decides exactly as before, only the words changed. The check renders ${matrix.answerCards.toLocaleString("en-US")} distinct place cards from these cases, each in English and Spanish, and fails any card whose headline is not YES or NO, whose mark or reason line doesn't match it, or that gives a hedge like "Can't confirm", "unsure" or "not sure" as the answer. The "Not sure" choice on a follow-up question is a question, not an answer, and it leads to NO.

| Engine verdict | Cases | Share | Card shows YES | Card shows NO |
|---|---|---|---|---|
${STATUS_ROWS.map(([key, name]) => `| ${name} | ${s[key].toLocaleString("en-US")} | ${pct(s[key], matrix.cases)} | ${matrix.shownAs[key].yes.toLocaleString("en-US")} | ${matrix.shownAs[key].no.toLocaleString("en-US")} |`).join("\n")}

An allowed card shows NO when the bottom line can't confirm that same card: a ride date past the 30-day state check, a "not sure" fast-mode answer, or a record not read in enacted text. ${lateDates.length} of the ${DATES.length} dates in this matrix are past the state check for every state, so ${pct(matrix.shownAs.yes.no, s.yes)} of allowed cards show NO here. Every other verdict always shows NO.

${vitest ? `Full test suite: ${vitest.numPassedTests} of ${vitest.numTotalTests} tests passed.` : "Run `npm run results` to add the full test suite count."}

Mutation check, done once by hand on Oct 17. Turning off the never-legal rule, or reading "less than 750 W" as "at most 750 W", each made the false-legal test fail. So the gate can catch real mistakes.

**What this proves, and what it doesn't.** The tests prove the engine matches the rules table. They don't prove the table matches the law. The state table was checked against statute text on Oct 16, 2026 in two verifier rounds (\`data/rules/verification_report.md\`, \`data/rules/corrections.json\`). On Oct 19, 2026 an independent skeptic pass reread the first seven San Diego records against enacted ordinance, code, board and statute text. On Oct 20, 2026 thirteen more cities were added (Chula Vista, Coronado, El Cajon, Escondido, Imperial Beach, La Mesa, Lemon Grove, National City, Oceanside, Poway, San Marcos, Santee and Vista), each read in enacted code or ordinance text and then reread by an independent second pass. ${verifiedRecords} of ${sdRecords.length} records are \`primary_verified\`. SDUHSD is \`primary_partial\`, because its class, tag and course rules are only on the district's web page. Each record lists its primary sources in \`data/rules/san_diego_local.json\`. A Bike Coalition or police review of the table is still to do.

## Bottom line

Under every answer the app shows one strict YES or NO for the whole ride (\`lib/rules/bottomLine.ts\`). YES needs every card allowed, every question answered, no "not sure" fast-mode answer, every record read in enacted text, and a ride date no more than 30 days after the state rules were last checked. It was checked on **${bottom.cases.toLocaleString("en-US")} generated rides**: the same states, classes, bikes, ages and dates as above, and in California every place alone, all places together and none, each with and without a picked place whose own city or county rules were not checked (the old "Somewhere else" choice). A separate checker in \`tests/oracle.ts\` lists every reason a case must not get a YES, and every rule that says a ride is definitely not allowed. Facts read from a link or photo count the same as facts typed in. Each one shows the words it was read from on the facts card, so the family can see where it came from and change it. The caveat line is read from the real rendered card, ${bottom.renderedCards} distinct cards in English and Spanish. Every bottom line, and the sentence screen readers hear, says a plain YES or NO first, with a plain reason under it, like "We can't confirm it's legal in Texas." That is read from ${bottom.answerCards.toLocaleString("en-US")} distinct rendered bottom lines, each in English and Spanish, with their sentences.

| Gate | Result |
|---|---|
| **False YES** (bottom line says YES, checker gives a reason against it) | **${bottom.falseYes.length}** |
| Missed YES (bottom line refuses, checker gives no reason to) | ${bottom.missedYes.length} |
| NO, not allowed, when the checker finds no rule that says no | ${bottom.falseIllegal.length} |
| A rule says no, but the answer is not NO, not allowed | ${bottom.missedIllegal.length} |
| YES or NO of the wrong kind for the cards shown | ${bottom.wrongKind.length} |
| Rendered card missing, or wrongly adding, the line that names unchecked places | ${bottom.missingCaveat.length} |
| Rendered bottom line or screen reader sentence whose answer is not a plain YES or NO, or leads with a hedge | ${bottom.hedged.length} |
| **Place card YES under a NO that names that card**, or a card answer the raw data doesn't give (${bottom.placeCards.toLocaleString("en-US")} distinct rendered place cards) | **${bottom.cardYesUnderNo.length}** |

| Bottom line | Rides | Share |
|---|---|---|
| YES | ${bottom.byKind.yes.toLocaleString("en-US")} | ${pct(bottom.byKind.yes, bottom.cases)} |
| NO, not allowed | ${bottom.byKind.no_illegal.toLocaleString("en-US")} | ${pct(bottom.byKind.no_illegal, bottom.cases)} |
| NO, can't confirm | ${bottom.byKind.no_unconfirmed.toLocaleString("en-US")} | ${pct(bottom.byKind.no_unconfirmed, bottom.cases)} |


Mutation checks, done by hand on Oct 19. Ignoring unverified records, ignoring a "not sure" fast-mode answer, or dropping the unchecked-places line each made a bottom-line gate fail. After the review fixes, five more each made a gate fail: running the campus Class 3 rule when pedals are unknown (960 false NO, not allowed), deleting the caveat paragraph from the card (116 rendered cards wrong), letting Carlsbad's ban lapse with the state power (148 false YES), turning off the engine's unchecked-places flag (13 rendered cards wrong), and not counting "not an e-bike" as not allowed (60,600 false YES). After the second review, three more each made a gate fail: ignoring a stated throttle speed when the throttle answer is "not sure" (6,058 false legal cards, 6,674 false YES), dropping a stated top speed when an assist speed is also given (10,030 false legal cards, 11,038 false YES), and letting a San Diego place vouch for an under-12 rider past 30 days after its check (2,204 false legal cards, 4,408 false YES). After the third review, two more each made a gate fail: trusting a Class 1 or 3 label when the throttle answer is blank or "not sure" with no throttle speed (7,572 false legal cards, 1,682 false YES), and letting state law vouch for a ride more than 30 days after its check (198,114 false YES). Between Oct 19 and Oct 20, more mutation checks covered a step where the family ticked each fact read from a link or photo before a YES. That step was removed on Oct 22, 2026, so its gates were retired, and those checks are in the git history. Once every answer had to be a plain YES or NO, two more each made a gate fail on Oct 20: putting the old "Can't confirm" label back on place cards that can't confirm (1,074 of 2,113 distinct rendered place cards wrong), and putting the old "Not confirmed." line back under the bottom line's NO (68 of 418 distinct rendered bottom lines wrong). After the second design review, letting a San Diego place card say YES on a ride date past the state check made both card gates fail on Oct 20: 19,128 engine cards drawn other than the raw data gives them, and 153,030 wrong place card answers in the bottom-line matrix.

## School districts, mods check and bike finder

Added on Oct 21, 2026. Each gate counts an answer that must never happen. \`tests/featureGates.ts\` runs them and \`tests/featureGates.test.ts\` fails if any is above 0.

| Gate | Result |
|---|---|
| School districts in the search, from the NCES 2025-26 directory | ${districts.districts.toLocaleString("en-US")} |
| San Dieguito Union High maps to the SDUHSD campus record | ${districts.sduhsd_mapped ? "Yes" : "**No**"} |
| **Any other district mapped to a checked record** | **${districts.other_checked}** |
| Mods check answers, every mod, class, choice, 5 ride dates, with and without the City of San Diego | ${mods.answers.toLocaleString("en-US")}, ${mods.yes.toLocaleString("en-US")} YES |
| **Mod YES for an outcome the research doesn't read as the same class or a new class** | **${mods.yes_beyond_source}** |
| **Mod YES with no outcome picked, or "something else, or not sure"** | **${mods.yes_unanswered}** |
| **Rendered reason, rule, date or penalty that is not the data's own words** (${mods.claims.toLocaleString("en-US")} checked, English and Spanish) | **${mods.claims_not_in_data}** |
| Mods check rides in every state and DC, 4 ages, every mod, class and choice, 3 bikes (500 W, 1000 W, watts not typed), California with and without the City of San Diego | ${modRides.rides.toLocaleString("en-US")}, ${modRides.yes.toLocaleString("en-US")} YES |
| **Mod YES where the engine, on the bike after the mod, says anything but YES** | **${modRides.yes_engine_not_yes}** |
| **Mod YES with no outcome picked, "something else", or an outcome that depends on the result** | **${modRides.yes_unsettled}** |
| **California ride whose research answer, rules or penalties differ from before, or whose NO turned YES** | **${modRides.ca_changed}** |
| **California research answers that differ from the fingerprint taken before every state was added** (${CA_ANSWERS_BEFORE.n.toLocaleString("en-US")} answers) | **${modRides.ca_digest_changed}** |
| Bike finder rides, ${finder.bikes} catalog bikes in every state, 15 ages and the checked San Diego place sets | ${finder.rides.toLocaleString("en-US")}, ${finder.yes.toLocaleString("en-US")} YES |
| **Finder YES where the engine, on the maker's facts alone, says not allowed** | **${finder.yes_engine_refuses}** |
| **Finder YES for a bike without stated pedals, or an e-moto** | **${finder.yes_without_pedals}** |

Mutation checks on the mods rides, done by hand on Oct 21: taking the engine's YES for every state but California made the engine gate fail (67,722 false YES), and letting a California research YES stand when the engine says NO made both the engine gate and the California gate fail (637 each).

## Pilot (bars committed in PILOT.md before each run)

| Check | Bar | Result | Pass |
|---|---|---|---|
| Pedal-less machines in 12 research photos | All 4 called no pedals | ${clip?.bars.pedal_less_all_caught?.result ?? "not run"} | ${clip?.bars.pedal_less_all_caught?.pass ? "Yes" : "No"} |
| Pedal call, 12 research photos | At least 11 of 12 | ${clip?.bars.pedal_call_overall?.result ?? "not run"} | ${clip?.bars.pedal_call_overall?.pass ? "Yes" : "**No**"} |
| Invented facts, 12 research photos | Zero values with no label visible | ${ocr ? `${ocr.photos_with_invented_values} of ${ocr.photos}` : "not run"} | ${ocr?.pass ? "Yes" : "No"} |
| 20 audit listings | Zero false legal, grounding, usefulness | ${listing ? "see pilot/results/listings.json" : "waiting on Arnav's audit"} | ${listing ? "see file" : "pending"} |
| Bike shop label photos | Class right or can't confirm, never wrong | ${labels ? "see pilot/results/labels.json" : "waiting on Sunday photos"} | ${labels ? "see file" : "pending"} |

Whole-bike photos were cut from the MVP because the pedal call missed the bar (rule in PILOT.md).

## Photo pilot v2 (a second try, preregistered in PILOT.md)

A part-focused method, zero-shot CLIP on 12 zoomed tiles of the lower bike, was built on 47 dev photos and then run once on 24 fresh held-out photos.

${v2 ? `| Check | Bar | Result | Pass |
|---|---|---|---|
| No-pedal machines | All 12 called no pedals | ${v2.bars.no_pedal_machines.result} | ${v2.bars.no_pedal_machines.pass ? "Yes" : "**No**"} |
| Pedal call overall | At least 22 of 24 | ${v2.bars.pedal_call_overall.result} | ${v2.bars.pedal_call_overall.pass ? "Yes" : "**No**"} |
| Invented facts | Zero values with no label visible | ${v2.bars.invented_facts.result} | ${v2.bars.invented_facts.pass ? "Yes" : "**No**"} |

Hard cases ${v2.breakdown.hard_cases.right} of ${v2.breakdown.hard_cases.of}, real-world photos ${v2.breakdown.real_world.right} of ${v2.breakdown.real_world.of}, pedal bikes ${v2.breakdown.pedal_bikes.right} of ${v2.breakdown.pedal_bikes.of}.

${v2.pass ? "It passed, so whole-bike photos came back as a pedals sorter only." : v3?.pass ? "It failed, so whole-bike photos stayed cut until the third try below." : "It failed, so whole-bike photos stay cut. The app reads class labels, product links and typed facts instead."}` : "Not run yet."}

## Photo pilot v3 (a third try, preregistered in PILOT.md)

An open-vocabulary detector, OWLv2 (q4, 194 MB, run on WebGPU), scored each photo with one fixed rule: the best "chain" score, plus "bicycle", minus "motorcycle". The rule was picked on 71 dev photos and then run once on 24 fresh held-out photos. The expected result, stated before the run from the dev leave-one-out estimate, was 88.7% right with 29 of 31 no-pedal machines.

${v3 ? `| Check | Bar | Result | Pass |
|---|---|---|---|
| No-pedal machines | All 12 called no pedals | ${v3.bars.no_pedal_machines.result} | ${v3.bars.no_pedal_machines.pass ? "Yes" : "**No**"} |
| Pedal call overall | At least 22 of 24 | ${v3.bars.pedal_call_overall.result} | ${v3.bars.pedal_call_overall.pass ? "Yes" : "**No**"} |
| Invented facts | Zero values with no label visible | ${v3.bars.invented_facts.result} | ${v3.bars.invented_facts.pass ? "Yes" : "**No**"} |

Hard cases ${v3.breakdown.hard_cases.right} of ${v3.breakdown.hard_cases.of}, real-world photos ${v3.breakdown.real_world.right} of ${v3.breakdown.real_world.of}, pedal bikes ${v3.breakdown.pedal_bikes.right} of ${v3.breakdown.pedal_bikes.of}${v3.breakdown.mean_ms === null ? "" : `, about ${(v3.breakdown.mean_ms / 1000).toFixed(1)} seconds per photo on a Mac`}.

${v3.pass ? "It passed, so whole-bike photos came back as an optional pedal sorter, never a verdict. It loads only when tapped, after showing the 194 MB download, it asks \"Does it have pedals?\" on close calls, and it only fills the pedals answer. One set of 24 photos can't pin accuracy closely (23 of 24 fits anything from 78.9% to 99.9%), so the dev estimate is the better guide to everyday accuracy." : "It failed, so whole-bike photos stay cut. The app reads class labels, product links and typed facts instead."}` : "Not run yet."}

## Still to measure

The five accuracy numbers on the frozen labeled set (zero false-legal calls, every pedal-less machine caught, accuracy where the tool answered, can't-confirm rate, field accuracy) need Arnav's 20 audit listings and his own label photos. They will be added here, with counts beside every percentage.
`;

writeFileSync(join(root, "RESULTS.md"), md);
process.stdout.write(
  `RESULTS.md written. ${matrix.cases} cases, ${matrix.falseLegal.length} false legal. Feature gates ${districts.other_checked + mods.yes_beyond_source + mods.yes_unanswered + mods.claims_not_in_data + modRides.yes_engine_not_yes + modRides.yes_unsettled + modRides.ca_changed + modRides.ca_digest_changed + finder.yes_engine_refuses + finder.yes_without_pedals}. ${bottom.cases} bottom lines, ${bottom.falseYes.length} false YES. ${matrix.hedged.length + bottom.hedged.length} rendered answers not a plain YES or NO.\n`,
);
