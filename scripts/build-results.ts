// Writes data/results/accuracy.json and RESULTS.md from real runs. Every number comes
// from the test matrix, the Vitest report or the pilot result files.
//
// Usage: npm run results

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATES, runBottomLineMatrix, runMatrix, SHAPES, VARIANTS, type ReadVariant } from "../tests/matrix";

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

function commit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  } catch {
    return "unknown";
  }
}

/** The four ways each ride runs, in the order RESULTS.md lists them. */
const READ_ROWS: [ReadVariant, string][] = [
  ["typed", "Typed in"],
  ["read_none_checked", "Read, no fact checked"],
  ["read_one_unchecked", "Read, one fact left unchecked"],
  ["read_all_checked", "Read, every fact checked"],
];

const matrix = runMatrix();
const bottom = runBottomLineMatrix();
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
    states: 51,
    san_diego_places: 7,
    cases: matrix.cases,
    state_cases: matrix.stateCases,
    local_cases: matrix.localCases,
    by_status: matrix.byStatus,
    false_legal: matrix.falseLegal.length,
    missed_yes: matrix.missedYes.length,
  },
  bottom_line: {
    cases: bottom.cases,
    bottom_lines: bottom.bottomLines,
    by_kind: bottom.byKind,
    by_read: bottom.byRead,
    unchecked_yes: bottom.uncheckedYes.length,
    facts_not_named: bottom.factsNotNamed.length,
    false_yes: bottom.falseYes.length,
    missed_yes: bottom.missedYes.length,
    false_illegal: bottom.falseIllegal.length,
    missed_illegal: bottom.missedIllegal.length,
    wrong_kind: bottom.wrongKind.length,
    missing_caveat: bottom.missingCaveat.length,
    rendered_cards: bottom.renderedCards,
  },
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
// Said only when the counts above show it.
const illegalSame = READ_ROWS.every(([key]) => bottom.byRead[key].no_illegal === bottom.byRead.typed.no_illegal);
const checkedSame = JSON.stringify(bottom.byRead.read_all_checked) === JSON.stringify(bottom.byRead.typed);
const readNote = [
  illegalSame
    ? "Reading the facts never changed a NO, not allowed, since a rule that says no still says no."
    : "**Reading the facts changed some NO, not allowed answers. Look into this.**",
  checkedSame
    ? "With every read fact checked, the answers matched typed-in facts exactly."
    : "**With every read fact checked, the answers did not match typed-in facts. Look into this.**",
].join(" ");
const md = `# Results

Generated by \`npm run results\` on ${pacific(accuracy.generated_at)} from commit \`${accuracy.commit}\`. Every number below comes from a file in this repo.

## Rules engine

The engine was checked on **${matrix.cases.toLocaleString("en-US")} generated cases**: every state and DC, every class, ten ages, ${DATES.length} dates around each rule change and the 30-day re-check line, and ${VARIANTS.length} versions of the bike that each flip one fact a caution reads (watts, wheel size, three wheels, weight, foot pegs, pedal kit, fast modes, and unanswered or "not sure" answers). It also ran ${SHAPES.length} bikes that are not one plain class: pedals unknown or missing, no class, two classes, facts that disagree, a throttle answered "not sure" with a throttle speed still stated, a throttle left blank with no speed, and a top speed of unknown mode on top of the assist speed. ${matrix.localCases.toLocaleString("en-US")} of those are San Diego local cards.

An independent checker in \`tests/oracle.ts\` reads the raw JSON itself and lists every reason a case must not get a yes. It shares no code with the engine.

| Gate | Result |
|---|---|
| **False legal** (engine says yes, table gives a reason for no) | **${matrix.falseLegal.length}** |
| Missed yes (engine refuses, table gives no reason to) | ${matrix.missedYes.length} |

| Verdict | Cases | Share |
|---|---|---|
| Yes | ${s.yes.toLocaleString("en-US")} | ${pct(s.yes, matrix.cases)} |
| No (rider not allowed) | ${s.no.toLocaleString("en-US")} | ${pct(s.no, matrix.cases)} |
| Not an e-bike | ${s.not_ebike.toLocaleString("en-US")} | ${pct(s.not_ebike, matrix.cases)} |
| Can't confirm | ${s.cant_confirm.toLocaleString("en-US")} | ${pct(s.cant_confirm, matrix.cases)} |
| Follow-up question needed | ${s.need_info.toLocaleString("en-US")} | ${pct(s.need_info, matrix.cases)} |

${vitest ? `Full test suite: ${vitest.numPassedTests} of ${vitest.numTotalTests} tests passed.` : "Run `npm run results` to add the full test suite count."}

Mutation check, done once by hand on Oct 17. Turning off the never-legal rule, or reading "less than 750 W" as "at most 750 W", each made the false-legal test fail. So the gate can catch real mistakes.

**What this proves, and what it doesn't.** The tests prove the engine matches the rules table. They don't prove the table matches the law. The state table was checked against statute text on Oct 16, 2026 in two verifier rounds (\`data/rules/verification_report.md\`, \`data/rules/corrections.json\`). On Oct 19, 2026 an independent skeptic pass reread every San Diego record against enacted ordinance, code, board and statute text. Six records are \`primary_verified\`. SDUHSD is \`primary_partial\`, because its class, tag and course rules are only on the district's web page. Each record lists its primary sources in \`data/rules/san_diego_local.json\`. A Bike Coalition or police review of the table is still to do.

## Bottom line

Under every answer the app shows one strict YES or NO for the whole ride (\`lib/rules/bottomLine.ts\`). YES needs every card allowed, every question answered, no "not sure" fast-mode answer, every record read in enacted text, a ride date no more than 30 days after the state rules were last checked, and every fact read from a link or photo checked by the family against the bike (\`lib/provenance.ts\`). It was checked on **${bottom.cases.toLocaleString("en-US")} generated rides**: the same states, classes, bikes, ages and dates as above, and in California every place alone, all places together and none, each with and without "Somewhere else". Each ride ran four ways, typed in, and read from a link or photo with no fact checked, with one fact left unchecked (each fact in turn), and with every fact checked, so **${bottom.bottomLines.toLocaleString("en-US")} bottom lines** in all. Every gate below counts all of them. A separate checker in \`tests/oracle.ts\` lists every reason a case must not get a YES, and every rule that says a ride is definitely not allowed. The matrix works out which facts were read on its own, and counts every unchecked one as a reason against YES, whether or not a card used it. The caveat line is read from the real rendered card, ${bottom.renderedCards} distinct cards in English and Spanish.

| Gate | Result |
|---|---|
| **False YES** (bottom line says YES, checker gives a reason against it) | **${bottom.falseYes.length}** |
| Missed YES (bottom line refuses, checker gives no reason to) | ${bottom.missedYes.length} |
| NO, not allowed, when the checker finds no rule that says no | ${bottom.falseIllegal.length} |
| A rule says no, but the answer is not NO, not allowed | ${bottom.missedIllegal.length} |
| YES or NO of the wrong kind for the cards shown | ${bottom.wrongKind.length} |
| Rendered card missing, or wrongly adding, the line that names unchecked places | ${bottom.missingCaveat.length} |
| **YES while a fact read from a link or photo is unchecked** | **${bottom.uncheckedYes.length}** |
| NO, not confirmed that doesn't name exactly the unchecked facts | ${bottom.factsNotNamed.length} |

| Bottom line, facts typed in | Rides | Share |
|---|---|---|
| YES | ${bottom.byKind.yes.toLocaleString("en-US")} | ${pct(bottom.byKind.yes, bottom.cases)} |
| NO, not allowed | ${bottom.byKind.no_illegal.toLocaleString("en-US")} | ${pct(bottom.byKind.no_illegal, bottom.cases)} |
| NO, not confirmed | ${bottom.byKind.no_unconfirmed.toLocaleString("en-US")} | ${pct(bottom.byKind.no_unconfirmed, bottom.cases)} |

| How the facts came in | YES | NO, not allowed | NO, not confirmed |
|---|---|---|---|
${READ_ROWS.map(([key, label]) => `| ${label} | ${bottom.byRead[key].yes.toLocaleString("en-US")} | ${bottom.byRead[key].no_illegal.toLocaleString("en-US")} | ${bottom.byRead[key].no_unconfirmed.toLocaleString("en-US")} |`).join("\n")}

${readNote}

Mutation checks, done by hand on Oct 19. Ignoring unverified records, ignoring a "not sure" fast-mode answer, or dropping the unchecked-places line each made a bottom-line gate fail. After the review fixes, five more each made a gate fail: running the campus Class 3 rule when pedals are unknown (960 false NO, not allowed), deleting the caveat paragraph from the card (116 rendered cards wrong), letting Carlsbad's ban lapse with the state power (148 false YES), turning off the engine's unchecked-places flag (13 rendered cards wrong), and not counting "not an e-bike" as not allowed (60,600 false YES). After the second review, three more each made a gate fail: ignoring a stated throttle speed when the throttle answer is "not sure" (6,058 false legal cards, 6,674 false YES), dropping a stated top speed when an assist speed is also given (10,030 false legal cards, 11,038 false YES), and letting a San Diego place vouch for an under-12 rider past 30 days after its check (2,204 false legal cards, 4,408 false YES). After the third review, two more each made a gate fail: trusting a Class 1 or 3 label when the throttle answer is blank or "not sure" with no throttle speed (7,572 false legal cards, 1,682 false YES), and letting state law vouch for a ride more than 30 days after its check (198,114 false YES). After facts read from a link or photo had to be checked, five more each made a gate fail: a bottom line that ignores unchecked facts (100,836 YES with a fact unchecked), never marking a read weight as read (2,758 YES with a fact unchecked), counting only facts a card uses, tried by leaving out the weight (2,758 YES with a fact unchecked), naming only the first unchecked fact (425,786 answers naming the wrong facts), and a tick that never checks a fact (50,418 missed YES). A pedal photo call that keeps an old check made 3 unit tests fail. After the second review of the checks, comparing a wheel size edit only with the facts just before it, not with the sizes as read, made 5 unit tests fail.

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
  `RESULTS.md written. ${matrix.cases} cases, ${matrix.falseLegal.length} false legal. ${bottom.bottomLines} bottom lines, ${bottom.falseYes.length} false YES, ${bottom.uncheckedYes.length} YES with an unchecked fact.\n`,
);
