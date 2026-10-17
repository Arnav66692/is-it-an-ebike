// Every sentence a verdict card can show, in English and Spanish. The engine picks the
// code and the numbers. These templates are the only legal text in the app.

import type { Line, Status } from "@/lib/rules/types";
import { formatDate, placeName, type Lang } from "./names";

type Params = Record<string, string | number>;
interface Ctx {
  state: string;
  lang: Lang;
}
type Template = (p: Params, c: Ctx) => string;

const n = (v: string | number | undefined): string => String(v ?? "");
/** "an 11-year-old", "an 8-year-old", "a 12-year-old". */
const aAge = (age: string | number | undefined): string => {
  const a = Number(age);
  const an = a === 8 || a === 11 || a === 18 || (a >= 80 && a <= 89);
  return `${an ? "an" : "a"} ${n(age)}-year-old`;
};
const cls = (p: Params) => n(p.cls);

const EN: Record<string, Template> = {
  allowed: (p, c) =>
    p.multi
      ? `This bike can run as Class ${p.multi}. Allowed in every mode for ${aAge(p.age)} in ${c.state}.`
      : `Class ${cls(p)} e-bike. Allowed for ${aAge(p.age)} in ${c.state}.`,
  under_min_age: (p, c) =>
    Number(p.cls) > 0
      ? `Riders under ${p.minAge} can't ride a Class ${cls(p)} e-bike in ${c.state}.`
      : `Riders under ${p.minAge} can't ride an e-bike in ${c.state}.`,
  under_min_age_license: (p, c) =>
    `Riders under ${p.minAge} need a driver's license or permit to ride an e-bike in ${c.state}, so in practice they can't.`,
  no_any_class: () => "Not allowed as an e-bike for this rider, whatever its class turns out to be.",
  no_pedals: (_p, c) => `No working pedals, so it's not an e-bike in ${c.state}. The law treats it as a motor vehicle.`,
  no_pedals_unclear: (_p, c) => `${c.state}'s definition doesn't clearly require pedals, so we can't confirm a machine without them.`,
  pedals_unknown: () => "We need to know whether it has working pedals.",
  never_legal: (_p, c) => `We can't confirm any e-bike as legal in ${c.state}. Its law doesn't clearly cover e-bikes.`,
  facts_conflict: () => "Some facts disagree with each other. Check the speeds and modes you entered.",
  class_unknown: () => "We couldn't find the class. Look for the label near the pedals, or type the class in.",
  class_conflict_throttle: (p) => `A Class ${cls(p)} e-bike only helps while you pedal. A throttle means it fits no single class.`,
  class_conflict_speed: (p) => `A Class ${cls(p)} label and a ${p.mph} mph speed don't match.`,
  fits_no_class_speed: (p) => `${p.mph} mph is faster than any e-bike class allows. Class 3 tops out at 28 mph.`,
  fits_no_class_mode: () =>
    "It can go past 20 mph on the motor alone, or past 28 mph with pedaling, in some mode. That fits no e-bike class.",
  over_watts: (p, c) => `The motor is ${p.watts} W. ${c.state} allows ${Number(p.strict) ? "less than" : "up to"} ${p.cap} W.`,
  watts_750_strict: (p, c) => `${c.state}'s law says less than ${p.cap} W. A label of exactly ${p.cap} W doesn't clearly qualify.`,
  watts_peak_only: (p) => `Only a peak figure (${p.peak} W) is given. The rated watts on the label decide.`,
  watts_upper_only: (p) => `The listing says ${p.watts} W but not whether that's rated or peak. The label decides.`,
  watts_unknown: () => "We need the motor watts printed on the label.",
  hp_cap_unclear: (p, c) => `${c.state} caps the motor at ${p.hp} horsepower. This motor is too close to that line to confirm.`,
  vt_motor_assisted_bicycle: (p) =>
    `At ${p.watts} W it's a "motor-assisted bicycle" in Vermont, not an e-bike. No riders under 16 on highways, and no sidewalks.`,
  il_motor_driven_cycle: (p) =>
    `At ${p.watts} W it's a motor driven cycle in Illinois from Jan 1, 2027. That needs a driver's license and insurance.`,
  caution_wheel_size: (p, c) =>
    p.verdict === "not_an_ebike"
      ? `Its wheels are too small for ${c.state}'s e-bike definition.`
      : `Its wheels may be too small for ${c.state}'s e-bike definition.`,
  caution_trike: (_p, c) => `${c.state}'s definition may not cover a three-wheeler.`,
  caution_foot_pegs: (_p, c) => `Foot pegs put it outside ${c.state}'s e-bike definition.`,
  caution_pedal_kit: (_p, c) => `A bike that needs a pedal kit is outside ${c.state}'s e-bike definition.`,
  caution_weight: (_p, c) => `Over 100 pounds, it's outside ${c.state}'s e-bike definition.`,
  caution_watts_hp: (_p, c) =>
    `${c.state} also caps the motor at 1 horsepower (about 745 W), so a label of 746 W or more can't be confirmed.`,
  caution_fast_mode: (_p, c) =>
    `A mode over 20 mph on the motor alone, or a setting that unlocks it, puts it outside ${c.state}'s e-bike definition.`,
  caution_class_not_recognized: (p, c) =>
    `${c.state} doesn't recognize Class ${cls(p)} e-bikes, so the law treats this one as a motor vehicle.`,
  caution_class_unclear: (p, c) => `${c.state}'s law doesn't clearly cover a Class ${cls(p)} e-bike.`,
  caution_class_age_unclear: (p, c) => `${c.state}'s law is unclear for Class ${cls(p)} riders this young.`,
  unsure_wheel_size: (_p, c) => `We need the wheel size to confirm this in ${c.state}.`,
  unsure_trike: (_p, c) => `We need the number of wheels to confirm this in ${c.state}.`,
  unsure_fast_mode: (_p, c) => `We need to know about fast or unlocked modes to confirm this in ${c.state}.`,
  unsure_weight: (_p, c) => `We need to know whether it weighs over 100 pounds to confirm this in ${c.state}.`,
  unsure_foot_pegs: (_p, c) => `We need to know about foot pegs to confirm this in ${c.state}.`,
  unsure_pedal_kit: (_p, c) => `We need to know whether it needs a pedal kit to confirm this in ${c.state}.`,
  need_info: () => "A few quick questions first. A label can't show these.",
  req_helmet_under: (p) => `Helmet required for riders under ${p.underAge}.`,
  req_helmet_all_ages: (p) => `Helmet required at every age on a Class ${cls(p)}.`,
  req_supervision: (p) => `Under ${p.minAge}, only with a parent or another adult right there.`,
  req_supervision_or_certificate: (p) => `Under ${p.minAge}, only with adult supervision or a state e-bike safety certificate.`,
  req_license: () => "A driver's license or permit is required.",
  nj_license_by_age: (p) =>
    Number(p.age) <= 16
      ? "A moped (class F) license or permit is required at 15 and 16."
      : "A driver's license or a moped license or permit is required.",
  req_registration: () => "The e-bike must be registered.",
  req_insurance: () => "Insurance is required.",
  req_campus_course: () => "Finish an approved safety course first (the CHP online course or an in-person class).",
  req_campus_tag: () => "Put an SDUHSD bike tag on the bike. Parents fill out the tag form.",
  req_campus_helmet: () => "Wear a buckled helmet on every ride to campus, at any age.",
  req_campus_walk: () => "Walk the bike on campus. Passengers only on a factory passenger seat.",
  caution_stop_pedaling_class2: (_p, c) =>
    `${c.state}'s law also says the motor must stop when you stop pedaling or brake. Read literally, that clashes with a throttle. Reviewers kept Class 2 legal, but no court or agency has settled it.`,
  caution_fast_mode_unverified: () => "If it has any mode over 20 mph on the motor alone, it is not a legal e-bike.",
  caution_helmet_unknown: (_p, c) => `${c.state}'s helmet rule for e-bikes is unclear. Wear one.`,
  no_state_min_age: () => "No statewide minimum age for this class.",
  no_state_helmet: () => "No statewide helmet rule. Towns may have one.",
  upcoming_change: (p, c) => `Coming ${formatDate(n(p.date), c.lang)}: ${CHANGES.en[n(p.change)] ?? ""}`,
  local_under_12: (p, c) =>
    `${placeName(n(p.place), c.lang)}: riders under 12 can't ride Class 1 or 2 e-bikes (since ${formatDate(n(p.since), c.lang)}).`,
  local_under_12_unclear: (p, c) =>
    `${placeName(n(p.place), c.lang)} may ban riders under 12 from Class 1 and 2, and we couldn't confirm whether it has. Check before riding.`,
  local_allowed: (p, c) => `Allowed in ${placeName(n(p.place), c.lang)} for ${aAge(p.age)}.`,
  campus_allowed: (p) => `Class ${cls(p)} e-bikes are allowed on SDUHSD campuses, after these steps.`,
  campus_class3: () => "Only Class 1 and 2 e-bikes are allowed on SDUHSD campuses.",
  campus_no_emoto: () => "E-motos and other non-e-bikes aren't allowed on SDUHSD campuses.",
  sd_course_in_lieu: () => "A cited rider can take an online e-bike safety course within 120 days instead of paying the $25 fine.",
  sd_warning_period: (p, c) => `Warnings only until ${formatDate(n(p.from), c.lang)}. Fines start then.`,
  sd_age_12: () => "One City release says \"12 and under.\" State law only allows a ban under 12, so 12-year-olds are treated as allowed.",
  sd_emoto: () => "City officials say high-powered e-motorcycles are not street legal.",
  sd_passengers: () => "Passengers only on an e-bike built with a permanent second seat.",
  carlsbad_emoto: () => "Carlsbad police can impound e-motorcycles.",
  carlsbad_parks: () => "No e-bikes at Poinsettia or Pine Avenue Community Parks.",
  carlsbad_impound: () => "A minor's e-bike can be impounded for risky riding. Getting it back takes an in-person safety course.",
  carlsbad_passengers: () => "Only e-bikes built for passengers can carry one.",
  carlsbad_class3_paths: () =>
    "Carlsbad's page suggests Class 3 can't use some paths. State law has had no such ban since 2023, and we found no Carlsbad code that adds one, so treat it as unclear.",
  city_page_750: () => "This city's page still says \"less than 750 watts,\" the wording before 2025. State law now allows up to 750 W.",
  encinitas_no_age_limit: () => "Encinitas has no local age limit. State rules apply.",
  encinitas_class3_paths: () =>
    "Encinitas's page says Class 3 can't use bike paths. State law has had no such ban since 2023, so treat it as unclear.",
  solana_emoto: () => "In Solana Beach, riding an e-moto on a road needs a motorcycle license, registration and insurance.",
  solana_sidewalks: () => "No riding on sidewalks or crosswalks in the business district, or on any street with a bike path.",
  solana_helmet_18: () => "Solana Beach's web page says helmets for \"18 and under,\" but state law and the city's own flyer say under 18.",
  del_mar_bans: () => "No bikes or e-bikes in Del Mar parks, preserves, commercial sidewalks or most San Dieguito Lagoon trails.",
  del_mar_coast_to_crest: () => "Class 1 and 2 e-bikes are allowed on Del Mar's part of the Coast to Crest Trail. Class 3 is unclear.",
  county_no_ordinance: () => "We found no county ordinance yet, but the county has the power to adopt one.",
};

const ES: Record<string, Template> = {
  allowed: (p, c) =>
    p.multi
      ? `Esta bicicleta puede funcionar como Clase ${p.multi}. Permitida en todos sus modos para alguien de ${p.age} años en ${c.state}.`
      : `Bicicleta eléctrica Clase ${cls(p)}. Permitida para alguien de ${p.age} años en ${c.state}.`,
  under_min_age: (p, c) =>
    Number(p.cls) > 0
      ? `Los menores de ${p.minAge} años no pueden usar una bicicleta eléctrica Clase ${cls(p)} en ${c.state}.`
      : `Los menores de ${p.minAge} años no pueden usar una bicicleta eléctrica en ${c.state}.`,
  under_min_age_license: (p, c) =>
    `Los menores de ${p.minAge} años necesitan licencia o permiso de conducir para usar una bicicleta eléctrica en ${c.state}, así que en la práctica no pueden.`,
  no_any_class: () => "No está permitida como bicicleta eléctrica para esta persona, sea cual sea su clase.",
  no_pedals: (_p, c) => `No tiene pedales que funcionen, así que no es una bicicleta eléctrica en ${c.state}. La ley la trata como un vehículo motorizado.`,
  no_pedals_unclear: (_p, c) => `La definición de ${c.state} no exige pedales con claridad, así que no podemos confirmar una máquina sin ellos.`,
  pedals_unknown: () => "Necesitamos saber si tiene pedales que funcionen.",
  never_legal: (_p, c) => `No podemos confirmar que una bicicleta eléctrica sea legal en ${c.state}. Su ley no las cubre con claridad.`,
  facts_conflict: () => "Algunos datos no coinciden entre sí. Revisa las velocidades y los modos que escribiste.",
  class_unknown: () => "No encontramos la clase. Busca la etiqueta cerca de los pedales o escribe la clase.",
  class_conflict_throttle: (p) => `Una bicicleta Clase ${cls(p)} solo ayuda mientras pedaleas. Un acelerador significa que no cabe en una sola clase.`,
  class_conflict_speed: (p) => `Una etiqueta Clase ${cls(p)} y una velocidad de ${p.mph} mph no coinciden.`,
  fits_no_class_speed: (p) => `${p.mph} mph es más rápido de lo que permite cualquier clase. La Clase 3 llega a 28 mph como máximo.`,
  fits_no_class_mode: () =>
    "En algún modo puede pasar de 20 mph solo con el motor, o de 28 mph pedaleando. Eso no cabe en ninguna clase de bicicleta eléctrica.",
  over_watts: (p, c) => `El motor es de ${p.watts} W. ${c.state} permite ${Number(p.strict) ? "menos de" : "hasta"} ${p.cap} W.`,
  watts_750_strict: (p, c) => `La ley de ${c.state} dice menos de ${p.cap} W. Una etiqueta de exactamente ${p.cap} W no cumple con claridad.`,
  watts_peak_only: (p) => `Solo aparece una cifra máxima (${p.peak} W). Decide la potencia nominal de la etiqueta.`,
  watts_upper_only: (p) => `El anuncio dice ${p.watts} W, pero no aclara si es potencia nominal o máxima. Decide la etiqueta.`,
  watts_unknown: () => "Necesitamos los vatios del motor que aparecen en la etiqueta.",
  hp_cap_unclear: (p, c) => `${c.state} limita el motor a ${p.hp} caballos de fuerza. Este motor está demasiado cerca de ese límite para confirmarlo.`,
  vt_motor_assisted_bicycle: (p) =>
    `Con ${p.watts} W es una "bicicleta asistida por motor" en Vermont, no una bicicleta eléctrica. Nadie menor de 16 en carreteras, y nada de aceras.`,
  il_motor_driven_cycle: (p) =>
    `Con ${p.watts} W es un ciclomotor (motor driven cycle) en Illinois desde el 1 de enero de 2027. Necesita licencia de conducir y seguro.`,
  caution_wheel_size: (p, c) =>
    p.verdict === "not_an_ebike"
      ? `Sus ruedas son demasiado pequeñas para la definición de bicicleta eléctrica de ${c.state}.`
      : `Sus ruedas podrían ser demasiado pequeñas para la definición de bicicleta eléctrica de ${c.state}.`,
  caution_trike: (_p, c) => `La definición de ${c.state} podría no cubrir un triciclo.`,
  caution_foot_pegs: (_p, c) => `Los reposapiés la dejan fuera de la definición de bicicleta eléctrica de ${c.state}.`,
  caution_pedal_kit: (_p, c) => `Una bicicleta que necesita un kit de pedales queda fuera de la definición de ${c.state}.`,
  caution_weight: (_p, c) => `Con más de 100 libras queda fuera de la definición de bicicleta eléctrica de ${c.state}.`,
  caution_watts_hp: (_p, c) =>
    `${c.state} también limita el motor a 1 caballo de fuerza (unos 745 W), así que no se puede confirmar una etiqueta de 746 W o más.`,
  caution_fast_mode: (_p, c) =>
    `Un modo de más de 20 mph solo con el motor, o un ajuste que lo desbloquea, la deja fuera de la definición de ${c.state}.`,
  caution_class_not_recognized: (p, c) =>
    `${c.state} no reconoce las bicicletas eléctricas Clase ${cls(p)}, así que la ley trata esta como un vehículo motorizado.`,
  caution_class_unclear: (p, c) => `La ley de ${c.state} no cubre con claridad una bicicleta eléctrica Clase ${cls(p)}.`,
  caution_class_age_unclear: (p, c) => `La ley de ${c.state} no es clara para conductores tan jóvenes en una Clase ${cls(p)}.`,
  unsure_wheel_size: (_p, c) => `Necesitamos el tamaño de las ruedas para confirmarlo en ${c.state}.`,
  unsure_trike: (_p, c) => `Necesitamos saber cuántas ruedas tiene para confirmarlo en ${c.state}.`,
  unsure_fast_mode: (_p, c) => `Necesitamos saber si tiene modos rápidos o desbloqueados para confirmarlo en ${c.state}.`,
  unsure_weight: (_p, c) => `Necesitamos saber si pesa más de 100 libras para confirmarlo en ${c.state}.`,
  unsure_foot_pegs: (_p, c) => `Necesitamos saber si tiene reposapiés para confirmarlo en ${c.state}.`,
  unsure_pedal_kit: (_p, c) => `Necesitamos saber si necesita un kit de pedales para confirmarlo en ${c.state}.`,
  need_info: () => "Primero, unas preguntas rápidas. Una etiqueta no muestra esto.",
  req_helmet_under: (p) => `Casco obligatorio para menores de ${p.underAge} años.`,
  req_helmet_all_ages: (p) => `Casco obligatorio a cualquier edad en una Clase ${cls(p)}.`,
  req_supervision: (p) => `Menores de ${p.minAge}, solo con su padre, madre u otro adulto presente.`,
  req_supervision_or_certificate: (p) => `Menores de ${p.minAge}, solo con supervisión de un adulto o un certificado estatal de seguridad.`,
  req_license: () => "Se necesita licencia o permiso de conducir.",
  nj_license_by_age: (p) =>
    Number(p.age) <= 16
      ? "A los 15 y 16 años se necesita licencia o permiso de ciclomotor (clase F)."
      : "Se necesita licencia de conducir o licencia o permiso de ciclomotor.",
  req_registration: () => "La bicicleta eléctrica debe estar registrada.",
  req_insurance: () => "Se necesita seguro.",
  req_campus_course: () => "Primero, completa un curso de seguridad aprobado (el curso en línea de la CHP o una clase presencial).",
  req_campus_tag: () => "Pon una etiqueta de bicicleta de SDUHSD en la bicicleta. Los padres llenan el formulario de la etiqueta.",
  req_campus_helmet: () => "Usa casco abrochado en cada viaje a la escuela, a cualquier edad.",
  req_campus_walk: () => "Camina con la bicicleta dentro de la escuela. Pasajeros solo en un asiento de fábrica.",
  caution_stop_pedaling_class2: (_p, c) =>
    `La ley de ${c.state} también dice que el motor debe parar cuando dejas de pedalear o frenas. Leído al pie de la letra, eso choca con un acelerador. Los revisores mantuvieron la Clase 2 como legal, pero ningún tribunal ni agencia lo ha resuelto.`,
  caution_fast_mode_unverified: () => "Si tiene algún modo de más de 20 mph solo con el motor, no es una bicicleta eléctrica legal.",
  caution_helmet_unknown: (_p, c) => `La regla de casco de ${c.state} para bicicletas eléctricas no es clara. Usa uno.`,
  no_state_min_age: () => "No hay edad mínima estatal para esta clase.",
  no_state_helmet: () => "No hay regla estatal de casco. Las ciudades pueden tener una.",
  upcoming_change: (p, c) => `A partir del ${formatDate(n(p.date), c.lang)}: ${CHANGES.es[n(p.change)] ?? ""}`,
  local_under_12: (p, c) =>
    `${placeName(n(p.place), c.lang)}: los menores de 12 años no pueden usar bicicletas eléctricas Clase 1 o 2 (desde el ${formatDate(n(p.since), c.lang)}).`,
  local_under_12_unclear: (p, c) =>
    `${placeName(n(p.place), c.lang)} puede prohibir las Clases 1 y 2 a menores de 12 años, y no pudimos confirmar si lo ha hecho. Verifica antes de salir.`,
  local_allowed: (p, c) => `Permitida en ${placeName(n(p.place), c.lang)} para alguien de ${p.age} años.`,
  campus_allowed: (p) => `Las bicicletas eléctricas Clase ${cls(p)} se permiten en las escuelas de SDUHSD, después de estos pasos.`,
  campus_class3: () => "En las escuelas de SDUHSD solo se permiten bicicletas eléctricas Clase 1 y 2.",
  campus_no_emoto: () => "Las motos eléctricas y otros vehículos que no son bicicletas eléctricas no se permiten en las escuelas de SDUHSD.",
  sd_course_in_lieu: () => "Quien reciba una multa puede tomar un curso de seguridad en línea dentro de 120 días en lugar de pagar los $25.",
  sd_warning_period: (p, c) => `Solo advertencias hasta el ${formatDate(n(p.from), c.lang)}. Después empiezan las multas.`,
  sd_age_12: () => "Un comunicado de la Ciudad dice \"12 años o menos\". La ley estatal solo permite prohibirlo a menores de 12, así que a los 12 años se considera permitido.",
  sd_emoto: () => "Funcionarios de la Ciudad dicen que las motos eléctricas potentes no son legales en la calle.",
  sd_passengers: () => "Pasajeros solo en una bicicleta eléctrica hecha con un segundo asiento permanente.",
  carlsbad_emoto: () => "La policía de Carlsbad puede confiscar motos eléctricas.",
  carlsbad_parks: () => "No se permiten bicicletas eléctricas en los parques comunitarios Poinsettia y Pine Avenue.",
  carlsbad_impound: () => "La bicicleta eléctrica de un menor puede ser confiscada por manejar con riesgo. Para recuperarla hay que tomar un curso presencial.",
  carlsbad_passengers: () => "Solo las bicicletas eléctricas hechas para pasajeros pueden llevar uno.",
  carlsbad_class3_paths: () =>
    "La página de Carlsbad sugiere que la Clase 3 no puede usar algunos senderos. La ley estatal no lo prohíbe desde 2023 y no encontramos un código de Carlsbad que lo haga, así que tómalo como no claro.",
  city_page_750: () => "La página de esta ciudad todavía dice \"menos de 750 vatios\", la redacción de antes de 2025. La ley estatal ahora permite hasta 750 W.",
  encinitas_no_age_limit: () => "Encinitas no tiene límite de edad local. Se aplican las reglas estatales.",
  encinitas_class3_paths: () =>
    "La página de Encinitas dice que la Clase 3 no puede usar ciclovías separadas. La ley estatal no lo prohíbe desde 2023, así que tómalo como no claro.",
  solana_emoto: () => "En Solana Beach, usar una moto eléctrica en la calle requiere licencia de motocicleta, registro y seguro.",
  solana_sidewalks: () => "No se puede andar por aceras ni cruces peatonales en la zona comercial, ni en calles con ciclovía.",
  solana_helmet_18: () => "La página web de Solana Beach dice casco para \"18 años o menos\", pero la ley estatal y el folleto de la ciudad dicen menores de 18.",
  del_mar_bans: () => "No se permiten bicicletas ni bicicletas eléctricas en parques, reservas, aceras comerciales ni en la mayoría de los senderos de la laguna San Dieguito en Del Mar.",
  del_mar_coast_to_crest: () => "Las Clases 1 y 2 se permiten en el tramo de Del Mar del sendero Coast to Crest. La Clase 3 no está clara.",
  county_no_ordinance: () => "Todavía no encontramos una ordenanza del condado, pero el condado tiene el poder de adoptar una.",
};

const CHANGES: Record<Lang, Record<string, string>> = {
  en: {
    hi_2026_11_12: "new e-bikes sold in Hawaii must carry a class, speed and wattage label, and sellers must say whether a bike is street legal.",
    nc_2026_12_01: "North Carolina recognizes Class 3 e-bikes. Riders and passengers under 18 on a Class 3 must wear a helmet.",
    ca_2027_01_01:
      "California bars any electric two- or three-wheeler that can top 20 mph on the motor alone from public roads unless it is road legal, sets a 10 mph sidewalk speed limit, and lets San Mateo County ban riders under 12.",
    co_2027_01_01: "labels on Colorado multi-mode e-bikes must show the highest class.",
    il_2027_01_01: "Illinois Class 1 and 2 riders must be 15 or older, and an e-bike at 750 W or more becomes a motor driven cycle.",
    nj_2027_01_01: "New Jersey e-bike riders count as pedestrians for car insurance (PIP), and the ban on online sales of electric motorized bicycles ends.",
    or_2027_01_01: "Oregon lowers the Class 1 age to 14. Class 2 and 3 stay at 16, and parents become responsible for helmets under 16.",
    ut_2027_05_05: "Utah riders 8 to 15 need adult supervision or a state safety certificate, and the separate Class 3 age rule is dropped.",
  },
  es: {
    hi_2026_11_12: "las bicicletas eléctricas nuevas que se vendan en Hawái deben llevar una etiqueta con clase, velocidad y vatios, y los vendedores deben decir si son legales en la calle.",
    nc_2026_12_01: "Carolina del Norte reconoce las bicicletas eléctricas Clase 3. Los menores de 18 en una Clase 3 deben usar casco.",
    ca_2027_01_01:
      "California prohíbe en la vía pública cualquier vehículo eléctrico de dos o tres ruedas que pase de 20 mph solo con el motor, salvo que sea legal para la calle. También fija 10 mph en las aceras y permite al condado de San Mateo prohibirlas a menores de 12.",
    co_2027_01_01: "las etiquetas de las bicicletas eléctricas de varios modos en Colorado deben mostrar la clase más alta.",
    il_2027_01_01: "en Illinois, quienes usen Clase 1 o 2 deben tener 15 años o más, y una bicicleta de 750 W o más pasa a ser un ciclomotor.",
    nj_2027_01_01: "en Nueva Jersey, quienes usen bicicleta eléctrica cuentan como peatones para el seguro de auto (PIP), y termina la prohibición de vender bicicletas motorizadas eléctricas en línea.",
    or_2027_01_01: "Oregón baja a 14 años la edad para la Clase 1. Las Clases 2 y 3 siguen en 16, y los padres pasan a ser responsables del casco para menores de 16.",
    ut_2027_05_05: "en Utah, quienes tengan de 8 a 15 años necesitan supervisión de un adulto o un certificado estatal de seguridad, y se elimina la regla aparte de edad para la Clase 3.",
  },
};

const TEMPLATES: Record<Lang, Record<string, Template>> = { en: EN, es: ES };

export function renderLine(line: Line, lang: Lang, state: string): string {
  const template = TEMPLATES[lang][line.code] ?? TEMPLATES.en[line.code];
  if (!template) return line.code;
  return template(line.params ?? {}, { state, lang });
}

export function hasTemplate(code: string): boolean {
  return code in EN && code in ES;
}

export const STATUS_LABEL: Record<Lang, Record<Status, string>> = {
  en: {
    yes: "Allowed",
    no: "Not allowed",
    not_ebike: "Not an e-bike",
    cant_confirm: "Can't confirm",
    need_info: "A few questions",
  },
  es: {
    yes: "Permitida",
    no: "No permitida",
    not_ebike: "No es bicicleta eléctrica",
    cant_confirm: "No se puede confirmar",
    need_info: "Unas preguntas",
  },
};

export const CHANGE_CODES = Object.keys(CHANGES.en);
