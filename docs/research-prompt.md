# Fable research-mode prompt

Optional. Paste the prompt below into Fable's research mode before refining Bento's rules. It asks for
a shareable, cited report that checks every number in [`methodology.md`](methodology.md) and finds the
factors Bento does not model yet.

---

You are preparing an evidence report for **Bento**, a static web app that plans carbohydrate, fluid,
sodium and caffeine intake during endurance sessions. Users choose a sport (road cycling, road running,
trail running), a workout type (zone 2, endurance, race) and terrain (road, trail). They enter duration,
body mass, temperature, humidity, altitude, sweat rate (optional), sweat sodium, gut-training level and a
caffeine cap. They also say which fuel they carry (gels, solids, drinks). Bento outputs per-hour targets
and a timed intake schedule with a packing list.

Produce a detailed report that I can share with coaches and sports dietitians. For every question:

- Give the current best estimate with a range.
- Name the strongest supporting studies, position stands and reviews (author, year, journal, DOI or URL),
  with the study population (trained or recreational, sex, n), protocol and effect size.
- Say how strong and how consistent the evidence is (high, moderate, low), and where studies disagree.
- Say what Bento should do: keep its current value, change it (to what), or warn the user.

## 1. Carbohydrate rates

1. Carbs per hour by intensity (zone 2 or low intensity, sustained endurance, race) and by duration
   (<45 min, 45-75 min, 1-2.5 h, >2.5 h, ultra >6 h). Bento uses z2 30-60, endurance 60-90 and race
   90-120 g/h, capped by duration at 0 / 30 / 90 / 120 g/h.
2. Evidence for 90-120 g/h: performance, oxidation, GI distress. Is 120 g/h justified outside elite
   athletes?
3. Glucose:fructose ratios: 2:1 against 1:0.8 against others, and the threshold rates where each matters.
4. Running against cycling: oxidation rates, GI symptom rates, and a defensible discount for running
   (Bento uses ×0.85 for road running and ×0.9 for trail running).
5. Gut training: protocols, duration, and how much tolerance improves (Bento caps untrained at 60,
   some training at 90, trained at 120 g/h).
6. Does body mass change the hourly carb need, or only fluid and caffeine?

## 2. Terrain and trail running

1. Energy cost of trail against road at the same pace or the same perceived effort, including vertical
   gain and technical descents.
2. GI tolerance and intake practice on trail: solids during climbing or walking, and gels on descents.
3. Practical limits: carrying capacity, aid station spacing, and refilling from natural sources.

## 3. Fluid

1. Sweat rate ranges by sport, intensity, body mass, temperature and humidity. Is there a validated
   predictive equation suitable for a consumer app (for example the Gonzalez 2009 or Barnes 2019 models)?
2. How much to replace: drinking to thirst against a planned rate, the 2% body-mass loss threshold, and
   hyponatraemia risk. Bento replaces 70% of estimated sweat, 300-1000 ml/h.
3. Cold weather: thirst blunting, freezing bottles, cold-induced diuresis.
4. Altitude: respiratory water loss, diuresis, and changes in fuel selection.
5. Heat acclimatisation: how it changes sweat rate and sweat sodium.

## 4. Sodium

1. Sweat sodium concentration distribution, and whether a population default (Bento uses 900 mg/L) is
   reasonable.
2. How much sodium to replace per hour and when it matters (duration, heat, heavy salty sweaters). Bento
   replaces 50%, up to 1500 mg/h.
3. Evidence on sodium and cramping, and on sodium and hyponatraemia prevention.

## 5. Caffeine

1. Effective dose range in mg/kg, timing (pre-session against mid-session), and repeated small doses.
2. Habitual intake and genotype (CYP1A2) effects, and side effects above 3 mg/kg.
3. Late-session caffeine and its impact on sleep after evening events.

## 6. Before the session

1. Carb loading: g/kg/day, duration, and the minimum event length where it pays off.
2. Pre-event meal: g/kg and timing; pre-hydration (ml/kg, sodium).

## 7. Factors Bento does not model yet

For each, say whether it should change the targets or only add a warning, and how strong the case is:
sex and menstrual cycle phase, age, body composition, training status, low-carb or fasted adaptation,
diabetes and other medical conditions, medication, heat acclimatisation, wind and solar radiation, clothing,
pacing strategy, product osmolality, protein during ultras, and anything else the literature supports.

## 8. Products

Typical carbs, sodium, caffeine, glucose:fructose content and volume for generic categories: standard gels,
high-carb hydrogel gels, chews, bars, rice cakes or real food, and drink mixes (low and high carb).

## Output format

1. An executive summary of no more than one page: what Bento gets right, what it should change, and the
   top five changes ranked by impact on athletes.
2. A table with one row per Bento rule: current value, recommended value, evidence grade and key citations.
3. A section for each of the eight topics above.
4. A full reference list.

Prefer systematic reviews, meta-analyses and position stands from ACSM, ISSN, IOC and the Academy of
Nutrition and Dietetics. Say clearly when evidence comes from small, male-only or elite-only samples.
