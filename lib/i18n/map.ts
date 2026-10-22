// Words for the map of bike racks, bike shops and repair stations, in English and Spanish. Names,
// hours and phone numbers come from OpenStreetMap as the mappers wrote them.

import type { SpotCounts, SpotKind } from "@/lib/map/osm";
import type { Lang } from "./names";

const en = {
  metaTitle: "Bike racks and shops map | Is it an e-bike?",
  metaDescription: "Find bike racks to lock up an e-bike, bike shops and repair stations near you, from OpenStreetMap.",
  title: "Racks and shops",
  tagline: "Where to lock up an e-bike, and where to get it fixed.",
  findLegend: "Where to look",
  placeLabel: "Find a place",
  placeHelp: "A city, address or ZIP code in the US.",
  placeGo: "Search",
  placeSearching: "Searching for {q}.",
  placeNone: "No place matches {q}. Try a city and state, like Austin, TX.",
  placeFailed: "The place search didn't work. Try again in a minute.",
  placeBusy: "The place search is busy. Wait a minute, then try again.",
  placeResults: "Places that match {q}",
  placeMoved: "Moved the map to {place}.",
  locate: "Use my location",
  locating: "Finding your location.",
  located: "Moved the map to your location.",
  locateDenied: "Location is off for this site. Search for a place instead.",
  locateFailed: "Couldn't find your location. Search for a place instead.",
  locateUnsupported: "This browser can't share a location. Search for a place instead.",
  mapLabel: "Map of bike racks, bike shops and repair stations. Arrow keys move the map, plus and minus zoom.",
  zoomIn: "Zoom in or pick a place to see bike racks and shops.",
  loading: "Looking for racks and shops here.",
  rateLimited: "The free map data service is busy. Wait a minute, then move the map a little to try again.",
  failed: "The rack and shop data didn't load. Move the map a little to try again.",
  noneHere: "No racks, shops or repair stations are mapped here yet.",
  rackOne: "1 rack",
  rackMany: "{n} racks",
  shopOne: "1 shop",
  shopMany: "{n} shops",
  repairOne: "1 repair station",
  repairMany: "{n} repair stations",
  inView: "{list} in view.",
  capped: "Showing the first {n} racks here. Zoom in to see them all.",
  legendTitle: "Map key",
  kind_rack: "Bike rack",
  kind_shop: "Bike shop",
  kind_repair: "Repair station",
  noName: "No name listed",
  capacityOne: "Holds 1 bike",
  capacityMany: "Holds {n} bikes",
  coveredYes: "Covered",
  coveredNo: "Not covered",
  restricted: "Private or for customers only. Check the signs.",
  hours: "Hours",
  phone: "Phone",
  website: "Website",
  openInMaps: "Open in Maps",
  showOnMap: "Show on map",
  nearestTitle: "Nearest to the middle of the map",
  nearestEmpty: "Nothing to list yet. Zoom in or pick a place.",
  nearestFrom: "{d} from the middle",
  dataNote: "Data from OpenStreetMap volunteers. It can be incomplete, and some racks are private, so check signs.",
  privacy: "Your location and searches go to OpenStreetMap services only when you ask, and nothing is stored.",
  aboutTitle: "About this map",
  about1: "Racks, shops and repair stations come from OpenStreetMap through the public Overpass API, only for the part of the map on screen.",
  about2: "Place search uses OpenStreetMap's Nominatim. Map tiles come from OpenStreetMap too. No accounts, no keys and no tracking.",
};

type MapKey = keyof typeof en;

const es: Record<MapKey, string> = {
  metaTitle: "Mapa de racks y tiendas de bicicletas | ¿Es una bicicleta eléctrica?",
  metaDescription: "Encuentra racks para dejar una bicicleta eléctrica, tiendas de bicicletas y estaciones de reparación cerca de ti, con datos de OpenStreetMap.",
  title: "Racks y tiendas",
  tagline: "Dónde dejar una bicicleta eléctrica con candado, y dónde repararla.",
  findLegend: "Dónde buscar",
  placeLabel: "Buscar un lugar",
  placeHelp: "Una ciudad, dirección o código postal en EE. UU.",
  placeGo: "Buscar",
  placeSearching: "Buscando {q}.",
  placeNone: "Ningún lugar coincide con {q}. Prueba una ciudad y estado, como Austin, TX.",
  placeFailed: "La búsqueda de lugares no funcionó. Inténtalo de nuevo en un minuto.",
  placeBusy: "La búsqueda de lugares está ocupada. Espera un minuto y vuelve a intentarlo.",
  placeResults: "Lugares que coinciden con {q}",
  placeMoved: "El mapa se movió a {place}.",
  locate: "Usar mi ubicación",
  locating: "Buscando tu ubicación.",
  located: "El mapa se movió a tu ubicación.",
  locateDenied: "La ubicación está desactivada para este sitio. Busca un lugar.",
  locateFailed: "No pudimos encontrar tu ubicación. Busca un lugar.",
  locateUnsupported: "Este navegador no puede compartir la ubicación. Busca un lugar.",
  mapLabel: "Mapa de racks, tiendas de bicicletas y estaciones de reparación. Las flechas mueven el mapa, más y menos cambian el zoom.",
  zoomIn: "Acerca el mapa o busca un lugar para ver racks y tiendas de bicicletas.",
  loading: "Buscando racks y tiendas aquí.",
  rateLimited: "El servicio gratis de datos del mapa está ocupado. Espera un minuto y mueve un poco el mapa para intentarlo de nuevo.",
  failed: "Los datos de racks y tiendas no cargaron. Mueve un poco el mapa para intentarlo de nuevo.",
  noneHere: "Aún no hay racks, tiendas ni estaciones de reparación en el mapa aquí.",
  rackOne: "1 rack",
  rackMany: "{n} racks",
  shopOne: "1 tienda",
  shopMany: "{n} tiendas",
  repairOne: "1 estación de reparación",
  repairMany: "{n} estaciones de reparación",
  inView: "{list} a la vista.",
  capped: "Se muestran los primeros {n} racks aquí. Acerca el mapa para verlos todos.",
  legendTitle: "Leyenda",
  kind_rack: "Rack de bicicletas",
  kind_shop: "Tienda de bicicletas",
  kind_repair: "Estación de reparación",
  noName: "Sin nombre",
  capacityOne: "Cabe 1 bicicleta",
  capacityMany: "Caben {n} bicicletas",
  coveredYes: "Techado",
  coveredNo: "Sin techo",
  restricted: "Privado o solo para clientes. Revisa los letreros.",
  hours: "Horario",
  phone: "Teléfono",
  website: "Sitio web",
  openInMaps: "Abrir en Mapas",
  showOnMap: "Ver en el mapa",
  nearestTitle: "Lo más cerca del centro del mapa",
  nearestEmpty: "Aún no hay nada que mostrar. Acerca el mapa o busca un lugar.",
  nearestFrom: "A {d} del centro",
  dataNote: "Datos de voluntarios de OpenStreetMap. Pueden estar incompletos, y algunos racks son privados, así que revisa los letreros.",
  privacy: "Tu ubicación y tus búsquedas van a los servicios de OpenStreetMap solo cuando lo pides, y no se guarda nada.",
  aboutTitle: "Sobre este mapa",
  about1: "Los racks, tiendas y estaciones de reparación vienen de OpenStreetMap por la API pública de Overpass, solo para la parte del mapa en pantalla.",
  about2: "La búsqueda de lugares usa Nominatim de OpenStreetMap. Los mosaicos del mapa también vienen de OpenStreetMap. Sin cuentas, sin claves y sin rastreo.",
};

const TEXT: Record<Lang, Record<MapKey, string>> = { en, es };

export function mapText(lang: Lang, key: MapKey, params: Record<string, string | number> = {}): string {
  return TEXT[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export const kindText = (lang: Lang, kind: SpotKind) => mapText(lang, `kind_${kind}` as MapKey);

function counted(lang: Lang, n: number, one: MapKey, many: MapKey): string {
  return n === 1 ? mapText(lang, one) : mapText(lang, many, { n });
}

/** "38 racks, 4 shops in view.", with the repair stations only when there are some. */
export function mapCountLine(lang: Lang, counts: SpotCounts): string {
  const parts = [counted(lang, counts.rack, "rackOne", "rackMany"), counted(lang, counts.shop, "shopOne", "shopMany")];
  if (counts.repair > 0) parts.push(counted(lang, counts.repair, "repairOne", "repairMany"));
  return mapText(lang, "inView", { list: parts.join(", ") });
}

export const MAP_TEXT = TEXT;
