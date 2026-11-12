import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  blockedReason, caffeineCap, carbPlan, carbRatio, dryHeatLossW, durationBucket, estimateSweatRate, fluidPlanned, fluidTarget,
  kindPreference, notesFor, sodiumNeeded, sodiumTarget, targets,
} from "../site/src/lib/factors.ts";
import { DEFAULT_SETTINGS, toPlanInput } from "../site/src/lib/storage.ts";
import { WORKOUTS, type PlanInput } from "../site/src/lib/types.ts";

const base: PlanInput = toPlanInput(DEFAULT_SETTINGS.session, []);
const at = (patch: Partial<PlanInput>): PlanInput => ({ ...base, ...patch });

const carb = (p: Partial<PlanInput>) => carbPlan(at(p));

test("carbs follow the intensity × duration matrix (evidence review A1)", () => {
  const ride = (workout: PlanInput["workout"], durationMin: number) => carb({ sport: "ride", workout, durationMin, gut: "high" });
  assert.deepEqual(ride("endurance", 90).band, [30, 60]);
  assert.equal(ride("endurance", 90).target, 45);
  assert.equal(ride("endurance", 240).target, 70);
  assert.equal(ride("tempo", 60).target, 15);
  assert.equal(ride("tempo", 120).target, 50);
  assert.equal(ride("race", 120).target, 70);
  assert.equal(ride("z2", 180).target, 45);
  assert.equal(ride("ultra", 600).target, 60);
  for (const w of WORKOUTS) assert.deepEqual(ride(w, 30).band, [0, 0], w);
});

test("matrix buckets break at 45, 75 and 150 minutes, with 75 and 150 in the lower rows", () => {
  assert.deepEqual([44, 45, 75, 76, 150, 151].map(durationBucket), [0, 1, 1, 2, 2, 3]);
});

test("easy sessions up to 90 minutes need no carbs unless the athlete practises fueling", () => {
  assert.equal(carb({ workout: "z2", durationMin: 50 }).target, 0);
  assert.equal(carb({ workout: "z2", durationMin: 90 }).target, 0);
  assert.equal(carb({ workout: "z2", durationMin: 120 }).target, 20);
  assert.equal(carb({ workout: "z2", durationMin: 50, practise: true }).target, 25);
  assert.equal(carb({ workout: "z2", durationMin: 30, practise: true }).target, 0);
});

test("running takes 0.85 of the riding band, except ultras whose band is runners' data", () => {
  assert.equal(carb({ sport: "run", workout: "race", durationMin: 210 }).target, 65);
  assert.equal(carb({ sport: "trail-run", workout: "race", durationMin: 240 }).target, 65);
  assert.equal(carb({ sport: "trail-run", workout: "ultra", durationMin: 720 }).target, 50);
});

test("gut ceilings are 60/75/90, and 90-120 g/h needs a trained gut, an opt-in and a long race", () => {
  assert.deepEqual(carb({ workout: "race", durationMin: 240, gut: "low" }).band, [60, 60]);
  assert.deepEqual(carb({ workout: "race", durationMin: 240, gut: "moderate" }).band, [60, 75]);
  assert.equal(carb({ workout: "race", durationMin: 240, gut: "high" }).target, 90);
  assert.deepEqual(carb({ workout: "race", durationMin: 240, gut: "high", highCarb: true }).band, [90, 120]);
  assert.equal(carb({ workout: "race", durationMin: 240, gut: "moderate", highCarb: true }).target, 75);
  assert.equal(carb({ workout: "race", durationMin: 120, gut: "high", highCarb: true }).target, 70);
  assert.equal(carb({ workout: "race", durationMin: 240, gut: "low" }).limitedByGut, true);
});

test("terrain and altitude no longer raise the carb target", () => {
  assert.equal(carb({ workout: "endurance", terrain: "trail" }).target, carb({ workout: "endurance", terrain: "road" }).target);
  assert.equal(carb({ workout: "endurance", altitudeM: 3000 }).target, carb({ workout: "endurance" }).target);
});

test("glucose:fructose advice scales with the carb rate", () => {
  assert.equal(carbRatio(45), null);
  assert.equal(carbRatio(60), null);
  assert.equal(carbRatio(75), "2:1");
  assert.equal(carbRatio(90), "1:0.8");
});

test("sweat rate rises with heat, humidity, size, intensity, pace and power", () => {
  const mild = estimateSweatRate(at({ tempC: 15 }));
  assert.ok(estimateSweatRate(at({ tempC: 32 })) > mild);
  assert.ok(estimateSweatRate(at({ tempC: 15, humidityPct: 90 })) > mild);
  assert.ok(estimateSweatRate(at({ tempC: 15, bodyKg: 90 })) > mild);
  assert.ok(estimateSweatRate(at({ tempC: 15, workout: "race" })) > mild);
  assert.ok(estimateSweatRate(at({ tempC: 15, altitudeM: 2500 })) > mild);
  assert.ok(estimateSweatRate(at({ tempC: 15, powerW: 250 })) > mild);
  const run = (paceSecKm: number) => estimateSweatRate(at({ sport: "run", tempC: 18, paceSecKm }));
  assert.ok(run(300) > run(400), "faster runners sweat more");
  assert.equal(estimateSweatRate(at({ tempC: -20, bodyKg: 30, sport: "run", paceSecKm: 900 })), 0.15);
});

test("indoors, sweat depends on the fan (evidence review C3)", () => {
  const indoor = (airflow: PlanInput["airflow"]) => estimateSweatRate(at({ indoor: true, airflow, tempC: 20 }));
  assert.ok(indoor("none") > indoor("fan") && indoor("fan") > indoor("strong"));
  assert.equal(indoor("strong"), estimateSweatRate(at({ tempC: 20 })));
  assert.equal(estimateSweatRate(at({ indoor: false, airflow: "none", tempC: 20 })), estimateSweatRate(at({ tempC: 20 })));
});

test("dry heat loss falls in heat and rises in cold", () => {
  assert.deepEqual([0, 15, 20, 30, 50].map(dryHeatLossW), [400, 250, 250, 150, 0]);
});

test("fluid is about 60% of sweat, under the sport ceiling and 200 ml/h below sweat (evidence review C1)", () => {
  const f = (sweat: number, p: Partial<PlanInput>) => fluidTarget(sweat, { sport: "ride", durationMin: 120, tempC: 20, indoor: false, ...p });
  assert.equal(f(1, {}), 600);
  assert.equal(f(2.5, {}), 1000);
  assert.equal(f(2.5, { sport: "run" }), 750);
  assert.equal(f(2.5, { sport: "run", durationMin: 300 }), 600);
  assert.equal(f(0.45, {}), 250, "never above sweat minus 200 ml/h");
  assert.equal(f(0.6, { tempC: 0 }), 350);
  assert.equal(f(1, { durationMin: 60 }), 0);
  assert.ok(f(1, { durationMin: 60, indoor: true }) > 0);
  assert.ok(f(1, { durationMin: 40, tempC: 30 }) > 0);
});

test("sodium is needed for 4 h or more, or when drinking covers 70% of sweat (evidence review C5)", () => {
  assert.equal(sodiumNeeded(1, 600, 180), false);
  assert.equal(sodiumNeeded(1, 600, 240), true);
  assert.equal(sodiumNeeded(1, 700, 120), true);
  assert.equal(sodiumTarget(1, 900, true), 450);
  assert.equal(sodiumTarget(3, 2500, true), 1000);
  assert.equal(sodiumTarget(1, 900, false), 0);
});

test("fluid is planned on long or hot sessions, otherwise a guide", () => {
  assert.equal(fluidPlanned({ durationMin: 120, tempC: 18 }), false);
  assert.equal(fluidPlanned({ durationMin: 200, tempC: 18 }), true);
  assert.equal(fluidPlanned({ durationMin: 90, tempC: 28 }), true);
});

test("extreme heat blocks runs over 30 min, races and rides over 60 min", () => {
  const hot = { tempC: 35, humidityPct: 80 };
  assert.ok(blockedReason({ ...hot, sport: "run", workout: "z2", durationMin: 40 }));
  assert.ok(blockedReason({ ...hot, sport: "ride", workout: "race", durationMin: 45 }));
  assert.ok(blockedReason({ ...hot, sport: "ride", workout: "z2", durationMin: 90 }));
  assert.equal(blockedReason({ ...hot, sport: "ride", workout: "z2", durationMin: 60 }), null);
  assert.equal(blockedReason({ tempC: 35, humidityPct: 40, sport: "run", workout: "race", durationMin: 120 }), null);
  assert.ok(blockedReason({ tempC: 40, humidityPct: 20, sport: "run", workout: "race", durationMin: 120 }));
});

test("caffeine cap is per kg, never above 6 mg/kg or 400 mg", () => {
  assert.equal(caffeineCap(70, 3), 210);
  assert.equal(caffeineCap(60, 9), 360);
  assert.equal(caffeineCap(70, 9), 400);
  assert.equal(caffeineCap(150, 6), 400);
  assert.equal(caffeineCap(70, 0), 0);
});

test("targets use a measured sweat rate when given", () => {
  assert.equal(targets(at({ sweatRateLh: 1.5 })).sweatRateLh, 1.5);
  assert.equal(targets(at({ sweatRateLh: 0 })).sweatRateLh, estimateSweatRate(base));
});

test("solids suit trail and easy efforts, not road runs or race finishes", () => {
  assert.ok(kindPreference("solid", { sport: "run", terrain: "trail", workout: "endurance" }, 0.2) > kindPreference("solid", { sport: "run", terrain: "road", workout: "endurance" }, 0.2));
  assert.ok(kindPreference("solid", { sport: "ride", terrain: "road", workout: "race" }, 0.2) < kindPreference("solid", { sport: "ride", terrain: "road", workout: "z2" }, 0.2));
  assert.ok(kindPreference("solid", { sport: "ride", terrain: "road", workout: "z2" }, 0.8) < kindPreference("solid", { sport: "ride", terrain: "road", workout: "z2" }, 0.2));
  assert.equal(kindPreference("drink", { sport: "ride", terrain: "road", workout: "race" }, 0.9), 1);
});

test("notes cover the extra factors when they apply", () => {
  const notes = (p: Partial<PlanInput>) => notesFor(at(p), targets(at(p))).join(" ");
  assert.match(notes({ workout: "race", durationMin: 240 }), /Carb-load/);
  assert.doesNotMatch(notes({ workout: "race", durationMin: 240, carbLoaded: true }), /Carb-load/);
  assert.match(notes({ tempC: 32 }), /Heat/);
  assert.match(notes({ tempC: -2 }), /cold/);
  assert.match(notes({ altitudeM: 2000 }), /altitude/);
  assert.match(notes({ terrain: "trail" }), /climbs/);
  assert.match(notes({ sport: "run", durationMin: 120 }), /150-250 ml of water/);
  assert.match(notes({ caffeineMgKg: 5 }), /3 mg\/kg/);
  assert.match(notes({ durationMin: 30 }), /45 minutes/);
  assert.match(notes({ gut: "low", workout: "race" }), /gut training is limiting/);
  assert.doesNotMatch(notes({ gut: "high", workout: "endurance" }), /gut training is limiting/);
  assert.match(notes({ workout: "z2", durationMin: 60 }), /No fuel needed/);
  assert.match(notes({ durationMin: 120 }), /Drink to thirst/);
  assert.match(notes({ durationMin: 120 }), /Sodium is optional/);
  assert.match(notes({ sport: "run", durationMin: 300 }), /hyponatraemia/);
  assert.match(notes({ indoor: true, airflow: "none" }), /Without a fan/);
  assert.match(notes({ workout: "ultra", sport: "trail-run", terrain: "trail", durationMin: 600 }), /protein/);
  assert.match(notes({ sweatRateLh: 0 }), /Sweat rate is estimated/);
});
