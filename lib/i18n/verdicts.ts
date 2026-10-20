// Every sentence a verdict card can show, in English and Spanish. The engine picks the
// code and the numbers. These templates are the only legal text in the app.

import type { BottomLineCode } from "@/lib/rules/bottomLine";
import { isQuestionId, type Line, type QuestionId, type Status } from "@/lib/rules/types";
import { formatDate, joinList, placeName, type Lang } from "./names";

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

/** State-law removal power for e-motos, shared by several San Diego notes (VC 22651.08). */
const EMOTO_REMOVAL_EN =
  "police can remove an e-moto that can top 20 mph on the motor alone when the rider has no license for it (VC 22651.08).";
const EMOTO_REMOVAL_ES =
  "la policía puede retirar una moto eléctrica que pase de 20 mph solo con el motor cuando quien la maneja no tiene licencia para ella (VC 22651.08).";

/** Keyed by QuestionId, so a new follow-up question can't ship without a name in both languages. */
const QUESTION_NAMES: Record<Lang, Record<QuestionId, string>> = {
  en: { wheels: "wheel size and number of wheels", fast_mode: "fast modes", weight: "weight", pegs_kit: "foot pegs or a pedal kit" },
  es: { wheels: "el tamaño y el número de ruedas", fast_mode: "los modos rápidos", weight: "el peso", pegs_kit: "los reposapiés o el kit de pedales" },
};

/** "fast_mode,wheels" becomes "fast modes and wheel size". */
function questionList(ids: string, lang: Lang): string {
  const names = ids
    .split(",")
    .filter(isQuestionId)
    .map((id) => QUESTION_NAMES[lang][id]);
  if (names.length === 0) return lang === "es" ? "la bicicleta" : "the bike";
  return joinList(names, lang);
}

/** Every bottom-line code must have a sentence. Other codes are checked by tests/i18n.test.ts. */
type Templates = Record<BottomLineCode, Template> & Record<string, Template>;

const EN = {
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
  throttle_unknown: (p) => `We need to know whether it has a throttle. A Class ${cls(p)} e-bike only helps while you pedal.`,
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
    `Riders under 12 can't ride Class 1 or 2 e-bikes here (since ${formatDate(n(p.since), c.lang)}).`,
  local_under_12_unclear: () =>
    "This place may ban riders under 12 from Class 1 and 2, and we couldn't confirm whether it has. Check before riding.",
  local_under_12_no_end: (p, c) =>
    `The local code bars riders under 12 from Class 1 and 2 e-bikes and gives no end date. The state law that allows that ban ends ${formatDate(n(p.powerEnds), c.lang)}, and it isn't settled whether the ban still applies after that. Check before riding.`,
  local_under_12_after_check: (p, c) =>
    `This place's rules for riders under 12 were last checked on ${formatDate(n(p.checked), c.lang)}, and they can change before your ride date. We can confirm them only through ${formatDate(n(p.through), c.lang)}. Check again before riding.`,
  local_allowed: (p, c) => `Allowed in ${placeName(n(p.place), c.lang)} for ${aAge(p.age)}.`,
  campus_allowed: (p) => `Class ${cls(p)} e-bikes are allowed on SDUHSD campuses, after these steps.`,
  campus_class3: () => "Only Class 1 and 2 e-bikes are allowed on SDUHSD campuses.",
  campus_no_emoto: () => "E-motos and other non-e-bikes aren't allowed on SDUHSD campuses.",
  sd_course_in_lieu: () =>
    "No fine if a parent or guardian gives the City proof, within 120 days of the citation, that the rider finished the e-bike safety program posted by the CHP.",
  sd_warning_period: (p, c) => `Warnings only until ${formatDate(n(p.from), c.lang)}. Fines start then.`,
  sd_age_12: () => "SDMC 84.19 bans only riders under 12. A 12-year-old may ride Class 1 or 2.",
  sd_emoto: () =>
    `The City has no e-moto ordinance of its own. Under state law, ${EMOTO_REMOVAL_EN}`,
  sd_passengers: () =>
    "Passengers only if the e-bike was designed and manufactured to carry more than one person and has a separate seat or saddle for each passenger.",
  sd_sidewalks: () =>
    "No riding on sidewalks in front of businesses unless signs allow it (SDMC 84.09). Riding an e-bike on other sidewalks may also be barred (SDMC 84.04). Ride in the street or bike lane.",
  sd_parks: () =>
    "In City parks and on City beaches, ride only where signs allow bikes, on marked bikeways, on roads open to cars or on fire and service roads (SDMC 63.0102). Whether an e-bike counts there as a banned motorized vehicle is unclear. Ocean Front Walk and some Mission Bay paths have an 8 mph limit.",
  sd_boardwalks: () =>
    "No e-bikes, owned or rented, on Ocean Front Walk, Bayside Walk, the east Mission Bay walkway or the La Jolla Shores boardwalk (SDMC 84.18).",
  carlsbad_emoto: () => `Under state law, ${EMOTO_REMOVAL_EN} Carlsbad code adds cost recovery (CMC 10.56.045).`,
  carlsbad_parks: () =>
    "No riding e-bikes in Poinsettia or Pine Avenue Community Parks where signs are posted. Walking one through is allowed unless signs say otherwise.",
  carlsbad_impound: () =>
    "A minor's e-bike can be impounded for risky riding. It is held at least 48 hours, and getting it back takes an in-person safety course at the police station with a parent there.",
  carlsbad_passengers: () => "Only e-bikes built for passengers can carry one.",
  carlsbad_under_12_passengers: () =>
    "Children under 12 can't ride as passengers on a Class 1 or 2 e-bike in Carlsbad either (CMC 10.56.030(A)). State law only mentions operating.",
  carlsbad_disability: () =>
    "Carlsbad's e-bike rules don't apply to devices used safely by people with a physical disability under the ADA (CMC 10.56.060(B)). This app can't check that.",
  carlsbad_sidewalks: () =>
    "No riding any bike or e-bike on any sidewalk in Carlsbad (CMC 10.56.020(B)). The seawall walk from Tamarack Ave to Pine St is for people on foot only.",
  carlsbad_trail_dismount: () => "On a city trail narrower than 5 feet, get off and walk when a person or horse is within 50 feet.",
  carlsbad_class3_paths: () =>
    "No Carlsbad code singles out Class 3 on bike lanes or bikeways. Trails are unclear. City code bars vehicles in parks and on public trails unless the City Manager allows them (CMC 11.32.030).",
  carlsbad_class3_trails: () => "The city's e-bike flier says Class 3 is not allowed on trails.",
  city_page_750: () => "This city's page still says \"less than 750 watts,\" the wording before 2025. State law now allows up to 750 W.",
  encinitas_no_age_limit: (p, c) =>
    `Encinitas had no local age limit when checked on ${formatDate(n(p.date), c.lang)}. State rules apply. The council has discussed adding one, so check again before riding.`,
  encinitas_emoto: () =>
    "E-motorcycles are banned on Encinitas trails, beaches and parks, except on authorized roads (EMC 14.32.093, 8.04.010, 8.04.130).",
  encinitas_sidewalks: () =>
    "No riding on sidewalks in any business district, including South Coast Highway 101 from D Street to J Street (EMC 14.56.020). Other sidewalks are not confirmed as allowed. Anyone riding on a sidewalk must yield to people walking and obey posted signs.",
  encinitas_parks_unclear: () =>
    "Riding in Encinitas parks, on beaches and on recreational trails is unclear. City code bars self-propelled vehicles there without city approval (EMC 8.04.010, 8.04.130), and it isn't settled whether that covers e-bikes.",
  encinitas_passengers: () => "No passengers on any bike unless it is built for them (EMC 14.56.030(B)).",
  encinitas_class3_paths: () =>
    "Encinitas's page says Class 3 can't use bike paths. No Encinitas ordinance says that, and state law has had no such ban since 2023. Obey posted signs.",
  solana_emoto: () => `This is state law, not a Solana Beach rule. ${EMOTO_REMOVAL_EN.charAt(0).toUpperCase()}${EMOTO_REMOVAL_EN.slice(1)}`,
  solana_sidewalks: () =>
    "No riding on the sidewalk in a business district, or on the sidewalk of any street with a designated bike path or bike way (SBMC 10.44.010(B)).",
  solana_parks_motor: () =>
    "Solana Beach bars motor-powered vehicles in parks and on beaches, including the bluff tops, trails and access ways next to them, unless the City Manager allows it (SBMC 11.12.020(R)). Whether that covers e-bikes isn't settled.",
  solana_passengers: () => "No passengers on any bike unless it is built for them (SBMC 10.44.010(C)).",
  solana_course: () =>
    "A first-time violator may be allowed to take a police-approved bike safety course instead of a penalty (SBMC 10.44.010(E)).",
  solana_helmet_18: () => "Solana Beach's web page says helmets for \"18 and under,\" but state law and the city's own flyer say under 18.",
  del_mar_bans: () =>
    "In Del Mar, no riding bikes or e-bikes on Village Center or commercial-zone sidewalks, on any sidewalk signed no riding, on the sidewalk of a street with a bike lane (ride in the lane, CVC 21208 exceptions apply), in parks and preserves, or on lagoon trails unless signed for bikes.",
  del_mar_beaches: () =>
    "Riding an e-bike on Del Mar beaches is unclear. City code bars self-propelled vehicles on public beaches without city approval (DMMC 8.04.020), and it isn't settled whether that covers e-bikes. Lifeguards have reported enforcing against illegal e-bike riding on Del Mar beaches.",
  del_mar_coast_to_crest: () => "Class 1 and 2 e-bikes are allowed on Del Mar's part of the Coast to Crest Trail. Class 3 is unclear.",
  county_no_ordinance: (p, c) =>
    `As of ${formatDate(n(p.date), c.lang)} the County had adopted no under-12 ban, but state law lets it adopt one (VC 21214.7(b)). Check again before riding.`,
  county_sidewalks: () => "County code bans riding bicycles on business-district sidewalks (SDCC 72.230). Treat e-bikes the same to be safe.",
  county_parks: () => "In County parks, trails and preserves, ride e-bikes only in areas marked for them (SDCC 41.130(b)).",
  county_dpr_sites: () =>
    "The County parks department closes Lindo Lake and Jess Martin skate parks, the Ramona Grasslands Old Survey Road 97 Trail, Sweetwater Bike Park and the Valley Center Community Park skate park to all e-bikes.",
  county_dpr_class3: () => "The County parks department says Class 3 e-bikes are not allowed on County trails.",
  bl_unanswered: (p, c) => `Answer the questions above about ${questionList(n(p.questions), c.lang)}.`,
  bl_unsure_fast_mode: () =>
    "You answered \"not sure\" about fast modes. A mode over 20 mph on the motor alone would make it not a legal e-bike.",
  bl_unverified_state: (_p, c) => `${c.state}'s rules here were not confirmed against statute text.`,
  bl_unverified_primary_partial: (p) =>
    p.place === "sduhsd_campuses"
      ? "The class, tag and course rules come only from the district's web page. No board policy or regulation has them, and the Board has not voted on them."
      : "Only part of these rules was found in enacted text. The rest comes from an official web page.",
  bl_unverified_primary_not_found: () => "The enacted text behind these rules was not found. They come from an official page or a release.",
} satisfies Templates;

/** Spanish must have a sentence for every English code, and no code English lacks. */
const ES = {
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
  throttle_unknown: (p) => `Necesitamos saber si tiene acelerador. Una bicicleta Clase ${cls(p)} solo ayuda mientras pedaleas.`,
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
    `Aquí los menores de 12 años no pueden usar bicicletas eléctricas Clase 1 o 2 (desde el ${formatDate(n(p.since), c.lang)}).`,
  local_under_12_unclear: () =>
    "Este lugar puede prohibir las Clases 1 y 2 a menores de 12 años, y no pudimos confirmar si lo ha hecho. Verifica antes de salir.",
  local_under_12_no_end: (p, c) =>
    `El código local prohíbe a los menores de 12 años usar bicicletas eléctricas Clase 1 y 2, sin fecha de fin. La ley estatal que permite esa prohibición termina el ${formatDate(n(p.powerEnds), c.lang)}, y no está resuelto si la prohibición sigue vigente después. Verifica antes de salir.`,
  local_under_12_after_check: (p, c) =>
    `Las reglas de este lugar para menores de 12 años se revisaron por última vez el ${formatDate(n(p.checked), c.lang)}, y pueden cambiar antes de la fecha de tu viaje. Solo podemos confirmarlas hasta el ${formatDate(n(p.through), c.lang)}. Vuelve a revisar antes de salir.`,
  local_allowed: (p, c) => `Permitida en ${placeName(n(p.place), c.lang)} para alguien de ${p.age} años.`,
  campus_allowed: (p) => `Las bicicletas eléctricas Clase ${cls(p)} se permiten en las escuelas de SDUHSD, después de estos pasos.`,
  campus_class3: () => "En las escuelas de SDUHSD solo se permiten bicicletas eléctricas Clase 1 y 2.",
  campus_no_emoto: () => "Las motos eléctricas y otros vehículos que no son bicicletas eléctricas no se permiten en las escuelas de SDUHSD.",
  sd_course_in_lieu: () =>
    "No se cobra la multa si el padre, la madre o el tutor legal le da a la Ciudad, dentro de 120 días de la citación, prueba de que la persona terminó el programa de seguridad de bicicletas eléctricas publicado por la CHP.",
  sd_warning_period: (p, c) => `Solo advertencias hasta el ${formatDate(n(p.from), c.lang)}. Después empiezan las multas.`,
  sd_age_12: () => "La sección 84.19 del código municipal (SDMC) prohíbe solo a menores de 12 años. Alguien de 12 años puede usar una Clase 1 o 2.",
  sd_emoto: () => `La Ciudad no tiene una ordenanza propia sobre motos eléctricas. Según la ley estatal, ${EMOTO_REMOVAL_ES}`,
  sd_passengers: () =>
    "Pasajeros solo si la bicicleta eléctrica fue diseñada y fabricada para llevar a más de una persona y tiene un asiento o sillín aparte para cada pasajero.",
  sd_sidewalks: () =>
    "No se puede andar por aceras frente a negocios, salvo que un letrero lo permita (SDMC 84.09). Andar en bicicleta eléctrica por otras aceras también podría estar prohibido (SDMC 84.04). Anda por la calle o la ciclovía.",
  sd_parks: () =>
    "En parques y playas de la Ciudad, anda solo donde un letrero permita bicicletas, en ciclovías marcadas, en calles abiertas a autos o en caminos de bomberos y de servicio (SDMC 63.0102). No está claro si ahí una bicicleta eléctrica cuenta como vehículo motorizado prohibido. Ocean Front Walk y algunos caminos de Mission Bay tienen un límite de 8 mph.",
  sd_boardwalks: () =>
    "No se permiten bicicletas eléctricas, propias o rentadas, en Ocean Front Walk, Bayside Walk, el paseo del lado este de Mission Bay ni el paseo de La Jolla Shores (SDMC 84.18).",
  carlsbad_emoto: () => `Según la ley estatal, ${EMOTO_REMOVAL_ES} El código de Carlsbad agrega el cobro de costos (CMC 10.56.045).`,
  carlsbad_parks: () =>
    "No se puede andar en bicicleta eléctrica en los parques comunitarios Poinsettia y Pine Avenue donde haya letreros. Se puede cruzar caminando con ella, salvo que los letreros digan otra cosa.",
  carlsbad_impound: () =>
    "La bicicleta eléctrica de un menor puede ser confiscada por manejar con riesgo. Se retiene al menos 48 horas, y para recuperarla hay que tomar un curso presencial en la estación de policía con el padre, la madre o el tutor presente.",
  carlsbad_passengers: () => "Solo las bicicletas eléctricas hechas para pasajeros pueden llevar uno.",
  carlsbad_under_12_passengers: () =>
    "En Carlsbad, los menores de 12 años tampoco pueden ir como pasajeros en una bicicleta eléctrica Clase 1 o 2 (CMC 10.56.030(A)). La ley estatal solo menciona manejarla.",
  carlsbad_disability: () =>
    "Las reglas de Carlsbad no se aplican a vehículos usados con cuidado por personas con una discapacidad física según la ADA (CMC 10.56.060(B)). Esta app no puede verificarlo.",
  carlsbad_sidewalks: () =>
    "En Carlsbad no se puede andar en bicicleta ni en bicicleta eléctrica por ninguna acera (CMC 10.56.020(B)). El paseo del malecón entre Tamarack Ave y Pine St es solo para peatones.",
  carlsbad_trail_dismount: () =>
    "En un sendero de la ciudad de menos de 5 pies de ancho, bájate y camina cuando haya una persona o un caballo a menos de 50 pies.",
  carlsbad_class3_paths: () =>
    "Ningún código de Carlsbad se refiere a la Clase 3 en carriles o ciclovías. Los senderos no están claros. El código prohíbe vehículos en parques y senderos públicos salvo que el administrador de la ciudad los permita (CMC 11.32.030).",
  carlsbad_class3_trails: () => "El folleto de la ciudad sobre bicicletas eléctricas dice que la Clase 3 no se permite en senderos.",
  city_page_750: () => "La página de esta ciudad todavía dice \"menos de 750 vatios\", la redacción de antes de 2025. La ley estatal ahora permite hasta 750 W.",
  encinitas_no_age_limit: (p, c) =>
    `Encinitas no tenía límite de edad local cuando se revisó el ${formatDate(n(p.date), c.lang)}. Se aplican las reglas estatales. El concejo ha hablado de agregar uno, así que vuelve a revisar antes de salir.`,
  encinitas_emoto: () =>
    "Las motos eléctricas están prohibidas en senderos, playas y parques de Encinitas, salvo en caminos autorizados (EMC 14.32.093, 8.04.010, 8.04.130).",
  encinitas_sidewalks: () =>
    "No se puede andar por aceras en ninguna zona comercial, incluida South Coast Highway 101 entre D Street y J Street (EMC 14.56.020). No está confirmado que se permita en otras aceras. Quien ande por una acera debe ceder el paso a los peatones y seguir los letreros.",
  encinitas_parks_unclear: () =>
    "No está claro si se puede andar en parques, playas y senderos recreativos de Encinitas. El código prohíbe ahí los vehículos autopropulsados sin permiso de la ciudad (EMC 8.04.010, 8.04.130), y no está resuelto si eso incluye las bicicletas eléctricas.",
  encinitas_passengers: () => "No se permiten pasajeros en ninguna bicicleta que no esté hecha para llevarlos (EMC 14.56.030(B)).",
  encinitas_class3_paths: () =>
    "La página de Encinitas dice que la Clase 3 no puede usar ciclovías separadas. Ninguna ordenanza de Encinitas lo dice, y la ley estatal no lo prohíbe desde 2023. Sigue los letreros.",
  solana_emoto: () => `Esto es ley estatal, no una regla de Solana Beach. ${EMOTO_REMOVAL_ES.charAt(0).toUpperCase()}${EMOTO_REMOVAL_ES.slice(1)}`,
  solana_sidewalks: () =>
    "No se puede andar por la acera en una zona comercial, ni por la acera de una calle con ciclovía designada (SBMC 10.44.010(B)).",
  solana_parks_motor: () =>
    "Solana Beach prohíbe vehículos motorizados en parques y playas, incluidos los acantilados, senderos y accesos junto a ellas, salvo permiso del administrador de la ciudad (SBMC 11.12.020(R)). No está resuelto si eso incluye las bicicletas eléctricas.",
  solana_passengers: () => "No se permiten pasajeros en ninguna bicicleta que no esté hecha para llevarlos (SBMC 10.44.010(C)).",
  solana_course: () =>
    "A quien cometa una primera infracción se le puede permitir tomar un curso de seguridad aprobado por la policía en lugar de la sanción (SBMC 10.44.010(E)).",
  solana_helmet_18: () => "La página web de Solana Beach dice casco para \"18 años o menos\", pero la ley estatal y el folleto de la ciudad dicen menores de 18.",
  del_mar_bans: () =>
    "En Del Mar no se puede andar en bicicleta ni en bicicleta eléctrica por aceras del Village Center o de zonas comerciales, por aceras con letreros que lo prohíben, por la acera de una calle con ciclovía (anda por la ciclovía, con las excepciones del CVC 21208), en parques y reservas, ni en senderos de la laguna salvo que un letrero lo permita.",
  del_mar_beaches: () =>
    "No está claro si se puede andar en bicicleta eléctrica en las playas de Del Mar. El código prohíbe ahí los vehículos autopropulsados sin permiso de la ciudad (DMMC 8.04.020), y no está resuelto si eso incluye las bicicletas eléctricas. Los salvavidas han informado que actúan contra el uso ilegal de bicicletas eléctricas en las playas de Del Mar.",
  del_mar_coast_to_crest: () => "Las Clases 1 y 2 se permiten en el tramo de Del Mar del sendero Coast to Crest. La Clase 3 no está clara.",
  county_no_ordinance: (p, c) =>
    `Al ${formatDate(n(p.date), c.lang)} el condado no había adoptado una prohibición para menores de 12 años, pero la ley estatal le permite hacerlo (VC 21214.7(b)). Vuelve a revisar antes de salir.`,
  county_sidewalks: () =>
    "El código del condado prohíbe andar en bicicleta por aceras de zonas comerciales (SDCC 72.230). Por seguridad, haz lo mismo con la bicicleta eléctrica.",
  county_parks: () => "En parques, senderos y reservas del condado, anda en bicicleta eléctrica solo en las zonas marcadas para ello (SDCC 41.130(b)).",
  county_dpr_sites: () =>
    "El departamento de parques del condado cierra a todas las bicicletas eléctricas los skateparks de Lindo Lake y Jess Martin, el sendero Old Survey Road 97 de Ramona Grasslands, el Sweetwater Bike Park y el skatepark del Valley Center Community Park.",
  county_dpr_class3: () => "El departamento de parques del condado dice que las bicicletas eléctricas Clase 3 no se permiten en los senderos del condado.",
  bl_unanswered: (p, c) => `Responde las preguntas de arriba sobre ${questionList(n(p.questions), c.lang)}.`,
  bl_unsure_fast_mode: () =>
    "Respondiste \"no sé\" sobre los modos rápidos. Un modo de más de 20 mph solo con el motor haría que no fuera una bicicleta eléctrica legal.",
  bl_unverified_state: (_p, c) => `Las reglas de ${c.state} no se confirmaron contra el texto de la ley.`,
  bl_unverified_primary_partial: (p) =>
    p.place === "sduhsd_campuses"
      ? "Las reglas de clase, etiqueta y curso vienen solo de la página web del distrito. Ninguna política ni reglamento de la junta las incluye, y la junta no ha votado sobre ellas."
      : "Solo una parte de estas reglas se encontró en un texto vigente. El resto viene de una página web oficial.",
  bl_unverified_primary_not_found: () => "No se encontró el texto vigente de estas reglas. Vienen de una página o un comunicado oficial.",
} satisfies Record<keyof typeof EN, Template>;

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

const TEMPLATES: Record<Lang, Record<string, Template>> = { en: EN, es: ES satisfies Templates };

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
