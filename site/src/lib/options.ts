// Which optional inputs can change this session's plan. The form shows an option only when it
// does, so every visible field matters; tests/options.test.ts checks that each option shown
// changes the plan and each option hidden does not.
import { carbPlan, intensityChangesCarbs, targets } from "./factors.ts";
import { buildPlan } from "./plan.ts";
import type { FuelPack, PlanInput } from "./types.ts";

/** Below this altitude the rules ignore it, so the form asks a yes/no question instead of metres. */
export const ALTITUDE_FROM_M = 2000;

export interface Relevant {
  /** Gut training: only where the gut ceiling can bind, so not on sessions that need no carbs. */
  gut: boolean;
  /** Pace or power: they feed the sweat estimate and, with a threshold, the carb intensity. */
  paceOrPower: boolean;
  /** FTP or threshold pace: only with power or pace entered, and where intensity changes the carbs. */
  threshold: boolean;
  /** The 90-120 g/h opt-in: a trained gut in a race over 2.5 h. */
  highCarb: boolean;
  /** Practise fueling: only where the plan would otherwise give less than the practice dose. */
  practise: boolean;
  /** Sweat sodium: only when the session needs sodium. */
  sweatSodium: boolean;
  /** Caffeine cap: only with a caffeinated pack carried. */
  caffeine: boolean;
  /** Fan setting: only indoors. */
  airflow: boolean;
  /** Refill points: outdoors, when there is something to carry. */
  refill: boolean;
}

function hasSomethingToCarry(input: PlanInput): boolean {
  const plan = buildPlan({ ...input, refillEveryMin: 0 });
  return plan.events.length > 0 || plan.totals.waterMl > 0;
}

export function relevantOptions(input: PlanInput, packs: FuelPack[]): Relevant {
  const withoutPractice = carbPlan({ ...input, practise: false }).target;
  const withPractice = carbPlan({ ...input, practise: true }).target;
  const gutTargets = new Set((["low", "moderate", "high"] as const).map((gut) => JSON.stringify(carbPlan({ ...input, gut }))));
  const intensityMatters = intensityChangesCarbs(input);
  const effortGiven = input.sport === "ride" ? input.powerW > 0 : input.paceSecKm > 0;
  return {
    gut: gutTargets.size > 1,
    paceOrPower: input.sweatRateLh <= 0 || intensityMatters,
    threshold: effortGiven && intensityMatters,
    highCarb: input.gut === "high" && input.workout === "race" && input.durationMin > 150,
    practise: withPractice !== withoutPractice,
    sweatSodium: targets({ ...input, sweatSodiumMgL: 900 }).sodiumNeeded,
    caffeine: packs.some((p) => p.caffeineMg > 0),
    airflow: input.indoor,
    refill: !input.indoor && hasSomethingToCarry(input),
  };
}
