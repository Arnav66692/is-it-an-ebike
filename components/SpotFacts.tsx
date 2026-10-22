// What is known about one rack, shop or repair station, shown in its map popup and in the list
// under the map. Only tags that are there are shown.

import type { Lang } from "@/lib/i18n/names";
import { kindText, mapText } from "@/lib/i18n/map";
import { osmLink, type Spot } from "@/lib/map/osm";

function facts(spot: Spot, lang: Lang): string[] {
  const out: string[] = [];
  if (spot.capacity !== null) out.push(spot.capacity === 1 ? mapText(lang, "capacityOne") : mapText(lang, "capacityMany", { n: spot.capacity }));
  if (spot.covered !== null) out.push(mapText(lang, spot.covered ? "coveredYes" : "coveredNo"));
  return out;
}

export function SpotFacts({ spot, lang, distance }: { spot: Spot; lang: Lang; distance?: string }) {
  const short = facts(spot, lang);
  return (
    <>
      <p className="spot-kind">{kindText(lang, spot.kind)}</p>
      <p className="spot-name">{spot.name ?? mapText(lang, "noName")}</p>
      {distance ? <p className="spot-line">{mapText(lang, "nearestFrom", { d: distance })}</p> : null}
      {short.length > 0 ? <p className="spot-line">{short.join(", ")}</p> : null}
      {spot.restricted ? <p className="spot-line spot-warn">{mapText(lang, "restricted")}</p> : null}
      {spot.hours || spot.phone || spot.website ? (
        <dl className="spot-tags">
          {spot.hours ? (
            <div>
              <dt>{mapText(lang, "hours")}</dt>
              <dd lang="en">{spot.hours}</dd>
            </div>
          ) : null}
          {spot.phone ? (
            <div>
              <dt>{mapText(lang, "phone")}</dt>
              <dd>
                <a href={`tel:${spot.phone.replace(/[^\d+]/g, "")}`}>{spot.phone}</a>
              </dd>
            </div>
          ) : null}
          {spot.website ? (
            <div>
              <dt>{mapText(lang, "website")}</dt>
              <dd>
                <a href={spot.website} target="_blank" rel="noopener noreferrer nofollow" className="spot-web">
                  {new URL(spot.website).hostname.replace(/^www\./, "")}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <a className="spot-open" href={osmLink(spot)} target="_blank" rel="noopener noreferrer">
        {mapText(lang, "openInMaps")}
      </a>
    </>
  );
}
