import Link from "next/link";
import accuracy from "@/data/results/accuracy.json";
import { ACCURACY_TEXT, localizeResult } from "@/lib/i18n/accuracy";
import { formatDate, type Lang } from "@/lib/i18n/names";

type Bar = { bar: string; result: string; pass: boolean };

interface FeatureResults {
  districts: { districts: number; other_checked: number };
  mods: {
    yes_beyond_source: number;
    yes_unanswered: number;
    claims_not_in_data: number;
    /** The mods check in every state. Older result files don't have it. */
    rides?: { yes_engine_not_yes: number; yes_unsettled: number; ca_changed: number; ca_digest_changed: number };
  };
  finder: { yes_engine_refuses: number; yes_without_pedals: number; yes_before_checked: number };
}

interface BottomLineResults {
  cases: number;
  bottom_lines?: number;
  unchecked_yes?: number;
  by_kind: { yes: number; no_illegal: number; no_unconfirmed: number };
  false_yes: number;
  missed_yes: number;
  false_illegal?: number;
  missed_illegal?: number;
  missing_caveat: number;
  hedged?: number;
  card_yes_under_no?: number;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr>
      <th scope="row" className={`text-left ${strong ? "font-semibold" : "font-normal"}`}>
        {label}
      </th>
      <td className={strong ? "text-lg font-bold" : undefined}>{value}</td>
    </tr>
  );
}

/** One of the safety gates, as a tile. Green at 0, red above it. */
function Gate({ label, value, fmt }: { label: string; value: number; fmt: (n: number) => string }) {
  return (
    <div className="stat" data-pass={value === 0 ? "true" : "false"}>
      <span className="stat-value">
        <span aria-hidden="true">{value === 0 ? "✓ " : "✕ "}</span>
        {fmt(value)}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/** The accuracy page, in English or Spanish. Every number comes from data/results/accuracy.json. */
export function AccuracyView({ lang }: { lang: Lang }) {
  const text = ACCURACY_TEXT[lang];
  const locale = lang === "es" ? "es-US" : "en-US";
  const e = accuracy.engine;
  // Rendered answers that are not a plain YES or NO. Older result files don't have the count.
  const hedged = (e as { hedged?: number }).hedged;
  const bl = (accuracy as { bottom_line?: BottomLineResults }).bottom_line ?? null;
  // How allowed cards are drawn, YES or NO. Older result files don't have it.
  const shownAs = (e as { shown_as?: Record<string, { yes: number; no: number }> }).shown_as ?? null;
  const fmt = (n: number) => n.toLocaleString(locale);
  const share = (n: number) => `${((100 * n) / e.cases).toFixed(1)}%`;
  const verdict = (bar: Bar) => `${localizeResult(bar.result, lang)}, ${bar.pass ? text.pass : text.fail}`;
  const of = (right: number, total: number) => localizeResult(`${right} of ${total}`, lang);
  const clip = accuracy.pilot.photos_clip as Record<string, Bar> | null;
  const ocr = accuracy.pilot.photos_ocr as { photos: number; invented: number; pass: boolean } | null;
  const v2 = (accuracy.pilot as { photos_v2?: { pass: boolean; bars: Record<string, Bar>; breakdown: Record<string, { right: number; of: number }> } | null }).photos_v2 ?? null;
  const v3 = (accuracy.pilot as { photos_v3?: { pass: boolean; bars: Record<string, Bar>; breakdown: { hard_cases: { right: number; of: number }; real_world: { right: number; of: number }; mean_ms: number | null } } | null }).photos_v3 ?? null;
  // The district, mods and finder gates. Older result files don't have them.
  const features = (accuracy as { features?: FeatureResults }).features ?? null;
  // The day the results were made, in Pacific time, spelled out like every other date in the app.
  const updated = formatDate(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(accuracy.generated_at)), lang);

  return (
    <main className="page flex-1" lang={lang}>
      <nav className="no-print">
        <Link href={lang === "es" ? "/?lang=es" : "/"} className="link-btn back-link inline-flex items-center gap-2">
          <span aria-hidden="true">&larr;</span>
          <span>{text.back}</span>
        </Link>
      </nav>
      <header className="app-head">
        <h1 className="app-title">{text.title}</h1>
        <p className="tagline">
          {text.introBefore} <code className="quote">RESULTS.md</code> {text.introAfter(updated)}
        </p>
      </header>

      <div className="stats">
        <Gate label={text.falseLegal} value={e.false_legal} fmt={fmt} />
        {bl ? <Gate label={text.blFalseYes} value={bl.false_yes} fmt={fmt} /> : null}
        {bl?.unchecked_yes !== undefined ? <Gate label={text.blUncheckedYes} value={bl.unchecked_yes} fmt={fmt} /> : null}
      </div>

      <section className="card space-y-4">
        <h2 className="card-title">{text.engineTitle}</h2>
        <p className="help">{text.engineCases(fmt(e.cases), e.san_diego_places)}</p>
        <table className="table">
          <tbody>
            <Row label={text.falseLegal} value={fmt(e.false_legal)} strong />
            <Row label={text.missedYes} value={fmt(e.missed_yes)} />
            {hedged !== undefined ? <Row label={text.hedged} value={fmt(hedged)} /> : null}
            {/* YES counts only the allowed cards that say YES. An older result file without the count shows no YES row. */}
            {shownAs ? <Row label={text.statusYes} value={`${fmt(shownAs.yes.yes)} (${share(shownAs.yes.yes)})`} /> : null}
            {shownAs ? <Row label={text.statusAllowedNo} value={`${fmt(shownAs.yes.no)} (${share(shownAs.yes.no)})`} /> : null}
            <Row label={text.statusNo} value={`${fmt(e.by_status.no)} (${share(e.by_status.no)})`} />
            <Row label={text.statusNotEbike} value={`${fmt(e.by_status.not_ebike)} (${share(e.by_status.not_ebike)})`} />
            <Row label={text.statusCantConfirm} value={`${fmt(e.by_status.cant_confirm)} (${share(e.by_status.cant_confirm)})`} />
            <Row label={text.statusNeedInfo} value={`${fmt(e.by_status.need_info)} (${share(e.by_status.need_info)})`} />
          </tbody>
        </table>
        {accuracy.tests ? <p>{text.testSuite(accuracy.tests.passed, accuracy.tests.total)}</p> : null}
        <p className="meta">{text.engineCaveat}</p>
      </section>

      {bl ? (
        <section className="card space-y-4">
          <h2 className="card-title">{text.blTitle}</h2>
          <p className="help">{text.blCases(fmt(bl.cases), fmt(bl.bottom_lines ?? bl.cases))}</p>
          <table className="table">
            <tbody>
              <Row label={text.blFalseYes} value={fmt(bl.false_yes)} strong />
              {bl.unchecked_yes !== undefined ? <Row label={text.blUncheckedYes} value={fmt(bl.unchecked_yes)} strong /> : null}
              <Row label={text.blMissedYes} value={fmt(bl.missed_yes)} />
              {bl.false_illegal !== undefined ? <Row label={text.blFalseIllegal} value={fmt(bl.false_illegal)} /> : null}
              {bl.missed_illegal !== undefined ? <Row label={text.blMissedIllegal} value={fmt(bl.missed_illegal)} /> : null}
              <Row label={text.blMissingCaveat} value={fmt(bl.missing_caveat)} />
              {bl.hedged !== undefined ? <Row label={text.hedged} value={fmt(bl.hedged)} /> : null}
              {bl.card_yes_under_no !== undefined ? <Row label={text.blCardYesUnderNo} value={fmt(bl.card_yes_under_no)} strong /> : null}
              <Row label={text.blYes} value={fmt(bl.by_kind.yes)} />
              <Row label={text.blNoIllegal} value={fmt(bl.by_kind.no_illegal)} />
              <Row label={text.blNoUnconfirmed} value={fmt(bl.by_kind.no_unconfirmed)} />
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="card space-y-4">
        <h2 className="card-title">{text.pilotTitle}</h2>
        <table className="table">
          <tbody>
            {clip ? <Row label={text.pilotPedalLess} value={verdict(clip.pedal_less_all_caught)} /> : null}
            {clip ? <Row label={text.pilotPedalCall} value={verdict(clip.pedal_call_overall)} /> : null}
            {ocr ? <Row label={text.pilotInvented} value={`${of(ocr.invented, ocr.photos)}, ${ocr.pass ? text.pass : text.fail}`} /> : null}
            <Row label={text.pilotListings} value={accuracy.pilot.listings ? text.seeResults : text.pending} />
            <Row label={text.pilotLabels} value={accuracy.pilot.labels ? text.seeResults : text.pending} />
          </tbody>
        </table>
        <p className="help">{text.pilotBody}</p>
      </section>

      {features ? (
        <section className="card space-y-4">
          <h2 className="card-title">{text.featuresTitle}</h2>
          <p className="help">{text.featuresIntro(fmt(features.districts.districts))}</p>
          <table className="table">
            <tbody>
              <Row label={text.districtOther} value={fmt(features.districts.other_checked)} strong />
              <Row label={text.modsBeyond} value={fmt(features.mods.yes_beyond_source)} strong />
              <Row label={text.modsUnanswered} value={fmt(features.mods.yes_unanswered)} />
              <Row label={text.modsClaims} value={fmt(features.mods.claims_not_in_data)} />
              {features.mods.rides ? <Row label={text.modsEngine} value={fmt(features.mods.rides.yes_engine_not_yes + features.mods.rides.yes_unsettled)} strong /> : null}
              {features.mods.rides ? <Row label={text.modsCaChanged} value={fmt(features.mods.rides.ca_changed + features.mods.rides.ca_digest_changed)} /> : null}
              <Row label={text.finderRefuses} value={fmt(features.finder.yes_engine_refuses)} strong />
              <Row label={text.finderPedals} value={fmt(features.finder.yes_without_pedals)} />
              <Row label={text.finderBeforeChecked} value={fmt(features.finder.yes_before_checked)} strong />
            </tbody>
          </table>
        </section>
      ) : null}

      {v2 ? (
        <section className="card space-y-4">
          <h2 className="card-title">{text.v2Title}</h2>
          <p className="help">{text.v2Intro}</p>
          <table className="table">
            <tbody>
              <Row label={text.noPedalMachines} value={verdict(v2.bars.no_pedal_machines)} />
              <Row label={text.pedalCall22} value={verdict(v2.bars.pedal_call_overall)} />
              <Row label={text.inventedFacts} value={verdict(v2.bars.invented_facts)} />
              <Row label={text.hardCases} value={of(v2.breakdown.hard_cases.right, v2.breakdown.hard_cases.of)} />
              <Row label={text.realWorld} value={of(v2.breakdown.real_world.right, v2.breakdown.real_world.of)} />
            </tbody>
          </table>
          <p className="help">{v2.pass ? text.v2Pass : v3?.pass ? text.v2FailThenV3 : text.v2Fail}</p>
        </section>
      ) : null}

      {v3 ? (
        <section className="card space-y-4">
          <h2 className="card-title">{text.v3Title}</h2>
          <p className="help">{text.v3Intro}</p>
          <table className="table">
            <tbody>
              <Row label={text.noPedalMachines} value={verdict(v3.bars.no_pedal_machines)} />
              <Row label={text.pedalCall22} value={verdict(v3.bars.pedal_call_overall)} />
              <Row label={text.inventedFacts} value={verdict(v3.bars.invented_facts)} />
              <Row label={text.hardCases} value={of(v3.breakdown.hard_cases.right, v3.breakdown.hard_cases.of)} />
              <Row label={text.realWorld} value={of(v3.breakdown.real_world.right, v3.breakdown.real_world.of)} />
            </tbody>
          </table>
          <p className="help">{v3.pass ? text.v3Pass : text.v3Fail}</p>
        </section>
      ) : null}
    </main>
  );
}
