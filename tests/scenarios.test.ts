// Reference scenarios from the evidence review (docs/evidence-review-2026-11.md, section 4):
// a 70 kg recreational athlete with some gut training. Each value must fall in the report's
// range. Ranges are the report's synthesis built on cited bands, so they test the rules as a
// whole rather than any single coefficient.
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildPlan } from "../site/src/lib/plan.ts";
import { DEFAULT_SETTINGS, toPlanInput, type Session } from "../site/src/lib/storage.ts";

type Range = readonly [number, number];
interface Scenario {
  name: string;
  session: Partial<Session>;
  carbs: Range;
  fluid: Range;
  sodium: Range;
}

/** name, session, then carbs, fluid and sodium ranges. */
const S = (name: string, session: Partial<Session>, [carbs, fluid, sodium]: [Range, Range, Range]): Scenario => ({ name, session, carbs, fluid, sodium });

const SCENARIOS: Scenario[] = [
  S("1 ride z2 50 min", { discipline: "bike-road", effort: "bike-z2", durationMin: 50, tempC: 18, humidityPct: 50 }, [[0, 15], [0, 500], [0, 0]]),
  S("2 ride z2 3 h", { discipline: "bike-road", effort: "bike-z2", durationMin: 180, tempC: 18 }, [[30, 60], [400, 700], [0, 500]]),
  S("3 ride endurance 90 min", { discipline: "bike-road", effort: "bike-steady", durationMin: 90, tempC: 18 }, [[30, 60], [300, 750], [0, 400]]),
  S("4 ride endurance 4 h hot", { discipline: "bike-road", effort: "bike-steady", durationMin: 240, tempC: 25, humidityPct: 60 }, [[60, 75], [600, 900], [300, 700]]),
  S("5a indoor tempo 75 min no fan", { discipline: "bike-indoor", effort: "bike-intervals", durationMin: 75, tempC: 22, airflow: "none" }, [[0, 45], [500, 900], [0, 500]]),
  S("5b indoor tempo 75 min fan", { discipline: "bike-indoor", effort: "bike-intervals", durationMin: 75, tempC: 22, airflow: "fan" }, [[0, 45], [400, 700], [0, 300]]),
  S("6 gran fondo 5 h (ridden steady)", { discipline: "bike-road", effort: "bike-steady", durationMin: 300, tempC: 28, humidityPct: 40 }, [[60, 75], [600, 1000], [400, 800]]),
  S("7 ride race 2 h", { discipline: "bike-road", effort: "bike-race", durationMin: 120, tempC: 20 }, [[60, 75], [500, 900], [0, 600]]),
  S("8 run easy 60 min", { discipline: "run-road", effort: "run-easy", durationMin: 60, tempC: 15 }, [[0, 20], [0, 400], [0, 0]]),
  S("9 long run 2 h 30 (steady)", { discipline: "run-road", effort: "run-steady", durationMin: 150, tempC: 12 }, [[30, 60], [300, 600], [0, 500]]),
  S("10a marathon 3:30", { discipline: "run-road", effort: "run-race", durationMin: 210, tempC: 18, paceSecKm: 299 }, [[45, 75], [400, 750], [0, 600]]),
  S("10b marathon 4:45", { discipline: "run-road", effort: "run-race", durationMin: 285, tempC: 18, paceSecKm: 405 }, [[40, 65], [300, 600], [300, 600]]),
  S("11 treadmill tempo 60 min", { discipline: "run-treadmill", effort: "run-tempo", durationMin: 60, tempC: 21 }, [[0, 30], [300, 800], [0, 0]]),
  S("12 trail race 4 h at altitude", { discipline: "run-trail", effort: "run-race", durationMin: 240, tempC: 12, altitudeM: 2400 }, [[45, 75], [400, 700], [300, 600]]),
  S("13 trail ultra 12 h", { discipline: "run-trail", effort: "run-ultra", durationMin: 720, tempC: 18, refillEveryMin: 90 }, [[30, 70], [400, 800], [300, 800]]),
];

// The review planned "long run" and "gran fondo" at endurance intensity; Bento now asks for the
// effort instead, so those scenarios use Steady. An easy 2.5 h run gets less (see factors tests).
const planFor = (session: Partial<Session>) => buildPlan(toPlanInput({ ...DEFAULT_SETTINGS.session, ...session }, []));
const inRange = (v: number, [lo, hi]: Range) => v >= lo && v <= hi;

for (const s of SCENARIOS) {
  test(`scenario ${s.name}: carbs, fluid and sodium fall in the review's ranges`, () => {
    const t = planFor(s.session).targets;
    assert.ok(inRange(t.carbsPerHour, s.carbs), `carbs ${t.carbsPerHour} g/h, want ${s.carbs.join("-")}`);
    assert.ok(inRange(t.fluidMlPerHour, s.fluid), `fluid ${t.fluidMlPerHour} ml/h, want ${s.fluid.join("-")}`);
    assert.ok(inRange(t.sodiumMgPerHour, s.sodium), `sodium ${t.sodiumMgPerHour} mg/h, want ${s.sodium.join("-")}`);
  });
}

test("scenario 1: a 50-minute zone 2 ride gets no gel", () => {
  assert.deepEqual(planFor(SCENARIOS[0]!.session).events, []);
});

test("scenario 10b: a 4:45 marathoner drinks less than a 3:30 one and is warned about hyponatraemia", () => {
  const fast = planFor(SCENARIOS[10]!.session);
  const slow = planFor(SCENARIOS[11]!.session);
  assert.ok(slow.targets.sweatRateLh < fast.targets.sweatRateLh);
  assert.ok(slow.targets.fluidMlPerHour < fast.targets.fluidMlPerHour);
  assert.ok(slow.notes.some((n) => /hyponatraemia/.test(n)));
});

test("scenario 14: in 35 °C and 80% humidity, runs, races and long rides are warned, not planned", () => {
  const hot = { tempC: 35, humidityPct: 80 };
  for (const s of [SCENARIOS[2]!, SCENARIOS[6]!, SCENARIOS[9]!, SCENARIOS[12]!]) {
    assert.ok(planFor({ ...s.session, ...hot }).blocked, s.name);
  }
  assert.equal(planFor({ ...SCENARIOS[0]!.session, ...hot }).blocked, null, "a short z2 ride is still planned");
});
