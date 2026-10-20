// Text for the "How accurate is it?" page in English and Spanish. Spanish needs a check by a fluent speaker.

import type { Lang } from "./names";

export interface AccuracyText {
  metaTitle: string;
  metaDescription: string;
  back: string;
  title: string;
  /** Before and after the RESULTS.md file name. */
  introBefore: string;
  introAfter: (date: string) => string;
  engineTitle: string;
  engineCases: (cases: string, places: number) => string;
  falseLegal: string;
  missedYes: string;
  statusYes: string;
  statusNo: string;
  statusNotEbike: string;
  statusCantConfirm: string;
  statusNeedInfo: string;
  testSuite: (passed: number, total: number) => string;
  engineCaveat: string;
  blTitle: string;
  blCases: (cases: string, bottomLines: string) => string;
  blFalseYes: string;
  blMissedYes: string;
  blFalseIllegal: string;
  blMissedIllegal: string;
  blMissingCaveat: string;
  blUncheckedYes: string;
  blYes: string;
  blNoIllegal: string;
  blNoUnconfirmed: string;
  /** Rendered cards and announcements whose answer is not a plain YES or NO. */
  hedged: string;
  pilotTitle: string;
  pilotPedalLess: string;
  pilotPedalCall: string;
  pilotInvented: string;
  pilotListings: string;
  pilotLabels: string;
  seeResults: string;
  pending: string;
  pass: string;
  fail: string;
  pilotBody: string;
  v2Title: string;
  v2Intro: string;
  noPedalMachines: string;
  pedalCall22: string;
  inventedFacts: string;
  hardCases: string;
  realWorld: string;
  v2Pass: string;
  v2FailThenV3: string;
  v2Fail: string;
  v3Title: string;
  v3Intro: string;
  v3Pass: string;
  v3Fail: string;
}

const en: AccuracyText = {
  metaTitle: "How accurate is it? | Is it an e-bike?",
  metaDescription: "Test results for the Is it an e-bike? rules engine and pilot.",
  back: "Back to the checker",
  title: "How accurate is it?",
  introBefore: "The costly mistake is calling a bike legal when it isn't. Everything here is measured against that. Numbers come from",
  introAfter: (date) => `in the code, updated ${date}.`,
  engineTitle: "Rules engine",
  engineCases: (cases, places) =>
    `${cases} generated cases across all 50 states, DC and ${places} San Diego places. Each one is checked against an independent reading of the rules table.`,
  falseLegal: "False legal results",
  missedYes: "Refused when the table allows it",
  statusYes: "YES",
  statusNo: "NO, rider not allowed",
  statusNotEbike: "NO, not an e-bike",
  statusCantConfirm: "NO, can't confirm it's legal",
  statusNeedInfo: "NO until a follow-up question is answered",
  testSuite: (passed, total) => `Test suite: ${passed} of ${total} tests passed.`,
  engineCaveat:
    "These tests prove the engine matches the rules table, not that the table matches the law. The table was checked against statute text on Oct 16, 2026. San Diego city and county rules were checked against enacted code and ordinance text on Oct 19 and Oct 20, 2026. SDUHSD's class, tag, course, walk-on-campus, passenger-seat and e-moto rules come only from the district's web page.",
  blTitle: "Bottom line YES or NO",
  blCases: (cases, bottomLines) =>
    `${cases} generated rides, including every San Diego place alone, all together and none, with and without "Somewhere else", and bikes with unknown pedals, an unknown class or more than one class. Each ride runs four ways, typed in, and read from a link or photo with no fact checked, every fact ticked and then one changed and put back to the value read, or every fact checked, ${bottomLines} answers in all. YES needs every card allowed, every question answered, every rule read in enacted text, a ride date no more than 30 days after the rules were checked, and every fact read from a link or photo checked against the bike. The YES and NO counts below are for facts typed in.`,
  blFalseYes: "False YES",
  blMissedYes: "Refused when every card allows it",
  blFalseIllegal: "Called not allowed when the checker finds no rule against it",
  blMissedIllegal: "A rule says no, but the answer isn't NO, not allowed",
  blMissingCaveat: "Unchecked places not named on the card",
  blUncheckedYes: "YES while a fact read from a link or photo is unchecked",
  blYes: "YES",
  blNoIllegal: "NO, not allowed",
  blNoUnconfirmed: "NO, can't confirm it's legal",
  hedged: "Answer shown as anything but a plain YES or NO",
  pilotTitle: "Pilot, with bars set before the run",
  pilotPedalLess: "Pedal-less e-motos caught (12 photos)",
  pilotPedalCall: "Pedal call, need 11 of 12",
  pilotInvented: "Invented facts from photos",
  pilotListings: "20 store listings",
  pilotLabels: "Bike shop label photos",
  seeResults: "see RESULTS.md",
  pending: "pending",
  pass: "pass",
  fail: "fail",
  pilotBody:
    "A free CLIP model caught every pedal-less e-moto but called four real e-bikes pedal-less, mostly moto-styled ones. That missed the bar, so whole-bike photos were cut. The app reads class labels and listings instead.",
  v2Title: "Photo pilot, second try",
  v2Intro: "A method that checks zoomed tiles of the lower bike was built on 47 photos, then run once on 24 fresh photos it had never seen.",
  noPedalMachines: "No-pedal machines caught, need 12 of 12",
  pedalCall22: "Pedal call, need 22 of 24",
  inventedFacts: "Invented facts",
  hardCases: "Hard cases (moto-styled and similar)",
  realWorld: "Real-world photos",
  v2Pass: "It passed, so whole-bike photos sort pedals from no pedals. They never give a legal answer on their own.",
  v2FailThenV3: "It failed too, so whole-bike photos stayed cut until the third try below.",
  v2Fail:
    "It failed too, so whole-bike photos stay cut. A photo of the whole bike can't reliably show pedals on a moto-styled e-bike, and a kids' balance bike can look like an e-bike.",
  v3Title: "Photo pilot, third try",
  v3Intro:
    "A free detector called OWLv2 looks for a chain and for a bicycle or a motorcycle, with one fixed rule. The rule was picked on 71 photos, then run once on 24 fresh photos it had never seen. The expected result, written down before the run, was 88.7%.",
  v3Pass:
    "It passed, so the app offers an optional photo check that looks for pedals. It loads only when tapped, asks you when the photo is a close call, and never decides if a bike is legal. One test of 24 photos can't pin accuracy down closely, so expect it to be right about nine times in ten.",
  v3Fail: "It failed too, so whole-bike photos stay cut.",
};

const es: AccuracyText = {
  metaTitle: "¿Qué tan preciso es? | ¿Es una bicicleta eléctrica?",
  metaDescription: "Resultados de las pruebas del motor de reglas y del piloto de ¿Es una bicicleta eléctrica?",
  back: "Volver al revisor",
  title: "¿Qué tan preciso es?",
  introBefore:
    "El error costoso es decir que una bicicleta es legal cuando no lo es. Todo lo de aquí se mide contra eso. Los números vienen de",
  introAfter: (date) => `en el código, actualizado el ${date}.`,
  engineTitle: "Motor de reglas",
  engineCases: (cases, places) =>
    `${cases} casos generados en los 50 estados, el Distrito de Columbia y ${places} lugares de San Diego. Cada uno se compara con una lectura independiente de la tabla de reglas.`,
  falseLegal: "Resultados legales falsos",
  missedYes: "Rechazados cuando la tabla lo permite",
  statusYes: "SÍ",
  statusNo: "NO, la persona no puede usarla",
  statusNotEbike: "NO, no es una bicicleta eléctrica",
  statusCantConfirm: "NO, no podemos confirmar que sea legal",
  statusNeedInfo: "NO hasta responder una pregunta más",
  testSuite: (passed, total) => `Pruebas: pasaron ${passed} de ${total}.`,
  engineCaveat:
    "Estas pruebas demuestran que el motor coincide con la tabla de reglas, no que la tabla coincida con la ley. La tabla se revisó contra el texto de la ley el 16 de octubre de 2026. Las reglas de las ciudades y del condado de San Diego se revisaron contra el texto vigente de sus códigos y ordenanzas el 19 y el 20 de octubre de 2026. Las reglas de SDUHSD de clase, etiqueta, curso, caminar con la bicicleta en la escuela, asiento de pasajero y motos eléctricas vienen solo de la página web del distrito.",
  blTitle: "En resumen, SÍ o NO",
  blCases: (cases, bottomLines) =>
    `${cases} viajes generados, con cada lugar de San Diego solo, todos juntos y ninguno, con y sin "Otro lugar", y con bicicletas de pedales desconocidos, de clase desconocida o de más de una clase. Cada viaje se prueba de cuatro maneras, con los datos escritos a mano, y leídos de un enlace o una foto sin ningún dato revisado, con todos marcados y luego uno cambiado y vuelto a lo que se leyó, o con todos revisados, ${bottomLines} respuestas en total. El SÍ exige que todas las tarjetas lo permitan, que todas las preguntas tengan respuesta, que cada regla se haya leído en un texto vigente, que el viaje sea a más tardar 30 días después de la revisión de las reglas, y que cada dato leído de un enlace o una foto se haya comparado con la bicicleta. Los conteos de SÍ y NO de abajo son con los datos escritos a mano.`,
  blFalseYes: "SÍ falsos",
  blMissedYes: "Rechazados cuando todas las tarjetas lo permiten",
  blFalseIllegal: "Dice no permitida cuando el verificador no encuentra ninguna regla en contra",
  blMissedIllegal: "Una regla dice que no, pero la respuesta no es NO, no permitida",
  blMissingCaveat: "Lugares sin revisar que la tarjeta no menciona",
  blUncheckedYes: "SÍ con un dato leído de un enlace o una foto sin revisar",
  blYes: "SÍ",
  blNoIllegal: "NO, no permitida",
  blNoUnconfirmed: "NO, no podemos confirmar que sea legal",
  hedged: "Respuesta que no es un SÍ o un NO claro",
  pilotTitle: "Piloto, con metas fijadas antes de la prueba",
  pilotPedalLess: "Motos eléctricas sin pedales detectadas (12 fotos)",
  pilotPedalCall: "Acierto en pedales, meta 11 de 12",
  pilotInvented: "Datos inventados a partir de fotos",
  pilotListings: "20 anuncios de tiendas",
  pilotLabels: "Fotos de etiquetas en tiendas de bicicletas",
  seeResults: "ver RESULTS.md",
  pending: "pendiente",
  pass: "cumple",
  fail: "no cumple",
  pilotBody:
    "Un modelo CLIP gratuito detectó todas las motos eléctricas sin pedales, pero dijo que cuatro bicicletas eléctricas reales no tenían pedales, casi todas con estilo de moto. Eso no alcanzó la meta, así que se quitaron las fotos de la bicicleta completa. La app lee las etiquetas de clase y los anuncios.",
  v2Title: "Piloto de fotos, segundo intento",
  v2Intro:
    "Un método que revisa partes ampliadas de la zona baja de la bicicleta se armó con 47 fotos y luego se probó una sola vez con 24 fotos nuevas que nunca había visto.",
  noPedalMachines: "Máquinas sin pedales detectadas, meta 12 de 12",
  pedalCall22: "Acierto en pedales, meta 22 de 24",
  inventedFacts: "Datos inventados",
  hardCases: "Casos difíciles (con estilo de moto y parecidos)",
  realWorld: "Fotos del mundo real",
  v2Pass: "Cumplió, así que las fotos de la bicicleta completa separan con pedales de sin pedales. Nunca dan una respuesta legal por sí solas.",
  v2FailThenV3: "Tampoco cumplió, así que las fotos de la bicicleta completa siguieron fuera hasta el tercer intento de abajo.",
  v2Fail:
    "Tampoco cumplió, así que las fotos de la bicicleta completa siguen fuera. Una foto de la bicicleta completa no muestra con seguridad los pedales de una bicicleta eléctrica con estilo de moto, y una bicicleta de equilibrio para niños puede parecer eléctrica.",
  v3Title: "Piloto de fotos, tercer intento",
  v3Intro:
    "Un detector gratuito llamado OWLv2 busca una cadena y una bicicleta o una motocicleta, con una sola regla fija. La regla se eligió con 71 fotos y luego se probó una sola vez con 24 fotos nuevas que nunca había visto. El resultado esperado, anotado antes de la prueba, era 88.7%.",
  v3Pass:
    "Cumplió, así que la app ofrece una revisión opcional de la foto que busca pedales. Solo se carga si la tocas, te pregunta cuando la foto no es clara y nunca decide si una bicicleta es legal. Una prueba de 24 fotos no fija la precisión con exactitud, así que espera que acierte unas nueve de cada diez veces.",
  v3Fail: "Tampoco cumplió, así que las fotos de la bicicleta completa siguen fuera.",
};

export const ACCURACY_TEXT: Record<Lang, AccuracyText> = { en, es };

/** "9 of 12" becomes "9 de 12" and "0 of 24 photos" becomes "0 de 24 fotos" in Spanish. Other text stays as written. */
export function localizeResult(result: string, lang: Lang): string {
  if (lang === "en") return result;
  const m = /^(\d+) of (\d+)( photos)?$/.exec(result);
  return m ? `${m[1]} de ${m[2]}${m[3] ? " fotos" : ""}` : result;
}
