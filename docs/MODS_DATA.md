# Mods check data

The mods check at `/mods` answers, for each change made to a bike, whether it is still legal to ride as an e-bike in California. It reads two files.

- `data/mods/ca-mods.json` is the research, read Oct 21, 2026 and checked by a second reader the same day. It has 18 mods, 46 sources, each mod's outcomes, rules, penalties, what changes on Jan 1, 2027, and a confidence note. Every quote in it was checked word for word against primary text and is under 15 words. The second reader's 10 corrections are listed in its `second_reader.changes`.
- `data/mods/ca-mods.answers.json` says how the app reads each outcome, in the source's order, with the Spanish names, examples and conditions. `lib/mods/data.ts` refuses a note that reads an outcome as more than the source says, like a not-an-e-bike outcome read as the same class.

## How the sources were read

The leginfo.legislature.ca.gov section pages returned HTTP 403 to automated reads on Oct 21, 2026. Statute and bill text came from the Legislature's official bulk data on downloads.leginfo.legislature.ca.gov, the same database, `pubinfo_2025.zip` dated Oct 18, 2026 and `pubinfo_daily_Tue.zip` dated Oct 20, 2026. Each source keeps its leginfo link for people to click. CHP, DMV and City of San Diego pages were read directly.

SB 1167 (ch. 846) and AB 2346 (ch. 842) were chaptered Sep 30, 2026 as non-urgency bills, so both take effect Jan 1, 2027 under Cal. Const. art. IV, sec. 8(c)(1).

## How an answer is made

`lib/mods/answer.ts` gives each ticked mod YES or NO.

- YES only for an outcome the source reads as the same class or a new class, like a Class 1 bike with a 20 mph throttle becoming Class 2.
- NO for an outcome that is not an e-bike, that the source doesn't settle, that depends on a speed the family hasn't named, or that breaks a named rule, like a disconnected brake cutoff under VC 24016(a)(2).
- NO when the family hasn't picked what the change does, or picks "Something else, or not sure".
- A bike whose pedal assist runs past 28 mph is NO before Jan 1, 2027, since the current text doesn't settle it, and NO as not an e-bike from that date.
- With "They ride in the City of San Diego" ticked, SDMC 84.21(b) makes an add-on passenger seat or child seat NO while it is in effect, Aug 13, 2026 through Jan 1, 2029, and leaves a child trailer NO as not settled.
- The 2027 changes show only for a ride date on or after Jan 1, 2027.
- A bike that stays an e-bike leaves out the motor vehicle penalties.

The whole bike is YES only when every ticked mod is YES.

Every reason, rule, date and penalty on the page is a string from `data/mods/ca-mods.json`, word for word. `tests/mods.test.ts` renders every mod, class, choice, date and place and checks each one. The page's own words are in `lib/i18n/mods.ts`, in English and Spanish. The legal text stays in English on the Spanish page, with a line that says so.

## Open questions the research names

- The leginfo pages themselves were not loaded because of the 403.
- No section read sets a penalty for VC 12500(b) alone, so it is an infraction under VC 40000.1. Whether the Penal Code 19.8(a)(2) $250 cap or the VC 42001(a) fines apply is not settled.
- A Class 3 bike with an added 20 mph throttle fits no class, before or after 2027.
- The statute does not say whether 750 watts means continuous or peak power.
- From Jan 1, 2027, VC 24016(d) still points to the label in 312.5(c), which SB 1167 turns into the non-e-bike list.
- Amended VC 22651.08(a)(3) points to an Article 9 that SB 1167 does not add.
- Whether a child in a towed trailer counts as a carried passenger under SDMC 84.21(b) is open.
- Sirens and colored lights other than blue are left out, since the research did not settle them.
