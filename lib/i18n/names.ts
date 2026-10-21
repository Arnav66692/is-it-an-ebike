// State and place names in English and Spanish.

import type { PlaceId } from "@/lib/rules/types";

export type Lang = "en" | "es";

const STATE_NAMES_ES: Record<string, string> = {
  DC: "Distrito de Columbia",
  HI: "Hawái",
  LA: "Luisiana",
  MI: "Míchigan",
  MN: "Minesota",
  MS: "Misisipi",
  MO: "Misuri",
  NJ: "Nueva Jersey",
  NM: "Nuevo México",
  NY: "Nueva York",
  NC: "Carolina del Norte",
  ND: "Dakota del Norte",
  OR: "Oregón",
  PA: "Pensilvania",
  SC: "Carolina del Sur",
  SD: "Dakota del Sur",
  TN: "Tennessee",
  VA: "Virginia",
  WV: "Virginia Occidental",
};

const STATE_NAMES_EN: Record<string, string> = {
  AK: "Alaska", AL: "Alabama", AR: "Arkansas", AZ: "Arizona", CA: "California", CO: "Colorado",
  CT: "Connecticut", DC: "Washington, DC", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  IA: "Iowa", ID: "Idaho", IL: "Illinois", IN: "Indiana", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  MA: "Massachusetts", MD: "Maryland", ME: "Maine", MI: "Michigan", MN: "Minnesota", MO: "Missouri",
  MS: "Mississippi", MT: "Montana", NC: "North Carolina", ND: "North Dakota", NE: "Nebraska",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NV: "Nevada", NY: "New York", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia", VT: "Vermont",
  WA: "Washington", WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming",
};

export function stateName(code: string, lang: Lang): string {
  if (lang === "es") return STATE_NAMES_ES[code] ?? STATE_NAMES_EN[code] ?? code;
  return STATE_NAMES_EN[code] ?? code;
}

/** Washington, DC is not a state, so its law is never called state law. */
const NOT_A_STATE = new Set(["DC"]);

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The name of the state's law. "title" heads a card, "inline" sits in a sentence and "list"
 * sits in a list of places. "California state law", "Washington, DC law", "la ley estatal de
 * California", "la ley del Distrito de Columbia".
 */
export function stateLaw(code: string, lang: Lang, form: "title" | "inline" | "list"): string {
  const name = stateName(code, lang);
  const district = NOT_A_STATE.has(code);
  if (lang === "en") return district ? `${name} law` : `${name} state law`;
  const base = district ? `ley del ${name}` : `ley estatal de ${name}`;
  if (form === "title") return capitalize(base);
  return form === "inline" ? `la ${base}` : base;
}

interface PlaceNames {
  en: string;
  es: string;
  hint: { en: string; es: string };
  /** In the middle of a sentence. */
  inline?: { en: string; es: string };
  /** In a list of places, when the standalone name starts with a capital that isn't a proper name. */
  list?: { en: string; es: string };
  /** Where a ride happens, when "in" plus the inline name doesn't read right: "on an SDUHSD campus". */
  where?: { en: string; es: string };
}

const PLACE_NAMES: Record<PlaceId, PlaceNames> = {
  city_of_san_diego: {
    en: "City of San Diego",
    es: "Ciudad de San Diego",
    inline: { en: "the City of San Diego", es: "la Ciudad de San Diego" },
    hint: { en: "Includes Carmel Valley, Pacific Highlands Ranch and the CCA area", es: "Incluye Carmel Valley, Pacific Highlands Ranch y la zona de CCA" },
  },
  carlsbad: { en: "Carlsbad", es: "Carlsbad", hint: { en: "", es: "" } },
  encinitas: { en: "Encinitas", es: "Encinitas", hint: { en: "", es: "" } },
  solana_beach: { en: "Solana Beach", es: "Solana Beach", hint: { en: "", es: "" } },
  del_mar: { en: "Del Mar", es: "Del Mar", hint: { en: "", es: "" } },
  unincorporated_san_diego_county: {
    en: "Unincorporated San Diego County",
    es: "Zona no incorporada del condado de San Diego",
    inline: { en: "unincorporated San Diego County", es: "la zona no incorporada del condado de San Diego" },
    list: { en: "unincorporated San Diego County", es: "zona no incorporada del condado de San Diego" },
    hint: { en: "Rancho Santa Fe, Fairbanks Ranch and similar", es: "Rancho Santa Fe, Fairbanks Ranch y zonas parecidas" },
  },
  sduhsd_campuses: {
    en: "An SDUHSD campus",
    es: "Una escuela de SDUHSD",
    inline: { en: "SDUHSD campus rules", es: "las reglas de las escuelas de SDUHSD" },
    list: { en: "an SDUHSD campus", es: "una escuela de SDUHSD" },
    where: { en: "on an SDUHSD campus", es: "en una escuela de SDUHSD" },
    hint: { en: "Canyon Crest Academy, Torrey Pines and the other district schools", es: "Canyon Crest Academy, Torrey Pines y las demás escuelas del distrito" },
  },
};

export function placeName(id: string, lang: Lang): string {
  const p = PLACE_NAMES[id as PlaceId];
  return p ? p[lang] : id;
}

/** The place name as it reads in the middle of a sentence. */
export function placeNameInline(id: string, lang: Lang): string {
  const p = PLACE_NAMES[id as PlaceId];
  if (!p) return id;
  return p.inline ? p.inline[lang] : p[lang];
}

/** The place name as an item in a list, for example the second item in "City of San Diego and an SDUHSD campus". */
export function placeNameInList(id: string, lang: Lang): string {
  const p = PLACE_NAMES[id as PlaceId];
  if (!p) return id;
  return p.list ? p.list[lang] : p[lang];
}

/**
 * Where a ride happens, to end a sentence like "We can't confirm it's legal in South Carolina."
 * "in California", "in Washington, DC", "en el Distrito de Columbia".
 */
export function stateWhere(code: string, lang: Lang): string {
  const name = stateName(code, lang);
  if (lang === "en") return `in ${name}`;
  return NOT_A_STATE.has(code) ? `en el ${name}` : `en ${name}`;
}

/** "of California", "de California", "del Distrito de Columbia". */
export function stateOf(code: string, lang: Lang): string {
  const name = stateName(code, lang);
  if (lang === "en") return `of ${name}`;
  return NOT_A_STATE.has(code) ? `del ${name}` : `de ${name}`;
}

/** "in the City of San Diego", "on an SDUHSD campus", "en la Ciudad de San Diego". */
export function placeWhere(id: string, lang: Lang): string {
  const p = PLACE_NAMES[id as PlaceId];
  if (!p) return lang === "es" ? `en ${id}` : `in ${id}`;
  if (p.where) return p.where[lang];
  return `${lang === "es" ? "en" : "in"} ${placeNameInline(id, lang)}`;
}

/** Where a card's answer holds: the state for a state card, the place for a local card. */
export function cardWhere(scope: "state" | "local", id: string, lang: Lang): string {
  return scope === "state" ? stateWhere(id, lang) : placeWhere(id, lang);
}

export function placeHint(id: PlaceId, lang: Lang): string {
  return PLACE_NAMES[id].hint[lang];
}

/** "a, b and c" or "a, b y c", with no comma before the last item. */
export function joinList(items: string[], lang: Lang): string {
  if (items.length <= 1) return items[0] ?? "";
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(", ")} ${lang === "es" ? "y" : "and"} ${last}`;
}

/**
 * A legal citation as the card shows it. Citation lists use semicolons, and the app writes with
 * periods and commas only, so "AS 28.90.990(a)(20); 13 AAC 40.010" shows as "AS 28.90.990(a)(20), 13 AAC 40.010".
 */
export function citationText(citation: string): string {
  return citation.replace(/\s*;\s*/g, ", ");
}

export function formatDate(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
    year: "numeric",
    month: lang === "es" ? "long" : "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
