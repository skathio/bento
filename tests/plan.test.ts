import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildPlan, packingList, SLOT_MIN } from "../site/src/lib/plan.ts";
import { PRESETS } from "../site/src/lib/products.ts";
import { DEFAULT_SETTINGS, toPlanInput } from "../site/src/lib/storage.ts";
import type { PlanInput } from "../site/src/lib/types.ts";

const packs = (...ids: string[]) => PRESETS.filter((p) => ids.includes(p.id));
const input = (patch: Partial<PlanInput>): PlanInput => ({ ...toPlanInput(DEFAULT_SETTINGS.session, packs("gel-40", "bar", "drink-40")), ...patch });
const owed = (i: PlanInput, carbsPerHour: number) => (carbsPerHour * i.durationMin) / 60;

test("a long endurance ride meets its carb target within 15%", () => {
  const i = input({});
  const plan = buildPlan(i);
  const target = owed(i, plan.targets.carbsPerHour);
  assert.ok(Math.abs(plan.totals.carbsG - target) <= target * 0.15, `${plan.totals.carbsG} vs ${target}`);
});

test("events land on the sport's slots and stop before the finish", () => {
  for (const sport of ["ride", "run", "trail-run"] as const) {
    const i = input({ sport, durationMin: 150 });
    const minutes = buildPlan(i).events.map((e) => e.minute);
    assert.ok(minutes.length > 0, sport);
    assert.ok(minutes.every((m) => m % SLOT_MIN[sport] === 0 && m <= 140), `${sport}: ${minutes}`);
  }
});

test("race plans carry more carbs than endurance, endurance more than z2", () => {
  const carbs = (workout: PlanInput["workout"]) => buildPlan(input({ workout, gut: "high", packs: packs("gel-22", "gel-40") })).totals.carbsG;
  assert.ok(carbs("race") > carbs("endurance"));
  assert.ok(carbs("endurance") > carbs("z2"));
});

test("drinks are paced to the fluid target", () => {
  const i = input({ packs: packs("drink-80"), gut: "high", workout: "race" });
  const plan = buildPlan(i);
  let drunk = 0;
  for (const e of plan.events) {
    drunk += e.fluidMl;
    assert.ok(drunk <= (plan.targets.fluidMlPerHour * (e.minute + 30)) / 60);
  }
});

test("caffeine waits until 40% and stays under the cap", () => {
  const i = input({ durationMin: 240, bodyKg: 50, caffeineMgKg: 3, packs: packs("gel-caf") });
  const plan = buildPlan(i);
  const caffeinated = plan.events.filter((e) => e.caffeineMg > 0);
  assert.ok(caffeinated.length > 0);
  assert.ok(caffeinated.every((e) => e.minute >= 96));
  assert.ok(plan.totals.caffeineMg <= plan.targets.caffeineCapMg);
  assert.equal(buildPlan({ ...i, caffeineMgKg: 0 }).totals.caffeineMg, 0);
});

test("road runs lean on gels; trail runs mix in solids", () => {
  const kinds = (p: Partial<PlanInput>) => new Set(buildPlan(input({ ...p, packs: packs("gel-40", "chews"), durationMin: 240 })).events.map((e) => e.kind));
  assert.deepEqual(kinds({ sport: "run", terrain: "road" }), new Set(["gel"]));
  assert.ok(kinds({ sport: "trail-run", terrain: "trail" }).has("solid"));
});

test("short sessions get no timeline", () => {
  const plan = buildPlan(input({ durationMin: 30 }));
  assert.deepEqual(plan.events, []);
  assert.deepEqual(plan.packing, []);
});

test("totals add water and the sodium gap", () => {
  const plan = buildPlan(input({ packs: packs("gel-22"), tempC: 30, durationMin: 180 }));
  assert.ok(plan.totals.waterMl > 0);
  assert.ok(plan.totals.sodiumGapMg > 0);
  assert.equal(plan.totals.carryVolumeMl, plan.events.length * 35);
  assert.ok(plan.notes.some((n) => /electrolyte/.test(n)));
});

test("coverage notes flag missing or too-small packs", () => {
  assert.ok(buildPlan(input({ packs: [] })).notes.some((n) => /Add at least one/.test(n)));
  const tiny = { ...PRESETS[0]!, id: "tiny", carbsG: 5 };
  assert.ok(buildPlan(input({ packs: [tiny] })).notes.some((n) => /cover/.test(n)));
});

test("packing list groups events, most used first", () => {
  const lines = packingList([
    { minute: 15, packId: "a", name: "A", kind: "gel", carbsG: 20, sodiumMg: 0, caffeineMg: 0, fluidMl: 0 },
    { minute: 30, packId: "b", name: "B", kind: "solid", carbsG: 20, sodiumMg: 0, caffeineMg: 0, fluidMl: 0 },
    { minute: 45, packId: "b", name: "B", kind: "solid", carbsG: 20, sodiumMg: 0, caffeineMg: 0, fluidMl: 0 },
  ]);
  assert.deepEqual(lines.map((l) => [l.packId, l.count]), [["b", 2], ["a", 1]]);
});

test("electrolyte drinks are scheduled for fluid and sodium without carbs", () => {
  const plan = buildPlan(input({ packs: packs("gel-40", "electrolyte"), tempC: 30, durationMin: 180 }));
  const bottles = plan.events.filter((e) => e.packId === "electrolyte");
  assert.ok(bottles.length > 0);
  assert.ok(plan.events.some((e) => e.packId === "gel-40"));
  // Never drinks ahead of the fluid target.
  assert.ok(plan.totals.fluidMl <= (plan.targets.fluidMlPerHour * 180) / 60);
  assert.equal(plan.totals.sodiumMg, plan.events.reduce((a, e) => a + e.sodiumMg, 0));
});

test("carb drink mixes count for carbs, fluid and sodium together", () => {
  const plan = buildPlan(input({ packs: packs("drink-80"), durationMin: 180 }));
  const drinks = plan.events.filter((e) => e.packId === "drink-80");
  assert.ok(drinks.length > 0);
  assert.equal(plan.totals.fluidMl, drinks.length * 500);
  assert.equal(plan.totals.sodiumMg, drinks.length * 500);
});

test("with only carb-free packs, the plan asks for a pack with carbs", () => {
  const plan = buildPlan(input({ packs: packs("electrolyte"), durationMin: 240 }));
  assert.ok(plan.events.every((e) => e.carbsG === 0));
  assert.ok(plan.notes.some((n) => /pack with carbs/.test(n)));
});

test("carb drink mixes never go past the session's fluid target", () => {
  const plan = buildPlan(input({ sport: "ride", workout: "race", tempC: 32, durationMin: 75, packs: packs("drink-40") }));
  assert.ok(plan.totals.fluidMl <= (plan.targets.fluidMlPerHour * 75) / 60);
});

test("no 60 minutes take more carbs than the top of the band", () => {
  const plan = buildPlan(input({ sport: "ride", workout: "endurance", gut: "low", durationMin: 480, packs: packs("drink-80", "electrolyte") }));
  const carbs = plan.events.filter((e) => e.carbsG > 0);
  assert.ok(carbs.length > 0);
  for (const e of carbs) {
    const hour = carbs.filter((x) => x.minute > e.minute - 60 && x.minute <= e.minute).reduce((a, x) => a + x.carbsG, 0);
    assert.ok(hour <= Math.max(plan.targets.carbBand[1], e.carbsG), `${hour} g in the hour to ${e.minute}`);
  }
});

test("a caffeinated carb-free drink is scheduled after 40% and within the cap", () => {
  const cola = { id: "custom-cola", name: "Zero cola", kind: "drink", carbsG: 0, sodiumMg: 20, caffeineMg: 100, fluidMl: 500, volumeMl: 500 } as const;
  const plan = buildPlan(input({ durationMin: 240, tempC: 25, caffeineMgKg: 3, packs: [...packs("gel-40"), cola] }));
  const sips = plan.events.filter((e) => e.packId === "custom-cola");
  assert.ok(sips.length > 0);
  assert.ok(sips.every((e) => e.minute >= 240 * 0.4));
  assert.ok(plan.totals.caffeineMg <= plan.targets.caffeineCapMg);
});
