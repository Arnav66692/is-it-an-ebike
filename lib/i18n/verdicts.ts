// Every sentence a verdict card can show, in English and Spanish. The engine picks the
// code and the numbers. These templates are the only legal text in the app.

import type { BottomLineCode } from "@/lib/rules/bottomLine";
import { isQuestionId, QUESTION_IDS, READ_FIELDS, type Line, type QuestionId, type ReadField, type Status } from "@/lib/rules/types";
import { formatDate, joinList, placeName, placeNameInline, type Lang } from "./names";

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

/** Spanish place names that take an article in a sentence: "en el Distrito de Columbia". */
const ES_ARTICLE: Record<string, string> = { "Distrito de Columbia": "el Distrito de Columbia" };
/** The state as an object in Spanish: "California", "el Distrito de Columbia". */
const esName = (c: Ctx): string => ES_ARTICLE[c.state] ?? c.state;
/** "de California", "del Distrito de Columbia". */
const esOf = (c: Ctx): string => {
  const name = esName(c);
  return name.startsWith("el ") ? `del ${name.slice(3)}` : `de ${name}`;
};
/** The state starting a sentence: "California", "El Distrito de Columbia". */
const esSubj = (c: Ctx): string => {
  const name = esName(c);
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** Which fast-mode answers were left at "not sure": the motor alone past 20 mph, pedal assist past 28 mph, or both. */
const fastUnsure = (p: Params): "both" | "motor" | "assist" =>
  Number(p.motor) && Number(p.assist) ? "both" : Number(p.assist) && !Number(p.motor) ? "assist" : "motor";

/** The state-record horizon sentence, shared by the state card's Watch out line and the bottom line's What's missing item. */
const STATE_AFTER_CHECK_EN: Template = (p, c) =>
  `These rules were last checked on ${formatDate(n(p.checked), c.lang)}. A new law could take effect before your ride date, so we can confirm them only through ${formatDate(n(p.through), c.lang)}. Check again before riding.`;
const STATE_AFTER_CHECK_ES: Template = (p, c) =>
  `Estas reglas se revisaron por última vez el ${formatDate(n(p.checked), c.lang)}. Una ley nueva podría entrar en vigor antes de la fecha de tu viaje, así que solo podemos confirmarlas hasta el ${formatDate(n(p.through), c.lang)}. Vuelve a revisar antes de salir.`;

/** State-law removal power for e-motos, shared by several San Diego notes (VC 22651.08). */
const EMOTO_REMOVAL_EN =
  "police can remove an e-moto that can top 20 mph on the motor alone when the rider has no license for it (VC 22651.08).";
const EMOTO_REMOVAL_ES =
  "la policía puede retirar una moto eléctrica que pase de 20 mph solo con el motor cuando quien la maneja no tiene licencia para ella (VC 22651.08).";

/** Keyed by QuestionId, so a new follow-up question can't ship without a name in both languages. */
const QUESTION_NAMES: Record<Lang, Record<QuestionId, string>> = {
  en: { wheels: "the wheels", fast_mode: "fast modes", weight: "weight", pegs_kit: "foot pegs or a pedal kit" },
  es: { wheels: "las ruedas", fast_mode: "los modos rápidos", weight: "el peso", pegs_kit: "los reposapiés o el kit de pedales" },
};

/** "fast_mode,wheels" becomes "the wheels and fast modes", in the order the questions appear on the page. */
function questionList(ids: string, lang: Lang): string {
  const asked = ids.split(",").filter(isQuestionId);
  const names = QUESTION_IDS.filter((id) => asked.includes(id)).map((id) => QUESTION_NAMES[lang][id]);
  if (names.length === 0) return lang === "es" ? "la bicicleta" : "the bike";
  return joinList(names, lang);
}

/** Keyed by ReadField, so a fact the readers can fill in can't ship without a plain name in both languages. */
export const READ_FIELD_NAMES: Record<Lang, Record<ReadField, string>> = {
  en: {
    hasPedals: "the pedals",
    classes: "the class",
    ratedWatts: "the rated motor watts",
    peakWatts: "the peak watts",
    wattsUpTo: "the watts listed",
    hasThrottle: "the throttle",
    throttleMph: "the throttle top speed",
    assistMph: "the top assisted speed",
    topSpeedMph: "the top speed",
    wheelSize: "the wheel size",
    weightLb: "the weight",
    wheelCount: "the number of wheels",
    hasFootPegs: "the foot pegs",
    switchable: "the unlock or off-road mode",
  },
  es: {
    hasPedals: "los pedales",
    classes: "la clase",
    ratedWatts: "los vatios nominales del motor",
    peakWatts: "los vatios máximos",
    wattsUpTo: "los vatios del anuncio",
    hasThrottle: "el acelerador",
    throttleMph: "la velocidad máxima con acelerador",
    assistMph: "la velocidad máxima con asistencia",
    topSpeedMph: "la velocidad máxima",
    wheelSize: "el tamaño de las ruedas",
    weightLb: "el peso",
    wheelCount: "el número de ruedas",
    hasFootPegs: "los reposapiés",
    switchable: "el modo desbloqueado o todoterreno",
  },
};

function namedReadFields(ids: string): ReadField[] {
  const named = ids.split(",");
  return READ_FIELDS.filter((f) => named.includes(f));
}

/**
 * True when the list names one read fact, so the sentence says "under that fact", not "under each
 * one". It never says "under it", since many fact names are plural, like "the pedals", and "it"
 * would read as the bike.
 */
function oneReadField(ids: string): boolean {
  return namedReadFields(ids).length === 1;
}

/** "classes,wheelSize" becomes "the class and the wheel size", in the order the facts card shows them. */
export function readFieldList(ids: string, lang: Lang): string {
  const fields = namedReadFields(ids);
  if (fields.length === 0) return lang === "es" ? "los datos leídos" : "the facts that were read";
  return joinList(
    fields.map((f) => READ_FIELD_NAMES[lang][f]),
    lang,
  );
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
  over_hp: (p, c) => `The motor is ${p.watts} W. ${c.state} allows up to ${p.hp} horsepower, about ${p.cap} W.`,
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
  caution_assist_fast_mode: (_p, c) => `Pedal assist past 28 mph in any mode puts it outside ${c.state}'s e-bike definition.`,
  caution_class_not_recognized: (p, c) =>
    `${c.state} doesn't recognize Class ${cls(p)} e-bikes, so the law treats this one as a motor vehicle.`,
  caution_class_unclear: (p, c) => `${c.state}'s law doesn't clearly cover a Class ${cls(p)} e-bike.`,
  caution_class_age_unclear: (p, c) => `${c.state}'s law is unclear for Class ${cls(p)} riders this young.`,
  unsure_wheel_size: (_p, c) => `We need the wheel size to confirm this in ${c.state}.`,
  unsure_trike: (_p, c) => `We need the number of wheels to confirm this in ${c.state}.`,
  unsure_fast_mode: (_p, c) => `We need to know about fast or unlocked modes to confirm this in ${c.state}.`,
  unsure_assist_fast_mode: (_p, c) => `We need to know whether pedal assist can go past 28 mph to confirm this in ${c.state}.`,
  unsure_weight: (_p, c) => `We need to know whether it weighs over 100 pounds to confirm this in ${c.state}.`,
  unsure_foot_pegs: (_p, c) => `We need to know about foot pegs to confirm this in ${c.state}.`,
  unsure_pedal_kit: (_p, c) => `We need to know whether it needs a pedal kit to confirm this in ${c.state}.`,
  unsure_watts_hp: (_p, c) =>
    `${c.state} also caps the motor at 1 horsepower (about 745 W). The text doesn't give the rated watts, so we need the rated figure from the label to confirm this.`,
  unsure_class_age_unclear: (p, c) => `${c.state}'s law is unclear for Class ${cls(p)} riders this young.`,
  need_info: () => "A few quick questions first. A label can't show these.",
  req_helmet_under: (p) => `Helmet required for riders under ${p.underAge}.`,
  req_helmet_all_ages: (p) => `Helmet required at every age on a Class ${cls(p)}.`,
  req_supervision: (p) => `Under ${p.minAge}, only with a parent or another adult right there.`,
  req_parent_supervision: (p) => `Under ${p.minAge}, only under the direct supervision of a parent or guardian.`,
  req_supervision_or_certificate: (p) => `Under ${p.minAge}, only with adult supervision or a state e-bike safety certificate.`,
  req_speedometer_class3: (p, c) =>
    Number(p.definition)
      ? `It must have a speedometer. Without one it isn't a Class 3 e-bike in ${c.state}.`
      : `A Class 3 e-bike must have a speedometer in ${c.state}.`,
  req_roads_max_speed: (p) => `Ride only on roads with a posted speed limit of ${p.mph} mph or less, unless a local law allows faster roads.`,
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
  caution_fast_mode_unverified: (p) =>
    ({
      both: "If it has any mode over 20 mph on the motor alone, or over 28 mph with pedal assist, it is not a legal e-bike.",
      motor: "If it has any mode over 20 mph on the motor alone, it is not a legal e-bike.",
      assist: "If pedal assist can go past 28 mph in any mode, it is not a legal e-bike.",
    })[fastUnsure(p)],
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
  local_under_12_start_unclear: (p, c) =>
    `This place's ban on riders under 12 on Class 1 and 2 e-bikes starts ${formatDate(n(p.since), c.lang)} by its own text, but state law may have put it in force on ${formatDate(n(p.from), c.lang)}. Check before riding.`,
  local_under_12_after_check: (p, c) =>
    `This place's rules for riders under 12 were last checked on ${formatDate(n(p.checked), c.lang)}, and they can change before your ride date. We can confirm them only through ${formatDate(n(p.through), c.lang)}. Check again before riding.`,
  local_allowed: (p, c) => `Allowed in ${placeNameInline(n(p.place), c.lang)} for ${aAge(p.age)}.`,
  campus_allowed: (p) =>
    p.multi
      ? `This bike can run as Class ${p.multi}. Each of those classes is allowed on SDUHSD campuses, after these steps.`
      : `Class ${cls(p)} e-bikes are allowed on SDUHSD campuses, after these steps.`,
  campus_class3: () => "Only Class 1 and 2 e-bikes are allowed on SDUHSD campuses.",
  campus_no_emoto: () => "E-motos and other non-e-bikes aren't allowed on SDUHSD campuses.",
  sd_course_in_lieu: () =>
    "No fine if a parent or guardian gives the City proof, within 120 days of the citation, that the rider finished the e-bike safety program posted by the CHP.",
  sd_warning_period: (p, c) => `Warnings only until ${formatDate(n(p.from), c.lang)}. Fines start then.`,
  sd_age_12: () => "SDMC 84.19 bans only riders under 12. A 12-year-old may ride Class 1 or 2.",
  sd_emoto: () =>
    `The City has no e-moto ordinance of its own. Under state law, ${EMOTO_REMOVAL_EN}`,
  sd_helmet_all_riders: () =>
    "Wear a properly fitted and fastened helmet at all times while riding, at any age. SDMC 84.21 applies to every e-bike rider and can be read to require one.",
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
  county_parks_vehicle_rule: () =>
    "County park code also bars operating a vehicle without a driver's license and current registration, or off park roads and parking areas without written permission (SDCC 41.127). It uses the Vehicle Code meaning of vehicle, which can include e-bikes, while SDCC 41.130 allows e-bikes under state law. Whether 41.127 covers e-bikes isn't settled.",
  county_dpr_sites: () =>
    "The County parks department closes Lindo Lake and Jess Martin skate parks, the Ramona Grasslands Old Survey Road 97 Trail, Sweetwater Bike Park and the Valley Center Community Park skate park to all e-bikes.",
  county_dpr_class3: () => "The County parks department says Class 3 e-bikes are not allowed on County trails.",
  esc_under_12_passengers: () =>
    "Escondido's text also bars children under 12 from riding as passengers on a Class 1 or 2 e-bike (EMC 5-6(c)). State law only mentions operating.",
  esc_fines_start: () =>
    "Escondido's text allows a fine of up to $25 from Nov 16, 2026. The state law behind the ban gives only warning notices for the first 60 days a ban is in force, which would run through Jan 14, 2027.",
  esc_sidewalks_soon: () =>
    "No riding an e-bike on any sidewalk in Escondido, at any age, or where signs bar bikes (EMC 5-5). The rule starts Nov 15, 2026 by its own text and may already apply.",
  esc_sidewalks: () => "No riding an e-bike on any sidewalk in Escondido, at any age, or where signs bar bikes (EMC 5-5).",
  esc_parks: () =>
    "In Escondido parks and other recreational areas, city code bars driving any vehicle off paved park roads and parking areas (EMC 18-129). It isn't settled whether that covers e-bikes on park paths.",
  esc_seizure: () =>
    "Police can seize a bike or e-bike when the rider is cited for reckless riding or for not riding with due care (EMC 5-9).",
  sm_sidewalks: () =>
    "No riding on sidewalks in a business district, on the sidewalk of any street with a designated bike path or bike way, or where signs bar it. Sidewalks in residential areas are allowed. Yield to people walking (SMMC 12.25.040).",
  sm_class3_parks: () => "No Class 3 e-bikes in any San Marcos park or on any City trail (SMMC 9.04.070(f)(2)).",
  sm_parks: () =>
    "In San Marcos parks and on City trails, Class 1 and 2 e-bikes may ride only in areas set aside for bikes, at 15 mph at most and 5 mph within 50 feet of anyone else (SMMC 9.04.070(f)).",
  sm_trail_list: () =>
    "The City's trail page says Class 1 and 2 e-bikes are not allowed on the trails around Walnut Grove Park and the Highlands.",
  cv_under_12_passengers: () =>
    "Children under 12 can't ride as passengers on a Class 1 or 2 e-bike in Chula Vista either (CVMC 10.73.040). State law only mentions operating.",
  cv_no_passengers_under_18: () =>
    "In Chula Vista, a rider under 18 can't carry any passenger on an e-bike (CVMC 10.73.050(A)).",
  cv_sidewalks: () =>
    "No e-bike riding on sidewalks in a business district or where signs bar it, and no Class 3 on any sidewalk. On other sidewalks, go at a safe speed and yield to people walking (CVMC 10.73.080).",
  cv_parks: () =>
    "In City parks, no riding a bike or e-bike on paths, walks or courts unless the City has marked or permitted the path for bikes (CVMC 2.66.250). Whether that permission covers e-bikes isn't settled.",
  cv_impound: () =>
    "The City can impound an e-bike ridden against its e-bike rules for up to 30 days (CVMC 10.73.120(G)).",
  lm_emoto: () =>
    "La Mesa police can remove an e-moto that can top 20 mph on the motor alone when the rider has no license for it, and hold it at least 48 hours (LMMC 12.38.050). They can also remove a Class 3 e-bike ridden by someone under 16.",
  lm_sidewalks: () =>
    "La Mesa code bars riding any vehicle on any sidewalk except across a driveway, and it counts bicycles as vehicles (LMMC 12.32.040, 12.04.030). The city's e-bike page says no e-bike class may ride on sidewalks. Ride in the street or bike lane.",
  lm_parks: () =>
    "In La Mesa parks and on other public lands, city code bars motorized vehicles off roads and parking lots without police permission, and bars self-driven vehicles on park paths, fields and lawns (LMMC 12.32.140, 9.08.095). It isn't settled whether that covers e-bikes.",
  poway_under_12_passengers: () =>
    "Poway's text also bars children under 12 from riding as passengers on a Class 1 or 2 e-bike (PMC 10.57.040(A)). State law only mentions operating.",
  poway_no_passengers_under_18: () =>
    "In Poway, a rider under 18 can't carry any passenger on an e-bike (PMC 10.57.050(A)).",
  poway_speed: () =>
    "E-bike speed limits in Poway: 10 mph on sidewalks, 5 mph on school-zone sidewalks when children are there, 20 mph on bike paths and trails (PMC 10.57.070).",
  poway_where: () =>
    "E-bikes may use sidewalks, bike paths and trails unless signs say no, but not sidewalks in a business district (PMC 10.40.010). In parks, stay on marked trails, paths and roads, and off courts, fields and lawns (PMC 10.57.090).",
  poway_impound: () =>
    "The City can impound an e-bike ridden against its e-bike rules for up to 30 days (PMC 10.57.100(G)).",
  poway_trails_page: () =>
    "Poway's trails page says motorized vehicles aren't allowed on trails, with bike limits of 10 mph at Lake Poway and 15 mph elsewhere, and no bikes at Blue Sky Ecological Reserve. City code allows e-bikes on trails unless signs say no, so follow the trail signs.",
  ec_parks: () =>
    "No riding an e-bike, any class and any age, in any El Cajon park, playground or public facility, or on the Civic Center and Prescott Promenade grounds. Even sitting on a stopped e-bike counts. Walking it there is allowed (ECMC 9.42.030).",
  ec_sidewalks: () =>
    "El Cajon code bars riding any vehicle on any sidewalk except across a driveway (ECMC 10.08.070). It isn't settled whether that covers e-bikes, so ride in the street or bike lane.",
  santee_under_12_passengers: () =>
    "Santee's text also bars children under 12 from riding as passengers on a Class 1 or 2 e-bike (SMC 10.22.015(A)). State law only mentions operating.",
  santee_sidewalks: () =>
    "No riding an e-bike on any Santee sidewalk where the City has posted a sign against it (SMC 10.22.016).",
  santee_parks: () =>
    "In Santee parks, ride only on roads, and on walkways and trails the City has marked for bikes (SMC 8.08.280).",
  cor_under_12_passengers: () =>
    "Coronado's text also bars children under 12 from riding as passengers on a Class 1 or 2 e-bike (CMC 56.18.060(B)). State law only mentions operating.",
  cor_sidewalks: () =>
    "No riding an e-bike on any Coronado sidewalk, the Hotel del Coronado Paseo, the Coronado Shores Boardwalk or the Glorietta Bay Marina Promenade. Get off and walk it there, or ride on the road (CMC 56.18.050).",
  cor_beaches_parks: () =>
    "Coronado bars vehicles, motorized or not, on public beaches, parks and the golf course unless the City allows them (CMC 56.18.040). The City treats that as covering e-bikes.",
  oc_pier: () =>
    "No riding a bike or e-bike on the Oceanside Pier or its ramps, the Pier Amphitheater, Pier Plaza, the Junior Seau Beach Community Center area, or where signs bar it (OCC 5.14). From May 15 to Sep 15 no bikes at all on the pier (OCC 18.1).",
  oc_sidewalks: () =>
    "No riding on sidewalks in front of businesses unless signs allow it. On other sidewalks, 10 mph at most, go with traffic and yield to people walking (OCC 5.14(g)).",
  oc_beach: () =>
    "Oceanside bars riding any motorized machine on the beach (OCC 19.7). That very likely covers e-bikes.",
  oc_seizure: () =>
    "Police can seize a Class 1, 2 or 3 e-bike when the rider is cited for reckless riding, for not riding with due care, or for two or more criminal e-bike code violations in 12 months (OCC 5.18).",
  vista_sidewalks: () =>
    "No riding a bike or e-bike on any sidewalk in Vista, at any age, except at signed and striped Bicycle Master Plan spots (VMC 10.68.030).",
  vista_dismount: () =>
    "In Vista, get off and walk the bike to use a crosswalk or a sidewalk (VMC 10.68.060).",
  vista_passengers: () =>
    "A passenger needs a seat installed by the bike's maker. No riding on handlebars or pegs (VMC 10.68.040(B)).",
  vista_parks: () =>
    "In Vista parks, ride a bike or e-bike only on paths and trails marked for it (VMC 12.08.010(O)).",
  ib_pier: () =>
    "No riding a bike, e-bike or any other vehicle on the Imperial Beach pier (IBMC 12.68.010).",
  ib_beach: () =>
    "Imperial Beach bars bringing or driving any vehicle, with a motor or without, onto the beach (IBMC 12.60.110). That likely covers e-bikes.",
  ib_parks: () =>
    "In Imperial Beach parks, including Dunes Park, Portwood Pier Plaza and the Tijuana Estuary Boardwalk, bikes may ride only in areas the Council has set aside, and never on walkways (IBMC 12.56.020, 12.56.050). Whether this covers e-bikes isn't settled, so walk the bike there.",
  ib_sidewalks: () =>
    "No riding a bicycle on sidewalks in a business district (IBMC 10.56.180). The code defines bicycle as human powered, so treat e-bikes the same to be safe.",
  lg_pending: () =>
    "On Sep 15, 2026 Lemon Grove's Mayor asked to put a possible e-bike ordinance on a future agenda. Check again before riding.",
  lg_sidewalks: () =>
    "No riding a bicycle on sidewalks in a business district (LGMC 10.44.010). Treat e-bikes the same to be safe.",
  lg_parks: () =>
    "Lemon Grove bars motor vehicles in parks except in their parking areas (LGMC 12.20.140). It isn't settled whether that covers e-bikes.",
  city_starting: (p, c) => `Starting ${formatDate(n(p.date), c.lang)}: ${TEMPLATES.en[n(p.note)]?.(p, c) ?? ""}`,
  city_no_age_limit: (p, c) =>
    `${placeName(n(p.place), c.lang)} had no under-12 e-bike ban when checked on ${formatDate(n(p.date), c.lang)}, but state law lets it adopt one (VC 21214.7(b)). Check again before riding.`,
  city_course_in_lieu: () =>
    "No court record and no fee for the citation if a parent or guardian gives proof, within 120 days of it, that the rider finished an e-bike safety and training program.",
  city_warning_period: (p, c) => `Warnings only until ${formatDate(n(p.from), c.lang)}. Fines start then.`,
  city_age_12: () => "This city's ban covers only riders under 12. A 12-year-old may ride Class 1 or 2.",
  city_emoto_state_law: (p, c) => `${placeName(n(p.place), c.lang)} has no e-moto rule of its own that we found. Under state law, ${EMOTO_REMOVAL_EN}`,
  bl_unconfirmed_facts: (p, c) =>
    `You haven't checked ${readFieldList(n(p.fields), c.lang)} against the bike yet. Facts read from a link or photo can be wrong, so look at the bike and tick "It matches the bike" ${oneReadField(n(p.fields)) ? `under that fact in "Here's what I read" above, or fix that fact` : `under each one in "Here's what I read" above, or fix any that are wrong`}.`,
  bl_no_unchecked_facts: (p, c) =>
    oneReadField(n(p.fields))
      ? `You haven't checked ${readFieldList(n(p.fields), c.lang)} against the bike yet. A fact read from a link or photo can be wrong, so this answer could change once you check it. Look at the bike and tick "It matches the bike" under that fact in "Here's what I read" above, or fix that fact.`
      : `You haven't checked ${readFieldList(n(p.fields), c.lang)} against the bike yet. Facts read from a link or photo can be wrong, so this answer could change once you check them. Look at the bike and tick "It matches the bike" under each one in "Here's what I read" above, or fix any that are wrong.`,
  bl_unanswered: (p, c) => `Answer the questions above about ${questionList(n(p.questions), c.lang)}.`,
  bl_unsure_fast_mode: (p) =>
    ({
      both: "You answered \"not sure\" about fast modes. A mode over 20 mph on the motor alone, or over 28 mph with pedal assist, would make it not a legal e-bike.",
      motor: "You answered \"not sure\" about the motor alone going past 20 mph. A mode like that would make it not a legal e-bike.",
      assist: "You answered \"not sure\" about pedal assist going past 28 mph. A mode like that would make it not a legal e-bike.",
    })[fastUnsure(p)],
  bl_unverified_state: (p, c) =>
    p.verified === "unclear"
      ? `${c.state}'s statutes were read, but they don't clearly cover e-bikes, so no answer here can be confirmed.`
      : `${c.state}'s rules here were not confirmed against statute text.`,
  bl_unverified_primary_partial: (p) =>
    p.place === "sduhsd_campuses"
      ? "The class, tag, course, walk-on-campus, passenger-seat and e-moto rules come only from the district's web page. Only the helmet rule was found in a district regulation (AR 5142). No board policy or regulation was found for the others, and the Board has not voted on the class, tag and course rules."
      : "Only part of these rules was found in enacted text. The rest comes from an official web page.",
  bl_unverified_primary_not_found: () => "The enacted text behind these rules was not found. They come from an official page or a release.",
  bl_state_after_check: STATE_AFTER_CHECK_EN,
  caution_state_after_check: STATE_AFTER_CHECK_EN,
} satisfies Templates;

/** Spanish must have a sentence for every English code, and no code English lacks. */
const ES = {
  allowed: (p, c) =>
    p.multi
      ? `Esta bicicleta puede funcionar como Clase ${p.multi}. Permitida en todos sus modos para alguien de ${p.age} años en ${esName(c)}.`
      : `Bicicleta eléctrica Clase ${cls(p)}. Permitida para alguien de ${p.age} años en ${esName(c)}.`,
  under_min_age: (p, c) =>
    Number(p.cls) > 0
      ? `Los menores de ${p.minAge} años no pueden usar una bicicleta eléctrica Clase ${cls(p)} en ${esName(c)}.`
      : `Los menores de ${p.minAge} años no pueden usar una bicicleta eléctrica en ${esName(c)}.`,
  under_min_age_license: (p, c) =>
    `Los menores de ${p.minAge} años necesitan licencia o permiso de conducir para usar una bicicleta eléctrica en ${esName(c)}, así que en la práctica no pueden.`,
  no_any_class: () => "No está permitida como bicicleta eléctrica para esta persona, sea cual sea su clase.",
  no_pedals: (_p, c) => `No tiene pedales que funcionen, así que no es una bicicleta eléctrica en ${esName(c)}. La ley la trata como un vehículo motorizado.`,
  no_pedals_unclear: (_p, c) => `La definición ${esOf(c)} no exige pedales con claridad, así que no podemos confirmar una máquina sin ellos.`,
  pedals_unknown: () => "Necesitamos saber si tiene pedales que funcionen.",
  never_legal: (_p, c) => `No podemos confirmar que una bicicleta eléctrica sea legal en ${esName(c)}. Su ley no las cubre con claridad.`,
  facts_conflict: () => "Algunos datos no coinciden entre sí. Revisa las velocidades y los modos que escribiste.",
  class_unknown: () => "No encontramos la clase. Busca la etiqueta cerca de los pedales o escribe la clase.",
  class_conflict_throttle: (p) => `Una bicicleta Clase ${cls(p)} solo ayuda mientras pedaleas. Un acelerador significa que no cabe en una sola clase.`,
  class_conflict_speed: (p) => `Una etiqueta Clase ${cls(p)} y una velocidad de ${p.mph} mph no coinciden.`,
  throttle_unknown: (p) => `Necesitamos saber si tiene acelerador. Una bicicleta Clase ${cls(p)} solo ayuda mientras pedaleas.`,
  fits_no_class_speed: (p) => `${p.mph} mph es más rápido de lo que permite cualquier clase. La Clase 3 llega a 28 mph como máximo.`,
  fits_no_class_mode: () =>
    "En algún modo puede pasar de 20 mph solo con el motor, o de 28 mph pedaleando. Eso no cabe en ninguna clase de bicicleta eléctrica.",
  over_watts: (p, c) => `El motor es de ${p.watts} W. ${esSubj(c)} permite ${Number(p.strict) ? "menos de" : "hasta"} ${p.cap} W.`,
  watts_750_strict: (p, c) => `La ley ${esOf(c)} dice menos de ${p.cap} W. Una etiqueta de exactamente ${p.cap} W no cumple con claridad.`,
  watts_peak_only: (p) => `Solo aparece una cifra máxima (${p.peak} W). Decide la potencia nominal de la etiqueta.`,
  watts_upper_only: (p) => `El anuncio dice ${p.watts} W, pero no aclara si es potencia nominal o máxima. Decide la etiqueta.`,
  watts_unknown: () => "Necesitamos los vatios del motor que aparecen en la etiqueta.",
  over_hp: (p, c) => `El motor es de ${p.watts} W. ${esSubj(c)} permite hasta ${p.hp} caballos de fuerza, unos ${p.cap} W.`,
  vt_motor_assisted_bicycle: (p) =>
    `Con ${p.watts} W es una "bicicleta asistida por motor" en Vermont, no una bicicleta eléctrica. Nadie menor de 16 en carreteras, y nada de aceras.`,
  il_motor_driven_cycle: (p) =>
    `Con ${p.watts} W es un ciclomotor (motor driven cycle) en Illinois desde el 1 de enero de 2027. Necesita licencia de conducir y seguro.`,
  caution_wheel_size: (p, c) =>
    p.verdict === "not_an_ebike"
      ? `Sus ruedas son demasiado pequeñas para la definición de bicicleta eléctrica ${esOf(c)}.`
      : `Sus ruedas podrían ser demasiado pequeñas para la definición de bicicleta eléctrica ${esOf(c)}.`,
  caution_trike: (_p, c) => `La definición ${esOf(c)} podría no cubrir un triciclo.`,
  caution_foot_pegs: (_p, c) => `Los reposapiés la dejan fuera de la definición de bicicleta eléctrica ${esOf(c)}.`,
  caution_pedal_kit: (_p, c) => `Una bicicleta que necesita un kit de pedales queda fuera de la definición ${esOf(c)}.`,
  caution_weight: (_p, c) => `Con más de 100 libras queda fuera de la definición de bicicleta eléctrica ${esOf(c)}.`,
  caution_watts_hp: (_p, c) =>
    `${esSubj(c)} también limita el motor a 1 caballo de fuerza (unos 745 W), así que no se puede confirmar una etiqueta de 746 W o más.`,
  caution_fast_mode: (_p, c) =>
    `Un modo de más de 20 mph solo con el motor, o un ajuste que lo desbloquea, la deja fuera de la definición ${esOf(c)}.`,
  caution_assist_fast_mode: (_p, c) => `La asistencia al pedalear de más de 28 mph en algún modo la deja fuera de la definición ${esOf(c)}.`,
  caution_class_not_recognized: (p, c) =>
    `${esSubj(c)} no reconoce las bicicletas eléctricas Clase ${cls(p)}, así que la ley la trata como un vehículo motorizado.`,
  caution_class_unclear: (p, c) => `La ley ${esOf(c)} no cubre con claridad una bicicleta eléctrica Clase ${cls(p)}.`,
  caution_class_age_unclear: (p, c) => `La ley ${esOf(c)} no es clara para conductores tan jóvenes en una Clase ${cls(p)}.`,
  unsure_wheel_size: (_p, c) => `Necesitamos el tamaño de las ruedas para confirmarlo en ${esName(c)}.`,
  unsure_trike: (_p, c) => `Necesitamos saber cuántas ruedas tiene para confirmarlo en ${esName(c)}.`,
  unsure_fast_mode: (_p, c) => `Necesitamos saber si tiene modos rápidos o desbloqueados para confirmarlo en ${esName(c)}.`,
  unsure_assist_fast_mode: (_p, c) => `Necesitamos saber si la asistencia al pedalear puede pasar de 28 mph para confirmarlo en ${esName(c)}.`,
  unsure_weight: (_p, c) => `Necesitamos saber si pesa más de 100 libras para confirmarlo en ${esName(c)}.`,
  unsure_foot_pegs: (_p, c) => `Necesitamos saber si tiene reposapiés para confirmarlo en ${esName(c)}.`,
  unsure_pedal_kit: (_p, c) => `Necesitamos saber si necesita un kit de pedales para confirmarlo en ${esName(c)}.`,
  unsure_watts_hp: (_p, c) =>
    `${esSubj(c)} también limita el motor a 1 caballo de fuerza (unos 745 W). El texto no da los vatios nominales, así que necesitamos la cifra nominal de la etiqueta para confirmarlo.`,
  unsure_class_age_unclear: (p, c) => `La ley ${esOf(c)} no es clara para conductores tan jóvenes en una Clase ${cls(p)}.`,
  need_info: () => "Primero, unas preguntas rápidas. Una etiqueta no muestra esto.",
  req_helmet_under: (p) => `Casco obligatorio para menores de ${p.underAge} años.`,
  req_helmet_all_ages: (p) => `Casco obligatorio a cualquier edad en una Clase ${cls(p)}.`,
  req_supervision: (p) => `Menores de ${p.minAge}, solo con su padre, madre u otro adulto presente.`,
  req_parent_supervision: (p) => `Menores de ${p.minAge}, solo bajo la supervisión directa de su padre, madre o tutor legal.`,
  req_supervision_or_certificate: (p) => `Menores de ${p.minAge}, solo con supervisión de un adulto o un certificado estatal de seguridad.`,
  req_speedometer_class3: (p, c) =>
    Number(p.definition)
      ? `Debe tener velocímetro. Sin uno no es una bicicleta eléctrica Clase 3 en ${esName(c)}.`
      : `Una bicicleta eléctrica Clase 3 debe tener velocímetro en ${esName(c)}.`,
  req_roads_max_speed: (p) => `Anda solo por calles con un límite de velocidad señalado de ${p.mph} mph o menos, salvo que una ley local permita calles más rápidas.`,
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
    `La ley ${esOf(c)} también dice que el motor debe parar cuando dejas de pedalear o frenas. Leído al pie de la letra, eso choca con un acelerador. Los revisores mantuvieron la Clase 2 como legal, pero ningún tribunal ni agencia lo ha resuelto.`,
  caution_fast_mode_unverified: (p) =>
    ({
      both: "Si tiene algún modo de más de 20 mph solo con el motor, o de más de 28 mph con asistencia al pedalear, no es una bicicleta eléctrica legal.",
      motor: "Si tiene algún modo de más de 20 mph solo con el motor, no es una bicicleta eléctrica legal.",
      assist: "Si la asistencia al pedalear puede pasar de 28 mph en algún modo, no es una bicicleta eléctrica legal.",
    })[fastUnsure(p)],
  caution_helmet_unknown: (_p, c) => `La regla de casco ${esOf(c)} para bicicletas eléctricas no es clara. Usa uno.`,
  no_state_min_age: () => "No hay edad mínima estatal para esta clase.",
  no_state_helmet: () => "No hay regla estatal de casco. Las ciudades pueden tener una.",
  upcoming_change: (p, c) => `A partir del ${formatDate(n(p.date), c.lang)}: ${CHANGES.es[n(p.change)] ?? ""}`,
  local_under_12: (p, c) =>
    `Aquí los menores de 12 años no pueden usar bicicletas eléctricas Clase 1 o 2 (desde el ${formatDate(n(p.since), c.lang)}).`,
  local_under_12_unclear: () =>
    "Este lugar puede prohibir las Clases 1 y 2 a menores de 12 años, y no pudimos confirmar si lo ha hecho. Verifica antes de salir.",
  local_under_12_no_end: (p, c) =>
    `El código local prohíbe a los menores de 12 años usar bicicletas eléctricas Clase 1 y 2, sin fecha de fin. La ley estatal que permite esa prohibición termina el ${formatDate(n(p.powerEnds), c.lang)}, y no está resuelto si la prohibición sigue vigente después. Verifica antes de salir.`,
  local_under_12_start_unclear: (p, c) =>
    `La prohibición de este lugar para menores de 12 años en bicicletas eléctricas Clase 1 y 2 empieza el ${formatDate(n(p.since), c.lang)} según su propio texto, pero la ley estatal podría haberla puesto en vigor el ${formatDate(n(p.from), c.lang)}. Verifica antes de salir.`,
  local_under_12_after_check: (p, c) =>
    `Las reglas de este lugar para menores de 12 años se revisaron por última vez el ${formatDate(n(p.checked), c.lang)}, y pueden cambiar antes de la fecha de tu viaje. Solo podemos confirmarlas hasta el ${formatDate(n(p.through), c.lang)}. Vuelve a revisar antes de salir.`,
  local_allowed: (p, c) => `Permitida en ${placeNameInline(n(p.place), c.lang)} para alguien de ${p.age} años.`,
  campus_allowed: (p) =>
    p.multi
      ? `Esta bicicleta puede funcionar como Clase ${p.multi}. Cada una de esas clases se permite en las escuelas de SDUHSD, después de estos pasos.`
      : `Las bicicletas eléctricas Clase ${cls(p)} se permiten en las escuelas de SDUHSD, después de estos pasos.`,
  campus_class3: () => "En las escuelas de SDUHSD solo se permiten bicicletas eléctricas Clase 1 y 2.",
  campus_no_emoto: () => "Las motos eléctricas y otros vehículos que no son bicicletas eléctricas no se permiten en las escuelas de SDUHSD.",
  sd_course_in_lieu: () =>
    "No se cobra la multa si el padre, la madre o el tutor legal le da a la Ciudad, dentro de 120 días de la citación, prueba de que la persona terminó el programa de seguridad de bicicletas eléctricas publicado por la CHP.",
  sd_warning_period: (p, c) => `Solo advertencias hasta el ${formatDate(n(p.from), c.lang)}. Después empiezan las multas.`,
  sd_age_12: () => "La sección 84.19 del código municipal (SDMC) prohíbe solo a menores de 12 años. Alguien de 12 años puede usar una Clase 1 o 2.",
  sd_emoto: () => `La Ciudad no tiene una ordenanza propia sobre motos eléctricas. Según la ley estatal, ${EMOTO_REMOVAL_ES}`,
  sd_helmet_all_riders: () =>
    "Usa un casco bien ajustado y abrochado todo el tiempo que andes, a cualquier edad. La sección 84.21 del código municipal (SDMC) se aplica a todos los que manejan una bicicleta eléctrica y puede leerse como que lo exige.",
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
  county_parks_vehicle_rule: () =>
    "El código de parques del condado también prohíbe manejar un vehículo sin licencia de conducir y registro vigente, o fuera de los caminos y estacionamientos del parque sin permiso escrito (SDCC 41.127). Usa la definición de vehículo del Código de Vehículos, que puede incluir las bicicletas eléctricas, mientras que la SDCC 41.130 las permite según la ley estatal. No está resuelto si la 41.127 se aplica a las bicicletas eléctricas.",
  county_dpr_sites: () =>
    "El departamento de parques del condado cierra a todas las bicicletas eléctricas los skateparks de Lindo Lake y Jess Martin, el sendero Old Survey Road 97 de Ramona Grasslands, el Sweetwater Bike Park y el skatepark del Valley Center Community Park.",
  county_dpr_class3: () => "El departamento de parques del condado dice que las bicicletas eléctricas Clase 3 no se permiten en los senderos del condado.",
  esc_under_12_passengers: () =>
    "El texto de Escondido también prohíbe que los menores de 12 años vayan como pasajeros en una bicicleta eléctrica Clase 1 o 2 (EMC 5-6(c)). La ley estatal solo menciona manejarla.",
  esc_fines_start: () =>
    "El texto de Escondido permite una multa de hasta $25 desde el 16 de noviembre de 2026. La ley estatal en que se basa la prohibición solo da advertencias durante los primeros 60 días en vigor, lo que llegaría hasta el 14 de enero de 2027.",
  esc_sidewalks_soon: () =>
    "No se puede andar en bicicleta eléctrica por ninguna acera de Escondido, a ninguna edad, ni donde un letrero prohíba bicicletas (EMC 5-5). La regla empieza el 15 de noviembre de 2026 según su propio texto y podría aplicarse ya.",
  esc_sidewalks: () =>
    "No se puede andar en bicicleta eléctrica por ninguna acera de Escondido, a ninguna edad, ni donde un letrero prohíba bicicletas (EMC 5-5).",
  esc_parks: () =>
    "En parques y otras áreas recreativas de Escondido, el código prohíbe manejar cualquier vehículo fuera de los caminos pavimentados del parque y los estacionamientos (EMC 18-129). No está resuelto si eso incluye bicicletas eléctricas en los caminos del parque.",
  esc_seizure: () =>
    "La policía puede quitar una bicicleta o bicicleta eléctrica cuando a quien la maneja le dan una citación por manejar de forma imprudente o sin el debido cuidado (EMC 5-9).",
  sm_sidewalks: () =>
    "No se puede andar por aceras de zonas comerciales, por la acera de una calle con ciclovía designada, ni donde un letrero lo prohíba. Se permiten las aceras de zonas residenciales. Cede el paso a quienes caminan (SMMC 12.25.040).",
  sm_class3_parks: () =>
    "No se permiten bicicletas eléctricas Clase 3 en ningún parque de San Marcos ni en ningún sendero de la Ciudad (SMMC 9.04.070(f)(2)).",
  sm_parks: () =>
    "En parques y senderos de San Marcos, las Clases 1 y 2 solo pueden andar en zonas destinadas a bicicletas, a 15 mph como máximo y a 5 mph a menos de 50 pies de otras personas (SMMC 9.04.070(f)).",
  sm_trail_list: () =>
    "La página de senderos de la Ciudad dice que las Clases 1 y 2 no se permiten en los senderos alrededor de Walnut Grove Park y la zona de Highlands.",
  cv_under_12_passengers: () =>
    "En Chula Vista, los menores de 12 años tampoco pueden ir como pasajeros en una bicicleta eléctrica Clase 1 o 2 (CVMC 10.73.040). La ley estatal solo menciona manejarla.",
  cv_no_passengers_under_18: () =>
    "En Chula Vista, quien maneja una bicicleta eléctrica y tiene menos de 18 años no puede llevar pasajeros (CVMC 10.73.050(A)).",
  cv_sidewalks: () =>
    "No se puede andar en bicicleta eléctrica por aceras de zonas comerciales ni donde un letrero lo prohíba, y la Clase 3 no puede ir por ninguna acera. En otras aceras, ve a una velocidad segura y cede el paso a quienes caminan (CVMC 10.73.080).",
  cv_parks: () =>
    "En los parques de la Ciudad no se puede andar en bicicleta ni en bicicleta eléctrica por caminos, andadores o canchas, salvo que la Ciudad haya marcado o autorizado el camino para bicicletas (CVMC 2.66.250). No está resuelto si ese permiso incluye bicicletas eléctricas.",
  cv_impound: () =>
    "La Ciudad puede retener hasta 30 días una bicicleta eléctrica usada en contra de sus reglas (CVMC 10.73.120(G)).",
  lm_emoto: () =>
    "La policía de La Mesa puede retirar una moto eléctrica que pase de 20 mph solo con el motor cuando quien la maneja no tiene licencia para ella, y retenerla al menos 48 horas (LMMC 12.38.050). También puede retirar una bicicleta eléctrica Clase 3 que maneje alguien menor de 16 años.",
  lm_sidewalks: () =>
    "El código de La Mesa prohíbe andar en cualquier vehículo por cualquier acera, salvo para cruzar una entrada de autos, y cuenta las bicicletas como vehículos (LMMC 12.32.040, 12.04.030). La página de la ciudad dice que ninguna clase de bicicleta eléctrica puede ir por las aceras. Anda por la calle o la ciclovía.",
  lm_parks: () =>
    "En parques y otros terrenos públicos de La Mesa, el código prohíbe vehículos motorizados fuera de calles y estacionamientos sin permiso de la policía, y vehículos autopropulsados en caminos, campos y pasto de los parques (LMMC 12.32.140, 9.08.095). No está resuelto si eso incluye bicicletas eléctricas.",
  poway_under_12_passengers: () =>
    "El texto de Poway también prohíbe que los menores de 12 años vayan como pasajeros en una bicicleta eléctrica Clase 1 o 2 (PMC 10.57.040(A)). La ley estatal solo menciona manejarla.",
  poway_no_passengers_under_18: () =>
    "En Poway, quien maneja una bicicleta eléctrica y tiene menos de 18 años no puede llevar pasajeros (PMC 10.57.050(A)).",
  poway_speed: () =>
    "Límites de velocidad para bicicletas eléctricas en Poway: 10 mph en aceras, 5 mph en aceras de zonas escolares cuando hay niños, 20 mph en ciclovías y senderos (PMC 10.57.070).",
  poway_where: () =>
    "Las bicicletas eléctricas pueden usar aceras, ciclovías y senderos salvo que un letrero lo prohíba, pero no las aceras de zonas comerciales (PMC 10.40.010). En los parques, quédate en senderos, caminos y calles marcados, y fuera de canchas, campos y pasto (PMC 10.57.090).",
  poway_impound: () =>
    "La Ciudad puede retener hasta 30 días una bicicleta eléctrica usada en contra de sus reglas (PMC 10.57.100(G)).",
  poway_trails_page: () =>
    "La página de senderos de Poway dice que no se permiten vehículos motorizados en los senderos, con límites para bicicletas de 10 mph en Lake Poway y 15 mph en los demás, y sin bicicletas en Blue Sky Ecological Reserve. El código de la ciudad permite bicicletas eléctricas en senderos salvo que un letrero lo prohíba, así que sigue los letreros.",
  ec_parks: () =>
    "No se puede andar en bicicleta eléctrica, de ninguna clase y a ninguna edad, en ningún parque, área de juegos o instalación pública de El Cajon, ni en los terrenos del Civic Center y Prescott Promenade. Incluso estar sentado en una bicicleta eléctrica detenida cuenta. Se puede llevar caminando (ECMC 9.42.030).",
  ec_sidewalks: () =>
    "El código de El Cajon prohíbe andar en cualquier vehículo por cualquier acera, salvo para cruzar una entrada de autos (ECMC 10.08.070). No está resuelto si eso incluye bicicletas eléctricas, así que anda por la calle o la ciclovía.",
  santee_under_12_passengers: () =>
    "El texto de Santee también prohíbe que los menores de 12 años vayan como pasajeros en una bicicleta eléctrica Clase 1 o 2 (SMC 10.22.015(A)). La ley estatal solo menciona manejarla.",
  santee_sidewalks: () =>
    "No se puede andar en bicicleta eléctrica por ninguna acera de Santee donde la Ciudad haya puesto un letrero que lo prohíba (SMC 10.22.016).",
  santee_parks: () =>
    "En los parques de Santee, anda solo por las calles y por los caminos y senderos que la Ciudad haya marcado para bicicletas (SMC 8.08.280).",
  cor_under_12_passengers: () =>
    "El texto de Coronado también prohíbe que los menores de 12 años vayan como pasajeros en una bicicleta eléctrica Clase 1 o 2 (CMC 56.18.060(B)). La ley estatal solo menciona manejarla.",
  cor_sidewalks: () =>
    "No se puede andar en bicicleta eléctrica por ninguna acera de Coronado, el Paseo del Hotel del Coronado, el paseo de Coronado Shores ni el paseo de la marina de Glorietta Bay. Ahí bájate y llévala caminando, o anda por la calle (CMC 56.18.050).",
  cor_beaches_parks: () =>
    "Coronado prohíbe vehículos, con o sin motor, en playas públicas, parques y el campo de golf salvo que la Ciudad lo permita (CMC 56.18.040). La Ciudad lo aplica a las bicicletas eléctricas.",
  oc_pier: () =>
    "No se puede andar en bicicleta ni en bicicleta eléctrica en el muelle de Oceanside o sus rampas, el anfiteatro del muelle, Pier Plaza, la zona del Junior Seau Beach Community Center, ni donde un letrero lo prohíba (OCC 5.14). Del 15 de mayo al 15 de septiembre no se permiten bicicletas en el muelle (OCC 18.1).",
  oc_sidewalks: () =>
    "No se puede andar por aceras frente a negocios, salvo que un letrero lo permita. En otras aceras, 10 mph como máximo, en el sentido del tráfico y cediendo el paso a quienes caminan (OCC 5.14(g)).",
  oc_beach: () =>
    "Oceanside prohíbe andar en cualquier máquina motorizada en la playa (OCC 19.7). Eso muy probablemente incluye las bicicletas eléctricas.",
  oc_seizure: () =>
    "La policía puede quitar una bicicleta eléctrica Clase 1, 2 o 3 cuando a quien la maneja le dan una citación por manejar de forma imprudente, sin el debido cuidado, o por dos o más infracciones penales del código en 12 meses (OCC 5.18).",
  vista_sidewalks: () =>
    "No se puede andar en bicicleta ni en bicicleta eléctrica por ninguna acera de Vista, a ninguna edad, salvo en los puntos del Plan Maestro de Bicicletas con letreros y marcas (VMC 10.68.030).",
  vista_dismount: () =>
    "En Vista, bájate y lleva la bicicleta caminando para usar un cruce peatonal o una acera (VMC 10.68.060).",
  vista_passengers: () =>
    "Un pasajero necesita un asiento instalado por el fabricante de la bicicleta. No se puede ir en el manubrio ni en los reposapiés (VMC 10.68.040(B)).",
  vista_parks: () =>
    "En los parques de Vista, anda en bicicleta o bicicleta eléctrica solo por caminos y senderos marcados para ello (VMC 12.08.010(O)).",
  ib_pier: () =>
    "No se puede andar en bicicleta, bicicleta eléctrica ni ningún otro vehículo en el muelle de Imperial Beach (IBMC 12.68.010).",
  ib_beach: () =>
    "Imperial Beach prohíbe llevar o manejar cualquier vehículo, con o sin motor, en la playa (IBMC 12.60.110). Eso probablemente incluye las bicicletas eléctricas.",
  ib_parks: () =>
    "En los parques de Imperial Beach, incluidos Dunes Park, Portwood Pier Plaza y el paseo del estuario de Tijuana, las bicicletas solo pueden andar en zonas que el Concejo haya destinado para ello, y nunca en andadores (IBMC 12.56.020, 12.56.050). No está resuelto si esto incluye bicicletas eléctricas, así que ahí llévala caminando.",
  ib_sidewalks: () =>
    "No se puede andar en bicicleta por aceras de zonas comerciales (IBMC 10.56.180). El código define bicicleta como de pedal, así que, por seguridad, trata igual a las bicicletas eléctricas.",
  lg_pending: () =>
    "El 15 de septiembre de 2026, el alcalde de Lemon Grove pidió llevar una posible ordenanza de bicicletas eléctricas a una agenda futura. Vuelve a revisar antes de salir.",
  lg_sidewalks: () =>
    "No se puede andar en bicicleta por aceras de zonas comerciales (LGMC 10.44.010). Por seguridad, trata igual a las bicicletas eléctricas.",
  lg_parks: () =>
    "Lemon Grove prohíbe vehículos de motor en los parques, salvo en sus estacionamientos (LGMC 12.20.140). No está resuelto si eso incluye bicicletas eléctricas.",
  city_starting: (p, c) => `A partir del ${formatDate(n(p.date), c.lang)}: ${TEMPLATES.es[n(p.note)]?.(p, c) ?? ""}`,
  city_no_age_limit: (p, c) =>
    `${placeName(n(p.place), c.lang)} no tenía una prohibición para menores de 12 años cuando se revisó el ${formatDate(n(p.date), c.lang)}, pero la ley estatal le permite adoptar una (VC 21214.7(b)). Vuelve a revisar antes de salir.`,
  city_course_in_lieu: () =>
    "No se manda registro al tribunal ni se cobra la citación si el padre, la madre o el tutor legal da prueba, dentro de 120 días, de que la persona terminó un programa de seguridad y capacitación de bicicletas eléctricas.",
  city_warning_period: (p, c) => `Solo advertencias hasta el ${formatDate(n(p.from), c.lang)}. Después empiezan las multas.`,
  city_age_12: () => "La prohibición de esta ciudad solo cubre a menores de 12 años. Alguien de 12 años puede usar una Clase 1 o 2.",
  city_emoto_state_law: (p, c) =>
    `${placeName(n(p.place), c.lang)} no tiene una regla propia sobre motos eléctricas que hayamos encontrado. Según la ley estatal, ${EMOTO_REMOVAL_ES}`,
  bl_unconfirmed_facts: (p, c) =>
    `Todavía no comparaste con la bicicleta ${readFieldList(n(p.fields), c.lang)}. Los datos leídos de un enlace o una foto pueden estar mal, así que mira la bicicleta y marca "Coincide con la bicicleta" ${oneReadField(n(p.fields)) ? `debajo de ese dato en "Esto es lo que leí", arriba, o corrige el dato` : `debajo de cada uno en "Esto es lo que leí", arriba, o corrige los que estén mal`}.`,
  bl_no_unchecked_facts: (p, c) =>
    oneReadField(n(p.fields))
      ? `Todavía no comparaste con la bicicleta ${readFieldList(n(p.fields), c.lang)}. Un dato leído de un enlace o una foto puede estar mal, así que esta respuesta podría cambiar cuando lo compares. Mira la bicicleta y marca "Coincide con la bicicleta" debajo de ese dato en "Esto es lo que leí", arriba, o corrige el dato.`
      : `Todavía no comparaste con la bicicleta ${readFieldList(n(p.fields), c.lang)}. Los datos leídos de un enlace o una foto pueden estar mal, así que esta respuesta podría cambiar cuando los compares. Mira la bicicleta y marca "Coincide con la bicicleta" debajo de cada uno en "Esto es lo que leí", arriba, o corrige los que estén mal.`,
  bl_unanswered: (p, c) => `Responde las preguntas de arriba sobre ${questionList(n(p.questions), c.lang)}.`,
  bl_unsure_fast_mode: (p) =>
    ({
      both: "Respondiste \"no sé\" sobre los modos rápidos. Un modo de más de 20 mph solo con el motor, o de más de 28 mph con asistencia al pedalear, haría que no fuera una bicicleta eléctrica legal.",
      motor: "Respondiste \"no sé\" sobre si el motor solo pasa de 20 mph. Un modo así haría que no fuera una bicicleta eléctrica legal.",
      assist: "Respondiste \"no sé\" sobre si la asistencia al pedalear pasa de 28 mph. Un modo así haría que no fuera una bicicleta eléctrica legal.",
    })[fastUnsure(p)],
  bl_unverified_state: (p, c) =>
    p.verified === "unclear"
      ? `Se leyeron las leyes ${esOf(c)}, pero no cubren con claridad las bicicletas eléctricas, así que aquí no se puede confirmar ninguna respuesta.`
      : `Las reglas ${esOf(c)} no se confirmaron contra el texto de la ley.`,
  bl_unverified_primary_partial: (p) =>
    p.place === "sduhsd_campuses"
      ? "Las reglas de clase, etiqueta, curso, caminar con la bicicleta en la escuela, asiento de pasajero y motos eléctricas vienen solo de la página web del distrito. Solo la regla del casco se encontró en un reglamento del distrito (AR 5142). No se encontró ninguna política ni reglamento de la junta para las demás, y la junta no ha votado sobre las reglas de clase, etiqueta y curso."
      : "Solo una parte de estas reglas se encontró en un texto vigente. El resto viene de una página web oficial.",
  bl_unverified_primary_not_found: () => "No se encontró el texto vigente de estas reglas. Vienen de una página o un comunicado oficial.",
  bl_state_after_check: STATE_AFTER_CHECK_ES,
  caution_state_after_check: STATE_AFTER_CHECK_ES,
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

/**
 * The lines with repeats left out. Two lines that render to the same sentence, with the same
 * Details text, are shown once, even when their codes or numbers differ in ways the sentence
 * doesn't show, like the class of a note that is the same for every class.
 */
export function uniqueRendered(lines: Line[], lang: Lang, state: string): Line[] {
  const seen = new Set<string>();
  return lines.filter((l) => {
    const key = `${renderLine(l, lang, state)}\n${l.detail ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
