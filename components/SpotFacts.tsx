// What is known about one rack, shop or repair station: its name and kind, then its facts as a
// short definition list and an Open in Maps button. The map popup shows all of it, and the list
// under the map shows the facts under the picked row. Only facts that are there are shown, and a
// shop or repair shop says its details may be outdated.

import type { Lang } from "@/lib/i18n/names";
import { mapText, spotKindText } from "@/lib/i18n/map";
import { isBusiness, osmLink, type Spot } from "@/lib/map/osm";

interface Fact {
  key: string;
  label: string;
  value: React.ReactNode;
  /** Opening hours are written in OpenStreetMap's own English shorthand. */
  lang?: string;
}

function factsOf(spot: Spot, lang: Lang, distance?: string): Fact[] {
  const out: Fact[] = [];
  if (distance) out.push({ key: "d", label: mapText(lang, "distanceLabel"), value: distance });
  if (spot.capacity !== null) {
    out.push({ key: "c", label: mapText(lang, "capacityLabel"), value: spot.capacity === 1 ? mapText(lang, "bikesOne") : mapText(lang, "bikesMany", { n: spot.capacity }) });
  }
  if (spot.covered !== null) out.push({ key: "r", label: mapText(lang, "coverLabel"), value: mapText(lang, spot.covered ? "coveredYes" : "coveredNo") });
  if (spot.address) out.push({ key: "a", label: mapText(lang, "addressLabel"), value: spot.address });
  if (spot.repairs) out.push({ key: "f", label: mapText(lang, "repairsLabel"), value: mapText(lang, "repairsYes") });
  if (spot.hours) out.push({ key: "h", label: mapText(lang, "hours"), value: spot.hours, lang: "en" });
  if (spot.phone) out.push({ key: "p", label: mapText(lang, "phone"), value: <a href={`tel:${spot.phone.replace(/[^\d+]/g, "")}`}>{spot.phone}</a> });
  if (spot.website) {
    out.push({
      key: "w",
      label: mapText(lang, "website"),
      value: (
        <a href={spot.website} target="_blank" rel="noopener noreferrer nofollow" className="spot-web">
          {new URL(spot.website).hostname.replace(/^www\./, "")}
        </a>
      ),
    });
  }
  return out;
}

/** The spot's facts, its access warning and its Open in Maps button. */
export function SpotDetails({ spot, lang, distance }: { spot: Spot; lang: Lang; distance?: string }) {
  const facts = factsOf(spot, lang, distance);
  return (
    <>
      {facts.length > 0 ? (
        <dl className="spot-facts">
          {facts.map((f) => (
            <div key={f.key}>
              <dt>{f.label}</dt>
              <dd lang={f.lang}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {spot.restricted ? <p className="spot-warn">{mapText(lang, "restricted")}</p> : null}
      {isBusiness(spot) ? <p className="meta spot-note">{mapText(lang, "callAhead")}</p> : null}
      <a className="btn btn-quiet spot-open" href={osmLink(spot)} target="_blank" rel="noopener noreferrer">
        {mapText(lang, "openInMaps")}
      </a>
    </>
  );
}

/** The name a spot goes by: its own, or its kind when the mappers gave it none. */
export function spotTitle(spot: Spot, lang: Lang): string {
  return spot.name ?? spotKindText(lang, spot);
}

/** The popup: title, a kind chip when the title is a name, then the details. */
export function SpotCard({ spot, lang }: { spot: Spot; lang: Lang }) {
  return (
    <div className="spot-card" lang={lang}>
      <div className="spot-head">
        <p className="spot-name">{spotTitle(spot, lang)}</p>
        {spot.name ? <span className={`spot-type spot-type-${spot.kind}`}>{spotKindText(lang, spot)}</span> : null}
      </div>
      <SpotDetails spot={spot} lang={lang} />
    </div>
  );
}
