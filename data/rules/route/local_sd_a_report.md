# Local where-you-ride rules, San Diego County set A

Derived 2026-10-23 for these ten jurisdictions: City of San Diego (city_of_san_diego), Carlsbad (carlsbad), Encinitas (encinitas), Solana Beach (solana_beach), Del Mar (del_mar), Oceanside (oceanside), Escondido (escondido), San Marcos (san_marcos), Vista (vista), Poway (poway).

The data file is data/rules/route/local_sd_a.json. Every entry has a status of banned, allowed or unclear, and a where of everywhere, business_district, posted_signs, parks, beaches or other. Entries marked record take their quote from data/rules/san_diego_local.json. Entries marked new_reading take their quote from enacted municipal code text that I read on 2026-10-23, where the record was silent.

## Method and checks

- Source 1 was read with a script, one jurisdiction at a time. A record quote is cut out of the record text by marker, so each one is an exact substring of the record quote.
- Source 2 was read on eCode360, Municode, codepublishing.com, the City of San Diego code PDFs and the Vista code portal. The code portals and PDFs gave the full text of each chapter named under No rule found.
- Every new_reading quote was checked as an exact match, after collapsing spaces, against the saved text or against the live code page.
- A script checked that the file is valid JSON, that all seven kinds appear exactly once per jurisdiction across kinds, noRuleFound and notChecked, and that every value comes from the allowed lists. It also checked prose for semicolons and dashes.
- Statuses follow the record where it is unsure. A rule the record marks unclear stays unclear. A ban limited to business districts or posted signs is banned with that where.
- Passenger, helmet, age, speed, parking, seizure and course rules are not where-you-ride rules and are skipped, unless they ban a kind of way.
- notChecked is empty for all ten jurisdictions.

## City of San Diego (city_of_san_diego)

Kinds with rules: bike_path, sidewalk, footway, trail. No rule found: road, bike_lane, separated_bikeway. Not checked: none. Facilities: 4.

### Rules taken from the record

- bike_path, unclear, where parks, classes 1 2 3. Rule park_bicycle_limits, SDMC 63.0102(c)(19), 63.0109. https://docs.sandiego.gov/municode/MuniCodeChapter06/Ch06Art03Division01.pdf
- sidewalk, banned, where business_district, classes 1 2 3. Rule no_sidewalk_riding_by_businesses, SDMC 84.09(a). https://docs.sandiego.gov/municode/MuniCodeChapter08/Ch08Art04Division00.pdf
- footway, trail, banned, where parks, classes 1 2 3. Rule park_bicycle_limits, SDMC 63.0102(c)(19), 63.0109. https://docs.sandiego.gov/municode/MuniCodeChapter06/Ch06Art03Division01.pdf

### New readings

- sidewalk, unclear, where everywhere, classes 1 2 3. Rule sidewalk_vehicle_ban_84_04, SDMC 84.04. https://docs.sandiego.gov/municode/MuniCodeChapter08/Ch08Art04Division00.pdf

### No rule found

- road, bike_lane, separated_bikeway. Read: SDMC Chapter 8, Article 4, Division 0 (84.01 to 84.21, all read) and Chapter 8, Article 3, Division 2 (83.0201 to 83.0207, all read). Chapter 6, Article 3, Divisions 0 and 1 were searched for bicycle, bikeway, electric, motorized, trail, boardwalk, pier and wheeled terms and the relevant hits were read, including 63.0102, 63.0106, 63.0109, 63.05, 63.20.7 and 63.20.16. No section limits e-bikes on streets or bike lanes, and 63.0102(c)(19) lets a bicycle use any road made for cars and any designated bikeway. Section 84.06(b) bars bicycles from freeways where signed, and freeways are not streets in this data. https://docs.sandiego.gov/municode/MuniCodeChapter08/Ch08Art04Division00.pdf

### Facilities

- ocean_front_walk (classes 1 2 3), banned, boardwalk_motorized_device_ban, from record. Names: Ocean Front Walk. The public walkway on Ocean Front Walk in Mission Beach, from the South Mission Beach Jetty north to the end of the walkway at Ocean Boulevard at Law Street in Pacific Beach. SDMC 84.18(b)(1), https://docs.sandiego.gov/municode/MuniCodeChapter08/Ch08Art04Division00.pdf
- bayside_walk (classes 1 2 3), banned, boardwalk_motorized_device_ban, from new_reading. Names: Bayside Walk, Bayside walk. The public walkway on the west side of Mission Bay Park from San Diego Place, next to the South Mission Beach Jetty, to Corona Oriente Road, the end of Crown Point Park. SDMC 84.18(b)(2), https://docs.sandiego.gov/municode/MuniCodeChapter08/Ch08Art04Division00.pdf
- east_mission_bay_walkway (classes 1 2 3), banned, boardwalk_motorized_device_ban, from new_reading. Names: no map name found. The public walkway on the east side of Mission Bay Park from De Anza Road south to the South Shores Boat Launch and Park. No OpenStreetMap name was found for it on 2026-10-23, so the app cannot match it by name. SDMC 84.18(b)(3), https://docs.sandiego.gov/municode/MuniCodeChapter08/Ch08Art04Division00.pdf
- la_jolla_shores_boardwalk (classes 1 2 3), banned, boardwalk_motorized_device_ban, from new_reading. Names: La Jolla Shores Boardwalk. The boardwalk from Avenida De La Playa, next to La Jolla Shores, north to the end of Kellogg Park at its northeast corner. The name comes from SDMC 63.0502. No OpenStreetMap way with this name was found on 2026-10-23. SDMC 84.18(b)(4), https://docs.sandiego.gov/municode/MuniCodeChapter08/Ch08Art04Division00.pdf

### Read and not encoded

- SDMC 84.06(b) bars bicycles from freeways where official signs are posted. Freeways are not one of the seven kinds, so it is not encoded.
- SDMC 83.0206 bars a bicycle on a grade separation where signs are posted. It names no street, so it is not encoded.
- SDMC 63.20.16(b)(2) bars riding a bicycle on any fishing pier owned or operated by the City. The code names no pier, so no facility was made. I did not add a pier name from outside the code.
- SDMC 63.20.7(a) bars driving any motor vehicle as the Vehicle Code defines it on a beach or the adjacent sidewalk or turf. It is unclear that an e-bike is a motor vehicle, and beaches are already covered by the park rule in 63.0102(c)(19), so it is not encoded.
- SDMC 84.09(d) bars any cycle other than a conventional bicycle on Ocean Front Walk and Bayside Walk. The motorized device ban in 84.18 already covers both, so it is not a separate entry.
- SDMC 63.0109 sets 8 mph on Ocean Front Walk and listed Mission Bay paths. It is a speed rule, so it is skipped.
- OpenStreetMap check on 2026-10-23. Ocean Front Walk (pedestrian and footway ways) and Bayside Walk (cycleway and path ways, also spelled Bayside walk) were found. The east Mission Bay walkway has no matching name, so that facility has an empty names list. La Jolla Shores Boardwalk was not found in OpenStreetMap, and its name comes from SDMC 63.0502.

## Carlsbad (carlsbad)

Kinds with rules: bike_path, sidewalk, footway, trail. No rule found: road, bike_lane, separated_bikeway. Not checked: none. Facilities: 2.

### Rules taken from the record

- bike_path, footway, trail, unclear, where parks, classes 1 2 3. Rule park_and_trail_vehicle_limit, Carlsbad Mun. Code 11.32.030(22), 11.32.010, 10.04.150. https://ecode360.com/44007383
- sidewalk, banned, where everywhere, classes 1 2 3. Rule sidewalk_ban, CMC 10.56.020(B). https://ecode360.com/44006970

### New readings

- bike_path, footway, trail, banned, where posted_signs, classes 1 2 3. Rule regulated_device_ban_where_posted, CMC 10.56.020(A). https://ecode360.com/44006970

### No rule found

- road, bike_lane, separated_bikeway. Read: CMC Chapter 10.56 (10.56.010 to 10.56.070), Chapter 10.32 (10.32.010 to 10.32.093) and Chapter 11.32 (11.32.010 to 11.32.110), all read in full on eCode360, plus the Chapter 10.04 definitions of highway, park, parkway, pedestrian and vehicle. No section bans or limits e-bikes on streets or bike lanes. Section 10.56.020(A) bars regulated mobility devices in any public area where a ban is posted and keeps a list of such places with the City Clerk. https://ecode360.com/44006970

### Facilities

- poinsettia_community_park (classes 1 2 3), banned, park_ban, from record. Names: Poinsettia Community Park, Poinsettia Park. Poinsettia Community Park. Added to the list of places where e-bikes are prohibited by Council resolution on Feb 10, 2026 (adopted 5 to 0 per the minutes). Only an unsigned packet draft of the resolution was read, and the ban applies where signs are posted. Carlsbad Res. No. 2026-038 (Feb 10, 2026 packet draft), https://www.carlsbadca.gov/home/showpublisheddocument/25363/639058922376966881#page=353
- pine_avenue_community_park (classes 1 2 3), banned, park_ban, from record. Names: Pine Avenue Community Park, Pine Avenue Park. Pine Avenue Community Park. Added to the list of places where e-bikes are prohibited by Council resolution on Feb 10, 2026 (adopted 5 to 0 per the minutes). Only an unsigned packet draft of the resolution was read, and the ban applies where signs are posted. Carlsbad Res. No. 2026-038 (Feb 10, 2026 packet draft), https://www.carlsbadca.gov/home/showpublisheddocument/25363/639058922376966881#page=353

### Read and not encoded

- CMC 10.32.030 bars vehicles, including bicycles, from any sidewalk area. It is cited in the sidewalk note and not a separate entry.
- CMC 11.32.070 limits the Carlsbad seawall sidewalk between Tamarack Avenue and Pine Street to pedestrians. The general sidewalk ban already covers it, and no OpenStreetMap way named for the seawall was found, so no facility was made.
- The city e-bike flier says Class 3 is not allowed on trails. A flier is not enacted text, so it is not used for a status.
- CMC 10.56.020(C)(3) requires dismounting on a narrow trail near pedestrians or horses. It is a conduct rule, so it is skipped.
- The two park facilities rest on an unsigned packet draft of Res. No. 2026-038 plus the Feb 10, 2026 minutes, as the record says. OpenStreetMap has a park named Poinsettia Park and no match for Pine Avenue Park.

## Encinitas (encinitas)

Kinds with rules: bike_path, sidewalk, footway, trail. No rule found: road, bike_lane, separated_bikeway. Not checked: none. Facilities: none.

### Rules taken from the record

- bike_path, footway, trail, unclear, where parks, classes 1 2 3. Rule park_beach_trail_vehicle_ban_unclear, Encinitas Municipal Code 8.04.010, 8.04.130 (Ord. 2004-09). https://ecode360.com/44477393
- sidewalk, banned, where business_district, classes 1 2 3. Rule sidewalk_ban_in_business_district, Encinitas Municipal Code 14.56.020(B), 14.06.010, 14.06.030, Veh. Code 235. https://ecode360.com/44479706

### New readings

- bike_path, footway, trail, unclear, where parks, classes 1 2 3. Rule park_beach_trail_vehicle_ban_unclear, EMC 8.04.130(A). https://ecode360.com/44477393
- trail, unclear, where other, classes 1 2 3. Rule motorcycles_power_cycles_on_trails, EMC 14.32.093. https://ecode360.com/44479462

### No rule found

- road, bike_lane, separated_bikeway. Read: EMC Chapter 14.56 (14.56.010 to 14.56.080), Chapter 14.06 and Chapter 14.32, all read in full on eCode360, plus Title 8 Chapter 8.04 (8.04.010 to 8.04.170, searched for bicycle, trail, vehicle and motor terms and the hits read). No section bans or limits bicycles or e-bikes on streets or bike lanes. Section 14.56.020(A) has the City Traffic Engineer erect signs regulating bicycle riding on any public sidewalk or roadway, but it states no ban. https://ecode360.com/44479706

### Facilities

- none

### Read and not encoded

- EMC 14.32.050 bars motorized transportation on public property not held open for vehicles and not under the Vehicle Code. The record treats it as a school-ground question, so it is not encoded for trails.
- EMC 14.32.030 leaves bicycles out of the general sidewalk driving ban, and 14.56.020(A) has the City Traffic Engineer erect signs regulating riding on sidewalks and roadways. Neither states a ban.
- EMC 14.06.030 names South Coast Highway 101 between D Street and J Street as part of the business district. No facility was made for it, because a name match would also catch the street.

## Solana Beach (solana_beach)

Kinds with rules: bike_path, sidewalk, footway, trail. No rule found: road, bike_lane, separated_bikeway. Not checked: none. Facilities: none.

### Rules taken from the record

- bike_path, footway, trail, unclear, where parks, classes 1 2 3. Rule motor_vehicles_banned_in_parks_and_beaches, SBMC 11.12.020(R), 11.12.010(A). https://www.codepublishing.com/CA/SolanaBeach/html/SolanaBeach11/SolanaBeach1112.html#11.12.020
- sidewalk, banned, where business_district, classes 1 2 3. Rule sidewalk_ban_in_business_district, Solana Beach Mun. Code 10.44.010(B). https://www.codepublishing.com/CA/SolanaBeach/html/SolanaBeach10/SolanaBeach1044.html#10.44.010
- sidewalk, banned, where other, classes 1 2 3. Rule sidewalk_ban_in_business_district, Solana Beach Mun. Code 10.44.010(B). https://www.codepublishing.com/CA/SolanaBeach/html/SolanaBeach10/SolanaBeach1044.html#10.44.010

### New readings

- trail, unclear, where other, classes 1 2 3. Rule motorcycles_power_cycles_on_trails, SBMC 10.44.080. https://www.codepublishing.com/CA/SolanaBeach/html/SolanaBeach10/SolanaBeach1044.html#10.44.010

### No rule found

- road, bike_lane, separated_bikeway. Read: SBMC Chapter 10.44 (10.44.010 to 10.44.150), Chapter 10.04 and Chapter 11.12 (11.12.010 to 11.12.210), all read in full. Chapters 10.12, 10.28, 10.36, 10.40, 10.46 and 11.16 were searched for bicycle, trail and path terms and no riding rule was found. No section bans or limits e-bikes on streets or bike lanes. Section 10.44.010(D) gives bicycles on a roadway the rights and duties of a vehicle. https://www.codepublishing.com/CA/SolanaBeach/html/SolanaBeach10/SolanaBeach1044.html#10.44.010

### Facilities

- none

### Read and not encoded

- SBMC 10.44.050 bars bicycles from freeways where signed. Freeways are not one of the seven kinds, so it is not encoded.
- SBMC 10.60.015 bars bicycling on posted private property open to the public. The record marks it low priority, so it is not encoded.

## Del Mar (del_mar)

Kinds with rules: bike_path, sidewalk, footway, trail. No rule found: road, bike_lane, separated_bikeway. Not checked: none. Facilities: 2.

### Rules taken from the record

- sidewalk, banned, where business_district, classes 1 2 3. Rule park_sidewalk_and_lagoon_trail_bans, DMMC 14.54.040(A). https://library.municode.com/ca/del_mar/codes/municipal_code?nodeId=TIT14TRCO_CH14.54BI
- sidewalk, banned, where posted_signs, classes 1 2 3. Rule park_sidewalk_and_lagoon_trail_bans, DMMC 14.54.040(B). https://library.municode.com/ca/del_mar/codes/municipal_code?nodeId=TIT14TRCO_CH14.54BI
- sidewalk, banned, where other, classes 1 2 3. Rule park_sidewalk_and_lagoon_trail_bans, DMMC 14.54.040(C). https://library.municode.com/ca/del_mar/codes/municipal_code?nodeId=TIT14TRCO_CH14.54BI
- footway, trail, unclear, where beaches, classes 1 2 3. Rule self_propelled_vehicles_beach_park_ban, DMMC 8.04.020. https://library.municode.com/ca/del_mar/codes/municipal_code?nodeId=TIT8BEWAPA_CH8.12SADILARI_8.12.030PRAC

### New readings

- bike_path, footway, trail, banned, where parks, classes 1 2 3. Rule park_sidewalk_and_lagoon_trail_bans, DMMC 8.04.090, 14.54.040(D). https://library.municode.com/ca/del_mar/codes/municipal_code?nodeId=TIT8BEWAPA_CH8.12SADILARI_8.12.030PRAC
- bike_path, footway, trail, banned, where other, classes 1 2 3. Rule park_sidewalk_and_lagoon_trail_bans, DMMC 14.54.040(E). https://library.municode.com/ca/del_mar/codes/municipal_code?nodeId=TIT14TRCO_CH14.54BI

### No rule found

- road, bike_lane, separated_bikeway. Read: DMMC Chapter 14.54 (14.54.010 to 14.54.050) and Title 8 Chapters 8.04 and 8.12 (all sections), read in full on Municode, code version of Jun 30, 2026. Section 14.54.040(C) requires riding inside a designated bicycle lane on a street that has one. No section bans or limits e-bikes on streets or in bike lanes. https://library.municode.com/ca/del_mar/codes/municipal_code?nodeId=TIT14TRCO_CH14.54BI

### Facilities

- coast_to_crest_trail (classes 1 2), allowed, coast_to_crest_class1_and_2_allowed, from record. Names: Coast to Crest Trail. The Coast to Crest Trail inside the San Dieguito Lagoon and River Valley in Del Mar. Class 1 and Class 2 e-bikes are expressly permitted. DMMC 8.12.030(D), 14.54.040(E), https://library.municode.com/ca/del_mar/codes/municipal_code?nodeId=TIT8BEWAPA_CH8.12SADILARI_8.12.030PRAC
- coast_to_crest_trail_class_3 (classes 3), unclear, coast_to_crest_class1_and_2_allowed, from record. Names: Coast to Crest Trail. The Coast to Crest Trail inside the San Dieguito Lagoon and River Valley in Del Mar. The code names only Class 1 and Class 2, so Class 3 is not confirmed. DMMC 8.12.030(D), 14.54.040(E), https://library.municode.com/ca/del_mar/codes/municipal_code?nodeId=TIT8BEWAPA_CH8.12SADILARI_8.12.030PRAC

### Read and not encoded

- DMMC 8.12.030(A)(3) bars the use of vehicles in the San Dieguito Lagoon and River Valley, and 8.12.030(D) speaks of non-motorized vehicles. This is why Class 3 on the Coast to Crest Trail stays unclear.
- DMMC 14.04.030(C) says no one is found in violation of a Title 14 rule without a sign giving notice. The record says it may limit enforcement but does not make riding lawful, so statuses were not softened.
- OpenStreetMap has ways named Coast to Crest Trail in Del Mar, tagged cycleway, footway and path.

## Oceanside (oceanside)

Kinds with rules: bike_path, sidewalk, footway, trail. No rule found: road, bike_lane, separated_bikeway. Not checked: none. Facilities: 5.

### Rules taken from the record

- sidewalk, banned, where business_district, classes 1 2 3. Rule sidewalk_rules, OCC 5.14(g). https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH5BIMODE
- footway, trail, unclear, where beaches, classes 1 2 3. Rule beach_motorized_ban, Oceanside City Code 19.7. https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH19OCBE

### New readings

- bike_path, sidewalk, footway, trail, banned, where posted_signs, classes 1 2 3. Rule mobility_device_ban_where_posted, OCC 5.14(f). https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH5BIMODE
- footway, banned, where other, classes 1 2 3. Rule harbor_docks_and_walkways, OCC 29A.49. https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH29ASMCRHA

### No rule found

- road. Read: OCC Chapter 5 (5.1 to 5.17), Chapter 18 (18.1 to 18.9), Chapter 19 (19.1 to 19.20) and Chapter 21, all read in full on Municode. Chapters 20 and 29A were searched for bicycle, motor, vehicle and skate terms and the hits were read. No section bans or limits e-bikes on streets outside the pier area and Pier Plaza. Section 5.14(f) bars mobility devices where signs are posted. https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH5BIMODE
- bike_lane, separated_bikeway. Read: OCC Chapter 5 (5.1 to 5.17), Chapter 18 (18.1 to 18.9), Chapter 19 (19.1 to 19.20) and Chapter 21, all read in full on Municode. Chapters 20 and 29A were searched for bicycle, motor, vehicle and skate terms and the hits were read. Section 5.11 bars a motor vehicle or other motor-driven cycle from a posted bicycle lane or facility. It does not name electric bicycles and Chapter 5 treats them separately as mobility devices, so it is not treated as a ban here. Section 5.14(f) bars mobility devices where signs are posted. https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH5BIMODE

### Facilities

- oceanside_pier (classes 1 2 3), banned, pier_and_plaza_ban, from record. Names: Oceanside Pier. The Municipal Pier and its ramps. OCC 18.1 also bars any bicycle or other propelled vehicle on the pier from May 15 through Sep 15. OCC 5.14(a), https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH5BIMODE
- oceanside_pier_amphitheater (classes 1 2 3), banned, pier_and_plaza_ban, from record. Names: Oceanside Pier Amphitheater. The Oceanside Pier Amphitheater. OCC 5.14(a), https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH5BIMODE
- junior_seau_beach_community_center_plaza (classes 1 2 3), banned, pier_and_plaza_ban, from new_reading. Names: Junior Seau Beach Community Center. All stairways, walkways, sidewalks and other ways inside the Junior Seau Beach Community Center plaza, south to the north curbline of Betty's Lot (Lot 30), bounded on the west by The Strand. No OpenStreetMap name was found for the plaza on 2026-10-23. OCC 5.14(b), https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH5BIMODE
- oceanside_pier_plaza (classes 1 2 3), banned, pier_and_plaza_ban, from new_reading. Names: Pier Plaza. The Pier Plaza, bounded on the south by First Street, on the north by the north side of the parking lot at the northwest intersection of The Strand and the Municipal Pier, on the east by the west side of Pacific Street, and on the west by the Pacific Ocean. It covers any sidewalk, roadway, parking lot or other way inside those lines. No OpenStreetMap name was found for the plaza on 2026-10-23, so the app cannot match it by name. OCC 5.14(c), (d), (f), https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH5BIMODE
- libby_lake_park (classes 1 2 3), unclear, libby_lake_park_motorized_vehicles, from new_reading. Names: Libby Lake Park. Libby Lake Park, except dedicated city streets and public parking lots. The code bars motorized vehicles and does not define the term or name electric bicycles. OCC 20.23(a), https://library.municode.com/ca/oceanside/codes/code_of_ordinances?nodeId=CH20OFIS

### Read and not encoded

- OCC 5.11 bars a motor vehicle or other motor-driven cycle from a posted bicycle lane or facility. It does not name electric bicycles, and Chapter 5 treats e-bikes separately as mobility devices, so it is not treated as a ban. This one deserves a second look.
- OCC 20.22 bars motorized transportation on public property not held open for vehicles and not under the Vehicle Code. The record read Chapter 20 and did not list it, so it is not encoded for trails.
- OCC 18.1 also bars any bicycle or other propelled vehicle on the pier from May 15 through Sep 15. OCC 5.14(a) already bans bicycles and mobility devices there all year.
- OCC 5.14(h) bars riding in drainage channels, culverts, ditches and on sports courts. These are not a way kind, so it is skipped.
- OpenStreetMap check on 2026-10-23. Oceanside Pier and The Strand North and South were found. Pier Plaza, the Junior Seau Beach Community Center and the amphitheater have no matching way name. Libby Lake Park is a park relation.

## Escondido (escondido)

Kinds with rules: bike_path, sidewalk, footway, trail. No rule found: road, bike_lane, separated_bikeway. Not checked: none. Facilities: none.

### Rules taken from the record

- bike_path, footway, trail, unclear, where parks, classes 1 2 3. Rule recreational_area_vehicle_limit, EMC 18-129. https://ecode360.com/43260426
- sidewalk, unclear, where everywhere, classes 1 2 3. Rule sidewalk_ban, EMC 5-5(b)(1). https://ecode360.com/43254330

### New readings

- bike_path, footway, trail, banned, where posted_signs, classes 1 2 3. Rule bicycles_and_mobility_devices_banned_where_posted, EMC 5-5(a). https://ecode360.com/43254330

### No rule found

- road, bike_lane, separated_bikeway. Read: EMC Chapter 5 (5-1 to 5-13, as replaced by Ord. No. 2026-07) and Chapter 18, Article 4, Division 3 (18-126 to 18-131), read in full on eCode360, plus 18-67, 18-71, 18-76 and 18-92. No section bans or limits e-bikes on streets or bike lanes. Section 5-5(a) bars bicycles and mobility devices in public areas where signs are posted. https://ecode360.com/43254330

### Facilities

- none

### Read and not encoded

- EMC 28-122 bars mobility devices on private property and public property not open to vehicles. The record says it is not shown in the app, so it is not encoded.
- EMC 18-76(a) keeps everyone to marked trails where trails are signed. It applies to all persons, so it is not an e-bike rule.
- The sidewalk answer depends on the effective date. As the record reports, a recital in the Aug 26, 2026 packet copy says the ordinance takes effect 60 days after adoption (Nov 15, 2026), and the Government Code 36937 default would be Oct 16, 2026. The status is unclear for that reason alone.

## San Marcos (san_marcos)

Kinds with rules: bike_path, sidewalk, footway, trail. No rule found: road, bike_lane, separated_bikeway. Not checked: none. Facilities: none.

### Rules taken from the record

- bike_path, footway, trail, banned, where parks, classes 3. Rule class3_park_and_trail_ban, SMMC 9.04.070(f)(2). https://library.municode.com/ca/san_marcos/codes/code_of_ordinances?nodeId=TIT9PARE_CH9.04GE
- bike_path, footway, trail, unclear, where parks, classes 1 2. Rule class3_park_and_trail_ban, SMMC 9.04.070(f)(2). https://library.municode.com/ca/san_marcos/codes/code_of_ordinances?nodeId=TIT9PARE_CH9.04GE
- sidewalk, banned, where business_district, classes 1 2 3. Rule sidewalk_rules, SMMC 12.25.040(a). https://library.municode.com/ca/san_marcos/codes/code_of_ordinances?nodeId=TIT12MOVETR_CH12.25BIELBIRE
- sidewalk, banned, where other, classes 1 2 3. Rule sidewalk_rules, SMMC 12.25.040(a). https://library.municode.com/ca/san_marcos/codes/code_of_ordinances?nodeId=TIT12MOVETR_CH12.25BIELBIRE
- sidewalk, allowed, where other, classes 1 2 3. Rule sidewalk_rules, SMMC 12.25.040(a). https://library.municode.com/ca/san_marcos/codes/code_of_ordinances?nodeId=TIT12MOVETR_CH12.25BIELBIRE

### New readings

- sidewalk, banned, where posted_signs, classes 1 2 3. Rule sidewalk_ban_where_posted, SMMC 12.25.040(b). https://library.municode.com/ca/san_marcos/codes/code_of_ordinances?nodeId=TIT12MOVETR_CH12.25BIELBIRE

### No rule found

- road, bike_lane, separated_bikeway. Read: SMMC Chapter 12.25 (12.25.010 to 12.25.060) read in full on Municode, and Title 9 Chapter 9.04 sections 9.04.020, 9.04.070 and 9.04.080 read in full. No section bans or limits e-bikes on streets or bike lanes. Section 9.04.080(a) lets Motorized Vehicles use roadways inside parks. https://library.municode.com/ca/san_marcos/codes/code_of_ordinances?nodeId=TIT12MOVETR_CH12.25BIELBIRE

### Facilities

- none

### Read and not encoded

- SMMC 12.16.070 bars e-bikes on private property and public property not open to vehicles. Only the record text was used. The record says it is not shown in the app, so it is not encoded.
- The Director of Parks and Recreation keeps the list of trails closed to Class 1 and 2. The list and its image-only maps were not read in enacted text, so no closed trail is named.

## Vista (vista)

Kinds with rules: bike_path, sidewalk, footway, trail. No rule found: road, bike_lane, separated_bikeway. Not checked: none. Facilities: none.

### Rules taken from the record

- bike_path, unclear, where parks, classes 1 2 3. Rule park_path_limits, Vista Mun. Code 12.08.010(O). https://portal.laserfiche.com/Portal/DocView.aspx?id=1044614&repo=r-3f0b2553
- sidewalk, banned, where everywhere, classes 1 2 3. Rule sidewalk_ban, VMC 10.68.030. https://portal.laserfiche.com/Portal/ElectronicFile.aspx?docid=1044603&repo=r-3f0b2553
- footway, trail, banned, where parks, classes 1 2 3. Rule park_path_limits, Vista Mun. Code 12.08.010(O). https://portal.laserfiche.com/Portal/DocView.aspx?id=1044614&repo=r-3f0b2553

### New readings

- none

### No rule found

- road, bike_lane, separated_bikeway. Read: VMC Chapter 10.68 (10.68.010 to 10.68.100, signed code portal copy dated 01/10/25), read in full. No section bans or limits e-bikes on streets or bike lanes. Section 10.68.050 on bikeways was repealed by Ord. No. 2024-14, and 10.68.080 gives bicycles on a roadway or bikeway the rights and duties of a vehicle. https://portal.laserfiche.com/Portal/ElectronicFile.aspx?docid=1044603&repo=r-3f0b2553

### Facilities

- none

### Read and not encoded

- VMC 10.68.060 makes a bicycle operator dismount to use a sidewalk or crosswalk. It is cited in the sidewalk note.
- Only page 1 of VMC 12.08 was read here, through the code portal text view. The 12.08.010(O) wording comes from the record, which two readers checked against the same document.

## Poway (poway)

Kinds with rules: road, bike_path, sidewalk, footway, trail. No rule found: bike_lane, separated_bikeway. Not checked: none. Facilities: none.

### Rules taken from the record

- footway, trail, banned, where parks, classes 1 2 3. Rule where_to_ride, PMC 10.57.090(C). https://ecode360.com/50661267

### New readings

- road, bike_path, allowed, where everywhere, classes 1 2 3. Rule riding_permitted_unless_signed, PMC 10.57.090(A). https://ecode360.com/50661267
- road, bike_path, sidewalk, banned, where posted_signs, classes 1 2 3. Rule riding_permitted_unless_signed, PMC 10.57.090(A). https://ecode360.com/50661267
- sidewalk, banned, where business_district, classes 1 2 3. Rule sidewalk_ban_in_business_district, PMC 10.40.010. https://ecode360.com/50661170
- sidewalk, allowed, where other, classes 1 2 3. Rule riding_permitted_unless_signed, PMC 10.57.090(A). https://ecode360.com/50661267
- footway, banned, where posted_signs, classes 1 2 3. Rule pedestrian_walkways_posted, PMC 9.48.280. https://ecode360.com/50661639
- trail, unclear, where other, classes 1 2 3. Rule riding_permitted_unless_signed, PMC 10.57.090(A), 10.40.100. https://ecode360.com/50661267

### No rule found

- bike_lane, separated_bikeway. Read: PMC Chapter 10.57 (10.57.010 to 10.57.100) and Chapter 10.40 (10.40.010 to 10.40.130), read in full on eCode360, plus Chapter 9.48 Article II (9.48.040 to 9.48.330, searched for bicycle, trail, motor and wheel terms and the hits read). No section bans or limits e-bikes in bike lanes or separated bikeways. Section 10.57.090(A) permits roadway riding unless signs prohibit it, and 10.57.090(D) assumes a rider may be in a bike lane. https://ecode360.com/50661267

### Facilities

- none

### Read and not encoded

- PMC 10.57.090(D) requires riding with traffic, even on sidewalks under 8 feet wide. It is a conduct rule, so it is skipped.
- PMC 9.48.330 bars vehicles of any description in Community Services facilities other than on designated paved roads. The e-bike specific rules in 10.57.090(C) and (E) decide parks, so it is not a separate entry.
- The city trails page says motorized vehicles are not permitted, sets 10 and 15 mph limits and bars bicycles at Blue Sky Ecological Reserve. It is a web page, not enacted text, so no facility was made.

