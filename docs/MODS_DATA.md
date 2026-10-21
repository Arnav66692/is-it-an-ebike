# Mods check data

The mods check at `/mods` answers, for each change made to a bike, whether it is still legal to ride as an e-bike where the family rides, in any state, county, city, town or school district. Every state's answer comes from the rules engine (`lib/rules`), on the bike after the mod. In California the verified mod research applies too. It is in two files.

- `data/mods/ca-mods.json` is the research, read Oct 21, 2026 and checked by a second reader the same day. It has 18 mods, 46 sources, each mod's outcomes, rules, penalties, what changes on Jan 1, 2027, and a confidence note. Every quote in it was checked word for word against primary text and is under 15 words. The second reader's 10 corrections are listed in its `second_reader.changes`.
- `data/mods/ca-mods.answers.json` says how the app reads each outcome, in the source's order, with the Spanish names, examples and conditions. `lib/mods/data.ts` refuses a note that reads an outcome as more than the source says, like a not-an-e-bike outcome read as the same class.

## How the sources were read

The leginfo.legislature.ca.gov section pages returned HTTP 403 to automated reads on Oct 21, 2026. Statute and bill text came from the Legislature's official bulk data on downloads.leginfo.legislature.ca.gov, the same database, `pubinfo_2025.zip` dated Oct 18, 2026 and `pubinfo_daily_Tue.zip` dated Oct 20, 2026. Each source keeps its leginfo link for people to click. CHP, DMV and City of San Diego pages were read directly.

SB 1167 (ch. 846) and AB 2346 (ch. 842) were chaptered Sep 30, 2026 as non-urgency bills, so both take effect Jan 1, 2027 under Cal. Const. art. IV, sec. 8(c)(1).

## How an answer is made in every state

`lib/mods/facts.ts` turns the bike's class, the mod and the family's answer about what it does now into the engine's bike facts, and `lib/mods/ride.ts` runs the engine.

- The bike before the mods is the class picked, with pedals, and a throttle only for Class 2, since Class 1 and Class 3 have none. Its rated watts are the ones typed in, and the engine's follow-up answers (fast modes, wheels, weight, foot pegs) are the family's own, about the bike as it is now.
- Each outcome in `ca-mods.json` has an entry in `MOD_FACTS`, in the same order, and a test fails if a mod or an outcome is missing. The motor alone now passing 20 mph sets `motorOver20`. Pedal assist past 28 mph sets `assistOver28`. A motor now over 750 W uses the typed watts when they are over 750, and leaves the watts unknown otherwise, so the engine can't confirm it. Removed pedals set `hasPedals` false. An added throttle sets `hasThrottle`, with the motor-over-20 answer the outcome names. A Class 1 bike that now gets a 20 mph throttle is Class 2, and one that now assists to 28 mph with pedaling only is Class 3. Rider foot pegs set `hasFootPegs`. A locked mode or code sets `switchable`.
- Lights, a horn or bell, turn signals, a child seat, a child trailer, a passenger seat or pegs, the class label, the brake cutoff, handlebars, and tires that keep the speed cutoffs change no engine fact, so they keep the engine's answer for the bike as it is.
- A wheel or tire change that lets the motor help past 20 or 28 mph can't be turned into facts, so it is NO as depending on the result. No answer, or "Something else, or not sure", sets nothing, so it is NO.
- The engine runs with the state, the checked places the picks stand for, whether a pick's own rules were not checked, the rider's age and the ride date, and `bottomLine` gives the YES or NO. The mod is YES only when that bottom line is YES. Otherwise it is NO with the engine's reason. Every open follow-up question shows in the bike step.
- The whole bike is YES only when every mod is YES and the engine says YES for all the mods together. When two mods set the same fact differently, the riskier answer wins, and the bike may be any class a mod moves it to.
- Outside California each card says in one line that the state's own rules for that mod and its penalties were not checked, and shows no penalties.

## What California adds

`lib/mods/answer.ts` gives each ticked mod California's YES or NO from the research, unchanged. In California the answer is YES only when both it and the engine say YES. When the research says YES and the engine doesn't, the card shows the engine's reason above the research's.

- YES only for an outcome the source reads as the same class or a new class, like a Class 1 bike with a 20 mph throttle becoming Class 2.
- NO for an outcome that is not an e-bike, that the source doesn't settle, that depends on a speed the family hasn't named, or that breaks a named rule, like a disconnected brake cutoff under VC 24016(a)(2).
- NO when the family hasn't picked what the change does, or picks "Something else, or not sure".
- A bike whose pedal assist runs past 28 mph is NO before Jan 1, 2027, since the current text doesn't settle it, and NO as not an e-bike from that date.
- With the City of San Diego, or one of its neighborhoods, picked, SDMC 84.21(b) makes an add-on passenger seat or child seat NO while it is in effect, Aug 13, 2026 through Dec 31, 2028, and leaves a child trailer NO as not settled. The City's fine shows only then.
- The 2027 changes show only for a ride date on or after Jan 1, 2027.
- A bike that stays an e-bike leaves out the motor vehicle penalties. A card waiting for "What does it do now?" shows no penalties and links back to the question.
- A mod that makes the bike Class 3 is NO when the rider is under 16. The page now always asks the age, since the engine needs it.
- A rule's end date is its last day in effect. The source gives VC 21214.5(b) and SDMC 84.21(b) the repeal date, Jan 1, 2029, so `ca-mods.answers.json` lists them under `ends_is_repeal_date` and the app ends them Dec 31, 2028. A rule whose text starts "Until Dec 31, 2026," ends that day.

Every reason, rule, date and penalty on the page is a string from `data/mods/ca-mods.json`, word for word. The one line about what a result means, like "The class label must be replaced, and that class's rules apply.", is the app's own, in English and Spanish, and so is who a penalty applies to. The overall line counts the mods that stop it being legal apart from those that can't be confirmed and those that still need an answer. `tests/mods.test.ts` renders every mod, class, choice, date and place and checks each one. `tests/modFacts.test.ts` checks the mod-to-facts table, and the gate in `tests/featureGates.ts` runs every state, four ages, every mod, class and choice and three bikes, and counts any YES where the engine on the bike after the mod says anything but YES. It also checks that every California answer from the research matches `answerMod` for the same inputs, and that `answerMod` still gives the same 14,328 answers it gave before this change, by a fingerprint in `tests/modsDigest.ts`. The page's own words are in `lib/i18n/mods.ts`, in English and Spanish. The legal text stays in English on the Spanish page, with a line that says so.

## Open questions the research names

- The leginfo pages themselves were not loaded because of the 403.
- No section read sets a penalty for VC 12500(b) alone, so it is an infraction under VC 40000.1. Whether the Penal Code 19.8(a)(2) $250 cap or the VC 42001(a) fines apply is not settled.
- A Class 3 bike with an added 20 mph throttle fits no class, before or after 2027.
- The statute does not say whether 750 watts means continuous or peak power.
- From Jan 1, 2027, VC 24016(d) still points to the label in 312.5(c), which SB 1167 turns into the non-e-bike list.
- Amended VC 22651.08(a)(3) points to an Article 9 that SB 1167 does not add.
- Whether a child in a towed trailer counts as a carried passenger under SDMC 84.21(b) is open.
- Sirens and colored lights other than blue are left out, since the research did not settle them.
