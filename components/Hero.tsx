// Pieces of the header band shared by the checker, its loading frame and the QR flyer: the title
// with its last word in a solid block, and the three short tags that say what the app covers.

import type { ReactNode } from "react";
import { titleParts } from "@/lib/i18n/ui";

/** The title's words, with the last one set in its own block: "Is it an [e-bike?]". */
export function TitleWords({ text }: { text: string }) {
  const [lead, key] = titleParts(text);
  return (
    <>
      {lead}
      <span className="hero-key">{key}</span>
    </>
  );
}

export type CoverKey = "coverStates" | "coverPlaces" | "coverDistricts" | "coverAccount";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
      {children}
    </svg>
  );
}

/** What the app covers, as short tags. `words` gives each tag's text in the page's language. */
export function Coverage({ words }: { words: (k: CoverKey) => ReactNode }) {
  return (
    <ul className="coverage" role="list">
      <li>
        <Icon>
          <path d="M1.75 3.75l4-1.5 4.5 1.5 4-1.5v10l-4 1.5-4.5-1.5-4 1.5z M5.75 2.25v10 M10.25 3.75v10" />
        </Icon>
        {words("coverStates")}
      </li>
      <li>
        <Icon>
          <path d="M8 14.25s4.75-4.2 4.75-7.75a4.75 4.75 0 0 0-9.5 0c0 3.55 4.75 7.75 4.75 7.75z" />
          <rect x="6.5" y="5" width="3" height="3" />
        </Icon>
        {words("coverPlaces")}
      </li>
      <li>
        <Icon>
          <path d="M1.75 6.25L8 2.75l6.25 3.5 M3.25 6.25v7.5h9.5v-7.5 M6.5 13.75v-3.5h3v3.5" />
        </Icon>
        {words("coverDistricts")}
      </li>
      <li>
        <Icon>
          <rect x="2.75" y="7.25" width="10.5" height="7" />
          <path d="M5.25 7.25V5a2.75 2.75 0 0 1 5.5 0v2.25" />
        </Icon>
        {words("coverAccount")}
      </li>
    </ul>
  );
}
