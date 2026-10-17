# E-bike law table, verification report

Checked Oct 16, 2026 (PT) by the independent verifier. The 51 source files were not edited. New files in this folder are `all_states.normalized.json`, `corrections.json`, `san_diego_local.json` and this report. Scripts and downloads are in the verifier scratchpad (`scratchpad/verifier/`).

## Bottom line

- **Sample error rate is 2 of 11 records (18%).** South Carolina would give a false "legal" today. North Carolina would give false "illegal" answers from Dec 1, 2026, because the agent missed a law signed in July.
- California was fully re-checked. It has no errors that change a verdict, only one citation fix and two wording fixes.
- Three jurisdictions must never return "legal": Alaska, Kentucky and South Carolina.
- The 750 W split is 19 states at "less than 750 W" and 24 at "750 W or less". Four have no watt cap and four fit neither group.
- Every sampled quote was found in its cited source, except one New Jersey helmet quote that I did not open (39:4-14.3q on FindLaw).

## 1. Sample and error rate

The sample was CA (full re-check), plus NJ, WV, RI, SC, FL, NC, NY, OR, VT and WI. For each one I read the official statute pages myself. I checked the definition, ages by class, helmet ages, license, registration and insurance, non-e-bike devices, local powers and pending changes. I also searched for 2025 and 2026 amendments.

| Severity | Entries | Records |
|---|---|---|
| would_cause_false_legal | 2 | SC |
| would_cause_false_illegal | 1 | NC |
| citation_only | 7 | CA, WV, RI, NC |
| cosmetic | 5 | CA, RI, SC, NC |

SC and NC have verdict-changing errors, so the rate is **2 of 11 (18.2%)**. With only 11 records this rate is rough. The two misses were different kinds of error (a definition that structured fields hid, and a missed new law), so I would expect more of both in the 40 unchecked records.

No corrections were needed for FL, NJ, NY, OR, VT or WI.

## 2. Corrections (all are in `corrections.json` and applied in the normalized file)

**Verdict-changing**

1. **SC, never_return_legal, set to true (false legal).** The only category, "electric-assist bicycles", needs a top motor-powered speed of "less than twenty miles an hour" and a motor that cuts out when "the rider stops pedaling". Class 2 throttles and all Class 3 bikes fall outside it, and a standard "20 mph" Class 1 label does not literally meet "less than twenty". The agent flagged this in open questions, but the structured fields (no age rule, no helmet rule, no license) would have let the engine say "legal".
2. **SC, helmet_status, set to unknown (false legal).** S.C. Code 56-5-3660 requires a helmet for anyone under 21 on "a two-wheeled motorized vehicle". Whether that reaches an e-bike is unresolved, so an empty helmet list should not read as "no helmet needed".
3. **NC, new pending change, S.L. 2026-46 (false illegal from Dec 1, 2026).** HB 1094 was ratified Jul 2 and approved Jul 7, 2026. Section 19, effective Dec 1, 2026, rewrites G.S. 20-4.01(7a) into three classes at 750 W or less, so Class 3 becomes an e-bike, not a moped. It requires helmets for Class 3 riders and passengers under 18. It also lets cities and counties restrict classes on multiuse paths and sidewalks, set speed limits and require helmets under 18 on Class 1 and 2. It adds no state minimum age. The agent wrote that the three-class bills were "stuck in committee". After Dec 1 the old record would wrongly bar under-16 riders from Class 3 and demand moped registration and insurance.

**Citation and wording fixes**

4. CA, non_ebike_devices.notes. VC 22651.08 (removal of fast non-e-bike electric two-wheelers and of Class 3 bikes ridden by under-16s) is already law. AB 875 added it effective Jan 1, 2026. The agent listed it as a Jan 1, 2027 change.
5. CA, AB 2346 summary and where_allowed.paths_trails. Local path limits are 15 or 20 mph, and 10 mph only in limited high-pedestrian or low-visibility areas, with signs.
6. WV, label_required. The quote is the anti-tampering clause, not label text. West Virginia has no label rule.
7. RI, three entries. A "motorized bicycle" is 31-1-3(p). (o) is "motor-driven cycle".
8. RI, open question resolved. H 7789 Sub A passed the House but was held in Senate Judiciary when the session ended Jun 11, 2026, so it is not law.
9. SC, non_ebike_devices.notes. A two-wheeler at or under 750 W that fails the e-bike definition most likely counts as a "motorcycle" (56-1-10(8)), not an unknown category.
10. NC, three notes updated to point at S.L. 2026-46.

**Checked and confirmed (no change needed)**

- CA. SB 1167 (ch. 846), AB 2346 (ch. 842) and AB 2595 (ch. 843) were all chaptered Sep 30, 2026 and are non-urgency, so they take effect Jan 1, 2027. VC 312.5(a) says "does not exceed 750 watts".
- WV. The agent's Class 3 age finding holds. The signed 2023 HB 2062 has no 17C-11-8(i)(1). The introduced bill kept the under-16 Class 3 rule and renumbered only the passenger rule, so the gap looks like a drafting error. The status stays "none in state law", with an engine caution added.
- NJ. P.L.2025, c.285 was read in full. Age 15, license or moped license, registration, and insurance for motorized bicycles only (MVC advisory, Jun 23, 2026) are all confirmed.
- FL. The 2026 statutes show no 2026 change, and SB 382 was vetoed.
- OR, VT, WI and NY. Texts and dates are as recorded.

## 3. Never return "legal"

| Code | Why |
|---|---|
| AK | No e-bike statute. HB 8 (2023) was vetoed. An e-bike looks like a motor vehicle or motorcycle. |
| KY | No e-bike statute. It could be a bicycle, a licensed moped or a 16+ scooter. |
| SC | Definition too narrow and unclear for any standard class label (see correction 1). |

Class-level cautions are in each record's `verdict_cautions` field. They mean "never return legal for this class (or this rider)":

- DC, Class 3. It is a motor-driven cycle above 20 mph and needs a driver's license.
- MA, Class 3. Only Class 1 and 2 exist, so a Class 3 is likely a motorized bicycle.
- MT, Class 3. Likely a moped.
- NC, Class 3. Likely a moped until Dec 1, 2026, then an e-bike.
- NJ, Class 2 and 3. Both are now motorized bicycles (license, registration, insurance, helmet at all ages).
- NY, Class 3. Allowed only in NYC with a 25 mph cap, so a 28 mph label fits no class.
- PA, Class 3. Not recognized.
- UT, Class 2. The exclusion of "20 miles per hour or greater on motor power alone" may catch a 20 mph throttle. Unclear.
- WV, Class 3 riders under 16. Unclear (see above).
- NE, any label of 746 W or more. Each class must also produce "no more than one brake horsepower" (about 745.7 W). Unclear.

## 4. The 750 W split

| Comparison | Count | Codes |
|---|---|---|
| less_than (750 W fails) | 19 | AL, AR, AZ, FL, ID, IL, KS, LA, ME, MO, MS, NH, NY, OH, TN, TX, VT, WV, WY |
| at_most (750 W passes) | 24 | CA, CO, CT, DE, GA, HI, IA, IN, MA, MD, MI, MN, NC, ND, NM, NV, OK, PA, SC, SD, UT, VA, WA, WI |
| no_watt_cap | 4 | DC, MT, NJ, OR |
| other | 4 | AK and KY (no e-bike law), RI (2 SAE hp), NE (750 W and also 1 bhp) |

Notes on the split:

- Two states recently moved to "at most". CT changed on Oct 1, 2026 (P.A. 26-24) and IA on Jul 1, 2026 (SF 490). California has used "does not exceed" since Jan 1, 2025.
- In Vermont a 750 W bike is not illegal. It becomes a "motor-assisted bicycle", which bars riders under 16 on highways and bans sidewalk riding.
- If NE is counted by its watt clause alone, the split is 19 less_than and 25 at_most.

## 5. Normalization (`all_states.normalized.json`)

- All 51 records now share one shape. Every object type has the same keys, and missing keys are null.
- `max_motor_watts` holds the statute's number. MO, MS and NH went from 749 to 750, and strictness now lives in `motor_watts_comparison`. RI went from 1,491 (the agent's horsepower conversion) to null, with `max_motor_hp` set to 2. NE and SC carry `max_motor_hp` 1.
- Folded fields:
  - `max_motor_watts_exclusive` became `motor_watts_comparison`.
  - `max_motor_hp_sae` became `max_motor_hp`.
  - `quote_note`, `*_notes`, `by_class`, `can_ban_on_paths` and `can_add_age_limits` are now standard keys.
  - Each agent's original status words are kept in `min_age_status_agent` and `helmet_status_agent`.
- Status totals:
  - `min_age_status`: rule 38, none_in_state_law 11, unknown 2 (AK, KY).
  - `helmet_status`: rule 31, none_in_state_law 18, unknown 2 (AK, SC).
  - DC's helmet status is "rule" because its list is non-empty, although the agent marked it unclear.
- New fields:
  - `never_return_legal`, `never_return_legal_reason` and `verdict_cautions`.
  - `normalization_notes`, which lists every value normalization changed.
  - `verified_by_verifier`. It is "2026-10-16" for the 11 checked records and null for the other 40.
  - `verifier_corrections`, a count, and `verifier_notes`.

## 6. Rules that change on a known date

| Date | Code | Change |
|---|---|---|
| about Nov 12, 2026 | HI | Act 259 label and point-of-sale rules begin (earlier if DOT adopts rules). |
| Dec 1, 2026 | NC | Three classes. Class 3 becomes an e-bike. Helmet for Class 3 riders under 18. New city and county powers. |
| Jan 1, 2027 | CA | SB 1167: e-moto definitions and new 312.5 non-e-bike list. VC 23135 bars any electric 2- or 3-wheeler able to exceed 20 mph on motor power alone from roads unless it is road legal. |
| Jan 1, 2027 | CA | AB 2346: 10 mph sidewalk limit, local path limits and point-of-sale disclosures. |
| Jan 1, 2027 | CA | AB 2595: San Mateo under-12 pilot, repealed Jan 1, 2031. |
| Jan 1, 2027 | IL | P.A. 104-0854: Class 1 and 2 riders must be 15+. Passenger limits under 18. Non-qualifying bikes become motor driven cycles. Local rules preempted. |
| Jan 1, 2027 | OR | HB 4007: Class 1 age drops from 16 to 14. Class 1 and 2 allowed at any age in a safety program. Helmet duty moves to parents. |
| Jan 1, 2027 | CO | Multiple-mode e-bike labels must show the highest class. |
| Jan 1, 2027 | NJ | E-bike riders count as pedestrians for PIP insurance. The online sales ban on electric motorized bicycles ends about Jan 19, 2027. |
| May 5, 2027 | UT | Ages 8 to 15 need supervision or a state safety certificate on highways. The separate Class 3 age-16 line is dropped. |
| Jan 1, 2029 | CA | Class 2 speedometer and front and rear lamps on new e-bikes (AB 2346). San Diego (21214.7) and Marin (21214.5) pilots end. |

The engine needs a per-rule effective date and a date switch. NC's switch comes first, in six weeks.

## 7. San Diego local layer (`san_diego_local.json`)

| Place | Under-12 ban on Class 1 and 2 | Status |
|---|---|---|
| City of San Diego (includes CCA area) | Yes, effective Aug 13, 2026. Citations from Oct 12, 2026. $25 fine or online course. | secondary_only (City releases. Ordinance text and code section not found.) |
| Carlsbad | Yes, effective Mar 26, 2026. Warnings ended May 25. Impound plus in-person course. E-motos impounded. | secondary_only |
| Encinitas | None found ("No minimum age" on city page) | secondary_only |
| Solana Beach | None found | secondary_only |
| Del Mar | None found (Chapter 14.54, adopted Jul 7, 2025, has no age rule) | secondary_only |
| Unincorporated County | Power exists. No ordinance found. | unclear. Return "unclear" for under-12 riders there. |
| SDUHSD campuses | Not an age rule. Only Class 1 and 2 on campus, a district tag, a safety course and a helmet at every age. | secondary_only |

City pages that conflict with the statute:

- Carlsbad and Encinitas still define an e-bike as "less than 750 watts". That is the pre-2025 wording. The statute now says "does not exceed 750 watts". The red-team notes made the same error.
- Encinitas says Class 3 is "pedal or throttle-assisted", bans Class 3 from bike paths "per CVC", and bans Class 3 passengers. None of that is in the current Vehicle Code.
- Carlsbad implies Class 3 is barred from Class I paths and Class IV bikeways. The state ban ended in 2023, and no Carlsbad ordinance doing this was found.
- Solana Beach's biking page says helmets for riders "18 years and under". Its own flyer and VC 21212 say under 18.
- The City of San Diego's Aug 7 release says pedal bikes are the only bikes for "ages 12 and under". The statute allows a ban only under 12.

## 8. Open questions that most affect verdicts

1. **SC classification.** Is a standard Class 1 (20 mph) or a Class 2 an "electric-assist bicycle" or a motorcycle? Until DPS or a court says, SC must stay never-legal.
2. **750 W labels in the 19 "less than" states.** The engine must not return "legal" for an exactly 750 W label there. The safest result is "unclear", or "not an e-bike" where the statute has a fallback category (VT motor-assisted bicycle, IL motor driven cycle from 2027).
3. **The "motor stops when the rider stops pedaling" clause.** It applies to every class in FL, IN, MS, MO, NV, NH, SD, TX, VA and others, and on its face conflicts with Class 2 throttles. I kept Class 2 legal in those states, but no source settles it.
4. **WV Class 3 under 16.** The statute is silent, likely by a 2023 drafting error, and some city codes still say 16.
5. **Local age limits outside California.** Florida (any minimum age since Jul 1, 2025), Arizona, Wyoming and others let cities set limits. A state-only "legal" can be wrong at city level.
6. **Unincorporated San Diego County and the City of San Diego ordinance text.** One is unconfirmed and the other lacks a code section to cite.
7. **NJ class 1 insurance.** The statute still says to carry an insurance card, while MVC and DOBI say none is required.
8. **UT Class 2 at exactly 20 mph, and NE labels from 746 to 750 W.** Both are treated as unclear.

## Method and limits

- Statutes were read on official sites, namely leginfo (through the browser pane, because of a bot check), njleg, code.wvlegislature.gov, rilegislature.gov, scstatehouse.gov, flsenate.gov, ncleg.gov, nysenate.gov (browser), oregonlegislature.gov, legislature.vermont.gov and docs.legis.wisconsin.gov. A script compared each sampled quote with the downloaded text.
- Secondary sources were used only to find bills (KQED, UNC SOG (by search summary), Bike Newport and the official NJ MVC advisory). The NC law itself was read in the enacted session law.
- I did not verify the other 40 records beyond normalization, the NJ 39:4-14.3q helmet text, the Carlsbad ordinance PDF (blocked), the Encinitas, Solana Beach and San Diego municipal codes, and County Board agendas.
- No logins, forms or contacts were used. No files were deleted.
