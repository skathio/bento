// The physiology rules behind a plan: carbs, fluid, sodium and caffeine per hour,
// and the advisory notes. Sources and assumptions are in docs/methodology.md.
import type { GutLevel, PackKind, PlanInput, Sport, Targets, Terrain, Workout } from "./types.ts";

/** Carbs per hour by workout type, in g/h, before sport, duration and gut limits. */
export const WORKOUT_BANDS: Record<Workout, [number, number]> = {
  z2: [30, 60],
  endurance: [60, 90],
  race: [90, 120],
};

/** Running jostles the gut, so runners absorb less than riders at the same effort. */
export const SPORT_GUT_FACTOR: Record<Sport, number> = { ride: 1, run: 0.85, "trail-run": 0.9 };

/** The most carbs per hour a gut can take, by how well it has been trained. */
export const GUT_CEILING: Record<GutLevel, number> = { low: 60, moderate: 90, high: 120 };

const SWEAT_BASE_LH: Record<Sport, number> = { ride: 0.8, run: 1.0, "trail-run": 0.9 };
const INTENSITY: Record<Workout, number> = { z2: 0.85, endurance: 1, race: 1.15 };

export const CAFFEINE_MAX_MG_KG = 6;
/** Session ceiling whatever the body weight: EFSA's safe daily intake for healthy adults. */
export const CAFFEINE_MAX_MG = 400;
export const HIGH_ALTITUDE_M = 1500;

const round = (v: number, step: number) => Number((Math.round(v / step) * step).toFixed(2));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The most carbs per hour worth taking for a session this long. */
export function durationCeiling(durationMin: number): number {
  if (durationMin < 45) return 0; // glycogen covers it; a mouth rinse is optional
  if (durationMin < 75) return 30;
  if (durationMin < 150) return 90;
  return 120;
}

/** The carb band in g/h after the sport, duration and gut ceilings. */
export function carbBand(input: Pick<PlanInput, "sport" | "workout" | "durationMin" | "gut">): [number, number] {
  const [lo, hi] = WORKOUT_BANDS[input.workout];
  const factor = SPORT_GUT_FACTOR[input.sport];
  const ceiling = Math.min(durationCeiling(input.durationMin), GUT_CEILING[input.gut]);
  const top = Math.min(round(hi * factor, 5), ceiling);
  return [Math.min(round(lo * factor, 5), top), top];
}

/** The carb target in g/h: the band's middle, raised for trail effort and altitude, kept in the band. */
export function carbTarget(input: Pick<PlanInput, "sport" | "workout" | "durationMin" | "gut" | "terrain" | "altitudeM">): number {
  const [lo, hi] = carbBand(input);
  let target = (lo + hi) / 2;
  if (input.terrain === "trail") target *= 1.05; // more effort for the same pace
  if (input.altitudeM >= HIGH_ALTITUDE_M) target *= 1.1; // more carbohydrate burned at altitude
  return clamp(round(target, 5), lo, hi);
}

/** Glucose:fructose advice: above ~60 g/h one transporter saturates, so mix sources. */
export function carbRatio(carbsPerHour: number): string | null {
  if (carbsPerHour >= 90) return "1:0.8";
  if (carbsPerHour > 60) return "2:1";
  return null;
}

/** Estimated sweat rate in L/h when none was measured. */
export function estimateSweatRate(input: Pick<PlanInput, "sport" | "workout" | "terrain" | "bodyKg" | "tempC" | "humidityPct" | "altitudeM">): number {
  let rate = SWEAT_BASE_LH[input.sport] * INTENSITY[input.workout] * (input.bodyKg / 70);
  rate *= Math.max(0.6, 1 + 0.03 * (input.tempC - 15));
  if (input.humidityPct > 60) rate *= 1 + (input.humidityPct - 60) / 200;
  if (input.terrain === "trail") rate *= 1.05;
  if (input.altitudeM >= 2000) rate += 0.1; // drier air, more breathing losses
  return clamp(round(rate, 0.05), 0.3, 2.5);
}

/** Fluid to drink in ml/h: about 70% of sweat losses, between 300 and 1000 ml/h. */
export function fluidTarget(sweatRateLh: number, durationMin: number, tempC: number): number {
  if (durationMin < 60 && tempC < 25) return 0;
  const floor = tempC < 5 ? 250 : 300;
  return clamp(round(sweatRateLh * 700, 50), floor, 1000);
}

/** Sodium in mg/h: half of what the sweat carries away, up to 1500 mg/h. */
export function sodiumTarget(sweatRateLh: number, sweatSodiumMgL: number, durationMin: number): number {
  if (durationMin < 60) return 0;
  return clamp(round(sweatRateLh * sweatSodiumMgL * 0.5, 50), 0, 1500);
}

/** Total caffeine cap for the session, in mg. */
export function caffeineCap(bodyKg: number, mgPerKg: number): number {
  if (mgPerKg <= 0) return 0;
  return Math.min(CAFFEINE_MAX_MG, Math.round(bodyKg * Math.min(mgPerKg, CAFFEINE_MAX_MG_KG)));
}

export function targets(input: PlanInput): Targets {
  const sweat = input.sweatRateLh > 0 ? input.sweatRateLh : estimateSweatRate(input);
  const carbsPerHour = carbTarget(input);
  return {
    carbsPerHour,
    carbBand: carbBand(input),
    fluidMlPerHour: fluidTarget(sweat, input.durationMin, input.tempC),
    sweatRateLh: sweat,
    sodiumMgPerHour: sodiumTarget(sweat, input.sweatSodiumMgL, input.durationMin),
    caffeineCapMg: caffeineCap(input.bodyKg, input.caffeineMgKg),
    ratio: carbRatio(carbsPerHour),
  };
}

const KIND_WEIGHT: Record<Sport, Record<Terrain, Record<PackKind, number>>> = {
  ride: { road: { drink: 1, gel: 0.9, solid: 0.8 }, trail: { gel: 1, solid: 0.8, drink: 0.8 } },
  run: { road: { gel: 1, drink: 0.8, solid: 0.3 }, trail: { gel: 1, solid: 0.8, drink: 0.7 } },
  "trail-run": { road: { gel: 1, drink: 0.8, solid: 0.5 }, trail: { gel: 1, solid: 0.9, drink: 0.7 } },
};

/**
 * How well a kind of fuel suits this moment, from 0 to 1. Trail favours solids for the walking
 * and climbing sections; solids suit the first half and easy efforts, gels and drinks the hard end.
 */
export function kindPreference(kind: PackKind, session: Pick<PlanInput, "sport" | "terrain" | "workout">, progress: number): number {
  let weight = KIND_WEIGHT[session.sport][session.terrain][kind];
  if (kind === "solid" && session.workout === "race") weight *= 0.6;
  if (kind === "solid" && progress > 0.6) weight *= 0.7;
  return weight;
}

interface Rule {
  when: (input: PlanInput, t: Targets) => boolean;
  note: (input: PlanInput, t: Targets) => string;
}

const RULES: Rule[] = [
  {
    when: (i) => i.durationMin < 45,
    note: () => "Under 45 minutes, stored glycogen covers the work. Rinse your mouth with a sports drink if you want a lift.",
  },
  {
    when: (i) => i.workout === "race" && i.durationMin >= 90 && !i.carbLoaded,
    note: (i) => `Carb-load before a race this long: ${Math.round(i.bodyKg * 10)}-${Math.round(i.bodyKg * 12)} g of carbs a day for the 36-48 h before.`,
  },
  {
    when: (i) => i.durationMin >= 60,
    note: (i) => `Pre-session meal: about ${Math.round(i.bodyKg * 1)}-${Math.round(i.bodyKg * 4)} g of carbs 1-4 h before (1 g/kg per hour of lead time).`,
  },
  {
    when: (i) => WORKOUT_BANDS[i.workout][1] * SPORT_GUT_FACTOR[i.sport] > GUT_CEILING[i.gut] && durationCeiling(i.durationMin) > GUT_CEILING[i.gut],
    note: () => "Your gut ceiling is limiting the target. Practise race fueling on long sessions to raise it over 4-6 weeks.",
  },
  {
    when: (_i, t) => t.ratio !== null,
    note: (_i, t) => `Above 60 g/h use mixed glucose and fructose products (about ${t.ratio}) so more carbs get absorbed.`,
  },
  {
    when: (i) => i.tempC >= 25 || i.humidityPct >= 70,
    note: () => "Heat and humidity raise sweat and sodium losses. Pre-hydrate with 5-7 ml/kg 2-4 h before and keep fluids cool.",
  },
  {
    when: (i) => i.tempC < 5,
    note: () => "In the cold, thirst fades but you still lose fluid. Insulate bottles, keep gels in an inner pocket, and expect solids to harden.",
  },
  {
    when: (i) => i.altitudeM >= HIGH_ALTITUDE_M,
    note: () => "At altitude you burn more carbohydrate and lose more water by breathing. The targets are raised for it.",
  },
  {
    when: (i) => i.terrain === "trail",
    note: () => "On trail, eat solids and take gels on climbs and walking sections, not on technical descents. Plan refills at aid stations or streams.",
  },
  {
    when: (i) => i.sport !== "ride",
    note: () => "Running tolerates less than riding. Take gels with a few sips of water, and test every product in training first.",
  },
  {
    when: (i) => i.caffeineMgKg > 3,
    note: () => "Above 3 mg/kg, caffeine adds little and raises the risk of gut upset, jitters and poor sleep.",
  },
  {
    when: (i) => i.sweatRateLh <= 0 && i.durationMin >= 90,
    note: () => "Sweat rate is estimated. Weigh yourself before and after a 1 h session (1 kg lost ≈ 1 L) to measure it.",
  },
];

/** The advisory notes that apply to this session. */
export function notesFor(input: PlanInput, t: Targets): string[] {
  return RULES.filter((r) => r.when(input, t)).map((r) => r.note(input, t));
}
