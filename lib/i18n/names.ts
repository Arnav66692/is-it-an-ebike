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

const PLACE_NAMES: Record<PlaceId, { en: string; es: string; hint: { en: string; es: string } }> = {
  city_of_san_diego: {
    en: "City of San Diego",
    es: "Ciudad de San Diego",
    hint: { en: "Includes Carmel Valley, Pacific Highlands Ranch and the CCA area", es: "Incluye Carmel Valley, Pacific Highlands Ranch y la zona de CCA" },
  },
  carlsbad: { en: "Carlsbad", es: "Carlsbad", hint: { en: "", es: "" } },
  encinitas: { en: "Encinitas", es: "Encinitas", hint: { en: "", es: "" } },
  solana_beach: { en: "Solana Beach", es: "Solana Beach", hint: { en: "", es: "" } },
  del_mar: { en: "Del Mar", es: "Del Mar", hint: { en: "", es: "" } },
  unincorporated_san_diego_county: {
    en: "Unincorporated San Diego County",
    es: "Zona no incorporada del condado de San Diego",
    hint: { en: "Rancho Santa Fe, Fairbanks Ranch and similar", es: "Rancho Santa Fe, Fairbanks Ranch y zonas parecidas" },
  },
  sduhsd_campuses: {
    en: "An SDUHSD campus",
    es: "Una escuela de SDUHSD",
    hint: { en: "Canyon Crest Academy, Torrey Pines and the other district schools", es: "Canyon Crest Academy, Torrey Pines y las demás escuelas del distrito" },
  },
};

export function placeName(id: string, lang: Lang): string {
  const p = PLACE_NAMES[id as PlaceId];
  return p ? p[lang] : id;
}

export function placeHint(id: PlaceId, lang: Lang): string {
  return PLACE_NAMES[id].hint[lang];
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
