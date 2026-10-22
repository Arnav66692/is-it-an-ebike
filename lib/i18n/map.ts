// Words for the map of bike racks, bike shops and repair spots, in English and Spanish. Names,
// addresses, hours and phone numbers come from OpenStreetMap and Overture Maps as the sources wrote them.

import type { Spot, SpotCounts, SpotKind } from "@/lib/map/osm";
import type { Lang } from "./names";

const en = {
  metaTitle: "Bike racks and shops map | Is it an e-bike?",
  metaDescription: "Find bike racks to lock up an e-bike, bike shops and repair shops near you, from OpenStreetMap and Overture Maps.",
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
  emptyState: "Zoom in or pick a place to see racks and shops.",
  zoomToSearch: "Zoom in to search here.",
  searchArea: "Search this area",
  tryAgain: "Try again",
  recenter: "Back to the place you picked",
  recenterShort: "Recenter",
  mapControls: "Map controls",
  filterLabel: "Show on the map",
  chip_rack: "Racks",
  chip_shop: "Bike shops",
  chip_repair: "Repair",
  clusterTitle: "{n} places here. Select to zoom in.",
  loading: "Looking for racks and shops here.",
  rateLimited: "The free map data service is busy. Wait a minute, then try again.",
  failed: "The rack and shop data didn't load. Try again in a minute.",
  noneHere: "No racks, shops or repair stations are mapped here yet.",
  rackOne: "1 rack",
  rackMany: "{n} racks",
  shopOne: "1 bike shop",
  shopMany: "{n} bike shops",
  repairOne: "1 repair spot",
  repairMany: "{n} repair spots",
  inView: "{list} in view.",
  capped: "Showing the first {n} racks here. Zoom in to see them all.",
  kind_rack: "Bike rack",
  kind_shop: "Bike shop",
  kind_repair: "Bike repair",
  kind_stand: "Repair station",
  kind_repairShop: "Repair shop",
  capacityLabel: "Holds",
  bikesOne: "1 bike",
  bikesMany: "{n} bikes",
  coverLabel: "Cover",
  distanceLabel: "Distance",
  coveredYes: "Covered",
  coveredNo: "Not covered",
  restricted: "Private or for customers only. Check the signs.",
  hours: "Hours",
  phone: "Phone",
  website: "Website",
  addressLabel: "Address",
  repairsLabel: "Repairs",
  repairsYes: "Fixes bikes too",
  callAhead: "Shop details may be outdated, so call ahead.",
  openInMaps: "Open in Maps",
  nearestTitle: "Nearest to the middle of the map",
  nearestEmpty: "Nothing to list yet. Zoom in or pick a place.",
  dataNote: "Data from OpenStreetMap volunteers and Overture Maps. It can be incomplete or out of date, and some racks are private, so check signs and call shops ahead.",
  privacy: "The map loads saved racks and shops from this site. For an area with no saved file yet, it asks our own server for the area on screen, and our server asks OpenStreetMap's Overpass servers and mirrors. Place searches go to OpenStreetMap only when you ask, and nothing is stored beyond a cache of map areas.",
  aboutTitle: "About this map",
  about1: "Racks, public repair stations and some shops come from OpenStreetMap. More bike shops and repair shops come from Overture Maps, an open map data project. Saved areas answer at once from this site. Elsewhere our server asks the public Overpass servers and mirrors, only for the part of the map on screen.",
  about2: "Place search uses OpenStreetMap's Nominatim. Map tiles come from OpenStreetMap too. No accounts, no keys and no tracking.",
};

type MapKey = keyof typeof en;

const es: Record<MapKey, string> = {
  metaTitle: "Mapa de racks y tiendas de bicicletas | ¿Es una bicicleta eléctrica?",
  metaDescription: "Encuentra racks para dejar una bicicleta eléctrica, tiendas de bicicletas y talleres de reparación cerca de ti, con datos de OpenStreetMap y Overture Maps.",
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
  emptyState: "Acerca el mapa o busca un lugar para ver racks y tiendas.",
  zoomToSearch: "Acerca el mapa para buscar aquí.",
  searchArea: "Buscar en esta zona",
  tryAgain: "Intentar de nuevo",
  recenter: "Volver al lugar que elegiste",
  recenterShort: "Recentrar",
  mapControls: "Controles del mapa",
  filterLabel: "Mostrar en el mapa",
  chip_rack: "Racks",
  chip_shop: "Tiendas de bicicletas",
  chip_repair: "Reparación",
  clusterTitle: "{n} lugares aquí. Selecciona para acercar.",
  loading: "Buscando racks y tiendas aquí.",
  rateLimited: "El servicio gratis de datos del mapa está ocupado. Espera un minuto y vuelve a intentarlo.",
  failed: "Los datos de racks y tiendas no cargaron. Vuelve a intentarlo en un minuto.",
  noneHere: "Aún no hay racks, tiendas ni estaciones de reparación en el mapa aquí.",
  rackOne: "1 rack",
  rackMany: "{n} racks",
  shopOne: "1 tienda de bicicletas",
  shopMany: "{n} tiendas de bicicletas",
  repairOne: "1 lugar de reparación",
  repairMany: "{n} lugares de reparación",
  inView: "{list} a la vista.",
  capped: "Se muestran los primeros {n} racks aquí. Acerca el mapa para verlos todos.",
  kind_rack: "Rack de bicicletas",
  kind_shop: "Tienda de bicicletas",
  kind_repair: "Reparación de bicicletas",
  kind_stand: "Estación de reparación",
  kind_repairShop: "Taller de bicicletas",
  capacityLabel: "Capacidad",
  bikesOne: "1 bicicleta",
  bikesMany: "{n} bicicletas",
  coverLabel: "Techo",
  distanceLabel: "Distancia",
  coveredYes: "Techado",
  coveredNo: "Sin techo",
  restricted: "Privado o solo para clientes. Revisa los letreros.",
  hours: "Horario",
  phone: "Teléfono",
  website: "Sitio web",
  addressLabel: "Dirección",
  repairsLabel: "Reparaciones",
  repairsYes: "También repara bicicletas",
  callAhead: "Los datos de la tienda pueden estar desactualizados, así que llama antes de ir.",
  openInMaps: "Abrir en Mapas",
  nearestTitle: "Lo más cerca del centro del mapa",
  nearestEmpty: "Aún no hay nada que mostrar. Acerca el mapa o busca un lugar.",
  dataNote: "Datos de voluntarios de OpenStreetMap y de Overture Maps. Pueden estar incompletos o desactualizados, y algunos racks son privados, así que revisa los letreros y llama a las tiendas antes de ir.",
  privacy: "El mapa carga racks y tiendas guardados en este sitio. Para una zona que aún no tiene archivo guardado, le pide a nuestro propio servidor la zona en pantalla, y nuestro servidor se la pide a los servidores Overpass de OpenStreetMap y sus espejos. Las búsquedas de lugares van a OpenStreetMap solo cuando lo pides, y no se guarda nada aparte de una caché de zonas del mapa.",
  aboutTitle: "Sobre este mapa",
  about1: "Los racks, las estaciones públicas de reparación y algunas tiendas vienen de OpenStreetMap. Más tiendas y talleres de bicicletas vienen de Overture Maps, un proyecto abierto de datos de mapas. Las zonas guardadas responden al instante desde este sitio. En otras zonas, nuestro servidor se los pide a los servidores públicos de Overpass y sus espejos, solo para la parte del mapa en pantalla.",
  about2: "La búsqueda de lugares usa Nominatim de OpenStreetMap. Los mosaicos del mapa también vienen de OpenStreetMap. Sin cuentas, sin claves y sin rastreo.",
};

const TEXT: Record<Lang, Record<MapKey, string>> = { en, es };

export function mapText(lang: Lang, key: MapKey, params: Record<string, string | number> = {}): string {
  return TEXT[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export const kindText = (lang: Lang, kind: SpotKind) => mapText(lang, `kind_${kind}` as MapKey);

/** What one spot is: a rack, a bike shop, a repair shop or a public repair station. */
export function spotKindText(lang: Lang, spot: Spot): string {
  if (spot.kind !== "repair") return kindText(lang, spot.kind);
  return mapText(lang, spot.stand === false ? "kind_repairShop" : "kind_stand");
}

function counted(lang: Lang, n: number, one: MapKey, many: MapKey): string {
  return n === 1 ? mapText(lang, one) : mapText(lang, many, { n });
}

/** "38 racks, 4 bike shops in view.", with the repair spots only when there are some. */
export function mapCountLine(lang: Lang, counts: SpotCounts): string {
  const parts = [counted(lang, counts.rack, "rackOne", "rackMany"), counted(lang, counts.shop, "shopOne", "shopMany")];
  if (counts.repair > 0) parts.push(counted(lang, counts.repair, "repairOne", "repairMany"));
  return mapText(lang, "inView", { list: parts.join(", ") });
}

export const MAP_TEXT = TEXT;
