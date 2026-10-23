# Local where-you-ride rules, San Diego County set B

Derived 2026-10-23 for `data/rules/route/local_sd_b.json`. Jurisdictions: Chula Vista, Coronado, El Cajon, Imperial Beach, La Mesa, Lemon Grove, National City, Santee, Unincorporated San Diego County.

## How this was made

- Source 1 is `data/rules/san_diego_local.json`, `other_local_rules` for the nine ids. Every entry marked `record` takes its quote, citation and URL from the record, and the check script confirms each quote is an exact substring of the record quote.
- Source 2 is the enacted city or county code, read in the Claude built-in browser because the code hosts block plain downloads. Hosts used were Code Publishing (Chula Vista, Coronado), eCode360 (El Cajon, Imperial Beach, Lemon Grove, Santee), Municode (La Mesa, National City) and American Legal (the County). eCode360 whole-title print pages and Municode chapter pages were saved as text and searched.
- Every entry marked `new_reading` has a quote copied from enacted text. Chula Vista, Imperial Beach and La Mesa quotes were matched against saved page text by script. Coronado, National City and County quotes were matched against the live pages in the browser on 2026-10-23.
- Agency pages, FAQs, news and staff reports were not used to say allowed or banned.

## Decisions that apply to every jurisdiction

- Park, beach and pier rules are attached to `bike_path`, `footway` and `trail` only (and to `sidewalk` in Chula Vista, where the text names sidewalks). The app cannot map business districts and, I assumed, cannot map parks either, so a rule with a `where` other than `everywhere` makes every segment of that kind unconfirmed. Attaching a park rule to `road` would make every street unconfirmed, so park roads are not modelled.
- Freeway rules (a sign-dependent ban on bicycles on freeways) are not entered as `road` rules, because `road` means a street with no bike lane.
- Status follows the record. Where the record says it is unsettled whether a bicycle rule reaches e-bikes, the status is `unclear`. Where the record does not doubt that a rule reaches e-bikes, the status is `banned`. My own new readings use `unclear` when the text says only vehicle or motorized vehicle and does not name bicycles (Imperial Beach 10.36.160, La Mesa 9.08.095, County 41.127(f)).
- A sidewalk ban limited to business districts or posted signs is `banned` (or `unclear` where the record doubts it) with `where` set to `business_district` or `posted_signs`.
- `whereNote` explains the rule in plain words. It is also filled in for `everywhere` entries where a reader needs the reason, such as an `unclear` status or a Class 3 only rule.
- No entry has status `allowed`. No enacted text found says e-bikes may ride a kind of way in a way that adds to state law.

## Summary

| Jurisdiction | Kinds with rules | noRuleFound | notChecked | Facilities | New readings |
|---|---|---|---|---|---|
| Chula Vista | bike_path, sidewalk, footway, trail | road, bike_lane, separated_bikeway | none | 0 | 1 |
| Coronado | bike_path, sidewalk, footway, trail | road, bike_lane, separated_bikeway | none | 3 | 4 |
| El Cajon | bike_path, sidewalk, footway, trail | road, bike_lane, separated_bikeway | none | 1 | 0 |
| Imperial Beach | bike_path, sidewalk, footway, trail | road, bike_lane, separated_bikeway | none | 1 | 1 |
| La Mesa | bike_path, sidewalk, footway, trail | road, bike_lane, separated_bikeway | none | 0 | 1 |
| Lemon Grove | bike_path, sidewalk, footway, trail | road, bike_lane, separated_bikeway | none | 0 | 0 |
| National City | bike_path, sidewalk, footway, trail | road, bike_lane, separated_bikeway | none | 0 | 1 |
| Santee | bike_path, sidewalk, footway, trail | road, bike_lane, separated_bikeway | none | 0 | 0 |
| Unincorporated San Diego County | bike_path, sidewalk, footway, trail | none | road, bike_lane, separated_bikeway | 0 | 1 |

## Chula Vista

### Rules taken from the record

- bike_path, sidewalk, footway, trail. Status unclear, where parks, classes 1/2/3. Rule `park_path_limits`, Chula Vista Mun. Code 2.66.250, 10.73.100. https://chulavista.municipal.codes/CVMC/2.66
- sidewalk. Status banned, where business_district, classes 1/2/3. Rule `sidewalk_rules`, Chula Vista Mun. Code 10.73.080(A) (Ord. 3597). https://chulavista.municipal.codes/CVMC/10.73
- sidewalk. Status banned, where posted_signs, classes 1/2/3. Rule `sidewalk_rules`, Chula Vista Mun. Code 10.73.080(A) (Ord. 3597). https://chulavista.municipal.codes/CVMC/10.73

### New readings

- sidewalk. Status banned, where everywhere, classes 3. Rule `sidewalk_rules`, Chula Vista Mun. Code 10.73.080(B) (Ord. 3597). https://chulavista.municipal.codes/CVMC/10.73.080

### Kinds with no rule found

- road, bike_lane, separated_bikeway. Read, CVMC Ch. 10.72 Bicycles, Ch. 10.73 Electric Micromobility Vehicles and Ch. 10.76 Pedestrians (all sections of each), plus the Title 10 chapter list and the Ch. 10.08 definitions of bicycle, bicycle lane, bicycle path, business district and electric micromobility vehicle. 10.73.080(C) to (E) cover motorized scooters only. https://chulavista.municipal.codes/CVMC/10.72

### Read but not modelled

- CVMC 10.72.190 lets human-powered bicycles use residential sidewalks and bans them in business districts and on posted sidewalks. The e-bike chapter already covers those sidewalks, so it adds nothing.
- CVMC 2.66.100 bars a self-driven vehicle on any park, recreation trail or plaza except at parking places. Whether an e-bike counts is unclear, and it would only add a second unclear entry on the path kinds, so it is left out.
- CVMC 2.66.255 limits City skate facilities to manually propelled devices. A skate facility is not a way kind.
- CVMC 10.73.090 (parking structures) and 10.73.110 (parking) are not riding rules for a kind of way.

### Map names

No facilities.

### Open items

- Whether an e-bike may use a park path that the Director of Recreation has designated for bicycles (the record's own open question).

## Coronado

### Rules taken from the record

- bike_path, footway, trail. Status unclear, where beaches, classes 1/2/3. Rule `beach_park_vehicle_ban`, Coronado Mun. Code 56.18.040. https://coronado.municipal.codes/CMC/56.18.040
- bike_path, footway, trail. Status unclear, where parks, classes 1/2/3. Rule `beach_park_vehicle_ban`, Coronado Mun. Code 56.18.040. https://coronado.municipal.codes/CMC/56.18.040

### New readings

- sidewalk. Status banned, where everywhere, classes 1/2/3. Rule `sidewalk_and_boardwalk_ban`, Coronado Mun. Code 56.18.050(B)(1), 56.02.020(H) (Ord. 2024-09). https://coronado.municipal.codes/CMC/56.18.050
- Facility `coronado_hotel_del_paseo`, Paseo at the Hotel del Coronado. Banned, classes 1/2/3. Rule `sidewalk_and_boardwalk_ban`, Coronado Mun. Code 56.18.050(B)(2), 56.02.020(H) (Ord. 2024-09). https://coronado.municipal.codes/CMC/56.18.050
- Facility `coronado_shores_boardwalk`, Boardwalk at Coronado Shores. Banned, classes 1/2/3. Rule `sidewalk_and_boardwalk_ban`, Coronado Mun. Code 56.18.050(B)(3), 56.02.020(H) (Ord. 2024-09). https://coronado.municipal.codes/CMC/56.18.050
- Facility `coronado_glorietta_bay_promenade`, Promenade along the Glorietta Bay Marina. Banned, classes 1/2/3. Rule `sidewalk_and_boardwalk_ban`, Coronado Mun. Code 56.18.050(B)(4), 56.02.020(H) (Ord. 2024-09). https://coronado.municipal.codes/CMC/56.18.050

### Kinds with no rule found

- road, bike_lane, separated_bikeway. Read, CMC Ch. 56.01, 56.02, 56.08 Bicycles, 56.18 Driving Rules, 56.20, 56.28, 56.40 Restricted Use of Streets and 56.90 (all sections), plus Ch. 48.04 Beaches. 56.18.050(B) sends riders to adjacent or nearby roadways and sets no street rule. https://coronado.municipal.codes/CMC/56

### Read but not modelled

- CMC 56.18.030 bans a motor vehicle on the Strand Bikeway along State Highway 75 where signs are posted, with a carve-out for licensed motorized bicycles. It does not name bicycles or e-bikes, and the record reads it as reaching e-motos only. Not modelled.
- CMC 56.08.054 bans human-powered bicycles on business-district sidewalks. The e-bike sidewalk ban in 56.18.050 already covers every City sidewalk.
- CMC 48.16.570(C) bars any wheeled riding device on the Glorietta Bay sea wall. It does not name e-bikes and the sea wall has no map name, so it is not listed as a facility.
- CMC 56.28.045 bars motorized vehicles in the City skateboard facility. A skate facility is not a way kind.
- Res. 2024-66 (Shores Boardwalk, bicycles) appears in the record as an unsigned draft in the Nov 19, 2024 packet. I did not read it, and 56.18.050 already covers the boardwalk.
- CMC 56.18.050(B) tells displaced riders to use adjacent or nearby roadways. That points riders to streets and sets no street rule, so it is not modelled as an allowed entry.

### Map names

Nominatim (one request per second, User-Agent naming is-it-an-ebike) found no way or place named Paseo at the Hotel del Coronado, Coronado Shores Boardwalk or Glorietta Bay Promenade. It did find the bounding names the code uses: Avenida Del Sol, R.H. Dana Place (OSM spelling), Avenida Lunar, Strand Way, Glorietta Bay Park and Paseo Lawn (a grass area). The three facility names in the JSON are therefore the code's own words. OSM draws the Bayshore Bikeway (highway=cycleway, bicycle=designated) along Glorietta Bay and Coronado Shores, for example way ids 1430352001 and 1430351357. I could not confirm that the Promenade or the Boardwalk is that same path. I left Bayshore Bikeway out of the names on purpose, because a name match would ban the whole bikeway including the Silver Strand. Someone with a map should check whether the Promenade stretch is the Bayshore Bikeway.

### Open items

- Whether CMC 56.18.040 (vehicles on beaches and in parks) reaches e-bikes. The city treats it as covering them (the record's own open question).
- Whether the Glorietta Bay Promenade and the Coronado Shores Boardwalk are mapped as the Bayshore Bikeway.
- Silver Strand. CMC 56.18.030 bans a motor vehicle on the Strand Bikeway along Highway 75, from the south City limits to Glorietta Boulevard at Tenth Street, where signs are posted. It does not name bicycles or e-bikes, and neither the record nor the text says an e-bike is a motor vehicle, so there is no Silver Strand entry. If you want a caution there, add a Coronado bike_path entry with status unclear and where posted_signs.

## El Cajon

### Rules taken from the record

- bike_path, footway, trail. Status banned, where parks, classes 1/2/3. Rule `park_and_facility_ebike_ban`, El Cajon Mun. Code 9.42.030 (Ord. No. 5176). https://ecode360.com/44370011
- sidewalk. Status unclear, where everywhere, classes 1/2/3. Rule `sidewalk_vehicle_ban`, El Cajon Mun. Code 10.08.070, 10.04.140. https://ecode360.com/44370524

### New readings

None.

### Facilities taken from the record

- `el_cajon_prescott_promenade_civic_center`, Prescott Promenade, Prescott Promenade Park. Banned, classes 1/2/3. Rule `park_and_facility_ebike_ban`, El Cajon Mun. Code 9.42.030 (Ord. No. 5176). https://ecode360.com/44370011

### Kinds with no rule found

- road, bike_lane, separated_bikeway. Read, Read in full: ECMC Ch. 9.42, Ch. 10.08 General Provisions and Ch. 10.26 Dockless Vehicles. Searched the full text of Titles 2, 9, 10 and 12 for bicycle, bike, scooter, skate and wheeled device and read every match. Only freeway and park rules turned up besides the sidewalk rule, and a freeway or a park is not an ordinary street. https://ecode360.com/44370485

### Read but not modelled

- ECMC 10.20.120 bars bicycles and other vehicles not drawn by a motor vehicle on a freeway where official signs give notice. A freeway is not an ordinary street, so it is not a road entry.
- ECMC 2.56.030(P), (Q) and (R) bar bicycles on park pedestrian walks, any vehicle in a park, and parking outside marked places. 9.42.030 already bars riding e-bikes in parks.
- ECMC 9.42.030, second sentence, bars human-powered bicycles in the Civic Center area unless on a bike path, alley, street or highway. The e-bike sentence has no such exception.
- ECMC 9.42.045 covers skatepark facilities. ECMC 10.26.050 and 12.08.100 ban shared dockless vehicles from sidewalks, which is not the same as a personal e-bike.

### Map names

Nominatim found Prescott Promenade Park (leisure=park, way 44500980) and no way named Prescott Promenade, so both names are listed.

### Open items

- Whether ECMC 10.08.070 (no vehicles on sidewalks) reaches e-bikes (the record's own open question).
- Whether the 9.42.030 e-bike ban reaches sidewalks and parking lots next to a park (the record's own open question).

## Imperial Beach

### Rules taken from the record

- bike_path, footway, trail. Status unclear, where parks, classes 1/2/3. Rule `park_bicycle_rules`, Imperial Beach Mun. Code 12.56.020(P), (EE), 12.56.050(A). https://ecode360.com/42864356
- bike_path, footway, trail. Status banned, where beaches, classes 1/2/3. Rule `beach_vehicle_ban`, Imperial Beach Mun. Code 12.60.110(A). https://ecode360.com/42864480
- sidewalk. Status unclear, where business_district, classes 1/2/3. Rule `business_sidewalk_ban`, Imperial Beach Mun. Code 10.56.180, 10.56.010. https://ecode360.com/42863889

### New readings

- bike_path, footway, trail. Status unclear, where beaches, classes 1/2/3. Rule `beach_area_vehicle_ban`, Imperial Beach Mun. Code 10.36.160 (Ord. 93-866). https://ecode360.com/42863741

### Facilities taken from the record

- `imperial_beach_pier`, Imperial Beach Pier. Banned, classes 1/2/3. Rule `pier_ban`, Imperial Beach Mun. Code 12.68.010(A). https://ecode360.com/42864551

### Kinds with no rule found

- road, bike_lane, separated_bikeway. Read, IBMC Title 10 Vehicles and Traffic (all chapters, 10.04 to 10.59, searched for bicycle, bike, skate, scooter and wheeled device), with Ch. 10.56 Bicycle Licensing and Regulation, 10.12.040 and 10.16.040 read in full. 10.56.180 covers business-district sidewalks only. https://ecode360.com/42863667

### Read but not modelled

- IBMC 12.56.020(P) bars riding a bicycle, motorcycle, automobile or other vehicle on a park pedestrian walk or designated bicycle path unless the City Manager allows it. It is covered by the same unclear park entry and is named in its whereNote.
- IBMC 12.56.055 (skateboard park), 10.16.040 (roller skates and coasters on an open roadway) and 9.10 (skateboards) are not e-bike rules.
- IBMC 10.56.020 still requires a City bicycle license. The record says staff do not enforce it after AB 1909, so it is not a riding rule.

### Map names

Nominatim found Imperial Beach Pier (man_made=pier, way 25723336), Imperial Beach Pier Plaza (landuse), Portwood Pier Plaza (leisure=park) and Seacoast Drive. It found nothing for the Tijuana Estuary Boardwalk or a boardwalk on Seacoast Drive.

### Open items

- Whether the park rules in IBMC 12.56 and the business-district sidewalk rule in 10.56.180 reach e-bikes (the record's own open question).
- Which map feature is the boardwalk that IBMC 10.36.160 counts as part of the beach area.

## La Mesa

### Rules taken from the record

- bike_path, footway, trail. Status unclear, where parks, classes 1/2/3. Rule `park_motorized_vehicle_ban`, La Mesa Mun. Code 12.32.140, 9.08.095. https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT12TR_CH12.32MIDRRU
- sidewalk. Status banned, where everywhere, classes 1/2/3. Rule `sidewalk_vehicle_ban`, La Mesa Mun. Code 12.32.040, 12.04.030. https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT12TR_CH12.32MIDRRU

### New readings

- bike_path, footway, trail. Status unclear, where parks, classes 1/2/3. Rule `park_motorized_vehicle_ban`, La Mesa Mun. Code 9.08.095. https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT9PARE_CH9.08RUGOPAREAR

### Kinds with no rule found

- road, bike_lane, separated_bikeway. Read, Read in full: LMMC 12.04.020 and 12.04.030 definitions, 12.12.050, Ch. 12.32 Miscellaneous Driving Rules, Ch. 12.36 Pedestrians and Ch. 12.38 Electric Bicycle Safety Pilot Program. Searched Ch. 12.52 Restricted Use of Streets for bicycle, bike, skate, scooter and wheel terms, which turned up only weight limits on named streets, plus the Title 12 chapter list. 12.32.070 covers freeways only. https://library.municode.com/ca/la_mesa/codes/code_of_ordinances?nodeId=TIT12TR

### Read but not modelled

- LMMC 12.32.070 bars bicycles and similar vehicles on a freeway where official signs give notice. A freeway is not an ordinary street.
- LMMC 12.38.050 lets an officer remove certain vehicles. It is not a riding rule.
- LMMC 12.52 sets weight and commercial vehicle limits on named streets. It does not apply to e-bikes.

### Map names

No facilities.

### Open items

- Whether LMMC 12.32.140 and 9.08.095 reach e-bikes in parks and on public lands (the record's own open question).
- The sidewalk entry is banned on the words of 12.32.040 and the 12.04.030 definition. No court or city statement has tested it, and the city's e-bike page agrees with this reading.

## Lemon Grove

### Rules taken from the record

- bike_path, footway, trail. Status unclear, where parks, classes 1/2/3. Rule `park_motor_vehicle_ban`, Lemon Grove Mun. Code 12.20.140. https://ecode360.com/44609049
- sidewalk. Status unclear, where business_district, classes 1/2/3. Rule `business_sidewalk_ban`, Lemon Grove Mun. Code 10.44.010, 10.04.020. https://ecode360.com/44608601

### New readings

None.

### Kinds with no rule found

- road, bike_lane, separated_bikeway. Read, LGMC Title 10 Vehicles and Traffic (all chapters, searched for bicycle, bike, skate, scooter and wheeled device), with Ch. 10.44 Bicycles and Skateboards read in full. 10.44.020 covers skateboards, roller skates and coasters in the central commercial area. https://ecode360.com/44608328

### Read but not modelled

- LGMC 10.44.020 bars skateboards, roller skates, coasters and similar devices on roadways and sidewalks in the central commercial area. It does not name e-bikes.
- LGMC 12.20.360 covers the skate park.

### Map names

No facilities.

### Open items

- Whether LGMC 12.20.140 (motor vehicles in parks) reaches e-bikes (the record's own open question).
- The Council may take up an e-bike ordinance on Nov 3 or Nov 17, 2026. Re-check before release.

## National City

### Rules taken from the record

- bike_path, footway, trail. Status unclear, where parks, classes 1/2/3. Rule `park_motorized_ban`, National City Mun. Code 10.52.010(G). https://library.municode.com/ca/national_city/codes/code_of_ordinances?nodeId=CD_ORD_TIT10PUPEMOSA_VIOFAGPR_CH10.52REUSMUPAPLGOCO
- sidewalk. Status unclear, where business_district, classes 1/2/3. Rule `sidewalk_ban`, National City Mun. Code 11.52.020(A). https://library.municode.com/ca/national_city/codes/code_of_ordinances?nodeId=CD_ORD_TIT11VETR_CH11.52BI
- sidewalk. Status unclear, where other, classes 1/2/3. Rule `sidewalk_ban`, National City Mun. Code 11.52.020(A). https://library.municode.com/ca/national_city/codes/code_of_ordinances?nodeId=CD_ORD_TIT11VETR_CH11.52BI

### New readings

- bike_path. Status banned, where everywhere, classes 3. Rule `class3_class_i_bike_path_ban`, National City Mun. Code 11.52.010(B)(3) (Ord. No. 2023-2520). https://library.municode.com/ca/national_city/codes/code_of_ordinances?nodeId=CD_ORD_TIT11VETR_CH11.52BI

### Kinds with no rule found

- road, bike_lane, separated_bikeway. Read, Read in full: NCMC Ch. 11.52 Bicycles, Ch. 11.64 Mobility Devices and Ch. 11.36 Miscellaneous Driving Rules. Searched Ch. 11.40 Street Use Restrictions (trains and truck routes) and Ch. 11.44 Pedestrians for bicycle, bike, skate, scooter, sidewalk and wheel terms, plus the Title 11 chapter list. 11.36.060 covers freeways only. 11.52.010(B) says Class 1 and Class 2 e-bikes are legal on any paved surface where a regular bike may operate, which adds no street rule. https://library.municode.com/ca/national_city/codes/code_of_ordinances?nodeId=CD_ORD_TIT11VETR

### Read but not modelled

- NCMC 11.52.010(B)(1) and (2) say Class 1 and Class 2 e-bikes are legal on any paved surface where a regular bike may operate. That depends on where bicycles are allowed and adds nothing to state law, so it is not modelled as an allowed entry.
- NCMC 11.36.060 bars bicycles on a freeway where signs are posted. NCMC 11.36.090 bars motor vehicles in parks but defines them as internal combustion devices, so it does not reach e-bikes.
- NCMC 11.64.010 bars scooters and similar toy vehicles from roadways. It does not name e-bikes.

### Map names

No facilities.

### Open items

- Decision for you. The Class 3 entry on bike_path is a new reading of 11.52.010(B)(3). The sentence sits inside a definitions subsection and repeats the pre-2023 state rule. The record's readers called 11.52.010 a definition. I marked it banned because it says prohibited and 11.52.020(C) makes violating the chapter, including on paths set aside for bicycles, an infraction. Change it to unclear if you read it as descriptive only.
- Whether NCMC 11.52.020(A) (no bicycles on business or residence district sidewalks) and 10.52.010(G) (any motorized vehicle on park walkways) reach e-bikes (the record's own open questions).

## Santee

### Rules taken from the record

- bike_path, footway, trail. Status banned, where parks, classes 1/2/3. Rule `park_vehicle_rule`, Santee Mun. Code 8.08.280(A). https://ecode360.com/43750414
- sidewalk. Status banned, where posted_signs, classes 1/2/3. Rule `posted_sidewalk_ban`, Santee Mun. Code 10.22.016 (Ord. 628). https://ecode360.com/48916226

### New readings

None.

### Kinds with no rule found

- road, bike_lane, separated_bikeway. Read, Read in full: SMC Ch. 10.22 Miscellaneous Provisions and the 10.02.020 definitions of bicycle and electric bicycle. Searched the full text of Titles 7, 8 and 10 for bicycle, bike, skate, scooter, wheeled device and trail, and read every match. 10.22.050 covers freeways only. 10.22.080 names motorcycles and power cycles on trails, not e-bikes. https://ecode360.com/43752313

### Read but not modelled

- SMC 10.22.050 bars bicycles and similar vehicles on a freeway where signs are posted. A freeway is not an ordinary street.
- SMC 10.22.080 bars a motorcycle or power cycle on riders' and hikers' trails. It does not name e-bikes, and the record reads it as e-motos only.
- SMC 10.22.020 bars skateboards, scooters, roller skates and toy vehicles on roadways. It does not name e-bikes. SMC 8.08.220 covers bicycles in skate parks.

### Map names

No facilities.

### Open items

- Which sidewalks the City Engineer has posted under SMC 10.22.016, and which park walkways and trails the Director has designated for bicycles under 8.08.280(A) (the record's own open question).

## Unincorporated San Diego County

### Rules taken from the record

- bike_path, footway, trail. Status banned, where parks, classes 1/2/3. Rule `county_parks_designated_areas_only`, SDCC 41.130(b), (b)(i), 41.102(b) (Ord. No. 10823 (N.S.)). https://codelibrary.amlegal.com/codes/san_diego/latest/sandiego_regs/0-0-0-95312
- sidewalk. Status unclear, where business_district, classes 1/2/3. Rule `sidewalk_ban_in_business_district`, SDCC 72.230 (County Traffic Code). https://codelibrary.amlegal.com/codes/san_diego/latest/sandiego_regs/0-0-0-84827

### New readings

- bike_path, footway, trail. Status unclear, where parks, classes 1/2/3. Rule `county_parks_vehicle_license_and_registration`, SDCC 41.127(f) (Ord. No. 10823 (N.S.)). https://codelibrary.amlegal.com/codes/san_diego/latest/sandiego_regs/0-0-0-95312

### Kinds with no rule found

None.

### Kinds not checked

road, bike_lane, separated_bikeway.

### Read but not modelled

- SDCC 72.237 bars bicycles and similar vehicles on a freeway where signs are posted. SDCC 72.245 bars a motorcycle or power cycle on riders' and hikers' trails and does not name e-bikes.
- The County Parks and Recreation e-bike fact sheet says Class 3 e-bikes are not permitted on County trails and closes five sites to all classes. It is a department page, not enacted text, so it is not used.

### Map names

No facilities.

### Open items

- road, bike_lane and separated_bikeway are notChecked. I read SDCC Title 7, Division 2, Article 18 (the miscellaneous provisions that hold the bicycle sections) and Division 4, and the park chapter. I did not read the other Traffic Code articles, so I did not claim there is no rule.
- Whether SDCC 41.127 applies to e-bikes in County parks, and which areas the Department has designated for bicycles under 41.130(b) (the record's own open questions).
- No County under-12 ordinance as of the record's Oct 19, 2026 check. Re-check before each release.

## Checks run

`tools/check.py` in the scratchpad ran after the final build. It confirms the file parses as JSON, every `record` quote is an exact substring of the record quote for the same rule, each of the seven kinds appears exactly once across `kinds`, `noRuleFound` and `notChecked` for every jurisdiction, and every status, where, from, class and date value is in its allowed list. It also checks that the prose fields have no em-dashes, en-dashes or semicolons.
