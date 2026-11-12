# Methodology

How Bento turns a session into targets, and where each rule comes from. The rules live in
[`site/src/lib/factors.ts`](../site/src/lib/factors.ts) (targets and notes) and
[`site/src/lib/plan.ts`](../site/src/lib/plan.ts) (the timeline). Every number below is a
starting point for an MVP, not a settled value. [`research-prompt.md`](research-prompt.md)
asks for the evidence that should confirm or replace each one.

Bento gives general guidance. It is not medical advice.

## Carbohydrate

| Rule | Value in Bento | Basis |
| --- | --- | --- |
| Band by workout | z2 30-60, endurance 60-90, race 90-120 g/h | Jeukendrup 2014 (*Sports Med* 44 S1), Thomas et al. 2016 ACSM/AND/DC position; 90-120 g/h from Viribay 2020, Podlogar 2022 |
| Duration ceiling | <45 min: 0 (mouth rinse); 45-75: 30; 75-150: 90; 150+: 120 g/h | Jeukendrup 2014 duration ladder, widened at the top for current race practice |
| Sport | running ×0.85, trail running ×0.9, cycling ×1 | Pfeiffer 2012 (similar oxidation, more GI symptoms in running); trail has walking sections |
| Gut training | low 60, moderate 90, high 120 g/h ceiling | Cox 2010, Costa 2017: tolerance rises over 2-6 weeks of practice |
| Target | middle of the band, +5% on trail, +10% at 1500 m+ | Trail costs more energy at a given pace; altitude shifts fuel use toward carbohydrate (Brooks 1991) |
| Glucose:fructose | 2:1 above 60 g/h, ~1:0.8 at 90 g/h+ | SGLT1 saturates near 60 g/h; Rowlands 2015, Podlogar 2022 |

## Fluid and sodium

| Rule | Value in Bento | Basis |
| --- | --- | --- |
| Sweat rate, unknown | base 0.8 (ride), 1.0 (run), 0.9 (trail run) L/h × intensity × body mass/70 × heat × humidity, clamped 0.3-2.5 | Ranges in Sawka 2007 ACSM fluid stand and Barnes 2019 (sweat rate variability) |
| Intensity | sweat ×0.85 for z2, ×1 endurance, ×1.15 race | Sweat rate rises with metabolic heat production (Sawka 2007); factors are an MVP simplification |
| Heat | +3% per °C above 15 °C, floor 60% of base | Simplified from Barnes 2019 |
| Humidity | +up to 20% above 60% RH | Less evaporative cooling, more drip sweat |
| Terrain | sweat ×1.05 on trail | Higher energy cost at a given pace on rough ground and climbs; MVP estimate |
| Altitude | +0.1 L/h at 2000 m+ | Drier air and higher ventilation add respiratory water loss (Sawka 2007); MVP estimate |
| Fluid target | 70% of sweat rate, 300-1000 ml/h (250 below 5 °C), none under 60 min unless hot | Avoid >2% body-mass loss without overdrinking (hyponatraemia risk), Sawka 2007, McDermott 2017 NATA |
| Sodium target | 50% of sweat sodium lost, 0-1500 mg/h; default sweat sodium 900 mg/L | Baker 2017 (sweat [Na] 200-2000 mg/L, mean ~950); McCubbin 2020 |
| Measured sweat rate | used instead of the estimate | Pre/post body-mass method |

## Caffeine

Cap is 3 mg/kg by default, adjustable to 6 mg/kg (Guest 2021 ISSN position), and never more than
400 mg in a session whatever the body weight, EFSA's 2015 safe daily intake for healthy adults. Caffeinated products are
scheduled only after 40% of the session, so the effect lands in the second half, and never past the cap.

## Timeline

- Prompts every 15 min on the bike and every 20 min running, starting at the first prompt, with nothing
  in the last 10 min.
- At each prompt Bento owes the carbs for the time up to the next prompt. It picks the carried pack that
  best matches what is owed, weighted by how well its kind suits the moment:
  - Road rides favour drinks, then gels and solids.
  - Road runs favour gels, with solids a poor fit.
  - Trail favours gels and solids, for the climbs and walking sections.
  - Solids lose weight in races and in the last 40% of a session.
  - Repeats are penalised for variety. Caffeinated and fluid-carrying packs get a small bonus.
- A bottle may only run 30 min ahead of the fluid target, and never past the session's total fluid target.
- Carbs in any 60 minutes stay within the top of the carb band (the gut ceiling). A pack bigger than the
  band on its own is taken alone in that hour.
- Carb-free drinks (electrolyte bottles) are added whenever the bottles so far leave a whole bottle of the
  fluid target uncovered. A caffeinated one follows the caffeine rules.
- The water still needed, the sodium gap (for tabs or salty food) and a spare pack are reported.

## Advisory notes

- Carb loading: 10-12 g/kg/day for 36-48 h before races of 90 min or more (Burke 2011).
- Pre-session meal: 1-4 g/kg 1-4 h before.
- Notes also cover heat pre-hydration (5-7 ml/kg), cold weather, altitude, trail technique, running gut
  tolerance, caffeine above 3 mg/kg, and how to measure sweat rate.

## Not yet modelled

Sex differences and menstrual cycle, fasted or low-carb adaptation, specific medical conditions, course
profiles (aid stations, climbs at known kilometres), product glucose:fructose content, and exercise
in very hot conditions with heat acclimatisation status. Some of these are listed in the research prompt.
