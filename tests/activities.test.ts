import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ACTIVITIES, DEFAULT_DISCIPLINE, DISCIPLINE_IDS, DISCIPLINES, disciplinesOf, EFFORTS, effortsFor, keepEffort, modelOf,
} from "../site/src/lib/activities.ts";
import { parseSession, toPlanInput } from "../site/src/lib/storage.ts";

test("bike and run each branch into their own disciplines", () => {
  assert.deepEqual(disciplinesOf("bike"), ["bike-road", "bike-gravel", "bike-mtb", "bike-indoor"]);
  assert.deepEqual(disciplinesOf("run"), ["run-road", "run-trail", "run-treadmill"]);
  for (const a of ACTIVITIES) assert.equal(DISCIPLINES[DEFAULT_DISCIPLINE[a]].activity, a);
});

test("workouts offered follow the sport and discipline", () => {
  const labels = (d: Parameters<typeof effortsFor>[0]) => effortsFor(d).map((e) => EFFORTS[e].label);
  assert.deepEqual(labels("bike-road"), ["Easy", "Steady", "Tempo / intervals", "Race"]);
  assert.deepEqual(labels("run-road"), ["Easy", "Steady", "Tempo / intervals", "Race"]);
  assert.ok(labels("run-trail").includes("Ultra"));
  assert.ok(!labels("run-road").includes("Ultra"));
  assert.ok(!labels("bike-indoor").includes("Race"));
  for (const d of disciplinesOf("run")) assert.ok(effortsFor(d).every((e) => e.startsWith("run-")), d);
  for (const d of disciplinesOf("bike")) assert.ok(effortsFor(d).every((e) => e.startsWith("bike-")), d);
});

test("switching discipline keeps the workout, or one at the same intensity", () => {
  assert.equal(keepEffort("run-race", "run-trail"), "run-race");
  assert.equal(keepEffort("run-ultra", "run-road"), "run-steady");
  assert.equal(keepEffort("bike-race", "bike-indoor"), "bike-intervals");
  assert.equal(keepEffort("bike-steady", "run-road"), "run-steady");
});

test("each pick maps onto the planner's sport, terrain and intensity", () => {
  assert.deepEqual(modelOf("run-trail", "run-ultra"), { sport: "trail-run", terrain: "trail", indoor: false, workout: "ultra" });
  assert.deepEqual(modelOf("bike-gravel", "bike-race"), { sport: "ride", terrain: "trail", indoor: false, workout: "race" });
  assert.deepEqual(modelOf("run-treadmill", "run-easy"), { sport: "run", terrain: "road", indoor: true, workout: "z2" });
  assert.equal(modelOf("bike-indoor", "bike-intervals").workout, "tempo");
  const input = toPlanInput(parseSession({ discipline: "bike-mtb", effort: "bike-z2" }), []);
  assert.equal(input.sport, "ride");
  assert.equal(input.terrain, "trail");
  assert.equal(input.workout, "z2");
  assert.ok(!("discipline" in input));
});

test("workouts describe effort, never session length, and each has a hint", () => {
  for (const e of Object.values(EFFORTS)) {
    assert.doesNotMatch(e.label, /long|fondo|endurance/i, e.label);
    assert.ok(e.hint.length > 10, e.label);
  }
  const intensities = (d: Parameters<typeof effortsFor>[0]) => effortsFor(d).map((e) => EFFORTS[e].workout);
  for (const d of DISCIPLINE_IDS) assert.equal(new Set(intensities(d)).size, intensities(d).length, `${d} offers two workouts at one intensity`);
});
