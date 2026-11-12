# Methodology

How Bento turns a session into targets, and where each rule comes from. The rules live in
[`site/src/lib/factors.ts`](../site/src/lib/factors.ts) (targets and notes) and
[`site/src/lib/plan.ts`](../site/src/lib/plan.ts) (the timeline). The values follow the
[evidence review of November 2026](evidence-review-2026-11.md); section numbers below (A1, C4 …)
point into it. Its grades: **H** position stands, systematic reviews or meta-analyses; **M** several
trials or one strong trial plus consensus; **L** small or single studies; **PC** practitioner
consensus or the review's own synthesis. PC values are starting points to calibrate against measured
data, not settled evidence.

Bento gives general guidance. It is not medical advice.

## What the athlete picks

The form branches Bike or Run, then a type, then a workout offered for that type
([`site/src/lib/activities.ts`](../site/src/lib/activities.ts)). Each pick maps onto the inputs the
rules use: sport, terrain, indoor or outdoor, and intensity (z2, endurance, tempo, race, ultra).
Everything beyond duration and temperature is optional and sits under "More options".

| Pick | Sport | Terrain | Indoor | Basis |
| --- | --- | --- | --- | --- |
| Bike: road | cycling | road | no | |
| Bike: gravel, MTB | cycling | trail | no | Rougher ground; gels and solids are easier to take than a bottle |
| Bike: indoor | cycling | road | yes | No cooling from moving through the air (C3) |
| Run: road | running | road | no | |
| Run: treadmill | running | road | yes | As indoor cycling |
| Run: trail | trail running | trail | no | |

| Workout | Intensity | Offered for | Basis |
| --- | --- | --- | --- |
| Zone 2 (bike), Easy (run) | z2 | all types | A2 |
| Endurance (bike), Long run, Gran fondo | endurance | all types; gran fondo road and gravel | A3: the endurance band is defensible for fondos and long runs |
| Tempo / intervals | tempo | all types | A3: its own band, lower than endurance for short sessions |
| Ultra | ultra | trail run | A4: its own band |
| Race | race | outdoor types | Racing is not offered indoors or on a treadmill |

Switching type keeps the workout if it is offered, else the first one at the nearest intensity.

## Carbohydrate

Carbs per hour come from an intensity × duration matrix (A1), then the sport factor, then the gut
ceiling. Cells are range / target in g/h.

| Duration | z2 / easy | endurance | tempo | race | ultra |
| --- | --- | --- | --- | --- | --- |
| under 45 min | 0 | 0 | 0 | 0 | 0 |
| 45-75 min | 0 | 0 | 0-30 / 15 | 0-30 / 20 | 0 |
| 76-150 min | 0-30 / 0 up to 90 min, else 20 | 30-60 / 45 | 45-60 / 50 | 60-80 / 70 | 30-60 / 45 |
| over 150 min | 30-60 / 45 | 60-90 / 70 | 60-90 / 70 | 60-90 / 75 | 30-70 / 50 |

| Rule | Value in Bento | Grade | Basis |
| --- | --- | --- | --- |
| Matrix, 1-2.5 h cells | as above | M-H | Thomas, Erdman & Burke 2016 ACSM/AND/DC position; Jeukendrup 2014 (guidelines are for well-trained athletes); Stellingwerff & Cox 2014 |
| Matrix, intensity split | as above | PC | Review synthesis (A1) |
| 75 and 150 min | fall in the lower rows | PC | The review's reference scenarios 5 and 9 |
| Easy sessions | no carbs up to 90 min; 20-30 g/h (target 25) with "Practise fueling" | M / L-M | A2; Costa et al. 2017 gut training |
| Sport factor | running and trail running ×0.85; cycling ×1; not applied to ultras | PC | A1, review table; the ultra band is runners' data (Tiller 2019) |
| Gut ceiling | new 60, some 75, trained 90 g/h | M | Costa 2017, Podlogar 2022, Wilson 2025 |
| Trained gut, long race | target 90 (60-90) | PC | A1 table |
| Trained ultra | target 60 | PC | A4 |
| 90-120 g/h | only with a trained gut, the opt-in, and a race over 150 min | M | No trial shows a gain above 90 g/h (Podlogar & Wallis 2022; Wilson 2025) |
| Trail and altitude bonus | removed | L/PC | No evidence found for either |
| Glucose:fructose | advice only: 2:1 above 60 g/h, about 1:0.8 at 90 g/h+ | M | Podlogar 2022; Hearris 2022 |
| Body mass | not used: carbs are absolute g/h | M/PC | Uptake is limited by intestinal transport (A5) |

## Delivery

| Rule | Value in Bento | Grade | Basis |
| --- | --- | --- | --- |
| Prompts | every 15 min on the bike, 20 min running; nothing in the last 10 min | L/PC | B1; Costa 2017 (30 g every 20 min) |
| When to take something | when the carbs owed by the next prompt exceed half the smallest serving | PC | B1: schedule against the cumulative target |
| Rolling hour | carbs in any 60 min at most target + one dose (40 g bike, 30 g run) | PC | B1; replaces the band-top cap, which turned a 65 g/h target into 40 g/h |
| Half gels | runners may take half of a gel over 30 g; the packing list rounds up | PC | B1, B3 |
| Water with gels | 150-250 ml with each gel, counted in the fluid plan | PC | B3; Tiller 2019 |
| Tolerance | delivered within max(±10 g/h, ±15%) of target | M | B2; Smith et al. 2013 dose-response |
| Bottles | may run 30 min ahead of the fluid target, never past the session total | PC | |
| Carb-free bottles | added when bottles so far leave a whole bottle of the fluid target uncovered | PC | |
| Refills | with "Refill every", carry the most any stretch uses; restock at each refill | PC | E: aid-station segments |

## Fluid and sodium

| Rule | Value in Bento | Grade | Basis |
| --- | --- | --- | --- |
| Sweat, running | (4.2 × mass × speed × 1.2 on trail − dry heat loss) ÷ 675 W per L/h; speed from pace, else typical for the workout | M/PC | C4; Gonzalez 2009, Jay 2024 a/b. 1.2 trail cost and typical speeds are PC |
| Typical running speed | road z2 9.5, endurance 10, tempo 12.5, race 12 km/h; trail 8 / 8.5 / 10 / 10, ultra 8.5 | PC | Matches the review's scenarios 9, 10, 12, 13 |
| Dry heat loss | 250 W at 15-20 °C, −10 W per °C above 20, +10 W per °C below 15 | PC | C4 (below 15 °C is Bento's extension) |
| Sweat, cycling | 0.8 L/h × intensity (z2 0.85, endurance 1, tempo 1.1, race 1.15, ultra 0.95) × mass/70 × heat (+3%/°C above 15 °C, floor 60%) × 1.05 off-road; × power ÷ typical power (z2 1.5, endurance 2.0, tempo 2.6, race 3.0 W/kg) when power is given | PC | The review's C4 formula cannot reproduce its own cycling scenarios at these W/kg, so cycling keeps the empirical model, which does (scenarios 2-7) |
| Humidity | up to +20% above 60% RH | PC | Unverified (C4) |
| Indoor airflow | no fan ×1.3, fan ×1.1 (default), strong fan ×1.0 | L | C3; fan-cooling RCT (Res Q Exerc Sport, doi:10.1080/02701367.2021.1946467) |
| Altitude | +0.1 L/h at 2000 m+ | PC | Respiratory water loss |
| Clamp | 0.15-3.5 L/h | M | SDA range (C4) |
| Measured sweat rate | replaces the estimate | | Pre/post body-mass method |
| Fluid target | 60% of sweat; at least 300 ml/h (250 below 5 °C); never above sweat − 200 ml/h | M | C1; Sawka 2007; Hew-Butler 2015 |
| Fluid ceiling | cycling 1000 ml/h; running 750, or 600 over 4 h | M | C1; Almond 2005 (hyponatraemia in slower runners) |
| No planned fluid | sessions up to 60 min below 25 °C outdoors | | |
| Planned or guide | planned over 3 h or at 25 °C+; otherwise a guide, drink to thirst | M | C2; McCubbin 2020 |
| Sodium needed | 4 h or more, or fluid at least 70% of sweat | M | C5; McCubbin 2025 |
| Sodium target | 50% of sweat sodium lost, up to 1000 mg/h; default sweat sodium 900 mg/L | M | C5; Barnes 2019 normative mean ≈830 mg/L |
| Sodium not needed | optional, up to 500 mg/h to taste | M | C5 |

## Caffeine

| Rule | Value in Bento | Grade | Basis |
| --- | --- | --- | --- |
| Cap | 3 mg/kg default, at most 6 mg/kg and 400 mg | M | Guest 2021 ISSN position; 400 mg is EFSA's safe daily intake |
| Up to 90 min | the whole dose before or at the start (first prompt only) | M | D |
| Over 90 min | up to half the cap early, the rest from 30% of the way | M | D; Talanian & Spriet 2016 |
| End | none in the last 30 min | PC | D |

## Extreme heat

At 35 °C or more with 60% humidity or more, or at 40 °C or more, validated sweat models no longer
apply. Bento shows a warning instead of a plan for runs over 30 min, any race, and rides over 60 min
(scenario 14). Shorter easy rides are still planned, with a heat warning.

## Advisory notes

- Carb loading: 10-12 g/kg/day for 36-48 h before races of 90 min or more (Burke 2011).
- Pre-session meal: 1-4 g/kg 1-4 h before.
- Hyponatraemia warning on runs over 4 h (Almond 2005).
- Ultras: mix real food with sports products, and 5-10 g of protein an hour (Tiller 2019).
- Notes also cover heat pre-hydration (5-7 ml/kg), cold weather, altitude, trail technique, fan use
  indoors, caffeine above 3 mg/kg and timing on short sessions, and how to measure sweat rate.

## Reference scenarios

[`tests/scenarios.test.ts`](../tests/scenarios.test.ts) runs the review's 14 reference scenarios and
checks that carbs, fluid and sodium fall within its ranges.

## Not yet modelled

Sex and menstrual cycle (note only, E7), age, heat acclimatisation (E5), low-carb adaptation (E6),
course profiles with climbs at known kilometres, product glucose:fructose content, and distance-based
refill points.
