import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  caffeineCap, carbBand, carbRatio, carbTarget, durationCeiling, estimateSweatRate, fluidTarget, kindPreference, notesFor,
  sodiumTarget, targets,
} from "../site/src/lib/factors.ts";
import { DEFAULT_SETTINGS, toPlanInput } from "../site/src/lib/storage.ts";
import type { PlanInput } from "../site/src/lib/types.ts";

const base: PlanInput = toPlanInput(DEFAULT_SETTINGS.session, []);
const at = (patch: Partial<PlanInput>): PlanInput => ({ ...base, ...patch });

test("carb bands follow the workout type", () => {
  const long = { sport: "ride", durationMin: 240, gut: "high" } as const;
  assert.deepEqual(carbBand({ ...long, workout: "z2" }), [30, 60]);
  assert.deepEqual(carbBand({ ...long, workout: "endurance" }), [60, 90]);
  assert.deepEqual(carbBand({ ...long, workout: "race" }), [90, 120]);
});

test("running tolerates fewer carbs than riding at the same workout", () => {
  const race = { workout: "race", durationMin: 240, gut: "high" } as const;
  const ride = carbBand({ ...race, sport: "ride" });
  const run = carbBand({ ...race, sport: "run" });
  const trail = carbBand({ ...race, sport: "trail-run" });
  assert.ok(run[1] < ride[1]);
  assert.ok(trail[1] < ride[1] && trail[1] > run[1]);
});

test("short sessions and untrained guts cap the carbs", () => {
  assert.equal(durationCeiling(30), 0);
  assert.equal(durationCeiling(60), 30);
  assert.equal(durationCeiling(120), 90);
  assert.equal(durationCeiling(200), 120);
  assert.deepEqual(carbBand({ sport: "ride", workout: "race", durationMin: 30, gut: "high" }), [0, 0]);
  assert.deepEqual(carbBand({ sport: "ride", workout: "race", durationMin: 240, gut: "low" }), [60, 60]);
});

test("trail terrain and altitude raise the carb target within the band", () => {
  const road = carbTarget(at({ workout: "endurance", terrain: "road" }));
  const trail = carbTarget(at({ workout: "endurance", terrain: "trail" }));
  const high = carbTarget(at({ workout: "endurance", altitudeM: 2500 }));
  assert.equal(road, 75);
  assert.ok(trail > road);
  assert.ok(high > road);
  assert.ok(carbTarget(at({ workout: "race", gut: "high", altitudeM: 3000, terrain: "trail" })) <= 120);
});

test("glucose:fructose advice scales with the carb rate", () => {
  assert.equal(carbRatio(45), null);
  assert.equal(carbRatio(60), null);
  assert.equal(carbRatio(75), "2:1");
  assert.equal(carbRatio(90), "1:0.8");
});

test("sweat rate rises with heat, humidity, size, intensity and trail", () => {
  const mild = estimateSweatRate(at({ tempC: 15 }));
  assert.ok(estimateSweatRate(at({ tempC: 32 })) > mild);
  assert.ok(estimateSweatRate(at({ tempC: 15, humidityPct: 90 })) > mild);
  assert.ok(estimateSweatRate(at({ tempC: 15, bodyKg: 90 })) > mild);
  assert.ok(estimateSweatRate(at({ tempC: 15, workout: "race" })) > mild);
  assert.ok(estimateSweatRate(at({ tempC: 15, terrain: "trail" })) > mild);
  assert.ok(estimateSweatRate(at({ tempC: 15, altitudeM: 2500 })) > mild);
  assert.equal(estimateSweatRate(at({ tempC: -20, bodyKg: 30 })), 0.3);
});

test("fluid replaces about 70% of sweat within safe bounds", () => {
  assert.equal(fluidTarget(1, 120, 20), 700);
  assert.equal(fluidTarget(2.5, 120, 30), 1000);
  assert.equal(fluidTarget(0.3, 120, 20), 300);
  assert.equal(fluidTarget(0.3, 120, 0), 250);
  assert.equal(fluidTarget(1, 40, 20), 0);
  assert.ok(fluidTarget(1, 40, 30) > 0);
});

test("sodium is half of sweat losses, capped", () => {
  assert.equal(sodiumTarget(1, 900, 120), 450);
  assert.equal(sodiumTarget(2.5, 2500, 120), 1500);
  assert.equal(sodiumTarget(1, 900, 45), 0);
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
  assert.match(notes({ sport: "run" }), /Running tolerates/);
  assert.match(notes({ caffeineMgKg: 5 }), /3 mg\/kg/);
  assert.match(notes({ durationMin: 30 }), /45 minutes/);
  assert.match(notes({ gut: "low", workout: "race" }), /gut ceiling/);
  assert.doesNotMatch(notes({ gut: "moderate", workout: "endurance" }), /gut ceiling/);
  assert.match(notes({ sweatRateLh: 0 }), /Sweat rate is estimated/);
});
