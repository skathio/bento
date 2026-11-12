import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildPlan, HALF, MAX_DOSE_G, packingList, SLOT_MIN } from "../site/src/lib/plan.ts";
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

test("long sessions take up to half the caffeine early, the rest from 30%, none in the last 30 min", () => {
  const i = input({ durationMin: 240, bodyKg: 50, caffeineMgKg: 3, packs: packs("gel-caf") });
  const plan = buildPlan(i);
  const caffeinated = plan.events.filter((e) => e.caffeineMg > 0);
  assert.ok(caffeinated.length > 0);
  const early = caffeinated.filter((e) => e.minute < 240 * 0.3).reduce((a, e) => a + e.caffeineMg, 0);
  assert.ok(early <= plan.targets.caffeineCapMg / 2, `${early} mg early`);
  assert.ok(caffeinated.every((e) => e.minute <= 210));
  assert.ok(plan.totals.caffeineMg <= plan.targets.caffeineCapMg);
  assert.equal(buildPlan({ ...i, caffeineMgKg: 0 }).totals.caffeineMg, 0);
});

test("sessions up to 90 min take caffeine only at the first prompt", () => {
  const plan = buildPlan(input({ workout: "race", durationMin: 90, caffeineMgKg: 3, packs: packs("gel-caf", "gel-22") }));
  const caffeinated = plan.events.filter((e) => e.caffeineMg > 0);
  assert.ok(caffeinated.length > 0);
  assert.ok(caffeinated.every((e) => e.minute === SLOT_MIN.ride));
});

test("road runs lean on gels; trail runs mix in solids", () => {
  const kinds = (p: Partial<PlanInput>) => new Set(buildPlan(input({ ...p, packs: packs("gel-22", "chews"), durationMin: 240 })).events.map((e) => e.kind));
  assert.deepEqual(kinds({ sport: "run", terrain: "road" }), new Set(["gel"]));
  assert.ok(kinds({ sport: "trail-run", terrain: "trail" }).has("solid"));
});

test("short sessions get no timeline", () => {
  const plan = buildPlan(input({ durationMin: 30 }));
  assert.deepEqual(plan.events, []);
  assert.deepEqual(plan.packing, []);
});

test("totals add water and the sodium gap", () => {
  const plan = buildPlan(input({ packs: packs("gel-22"), tempC: 30, durationMin: 240 }));
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

test("no 60 minutes take more than the hourly target plus one dose", () => {
  for (const [sport, gut] of [["ride", "low"], ["run", "moderate"]] as const) {
    const plan = buildPlan(input({ sport, workout: "endurance", gut, durationMin: 480, packs: packs("drink-80", "gel-40", "electrolyte") }));
    const carbs = plan.events.filter((e) => e.carbsG > 0);
    assert.ok(carbs.length > 0);
    for (const e of carbs) {
      const hour = carbs.filter((x) => x.minute > e.minute - 60 && x.minute <= e.minute).reduce((a, x) => a + x.carbsG, 0);
      assert.ok(hour <= Math.max(plan.targets.carbsPerHour + MAX_DOSE_G[sport], e.carbsG), `${sport}: ${hour} g in the hour to ${e.minute}`);
    }
  }
});

test("delivery meets the target with big packs: 40 g gels and a 65 g/h run target give 180-210 g over 3 h (evidence review B1)", () => {
  const plan = buildPlan(input({ sport: "run", terrain: "road", workout: "race", durationMin: 180, packs: packs("gel-40") }));
  assert.equal(plan.targets.carbsPerHour, 65);
  assert.ok(plan.totals.carbsG >= 180 && plan.totals.carbsG <= 210, `${plan.totals.carbsG} g`);
});

test("delivery stays within max(±10 g/h, ±15%) of the target across sports and packs (evidence review B2)", () => {
  const cases: Partial<PlanInput>[] = [
    { sport: "ride", workout: "endurance", durationMin: 180, packs: packs("gel-40") },
    { sport: "ride", workout: "race", durationMin: 240, gut: "high", packs: packs("drink-80", "gel-40") },
    { sport: "run", workout: "endurance", durationMin: 180, packs: packs("gel-40", "drink-40") },
    { sport: "trail-run", terrain: "trail", workout: "ultra", durationMin: 600, packs: packs("gel-22", "bar", "chews") },
  ];
  for (const c of cases) {
    const plan = buildPlan(input(c));
    const got = plan.totals.carbsG / ((c.durationMin as number) / 60);
    const tolerance = Math.max(10, plan.targets.carbsPerHour * 0.15);
    assert.ok(Math.abs(got - plan.targets.carbsPerHour) <= tolerance, `${c.sport} ${c.workout}: ${got.toFixed(0)} vs ${plan.targets.carbsPerHour}`);
  }
});

test("runners take half of a big gel, and the packing list rounds halves up to whole gels", () => {
  const plan = buildPlan(input({ sport: "run", workout: "endurance", durationMin: 180, packs: packs("gel-40") }));
  const halves = plan.events.filter((e) => e.packId === "gel-40" + HALF);
  assert.ok(halves.length > 0);
  assert.ok(halves.every((e) => e.carbsG === 20 && e.name.startsWith("½")));
  const servings = plan.events.reduce((a, e) => a + (e.packId.endsWith(HALF) ? 0.5 : 1), 0);
  assert.deepEqual(plan.packing.map((l) => [l.packId, l.count]), [["gel-40", Math.ceil(servings)]]);
  assert.equal(buildPlan(input({ sport: "ride", packs: packs("gel-40") })).events.some((e) => e.packId.endsWith(HALF)), false);
});

test("extreme heat replaces the plan with a warning", () => {
  const plan = buildPlan(input({ sport: "run", workout: "race", durationMin: 120, tempC: 36, humidityPct: 80 }));
  assert.ok(plan.blocked && /heat illness/.test(plan.blocked));
  assert.deepEqual(plan.events, []);
  assert.equal(buildPlan(input({ durationMin: 120 })).blocked, null);
});

test("with refill points, carry enough for the longest stretch", () => {
  const plan = buildPlan(input({ durationMin: 360, refillEveryMin: 120, packs: packs("gel-40", "drink-40") }));
  assert.ok(plan.stretches);
  assert.equal(plan.stretches.count, 3);
  for (const line of plan.stretches.carry) {
    const total = plan.packing.find((l) => l.packId === line.packId)!.count;
    assert.ok(line.count < total, `${line.packId}: carry ${line.count} of ${total}`);
  }
  assert.ok(plan.stretches.waterMl <= plan.totals.waterMl);
  assert.equal(buildPlan(input({ durationMin: 360 })).stretches, null);
  assert.equal(buildPlan(input({ durationMin: 100, refillEveryMin: 120 })).stretches, null);
});

test("a caffeinated carb-free drink follows the caffeine timing and cap", () => {
  const cola = { id: "custom-cola", name: "Zero cola", kind: "drink", carbsG: 0, sodiumMg: 20, caffeineMg: 100, fluidMl: 500, volumeMl: 500 } as const;
  const plan = buildPlan(input({ durationMin: 240, tempC: 25, caffeineMgKg: 3, packs: [...packs("gel-40"), cola] }));
  const sips = plan.events.filter((e) => e.packId === "custom-cola");
  assert.ok(sips.length > 0);
  assert.ok(sips.every((e) => e.minute <= 210));
  assert.ok(plan.totals.caffeineMg <= plan.targets.caffeineCapMg);
});

test("the coverage note appears only when the plan is really short of its target", () => {
  const short = buildPlan(input({ sport: "run", terrain: "road", workout: "race", gut: "high", durationMin: 240, packs: packs("gel-22") }));
  assert.ok(short.notes.some((n) => /These packs cover/.test(n)), "22 g gels every 20 min cannot reach 75 g/h");
  const onTarget = buildPlan(input({ workout: "z2", durationMin: 140, packs: packs("gel-40") }));
  assert.ok(!onTarget.notes.some((n) => /These packs cover/.test(n)));
});
