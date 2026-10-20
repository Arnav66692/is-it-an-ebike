import Link from "next/link";
import accuracy from "@/data/results/accuracy.json";
import { ACCURACY_TEXT, localizeResult } from "@/lib/i18n/accuracy";
import type { Lang } from "@/lib/i18n/names";

type Bar = { bar: string; result: string; pass: boolean };

interface BottomLineResults {
  cases: number;
  by_kind: { yes: number; no_illegal: number; no_unconfirmed: number };
  false_yes: number;
  missed_yes: number;
  false_illegal?: number;
  missed_illegal?: number;
  missing_caveat: number;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-2 pr-3 text-left font-normal">
        {label}
      </th>
      <td className={`py-2 text-right ${strong ? "text-lg font-bold" : ""}`}>{value}</td>
    </tr>
  );
}

/** The accuracy page, in English or Spanish. Every number comes from data/results/accuracy.json. */
export function AccuracyView({ lang }: { lang: Lang }) {
  const text = ACCURACY_TEXT[lang];
  const locale = lang === "es" ? "es-US" : "en-US";
  const e = accuracy.engine;
  const bl = (accuracy as { bottom_line?: BottomLineResults }).bottom_line ?? null;
  const fmt = (n: number) => n.toLocaleString(locale);
  const share = (n: number) => `${((100 * n) / e.cases).toFixed(1)}%`;
  const verdict = (bar: Bar) => `${localizeResult(bar.result, lang)}, ${bar.pass ? text.pass : text.fail}`;
  const of = (right: number, total: number) => localizeResult(`${right} of ${total}`, lang);
  const clip = accuracy.pilot.photos_clip as Record<string, Bar> | null;
  const ocr = accuracy.pilot.photos_ocr as { photos: number; invented: number; pass: boolean } | null;
  const v2 = (accuracy.pilot as { photos_v2?: { pass: boolean; bars: Record<string, Bar>; breakdown: Record<string, { right: number; of: number }> } | null }).photos_v2 ?? null;
  const v3 = (accuracy.pilot as { photos_v3?: { pass: boolean; bars: Record<string, Bar>; breakdown: { hard_cases: { right: number; of: number }; real_world: { right: number; of: number }; mean_ms: number | null } } | null }).photos_v3 ?? null;
  const updated = new Date(accuracy.generated_at).toLocaleDateString(locale, { timeZone: "America/Los_Angeles" });

  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-5 px-4 py-6" lang={lang}>
      <Link href={lang === "es" ? "/?lang=es" : "/"} className="text-sm underline">
        {text.back}
      </Link>
      <h1 className="text-2xl font-extrabold">{text.title}</h1>
      <p>
        {text.introBefore} <code>RESULTS.md</code> {text.introAfter(updated)}
      </p>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">{text.engineTitle}</h2>
        <p className="text-sm text-muted">{text.engineCases(fmt(e.cases), e.san_diego_places)}</p>
        <table className="w-full text-sm">
          <tbody>
            <Row label={text.falseLegal} value={fmt(e.false_legal)} strong />
            <Row label={text.missedYes} value={fmt(e.missed_yes)} />
            <Row label={text.statusYes} value={`${fmt(e.by_status.yes)} (${share(e.by_status.yes)})`} />
            <Row label={text.statusNo} value={`${fmt(e.by_status.no)} (${share(e.by_status.no)})`} />
            <Row label={text.statusNotEbike} value={`${fmt(e.by_status.not_ebike)} (${share(e.by_status.not_ebike)})`} />
            <Row label={text.statusCantConfirm} value={`${fmt(e.by_status.cant_confirm)} (${share(e.by_status.cant_confirm)})`} />
            <Row label={text.statusNeedInfo} value={`${fmt(e.by_status.need_info)} (${share(e.by_status.need_info)})`} />
          </tbody>
        </table>
        {accuracy.tests ? <p className="text-sm">{text.testSuite(accuracy.tests.passed, accuracy.tests.total)}</p> : null}
        <p className="text-sm text-muted">{text.engineCaveat}</p>
      </section>

      {bl ? (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">{text.blTitle}</h2>
          <p className="text-sm text-muted">{text.blCases(fmt(bl.cases))}</p>
          <table className="w-full text-sm">
            <tbody>
              <Row label={text.blFalseYes} value={fmt(bl.false_yes)} strong />
              <Row label={text.blMissedYes} value={fmt(bl.missed_yes)} />
              {bl.false_illegal !== undefined ? <Row label={text.blFalseIllegal} value={fmt(bl.false_illegal)} /> : null}
              {bl.missed_illegal !== undefined ? <Row label={text.blMissedIllegal} value={fmt(bl.missed_illegal)} /> : null}
              <Row label={text.blMissingCaveat} value={fmt(bl.missing_caveat)} />
              <Row label={text.blYes} value={fmt(bl.by_kind.yes)} />
              <Row label={text.blNoIllegal} value={fmt(bl.by_kind.no_illegal)} />
              <Row label={text.blNoUnconfirmed} value={fmt(bl.by_kind.no_unconfirmed)} />
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">{text.pilotTitle}</h2>
        <table className="w-full text-sm">
          <tbody>
            {clip ? <Row label={text.pilotPedalLess} value={verdict(clip.pedal_less_all_caught)} /> : null}
            {clip ? <Row label={text.pilotPedalCall} value={verdict(clip.pedal_call_overall)} /> : null}
            {ocr ? <Row label={text.pilotInvented} value={`${of(ocr.invented, ocr.photos)}, ${ocr.pass ? text.pass : text.fail}`} /> : null}
            <Row label={text.pilotListings} value={accuracy.pilot.listings ? text.seeResults : text.pending} />
            <Row label={text.pilotLabels} value={accuracy.pilot.labels ? text.seeResults : text.pending} />
          </tbody>
        </table>
        <p className="text-sm">{text.pilotBody}</p>
      </section>

      {v2 ? (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">{text.v2Title}</h2>
          <p className="text-sm text-muted">{text.v2Intro}</p>
          <table className="w-full text-sm">
            <tbody>
              <Row label={text.noPedalMachines} value={verdict(v2.bars.no_pedal_machines)} />
              <Row label={text.pedalCall22} value={verdict(v2.bars.pedal_call_overall)} />
              <Row label={text.inventedFacts} value={verdict(v2.bars.invented_facts)} />
              <Row label={text.hardCases} value={of(v2.breakdown.hard_cases.right, v2.breakdown.hard_cases.of)} />
              <Row label={text.realWorld} value={of(v2.breakdown.real_world.right, v2.breakdown.real_world.of)} />
            </tbody>
          </table>
          <p className="text-sm">{v2.pass ? text.v2Pass : v3?.pass ? text.v2FailThenV3 : text.v2Fail}</p>
        </section>
      ) : null}

      {v3 ? (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">{text.v3Title}</h2>
          <p className="text-sm text-muted">{text.v3Intro}</p>
          <table className="w-full text-sm">
            <tbody>
              <Row label={text.noPedalMachines} value={verdict(v3.bars.no_pedal_machines)} />
              <Row label={text.pedalCall22} value={verdict(v3.bars.pedal_call_overall)} />
              <Row label={text.inventedFacts} value={verdict(v3.bars.invented_facts)} />
              <Row label={text.hardCases} value={of(v3.breakdown.hard_cases.right, v3.breakdown.hard_cases.of)} />
              <Row label={text.realWorld} value={of(v3.breakdown.real_world.right, v3.breakdown.real_world.of)} />
            </tbody>
          </table>
          <p className="text-sm">{v3.pass ? text.v3Pass : text.v3Fail}</p>
        </section>
      ) : null}
    </main>
  );
}
