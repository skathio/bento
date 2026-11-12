// Every optional input the form shows must be able to change the plan, and every input it hides
// must not, across a grid of sessions. This is what keeps "More options" honest.
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DISCIPLINE_IDS, effortsFor } from "../site/src/lib/activities.ts";
import { relevantOptions, type Relevant } from "../site/src/lib/options.ts";
import { buildPlan } from "../site/src/lib/plan.ts";
import { PRESETS } from "../site/src/lib/products.ts";
import { DEFAULT_SETTINGS, toPlanInput, type Session } from "../site/src/lib/storage.ts";
import type { FuelPack } from "../site/src/lib/types.ts";

const packsOf = (...ids: string[]) => PRESETS.filter((p) => ids.includes(p.id));
const PACK_SETS = [packsOf("gel-40", "bar", "drink-40"), packsOf("gel-40", "gel-caf")];

/** The values each option is tried at; the option "matters" if any of them changes the plan. */
const TRIES: Record<keyof Relevant, (s: Session) => Partial<Session>[]> = {
  gut: () => [{ gut: "low" }, { gut: "moderate" }, { gut: "high" }],
  // Power or pace matter through sweat, or through a threshold the athlete adds next to them.
  paceOrPower: () => [
    { paceSecKm: 0, powerW: 0 },
    { paceSecKm: 270, powerW: 300, ftpW: 250, thresholdPaceSecKm: 270 },
    { paceSecKm: 480, powerW: 100, ftpW: 250, thresholdPaceSecKm: 270 },
  ],
  threshold: () => [{ ftpW: 0, thresholdPaceSecKm: 0 }, { ftpW: 150, thresholdPaceSecKm: 200 }, { ftpW: 400, thresholdPaceSecKm: 600 }],
  highCarb: () => [{ highCarb: false }, { highCarb: true }],
  practise: () => [{ practise: false }, { practise: true }],
  sweatSodium: () => [{ sweatSodiumMgL: 400 }, { sweatSodiumMgL: 1500 }],
  caffeine: () => [{ caffeineMgKg: 0 }, { caffeineMgKg: 3 }, { caffeineMgKg: 6 }],
  airflow: () => [{ airflow: "none" }, { airflow: "strong" }],
  refill: () => [{ refillEveryMin: 0 }, { refillEveryMin: 30 }, { refillEveryMin: 60 }],
};

function matters(s: Session, packs: FuelPack[], key: keyof Relevant): boolean {
  const plans = TRIES[key](s).map((patch) => JSON.stringify(buildPlan(toPlanInput({ ...s, ...patch }, packs))));
  return new Set(plans).size > 1;
}

interface Case {
  session: Session;
  packs: FuelPack[];
}

/** Every type and workout, at a range of durations, with and without a trained gut or a measured sweat rate. */
const CASES: Case[] = DISCIPLINE_IDS.flatMap((discipline) =>
  effortsFor(discipline).flatMap((effort) =>
    [30, 60, 90, 150, 240, 480].flatMap((durationMin) =>
      ([{ gut: "moderate" }, { gut: "high" }, { sweatRateLh: 1.2 }, { powerW: 200, paceSecKm: 330 }] as Partial<Session>[]).flatMap((extra) =>
        PACK_SETS.map((packs) => ({ session: { ...DEFAULT_SETTINGS.session, discipline, effort, durationMin, ...extra }, packs })),
      ),
    ),
  ),
);

test("each optional input is shown exactly when it can change the plan", () => {
  const keys = Object.keys(TRIES) as (keyof Relevant)[];
  for (const { session, packs } of CASES) {
    const shown = relevantOptions(toPlanInput(session, packs), packs);
    for (const key of keys) {
      const where = `${key} on ${session.discipline}/${session.effort} ${session.durationMin} min`;
      assert.equal(matters(session, packs, key), shown[key], `${where}: shown ${shown[key]}`);
    }
  }
  assert.ok(CASES.length * keys.length > 1000);
});
