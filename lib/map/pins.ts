// The map's marks, drawn as inline SVG so no image file is loaded. Each kind has its own shape as
// well as its own color, so they tell apart without color: a square for a rack, a circle for a
// shop and a diamond for a repair station. The map tiles are light in both themes, so the marks
// use fixed colors with a white edge.

import type { SpotKind } from "./osm";

/** The box each mark sits in, which is also its tap area. */
export const PIN_SIZE = 44;

const RACK = "#2433ff";
const SHOP = "#0f0f0f";
const REPAIR = "#0f7a3a";

const shapes: Record<SpotKind, string> = {
  rack:
    `<rect x="13" y="13" width="18" height="18" fill="${RACK}" stroke="#fff" stroke-width="2"/>` +
    `<path d="M18 27v-6a4 4 0 0 1 8 0v6" fill="none" stroke="#fff" stroke-width="2"/>`,
  shop:
    `<circle cx="22" cy="22" r="11" fill="${SHOP}" stroke="#fff" stroke-width="2"/>` +
    `<path d="M16.5 20.5h11l-1.25-3.5h-8.5z M17.75 20.5v6h8.5v-6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`,
  repair:
    `<path d="M22 9l13 13-13 13L9 22z" fill="${REPAIR}" stroke="#fff" stroke-width="2"/>` +
    `<path d="M18.5 25.5l5-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>` +
    `<circle cx="24.75" cy="19.25" r="2.4" fill="none" stroke="#fff" stroke-width="1.8"/>`,
};

/** One kind's mark as an SVG string, for a Leaflet divIcon and the map key. Hidden from screen readers. */
export function pinSvg(kind: SpotKind): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_SIZE}" height="${PIN_SIZE}" viewBox="0 0 44 44" aria-hidden="true" focusable="false">${shapes[kind]}</svg>`;
}
