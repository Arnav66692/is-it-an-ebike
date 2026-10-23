# Route rules by state, banned and unclear values

Derived 2026-10-23 from data/rules/all_states.normalized.json, fields where_allowed and local_authority. Each bullet is a way kind with at least one banned or unclear class, with the exact words the value rests on. Kinds that are allowed for all three classes are not listed. Every quoted basis is an exact substring of the named field and was checked by script. Where a bullet gives a basis from one field, the other classes in the same row come from the field that normally feeds that kind.

## AK Alaska

- road, all classes unclear. Basis from where_allowed.roads, "Unclear. Depends on whether the e-bike is a motor vehicle, motorcycle or motor-driven cycle."
- bike_lane, all classes unclear. Basis from where_allowed.bike_lanes, "Unclear."
- separated_bikeway, all classes unclear. Basis from where_allowed.bike_lanes, "Unclear."
- bike_path, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Unclear at state level. Land managers and municipalities set their own rules (not researched)."
- sidewalk, all classes unclear. Basis from where_allowed.sidewalks, "Unclear."
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Unclear."
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Unclear at state level. Land managers and municipalities set their own rules (not researched)."

## AL Alabama

- sidewalk, all classes unclear. Basis from where_allowed.sidewalks, "No state e-bike sidewalk rule found." The field finds no state rule.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No state e-bike sidewalk rule found." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear. Basis from where_allowed.paths_trails, "This path-ban power does not cover nonmotorized natural-surface trails (32-5A-267(h)(2)), and the statute is silent on e-bikes there." The field finds no state rule.

## AR Arkansas

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.class3_restrictions, "Class 3 is barred from bicycle and multi-use paths unless within or adjacent to a highway or roadway, or the local authority permits it (27-51-1705(b))."
- sidewalk, all classes unclear. Basis from where_allowed.sidewalks, "No state e-bike sidewalk rule found." The field finds no state rule.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No state e-bike sidewalk rule found." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear. Basis from where_allowed.paths_trails, "Class 1 and 2 may use bicycle and multi-use paths where bicycles are permitted, but the local authority with jurisdiction may prohibit them (27-51-1705(a))." The text names paths or bikeways and does not address natural-surface trails.

## AZ Arizona

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.class3_restrictions, "Class 3 may not be ridden on a bicycle or multiuse path unless it is within or adjacent to a highway or roadway, or the agency with jurisdiction allows it (28-819(E))."
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No state e-bike sidewalk rule found. Left to local regulation under 28-627(A)(8) and (14)." The field finds no state rule.
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No state e-bike sidewalk rule found. Left to local regulation under 28-627(A)(8) and (14)." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Class 1 and 2 allowed on bicycle and multiuse paths, but the state agency or local authority with jurisdiction may prohibit them (28-819(D))." The text names paths or bikeways and does not address natural-surface trails.

## CA California

- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Locals may regulate operation on pedestrian or bicycle facilities (21206)." The field only says locals may regulate operation on pedestrian facilities and does not say whether e-bikes may ride there.

## CO Colorado

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.class3_restrictions, "Class 3 is barred from bike or pedestrian paths unless the path is within a street or highway or the local authority permits it (42-4-1412(14)(b))."
- footway, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.class3_restrictions, "Class 3 is barred from bike or pedestrian paths unless the path is within a street or highway or the local authority permits it (42-4-1412(14)(b))."
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Class 1 and 2 may ride on a bike or pedestrian path where bicycles may travel, but a local authority may prohibit them (42-4-1412(14)(a))." The text names paths or bikeways and does not address natural-surface trails.

## CT Connecticut

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict. Basis from where_allowed.class3_restrictions, "Class 3 'shall not be ridden on a bicycle trail or path or multiuse trail or path' (14-289k(c)), with no local opt-in."
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Allowed unless a city, town or borough ordinance or a State Traffic Administration regulation prohibits it." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, class 1 allowed, classes 2 and 3 banned, local authorities may restrict. Basis from where_allowed.paths_trails, "Class 2 may not be ridden on a nonmotorized bicycle or multiuse trail with a natural surface tread and no added surfacing, unless a local ordinance permits (14-289k(d))." Class 3 has no local opt-in, so local allowance is not set for the whole row.

## DC District of Columbia

- road, classes 1 and 2 allowed, class 3 unclear. Basis from where_allowed.class3_restrictions, "A Class 3 used by motor above 20 mph is treated as a motor-driven cycle and the rider needs a valid driver's license (18 DCMR 9901.1)." A Class 3 used by motor above 20 mph is a motor-driven cycle, a category the other DC fields do not address.
- bike_lane, classes 1 and 2 allowed, class 3 unclear. Basis from where_allowed.class3_restrictions, "A Class 3 used by motor above 20 mph is treated as a motor-driven cycle and the rider needs a valid driver's license (18 DCMR 9901.1)." A Class 3 used by motor above 20 mph is a motor-driven cycle, a category the other DC fields do not address.
- separated_bikeway, classes 1 and 2 allowed, class 3 unclear. Basis from where_allowed.class3_restrictions, "A Class 3 used by motor above 20 mph is treated as a motor-driven cycle and the rider needs a valid driver's license (18 DCMR 9901.1)." A Class 3 used by motor above 20 mph is a motor-driven cycle, a category the other DC fields do not address.
- bike_path, classes 1 and 2 allowed, class 3 unclear. Basis from where_allowed.class3_restrictions, "A Class 3 used by motor above 20 mph is treated as a motor-driven cycle and the rider needs a valid driver's license (18 DCMR 9901.1)." A Class 3 used by motor above 20 mph is a motor-driven cycle, a category the other DC fields do not address.
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Allowed outside the Central Business District unless a Mayor's order and signs prohibit it. Banned in the Central Business District except on designated sidewalks." The rule changes by zone, speed or local order, so one statewide answer is not safe.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Allowed outside the Central Business District unless a Mayor's order and signs prohibit it." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear. Basis from where_allowed.paths_trails, "National Park Service land in DC follows federal rules, not checked here." The field says the rules of the managing bodies were not checked.

## DE Delaware

- sidewalk, all classes banned. Basis from where_allowed.sidewalks, "Not allowed while using the electric motor, even on sidewalks open to bicycles (4198P(g)(3))."
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Not allowed while using the electric motor, even on sidewalks open to bicycles (4198P(g)(3))." The sidewalks text names sidewalks only, so pedestrian paths are not covered.

## FL Florida

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Unclear default. E-bikes have bicycle rights, and 316.2065(10) sets duties for people riding bicycles on sidewalks. 316.008(7)(a) lets a county or municipality 'permit, control, or regulate' e-bikes on sidewalks, with a 15 mph cap in such an ordinance."
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Unclear default." The sidewalks text names sidewalks only, so pedestrian paths are not covered.

## GA Georgia

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class III only if the path is within or next to a highway, or the managing authority permits it (§ 40-6-303(a)(2))."
- sidewalk, all classes banned. Basis from where_allowed.sidewalks, "Generally prohibited. § 40-6-144: no person shall drive any vehicle upon a sidewalk, except where a local ordinance allows bicycles on sidewalks for riders 12 or younger. Whether that local exception covers e-bikes is not stated." A local exception exists only for riders 12 or younger and the field does not say it covers e-bikes, so local allowance is not set.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Generally prohibited. § 40-6-144: no person shall drive any vehicle upon a sidewalk, except where a local ordinance allows bicycles on sidewalks for riders 12 or younger." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Natural-surface trails designated nonmotorized are outside these rules. Their managers decide which devices may use them (§ 40-6-303(a)(3))." The managing authority decides, so state law gives no answer.

## HI Hawaii

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "All three classes allowed at 10 mph or less, except in business districts or where a county ordinance prohibits it. Counties may add reasonable restrictions (§ 291C-145(g))." The rule changes by zone, speed or local order, so one statewide answer is not safe.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "All three classes allowed at 10 mph or less, except in business districts or where a county ordinance prohibits it." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "No state rule on natural-surface trails was found. State and county park rules may apply." The field finds no state rule.

## IA Iowa

- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk ban found. Allowed where bicycles are allowed." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "No state natural-surface trail carve-out was found. DNR, county conservation and city park rules were not reviewed." The field says the rules of the managing bodies were not checked.

## ID Idaho

- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Allowed where bicycles are allowed." The sidewalks text names sidewalks only, so pedestrian paths are not covered.

## IL Illinois

- sidewalk, all classes banned. Basis from where_allowed.sidewalks, "Prohibited: 'A person may not operate a low-speed electric bicycle on a sidewalk' (§ 11-1517(g))."
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Prohibited: 'A person may not operate a low-speed electric bicycle on a sidewalk' (§ 11-1517(g))." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Allowed on any bicycle path unless the municipality, county or local authority with jurisdiction bans e-bikes or a class (§ 11-1517(f), through 2026)." The text names paths or bikeways and does not address natural-surface trails.

## IN Indiana

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 3 only on paths within or next to a highway, or where the local authority or state agency allows it."
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk rule was found. Sidewalk riding is governed by local ordinance." The field finds no state rule.
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk rule was found. Sidewalk riding is governed by local ordinance." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "On natural-surface nonmotorized trails, the managing local authority or state agency decides (subsection (l))." The managing authority decides, so state law gives no answer.

## KS Kansas

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk rule. Cities may adopt home-rule ordinances governing e-bikes on 'sidewalks or sidewalk areas' (8-1592b(f)(2)). Local rules apply." The field finds no state rule.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk rule." The sidewalks text names sidewalks only, so pedestrian paths are not covered.

## KY Kentucky

- bike_lane, all classes unclear. Basis from where_allowed.bike_lanes, "No e-bike-specific rule. Electric low-speed scooters may use bicycle lanes (KRS 189.289(1))." The field finds no state rule.
- separated_bikeway, all classes unclear. Basis from where_allowed.bike_lanes, "No e-bike-specific rule. Electric low-speed scooters may use bicycle lanes (KRS 189.289(1))." The field finds no state rule.
- bike_path, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "No state e-bike path rule found. Local, state park and Kentucky Fish & Wildlife rules govern. Not reviewed." The field finds no state rule.
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Bicycles may use sidewalks 'unless prohibited by law or ordinance' and must yield to pedestrians (601 KAR 14:020 § 7(4)). Whether this covers e-bikes depends on the unresolved classification." The field says the answer depends on how an e-bike is classified, which is unresolved.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Whether this covers e-bikes depends on the unresolved classification." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "No state e-bike path rule found. Local, state park and Kentucky Fish & Wildlife rules govern. Not reviewed." The field finds no state rule.

## LA Louisiana

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk rule found. Local ordinances govern (several parishes and cities restrict sidewalk cycling, not reviewed)." The field finds no state rule.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk rule found." The sidewalks text names sidewalks only, so pedestrian paths are not covered.

## MA Massachusetts

- bike_path, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "No Class 3 category exists. A 28 mph bike is likely a motorized bicycle: max 25 mph on ways, excluded from off-street recreational bicycle paths, bicycle lanes allowed (ch. 90, § 1B)." No Class 3 category exists and a 28 mph bike is only likely a motorized bicycle, so Class 3 is not settled.
- sidewalk, classes 1 and 2 banned, class 3 unclear. Basis from where_allowed.sidewalks, "Prohibited for e-bikes statewide (§ 11B3/4(b)), even though regular bicycles may use some sidewalks outside business districts." No Class 3 category exists and a 28 mph bike is only likely a motorized bicycle, so Class 3 is not settled.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Prohibited for e-bikes statewide (§ 11B3/4(b)), even though regular bicycles may use some sidewalks outside business districts." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, classes 1 and 2 banned, class 3 unclear, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Natural-surface trails designated nonmotorized are CLOSED to e-bikes unless the agency opens them after notice and hearing (§ 11B3/4(d))." No Class 3 category exists and a 28 mph bike is only likely a motorized bicycle, so Class 3 is not settled.

## MD Maryland

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.class3_restrictions, "Class 3 may not be used on a bicycle path unless the path is within or adjacent to a highway right-of-way or the agency with jurisdiction allows it."
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Because § 11-104 defines bicycle to include an electric bicycle, sidewalk riding appears allowed unless a local ordinance bans it." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Natural-surface trails designated nonmotorized may be regulated for any class by the agency with jurisdiction." The managing authority decides, so state law gives no answer.

## ME Maine

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 3 only on paths within a highway or roadway, or where the managing authority authorizes it."
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk rule found in 29-A. Municipal ordinances govern. Not reviewed." The field finds no state rule.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk rule found in 29-A." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes banned, local authorities may lift the ban. Basis from where_allowed.paths_trails, "No e-bike may use a nonmotorized path with significant natural surface (gravel, stones, wooden bridging) unless authorized (§ 2063(14)(F)(3))."

## MI Michigan

- bike_path, class 1 allowed, classes 2 and 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 2 and Class 3 allowed on those trails ONLY if the managing agency authorizes it."
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No e-bike-specific sidewalk rule." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes banned, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Natural-surface nonmotorized trails are closed to all e-bikes unless the agency allows them."

## MN Minnesota

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "E-bikes are bicycles, so bicycle sidewalk rules apply: not on sidewalks in a business district unless local authorities permit it, and local authorities may ban bicycles on any sidewalk (§ 169.222, subd. 4(d))." The rule changes by zone, speed or local order, so one statewide answer is not safe.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "E-bikes are bicycles, so bicycle sidewalk rules apply: not on sidewalks in a business district unless local authorities permit it, and local authorities may ban bicycles on any sidewalk (§ 169.222, subd. 4(d))." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Natural-surface nonmotorized trails and bike parks may be regulated by the managing agency." The managing authority decides, so state law gives no answer.

## MO Missouri

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No e-bike sidewalk rule in § 307.194." The field finds no state rule.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No e-bike sidewalk rule in § 307.194." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Natural-surface nonmotorized trails may be regulated by the agency." The managing authority decides, so state law gives no answer.

## MS Mississippi

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Not addressed in § 63-3-1315. § 21-37-3(2) says § 63-3-1315 governs e-bikes on sidewalks, and § 63-3-1315(7) allows e-bikes where bicycles are permitted, so sidewalk use follows local bicycle rules. Treat as unclear."
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Not addressed in § 63-3-1315." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Natural-surface trails designated nonmotorized may be regulated by the agency." The managing authority decides, so state law gives no answer.

## MT Montana

- bike_path, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "No Class 3 category. A 28 mph bike is likely a moped: may NOT be ridden under power on sidewalks or bicycle paths (61-8-608(3)(b)), may use highways, bike lanes and shoulders under power (61-8-608(3)(c))". No Class 3 category exists and a 28 mph bike is only likely a moped, which differs from the bicycle text for this kind, so Class 3 is not settled.
- sidewalk, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "No Class 3 category. A 28 mph bike is likely a moped: may NOT be ridden under power on sidewalks or bicycle paths (61-8-608(3)(b)), may use highways, bike lanes and shoulders under power (61-8-608(3)(c))". No Class 3 category exists and a 28 mph bike is only likely a moped, which differs from the bicycle text for this kind, so Class 3 is not settled.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Allowed unless official traffic control devices prohibit it (61-8-608(2)), yielding to pedestrians." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Land managers (state parks, federal lands) set their own trail rules." The managing authority decides, so state law gives no answer.

## NC North Carolina

- road, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "Class 3 (28 mph) is treated as a moped". Class 3 is treated as a moped, a category the bicycle text for this kind does not address.
- bike_lane, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "Class 3 (28 mph) is treated as a moped". Class 3 is treated as a moped, a category the bicycle text for this kind does not address.
- separated_bikeway, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "Class 3 (28 mph) is treated as a moped". Class 3 is treated as a moped, a category the bicycle text for this kind does not address.
- bike_path, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "No state statute. Set by the managing agency and local ordinance." The field finds no state rule.
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No state statute for bicycles or e-bikes (20-160(b) bans only motor vehicles on sidewalks). Cities may regulate sidewalks (160A-296, 160A-300)." The field finds no state rule.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No state statute for bicycles or e-bikes (20-160(b) bans only motor vehicles on sidewalks)." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "No state statute. Set by the managing agency and local ordinance." The field finds no state rule.

## ND North Dakota

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No state statute found in chapters 39-10 or 39-10.1. Set by city ordinance." The field finds no state rule.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No state statute found in chapters 39-10 or 39-10.1." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear. Basis from where_allowed.paths_trails, "All classes are allowed on bicycle and multi-use paths unless the governing entity prohibits them." The text names paths or bikeways and does not address natural-surface trails.

## NE Nebraska

- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Allowed as a bicycle with pedestrian duties and yielding to pedestrians (§ 60-6,317(4)), unless a local ordinance restricts it (§ 60-6,317(5))." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "The state and any political subdivision may permit, prohibit or control e-bike use in areas under its control (§ 60-678)." The managing authority decides, so state law gives no answer.

## NH New Hampshire

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.class3_restrictions, "Class 3 may NOT use a bicycle or multi-use path unless the path is within or adjacent to a highway or roadway, or the agency with jurisdiction allows Class 3."
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk rule found. Towns and cities regulate bicycle use on their ways by ordinance (RSA 265:149)." The field finds no state rule.
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide e-bike sidewalk rule found." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Natural-surface nonmotorized trails may be regulated by the agency." The managing authority decides, so state law gives no answer.

## NJ New Jersey

- road, class 1 allowed, classes 2 and 3 unclear. Basis from where_allowed.roads, "Motorized bicycles (class 2 and 3): banned from interstates, median-divided highways, roads posted over 50 mph, railroad rights-of-way, and public land where the agency prohibits them." The rule changes by zone, speed or local order, so one statewide answer is not safe.
- bike_path, class 1 allowed, classes 2 and 3 unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Path access for motorized bicycles is not stated in c.285." Classes 2 and 3 are motorized bicycles in New Jersey and the field does not state their access here.
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Sidewalk riding is not authorized by state law and is set by local ordinance."
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Sidewalk riding is not authorized by state law and is set by local ordinance." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, class 1 banned, classes 2 and 3 unclear, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Natural-surface non-motorized trails are off limits unless the agency allows it (39:4-14.16(d),(e))." Classes 2 and 3 are motorized bicycles in New Jersey and the field does not state their access here.

## NM New Mexico

- road, all classes unclear. Basis from where_allowed.roads, "Not expressly addressed in SB 69. E-bikes are not motor vehicles. Bicycle-on-road rules were not separately verified."
- bike_lane, all classes unclear. Basis from where_allowed.bike_lanes, "Not expressly addressed."
- separated_bikeway, all classes unclear. Basis from where_allowed.bike_lanes, "Not expressly addressed."
- bike_path, class 1 allowed, classes 2 and 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 1 is allowed on bicycle or pedestrian paths unless a political subdivision bans it. Class 2 and 3 are banned from paths unless the path is within a street or highway, or a political subdivision allows them."
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Not addressed in SB 69. Left to local ordinance (not verified)." The field finds no state rule.
- footway, class 1 allowed, classes 2 and 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 1 is allowed on bicycle or pedestrian paths unless a political subdivision bans it. Class 2 and 3 are banned from paths unless the path is within a street or highway, or a political subdivision allows them."
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Natural-surface non-motorized trails are outside 66-3-709 and may be regulated by the managing agency." The managing authority decides, so state law gives no answer.

## NV Nevada

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide rule on riding bicycles or e-bikes on sidewalks was found. The sidewalk ban in NRS 484B.117 applies to drivers of 'vehicles', and e-bikes are excluded from 'vehicle'." The field finds no state rule.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No statewide rule on riding bicycles or e-bikes on sidewalks was found." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Natural-surface nonmotorized trails may be regulated by the agency with jurisdiction." The managing authority decides, so state law gives no answer.

## NY New York

- road, all classes unclear, local authorities may restrict. Basis from where_allowed.roads, "Only on highways posted 30 mph or less (including private roads open to motor vehicles), unless local law says otherwise." The rule changes by zone, speed or local order, so one statewide answer is not safe.
- bike_lane, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "Class 3 is illegal outside a city of 1 million or more (in practice only NYC) per 1242(10)." Class 3 is legal only in a city of 1 million or more and the table has no place exceptions, so Class 3 is not settled statewide.
- separated_bikeway, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "Class 3 is illegal outside a city of 1 million or more (in practice only NYC) per 1242(10)." Class 3 is legal only in a city of 1 million or more and the table has no place exceptions, so Class 3 is not settled statewide.
- bike_path, all classes banned, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Banned on public lands and property other than highways, and greenways next to or connected with highways count as banned too, unless a state agency or locality designates and posts the land for e-bikes (1242(4))."
- sidewalk, all classes banned, local authorities may lift the ban. Basis from where_allowed.sidewalks, "Banned unless a local law authorizes it: 'No bicycle with electric assist shall be operated on a sidewalk, except as may be authorized by a local law'."
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Banned unless a local law authorizes it: 'No bicycle with electric assist shall be operated on a sidewalk, except as may be authorized by a local law'." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes banned, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Banned on public lands and property other than highways, and greenways next to or connected with highways count as banned too, unless a state agency or locality designates and posts the land for e-bikes (1242(4))."

## OH Ohio

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 3 is banned from those paths unless the path is within or next to a highway or the authority allows it."
- sidewalk, all classes banned. Basis from where_allowed.sidewalks, "Sidewalk riding is allowed only with the motor NOT engaged: no vehicle 'other than a bicycle or an electric bicycle if the motor is not engaged' on sidewalks (4511.711(A))."
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Sidewalk riding is allowed only with the motor NOT engaged: no vehicle 'other than a bicycle or an electric bicycle if the motor is not engaged' on sidewalks (4511.711(A))." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes banned, local authorities may lift the ban. Basis from where_allowed.paths_trails, "All classes are banned from mountain-bike, hiking, equestrian and natural-surface non-motorized trails unless authorized (4511.522(C)(3))."

## OK Oklahoma

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No state statute found. Set by local ordinance." The field finds no state rule.
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No state statute found. Set by local ordinance." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Natural-surface non-motorized trails are outside this rule and may be regulated by the agency." The managing authority decides, so state law gives no answer.

## OR Oregon

- bike_path, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "No e-bike-specific state statute was found. Path and trail rules are set by the managing agency (Oregon State Parks rulemaking in 2024 to 2025, not verified)." The field finds no state rule.
- sidewalk, all classes banned. Basis from where_allowed.sidewalks, "BANNED statewide. Riding an e-bike on a sidewalk is 'unsafe operation of a bicycle on a sidewalk', a Class D violation (814.410(1)(e))."
- footway, all classes unclear. Basis from where_allowed.sidewalks, "BANNED statewide. Riding an e-bike on a sidewalk is 'unsafe operation of a bicycle on a sidewalk', a Class D violation (814.410(1)(e))." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "No e-bike-specific state statute was found. Path and trail rules are set by the managing agency (Oregon State Parks rulemaking in 2024 to 2025, not verified)." The field finds no state rule.

## PA Pennsylvania

- road, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "Class 3 status is unclear (see verdict_cautions). If it counts as a pedalcycle with electric assist, the rules for other e-bikes apply, including the 16 and older age rule. If not, it is most likely a motor-driven cycle (license, registration, insurance)." The field says Class 3 status is unclear, since it may be a pedalcycle or a motor-driven cycle.
- bike_lane, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "Class 3 status is unclear (see verdict_cautions). If it counts as a pedalcycle with electric assist, the rules for other e-bikes apply, including the 16 and older age rule. If not, it is most likely a motor-driven cycle (license, registration, insurance)." The field says Class 3 status is unclear, since it may be a pedalcycle or a motor-driven cycle.
- separated_bikeway, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "Class 3 status is unclear (see verdict_cautions). If it counts as a pedalcycle with electric assist, the rules for other e-bikes apply, including the 16 and older age rule. If not, it is most likely a motor-driven cycle (license, registration, insurance)." The field says Class 3 status is unclear, since it may be a pedalcycle or a motor-driven cycle.
- bike_path, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "Class 3 status is unclear (see verdict_cautions). If it counts as a pedalcycle with electric assist, the rules for other e-bikes apply, including the 16 and older age rule. If not, it is most likely a motor-driven cycle (license, registration, insurance)." The field says Class 3 status is unclear, since it may be a pedalcycle or a motor-driven cycle.
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Allowed outside business districts, yielding to pedestrians and signaling before passing. In business districts only where signs permit, and not where a usable bike-only lane is next to the sidewalk (§ 3508)." The rule changes by zone, speed or local order, so one statewide answer is not safe.
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Allowed outside business districts, yielding to pedestrians and signaling before passing." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Trail access on DCNR and other lands is set by the land manager (not verified)." The managing authority decides, so state law gives no answer.

## RI Rhode Island

- road, all classes unclear. Basis from where_allowed.roads, "Not addressed in chapter 31-19.7. E-bikes are not motor vehicles. Whether chapter 31-19 bicycle rules apply was not verified." The field finds no state rule.
- bike_lane, all classes unclear. Basis from where_allowed.bike_lanes, "Not addressed." The field finds no state rule.
- separated_bikeway, all classes unclear. Basis from where_allowed.bike_lanes, "Not addressed." The field finds no state rule.
- bike_path, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Class 1 is allowed by statute on state bicycle trails and paths. DEM may regulate other uses on its properties (DEM proposed state-park rule amendments in March 2025, not read). Class 2 and 3 access to state paths depends on DEM rules." The statute speaks only to state bicycle trails and paths, so other paths are not covered.
- sidewalk, all classes unclear. Basis from where_allowed.sidewalks, "Not addressed in the sections read." The field finds no state rule.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Not addressed in the sections read." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Class 1 is allowed by statute on state bicycle trails and paths. DEM may regulate other uses on its properties (DEM proposed state-park rule amendments in March 2025, not read). Class 2 and 3 access to state paths depends on DEM rules." The statute speaks only to state bicycle trails and paths, so other paths are not covered.

## SC South Carolina

- road, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "SC has no Class 3 category. A 28 mph Class 3 bike does not meet the § 56-1-10(29) definition (top motor-powered speed must be less than 20 mph)." A 28 mph Class 3 bike does not meet the South Carolina e-bike definition, so the e-bike text does not cover it.
- bike_lane, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "SC has no Class 3 category. A 28 mph Class 3 bike does not meet the § 56-1-10(29) definition (top motor-powered speed must be less than 20 mph)." A 28 mph Class 3 bike does not meet the South Carolina e-bike definition, so the e-bike text does not cover it.
- separated_bikeway, classes 1 and 2 allowed, class 3 unclear, local authorities may restrict. Basis from where_allowed.class3_restrictions, "SC has no Class 3 category. A 28 mph Class 3 bike does not meet the § 56-1-10(29) definition (top motor-powered speed must be less than 20 mph)." A 28 mph Class 3 bike does not meet the South Carolina e-bike definition, so the e-bike text does not cover it.
- bike_path, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "No statewide e-bike rule found for paths or trails. Land managers and local governments set their own rules." The field finds no state rule.
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Whether an e-bike is a 'vehicle' under § 56-1-10(28) (which excludes devices moved by human power) is unclear. Local ordinances apply." The field says the answer depends on how an e-bike is classified, which is unresolved.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No statewide e-bike or bicycle sidewalk rule found." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "No statewide e-bike rule found for paths or trails. Land managers and local governments set their own rules." The field finds no state rule.

## SD South Dakota

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.class3_restrictions, "Class III not allowed on a bicycle path or multi-use path unless it is within or adjacent to a highway or roadway, or the managing entity expressly permits it (§ 32-20B-12)."
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Not confirmed whether 'bicycle' in those sections includes electric bicycles. Municipal ordinances may bar sidewalk riding." The field says the answer depends on how an e-bike is classified, which is unresolved.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Not confirmed whether 'bicycle' in those sections includes electric bicycles." The sidewalks text names sidewalks only, so pedestrian paths are not covered.

## TN Tennessee

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 3 barred from paths and trails unless the path is within or adjacent to a street or highway or the local government or state agency permits it."
- sidewalk, all classes banned. Basis from where_allowed.sidewalks, "No electric bicycle on a sidewalk unless the local government or state agency authorizes bicycles on that sidewalk AND the electric motor is disabled (§ 55-8-306(a)(4), 2016 text, not changed by Pub. Ch. 651)."
- footway, all classes unclear. Basis from where_allowed.sidewalks, "No electric bicycle on a sidewalk unless the local government or state agency authorizes bicycles on that sidewalk AND the electric motor is disabled (§ 55-8-306(a)(4), 2016 text, not changed by Pub. Ch. 651)." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 3 barred from paths and trails unless the path is within or adjacent to a street or highway or the local government or state agency permits it."

## TX Texas

- footway, all classes unclear. Basis from where_allowed.sidewalks, "No statewide ban. TxDOT or a local authority may prohibit bicycles (and so e-bikes) on sidewalks (§ 551.106(b)(1))." The sidewalks text names sidewalks only, so pedestrian paths are not covered.

## UT Utah

- footway, all classes unclear. Basis from where_allowed.sidewalks, "Bicycle sidewalk rules apply: yield to pedestrians, give an audible signal, ride at a prudent speed." The sidewalks text names sidewalks only, so pedestrian paths are not covered.

## VA Virginia

- footway, all classes unclear. Basis from where_allowed.sidewalks, "Allowed. § 46.2-903 exempts electric power-assisted bicycles from the ban on vehicles on sidewalks." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "Natural-surface nonmotorized trails may be regulated by the managing body (§ 46.2-904.1(F)(1)-(3))." The managing authority decides, so state law gives no answer.

## VT Vermont

- footway, all classes unclear. Basis from where_allowed.sidewalks, "No statewide e-bike or bicycle sidewalk ban found. § 1132 bars only motor vehicles from sidewalks, and e-bikes are not motor vehicles." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "On natural-surface trails designated nonmotorized, the path rules do not apply and the managing body may regulate e-bikes (§ 1136a(e)(2)-(4))." The managing authority decides, so state law gives no answer.

## WA Washington

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 3 barred from shared-use paths unless the local jurisdiction allows it."
- sidewalk, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.sidewalks, "Class 3 barred from sidewalks unless there is no alternative as part of a bicycle or pedestrian path, or a local ordinance authorizes it (RCW 46.61.710(3), 46.61.715)."
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Class 3 barred from sidewalks unless there is no alternative as part of a bicycle or pedestrian path, or a local ordinance authorizes it (RCW 46.61.710(3), 46.61.715)." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes banned, local authorities may lift the ban. Basis from where_allowed.paths_trails, "ALL classes barred from natural-surface trails designated nonmotorized unless the managing authority allows them (RCW 46.61.710(9))."

## WI Wisconsin

- sidewalk, all classes banned, local authorities may lift the ban. Basis from where_allowed.sidewalks, "Not allowed unless local authorities permit it."
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Not allowed unless local authorities permit it." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, all classes unclear, local authorities may restrict. Basis from where_allowed.paths_trails, "All classes may ride with the motor on along bikeways (as defined in § 84.60(1)(a)) run by DNR, DOT, a municipality or a county, subject to their rules." The text names paths or bikeways and does not address natural-surface trails.

## WV West Virginia

- bike_path, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 3 barred from bicycle paths, multiuse trails and single-use trails unless within a highway or roadway or the managing municipality, local authority or state agency expressly permits it."
- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide e-bike or bicycle sidewalk rule found. Municipalities regulate bicycle operation under § 17C-2-8(a)(8)." The field finds no state rule.
- footway, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "No statewide e-bike or bicycle sidewalk rule found." The sidewalks text names sidewalks only, so pedestrian paths are not covered.
- trail, classes 1 and 2 allowed, class 3 banned, local authorities may restrict, local authorities may lift the ban. Basis from where_allowed.paths_trails, "Class 3 barred from bicycle paths, multiuse trails and single-use trails unless within a highway or roadway or the managing municipality, local authority or state agency expressly permits it."

## WY Wyoming

- sidewalk, all classes unclear, local authorities may restrict. Basis from where_allowed.sidewalks, "Likely not allowed under motor power. § 31-5-120 bars driving 'any vehicle except motorized wheelchairs other than by human power upon a sidewalk'. Pedaling with the motor off appears allowed. Local ordinances may differ." The field only says the sidewalk ban likely applies under motor power, so it is not settled.
- footway, all classes unclear. Basis from where_allowed.sidewalks, "Likely not allowed under motor power. § 31-5-120 bars driving 'any vehicle except motorized wheelchairs other than by human power upon a sidewalk'." The sidewalks text names sidewalks only, so pedestrian paths are not covered.

## Allowed values with an exception or a date

These rows are allowed for the classes shown in states.json, but the named field also states an exception for certain places or a change of date. One value cannot show it, so the quote is repeated here. For Illinois, localMayRestrict follows the law through 2026 and narrows from 2027.

- IL bike_path. Basis from where_allowed.paths_trails, "From 2027, only the State agency with jurisdiction, DNR (by rule) and park, forest preserve, conservation and transit districts may restrict paths."
- KS road. Basis from where_allowed.roads, "Wherever a usable path for bicycles has been provided adjacent to a roadway, bicycle riders shall use such path and shall not use the roadway."
- MA road. Basis from where_allowed.roads, "all public ways except limited-access or express state highways posted against bicycles".
- MD road. Basis from where_allowed.roads, "Bicycles may not use roadways posted above 50 mph (shoulder use allowed) or expressways".
- MI road. Basis from where_allowed.roads, "Not allowed in a city that bans nonemergency motor vehicles (Mackinac Island) unless the city allows it, and not in Mackinac Island State Park without a permit".
- OR road. Basis from where_allowed.roads, "Where a jurisdiction finds a bike lane or path suitable, riders must use it (814.420)."
- PA road. Basis from where_allowed.roads, "Banned on freeways except by permit or designation (§ 3511)."
- SC road. Basis from where_allowed.roads, "Freeway main lanes are closed to bicycles and 'a bicycle with motor attached'."
- SD bike_path. Basis from where_allowed.paths_trails, "George S. Mickelson Trail: only Class I is allowed."
- VA road. Basis from where_allowed.roads, "Banned on Interstate Highway System components except barrier-separated facilities the Commonwealth Transportation Board approves (§ 46.2-908.1)."
