import type { Metadata } from "next";
import Link from "next/link";
import accuracy from "@/data/results/accuracy.json";

export const metadata: Metadata = {
  title: "How accurate is it? | Is it an e-bike?",
  description: "Test results for the Is it an e-bike? rules engine and pilot.",
};

type Bar = { bar: string; result: string; pass: boolean };

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

export default function AccuracyPage() {
  const e = accuracy.engine;
  const fmt = (n: number) => n.toLocaleString("en-US");
  const share = (n: number) => `${((100 * n) / e.cases).toFixed(1)}%`;
  const clip = accuracy.pilot.photos_clip as Record<string, Bar> | null;
  const ocr = accuracy.pilot.photos_ocr as { photos: number; invented: number; pass: boolean } | null;
  const v2 = (accuracy.pilot as { photos_v2?: { pass: boolean; bars: Record<string, Bar>; breakdown: Record<string, { right: number; of: number }> } | null }).photos_v2 ?? null;
  const v3 = (accuracy.pilot as { photos_v3?: { pass: boolean; bars: Record<string, Bar>; breakdown: { hard_cases: { right: number; of: number }; real_world: { right: number; of: number }; mean_ms: number | null } } | null }).photos_v3 ?? null;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-5 px-4 py-6">
      <Link href="/" className="text-sm underline">
        Back to the checker
      </Link>
      <h1 className="text-2xl font-extrabold">How accurate is it?</h1>
      <p>
        The costly mistake is calling a bike legal when it isn&apos;t. Everything here is measured against that. Numbers come from{" "}
        <code>RESULTS.md</code> in the code, updated {new Date(accuracy.generated_at).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}.
      </p>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Rules engine</h2>
        <p className="text-sm text-muted">
          {fmt(e.cases)} generated cases across all 50 states, DC and {e.san_diego_places} San Diego places. Each one is checked against an
          independent reading of the rules table.
        </p>
        <table className="w-full text-sm">
          <tbody>
            <Row label="False legal results" value={fmt(e.false_legal)} strong />
            <Row label="Refused when the table allows it" value={fmt(e.missed_yes)} />
            <Row label="Yes" value={`${fmt(e.by_status.yes)} (${share(e.by_status.yes)})`} />
            <Row label="No, rider not allowed" value={`${fmt(e.by_status.no)} (${share(e.by_status.no)})`} />
            <Row label="Not an e-bike" value={`${fmt(e.by_status.not_ebike)} (${share(e.by_status.not_ebike)})`} />
            <Row label="Can't confirm" value={`${fmt(e.by_status.cant_confirm)} (${share(e.by_status.cant_confirm)})`} />
            <Row label="Asks a follow-up question" value={`${fmt(e.by_status.need_info)} (${share(e.by_status.need_info)})`} />
          </tbody>
        </table>
        {accuracy.tests ? (
          <p className="text-sm">
            Test suite: {accuracy.tests.passed} of {accuracy.tests.total} tests passed.
          </p>
        ) : null}
        <p className="text-sm text-muted">
          These tests prove the engine matches the rules table, not that the table matches the law. The table was checked against
          statute text on Oct 16, 2026. San Diego rules come from city and district pages.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Pilot, with bars set before the run</h2>
        <table className="w-full text-sm">
          <tbody>
            {clip ? <Row label="Pedal-less e-motos caught (12 photos)" value={`${clip.pedal_less_all_caught.result}, ${clip.pedal_less_all_caught.pass ? "pass" : "fail"}`} /> : null}
            {clip ? <Row label="Pedal call, need 11 of 12" value={`${clip.pedal_call_overall.result}, ${clip.pedal_call_overall.pass ? "pass" : "fail"}`} /> : null}
            {ocr ? <Row label="Invented facts from photos" value={`${ocr.invented} of ${ocr.photos}, ${ocr.pass ? "pass" : "fail"}`} /> : null}
            <Row label="20 store listings" value={accuracy.pilot.listings ? "see RESULTS.md" : "pending"} />
            <Row label="Bike shop label photos" value={accuracy.pilot.labels ? "see RESULTS.md" : "pending"} />
          </tbody>
        </table>
        <p className="text-sm">
          A free CLIP model caught every pedal-less e-moto but called four real e-bikes pedal-less, mostly moto-styled ones. That missed
          the bar, so whole-bike photos were cut. The app reads class labels and listings instead.
        </p>
      </section>

      {v2 ? (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">Photo pilot, second try</h2>
          <p className="text-sm text-muted">
            A method that checks zoomed tiles of the lower bike was built on 47 photos, then run once on 24 fresh photos it had never seen.
          </p>
          <table className="w-full text-sm">
            <tbody>
              <Row label="No-pedal machines caught, need 12 of 12" value={`${v2.bars.no_pedal_machines.result}, ${v2.bars.no_pedal_machines.pass ? "pass" : "fail"}`} />
              <Row label="Pedal call, need 22 of 24" value={`${v2.bars.pedal_call_overall.result}, ${v2.bars.pedal_call_overall.pass ? "pass" : "fail"}`} />
              <Row label="Invented facts" value={`${v2.bars.invented_facts.result}, ${v2.bars.invented_facts.pass ? "pass" : "fail"}`} />
              <Row label="Hard cases (moto-styled and similar)" value={`${v2.breakdown.hard_cases.right} of ${v2.breakdown.hard_cases.of}`} />
              <Row label="Real-world photos" value={`${v2.breakdown.real_world.right} of ${v2.breakdown.real_world.of}`} />
            </tbody>
          </table>
          <p className="text-sm">
            {v2.pass
              ? "It passed, so whole-bike photos sort pedals from no pedals. They never give a legal answer on their own."
              : v3?.pass
                ? "It failed too, so whole-bike photos stayed cut until the third try below."
                : "It failed too, so whole-bike photos stay cut. A photo of the whole bike can't reliably show pedals on a moto-styled e-bike, and a kids' balance bike can look like an e-bike."}
          </p>
        </section>
      ) : null}

      {v3 ? (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">Photo pilot, third try</h2>
          <p className="text-sm text-muted">
            A free detector called OWLv2 looks for a chain and for a bicycle or a motorcycle, with one fixed rule. The rule was picked on 71
            photos, then run once on 24 fresh photos it had never seen. The expected result, written down before the run, was 88.7%.
          </p>
          <table className="w-full text-sm">
            <tbody>
              <Row label="No-pedal machines caught, need 12 of 12" value={`${v3.bars.no_pedal_machines.result}, ${v3.bars.no_pedal_machines.pass ? "pass" : "fail"}`} />
              <Row label="Pedal call, need 22 of 24" value={`${v3.bars.pedal_call_overall.result}, ${v3.bars.pedal_call_overall.pass ? "pass" : "fail"}`} />
              <Row label="Invented facts" value={`${v3.bars.invented_facts.result}, ${v3.bars.invented_facts.pass ? "pass" : "fail"}`} />
              <Row label="Hard cases (moto-styled and similar)" value={`${v3.breakdown.hard_cases.right} of ${v3.breakdown.hard_cases.of}`} />
              <Row label="Real-world photos" value={`${v3.breakdown.real_world.right} of ${v3.breakdown.real_world.of}`} />
            </tbody>
          </table>
          <p className="text-sm">
            {v3.pass
              ? "It passed, so the app offers an optional photo check that looks for pedals. It loads only when tapped, asks you when the photo is a close call, and never decides if a bike is legal. One test of 24 photos can't pin accuracy down closely, so expect it to be right about nine times in ten."
              : "It failed too, so whole-bike photos stay cut."}
          </p>
        </section>
      ) : null}
    </main>
  );
}
