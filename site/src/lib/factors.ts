// The physiology rules behind a plan: carbs, fluid, sodium and caffeine per hour,
// and the advisory notes. Sources and assumptions are in docs/methodology.md.
import type { Airflow, GutLevel, PackKind, PlanInput, Sport, Targets, Terrain, Workout } from "./types.ts";

type Cell = readonly [lo: number, hi: number, target: number];
const ZERO: Cell = [0, 0, 0];

/**
 * Carbs in g/h by intensity and duration (evidence review A1): under 45 min, 45-75 min,
 * 76-150 min and over 150 min. The 1-2.5 h cells follow the 2016 ACSM/AND/DC position.
 */
export const CARB_MATRIX: Record<Workout, readonly [Cell, Cell, Cell, Cell]> = {
  z2: [ZERO, ZERO, [0, 30, 20], [30, 60, 45]],
  endurance: [ZERO, ZERO, [30, 60, 45], [60, 90, 70]],
  tempo: [ZERO, [0, 30, 15], [45, 60, 50], [60, 90, 70]],
  race: [ZERO, [0, 30, 20], [60, 80, 70], [60, 90, 75]],
  ultra: [ZERO, ZERO, [30, 60, 45], [30, 70, 50]],
};

/** Duration bucket for the matrix: <45, 45-75, 76-150, >150 min (the review's scenarios put 75 and 150 in the lower rows). */
export function durationBucket(durationMin: number): 0 | 1 | 2 | 3 {
  if (durationMin < 45) return 0;
  if (durationMin <= 75) return 1;
  if (durationMin <= 150) return 2;
  return 3;
}

/** Running absorbs less than riding. Ultra bands already come from runners' data. */
export const SPORT_GUT_FACTOR: Record<Sport, number> = { ride: 1, run: 0.85, "trail-run": 0.85 };

/** The most carbs per hour a gut tolerates, by how well it has been trained (evidence review: 60/75/90). */
export const GUT_CEILING: Record<GutLevel, number> = { low: 60, moderate: 75, high: 90 };
/** Ceiling for trained guts that opt in to high-carb race fueling. */
export const HIGH_CARB_CEILING = 120;
/** Gut-training intake for sessions that need no fuel (evidence review A2). */
const PRACTISE: Cell = [20, 30, 25];

export const CAFFEINE_MAX_MG_KG = 6;
/** Session ceiling whatever the body weight: EFSA's safe daily intake for healthy adults. */
export const CAFFEINE_MAX_MG = 400;
export const HIGH_ALTITUDE_M = 1500;

const round = (v: number, step: number) => Number((Math.round(v / step) * step).toFixed(2));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type CarbInput = Pick<PlanInput, "sport" | "workout" | "durationMin" | "gut" | "highCarb" | "practise">;

/** Whether this session may use the 90-120 g/h band: trained gut, opted in, a race over 2.5 h. */
const highCarbAllowed = (i: CarbInput) => i.highCarb && i.gut === "high" && i.workout === "race" && durationBucket(i.durationMin) === 3;

/** The matrix cell for the session, before the sport factor and gut ceiling. */
function rawCell(i: CarbInput): Cell {
  const bucket = durationBucket(i.durationMin);
  if (highCarbAllowed(i)) return [90, 120, 105];
  let cell = CARB_MATRIX[i.workout][bucket];
  if (i.workout === "z2" && bucket === 2 && i.durationMin <= 90) cell = [0, 30, 0];
  if (i.gut === "high" && bucket === 3 && i.workout === "race") cell = [60, 90, 90];
  if (i.gut === "high" && bucket === 3 && i.workout === "ultra") cell = [30, 70, 60];
  if (cell[2] === 0 && i.practise && bucket > 0) cell = PRACTISE;
  return cell;
}

function ceilingFor(i: CarbInput): number {
  return highCarbAllowed(i) ? HIGH_CARB_CEILING : GUT_CEILING[i.gut];
}

/** Band and target in g/h after the sport factor and the gut ceiling. */
export function carbPlan(i: CarbInput): { band: [number, number]; target: number; limitedByGut: boolean } {
  const [lo, hi, target] = rawCell(i);
  const factor = i.workout === "ultra" ? 1 : SPORT_GUT_FACTOR[i.sport];
  const ceiling = ceilingFor(i);
  const top = Math.min(round(hi * factor, 5), ceiling);
  const bottom = Math.min(round(lo * factor, 5), top);
  return { band: [bottom, top], target: clamp(round(target * factor, 5), bottom, top), limitedByGut: round(hi * factor, 5) > ceiling };
}

export const carbBand = (i: CarbInput): [number, number] => carbPlan(i).band;
export const carbTarget = (i: CarbInput): number => carbPlan(i).target;

/** Glucose:fructose advice: above ~60 g/h one transporter saturates, so mix sources. Advisory only. */
export function carbRatio(carbsPerHour: number): string | null {
  if (carbsPerHour >= 90) return "1:0.8";
  if (carbsPerHour > 60) return "2:1";
  return null;
}

/** Typical riding power by intensity, in W/kg, when the rider gives none (evidence review C4). */
const TYPICAL_W_KG: Record<Workout, number> = { z2: 1.5, endurance: 2.0, tempo: 2.6, race: 3.0, ultra: 1.8 };
/** Ride sweat by intensity relative to endurance, at typical power. */
const RIDE_INTENSITY: Record<Workout, number> = { z2: 0.85, endurance: 1, tempo: 1.1, race: 1.15, ultra: 0.95 };
/** Typical running speed in km/h when the runner gives no pace: flat-equivalent effort. */
const TYPICAL_KMH: Record<Terrain, Record<Workout, number>> = {
  road: { z2: 9.5, endurance: 10, tempo: 12.5, race: 12, ultra: 9 },
  trail: { z2: 8, endurance: 8.5, tempo: 10, race: 10, ultra: 8.5 },
};
/** Climbing and rough ground raise the energy cost of a trail kilometre. */
const TRAIL_RUN_COST = 1.2;
/** Indoors nothing moves air over the body unless a fan does (evidence review C3). */
export const AIRFLOW_FACTOR: Record<Airflow, number> = { none: 1.3, fan: 1.1, strong: 1 };
/** Watts of heat that 1 L/h of evaporated sweat removes. */
const W_PER_L_H = 675;

/** Heat the body loses without sweating, in W: about 250 W at 15-20 °C, less in heat, more in cold. */
export function dryHeatLossW(tempC: number): number {
  if (tempC > 20) return Math.max(0, 250 - 10 * (tempC - 20));
  if (tempC < 15) return 250 + 10 * (15 - tempC);
  return 250;
}

type SweatInput = Pick<PlanInput, "sport" | "workout" | "terrain" | "indoor" | "airflow" | "bodyKg" | "tempC" | "humidityPct" | "altitudeM" | "paceSecKm" | "powerW">;

/** Running sweat from metabolic heat: about 1 kcal per kg per km (evidence review C4). */
function runSweat(i: SweatInput): number {
  const speed = i.paceSecKm > 0 ? 1000 / i.paceSecKm : TYPICAL_KMH[i.terrain][i.workout] / 3.6;
  const heatW = 4.2 * i.bodyKg * speed * (i.terrain === "trail" ? TRAIL_RUN_COST : 1);
  return (heatW - dryHeatLossW(i.tempC)) / W_PER_L_H;
}

/** Riding sweat: an empirical base scaled by intensity, mass and heat, and by power when given. */
function rideSweat(i: SweatInput): number {
  let rate = 0.8 * RIDE_INTENSITY[i.workout] * (i.bodyKg / 70);
  if (i.powerW > 0) rate *= i.powerW / (TYPICAL_W_KG[i.workout] * i.bodyKg);
  rate *= Math.max(0.6, 1 + 0.03 * (i.tempC - 15));
  if (i.terrain === "trail") rate *= 1.05;
  return rate;
}

/** Estimated sweat rate in L/h when none was measured. */
export function estimateSweatRate(i: SweatInput): number {
  let rate = i.sport === "ride" ? rideSweat(i) : runSweat(i);
  if (i.humidityPct > 60) rate *= 1 + (i.humidityPct - 60) / 200;
  if (i.indoor) rate *= AIRFLOW_FACTOR[i.airflow];
  if (i.altitudeM >= 2000) rate += 0.1; // drier air, more breathing losses
  return clamp(round(rate, 0.05), 0.15, 3.5);
}

/** Planned drinking ceilings in ml/h (evidence review C1): runners tolerate less, and long runs risk hyponatraemia. */
export function fluidCeiling(sport: Sport, durationMin: number): number {
  if (sport === "ride") return 1000;
  return durationMin > 240 ? 600 : 750;
}

type FluidInput = Pick<PlanInput, "sport" | "durationMin" | "tempC" | "indoor">;

/** Fluid in ml/h: about 60% of sweat, under the sport's ceiling, and always 200 ml/h below sweat losses. */
export function fluidTarget(sweatRateLh: number, i: FluidInput): number {
  if (i.durationMin <= 60 && i.tempC < 25 && !i.indoor) return 0;
  const floor = i.tempC < 5 ? 250 : 300;
  const planned = Math.max(round(sweatRateLh * 600, 50), floor);
  const belowSweat = round(sweatRateLh * 1000 - 200, 50);
  return Math.max(0, Math.min(planned, fluidCeiling(i.sport, i.durationMin), belowSweat));
}

/** Plan fluid as a rate on long or hot sessions; otherwise it is a guide and thirst leads (evidence review C2). */
export const fluidPlanned = (i: Pick<PlanInput, "durationMin" | "tempC">) => i.durationMin > 180 || i.tempC >= 25;

/** Sodium matters on sessions of 4 h or more, or when drinking replaces 70% or more of sweat (evidence review C5). */
export function sodiumNeeded(sweatRateLh: number, fluidMlPerHour: number, durationMin: number): boolean {
  return durationMin >= 240 || (sweatRateLh > 0 && fluidMlPerHour >= 0.7 * sweatRateLh * 1000);
}

/** Sodium in mg/h when needed: half of what the sweat carries away, up to 1000 mg/h. */
export function sodiumTarget(sweatRateLh: number, sweatSodiumMgL: number, needed: boolean): number {
  if (!needed) return 0;
  return clamp(round(sweatRateLh * sweatSodiumMgL * 0.5, 50), 0, 1000);
}

/** Total caffeine cap for the session, in mg. */
export function caffeineCap(bodyKg: number, mgPerKg: number): number {
  if (mgPerKg <= 0) return 0;
  return Math.min(CAFFEINE_MAX_MG, Math.round(bodyKg * Math.min(mgPerKg, CAFFEINE_MAX_MG_KG)));
}

/** Beyond what validated sweat models cover, where heat illness becomes the main risk. */
export const extremeHeat = (i: Pick<PlanInput, "tempC" | "humidityPct">) => (i.tempC >= 35 && i.humidityPct >= 60) || i.tempC >= 40;

/**
 * Why the session should not be planned at all, or null. In extreme heat Bento warns instead of
 * planning any run over 30 min, any race, and any ride over 60 min (evidence review scenario 14).
 */
export function blockedReason(i: Pick<PlanInput, "tempC" | "humidityPct" | "sport" | "workout" | "durationMin">): string | null {
  if (!extremeHeat(i)) return null;
  const risky = (i.sport !== "ride" && i.durationMin > 30) || i.workout === "race" || (i.sport === "ride" && i.durationMin > 60);
  if (!risky) return null;
  return `At ${i.tempC} °C and ${i.humidityPct}% humidity, heat illness is the main risk and fueling estimates stop being reliable. Move indoors with fans, shorten the session or lower the intensity.`;
}

export function targets(input: PlanInput): Targets {
  const sweat = input.sweatRateLh > 0 ? input.sweatRateLh : estimateSweatRate(input);
  const carbs = carbPlan(input);
  const fluid = fluidTarget(sweat, input);
  const needed = sodiumNeeded(sweat, fluid, input.durationMin);
  return {
    carbsPerHour: carbs.target,
    carbBand: carbs.band,
    fluidMlPerHour: fluid,
    sweatRateLh: sweat,
    sodiumMgPerHour: sodiumTarget(sweat, input.sweatSodiumMgL, needed),
    caffeineCapMg: caffeineCap(input.bodyKg, input.caffeineMgKg),
    ratio: carbRatio(carbs.target),
    fluidPlanned: fluidPlanned(input),
    sodiumNeeded: needed,
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
    when: (i, t) => i.durationMin >= 45 && t.carbsPerHour === 0 && !i.practise,
    note: () => "No fuel needed for an easy session this short. Tick \"Practise fueling\" under More options to train your gut, or after a fasted start or a second session that day.",
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
    when: (i) => carbPlan(i).limitedByGut,
    note: () => "Your gut training is limiting the target. Practise race fueling on long sessions to raise it over 2-6 weeks.",
  },
  {
    when: (_i, t) => t.ratio !== null,
    note: (_i, t) => `Above 60 g/h, products with mixed glucose and fructose (about ${t.ratio}) are absorbed better.`,
  },
  {
    when: (_i, t) => t.fluidMlPerHour > 0 && !t.fluidPlanned,
    note: (_i, t) => `Drink to thirst. About ${t.fluidMlPerHour} ml/h is a guide, not a target.`,
  },
  {
    when: (i, t) => i.durationMin >= 60 && !t.sodiumNeeded,
    note: () => "Sodium is optional for this session: up to 500 mg/h to taste, for example in a drink mix.",
  },
  {
    when: (i) => i.sport !== "ride" && i.durationMin > 240,
    note: () => "On runs over 4 h, drinking more than you sweat is the main cause of low blood sodium (hyponatraemia). Drink to thirst, stay within the plan, and you should not gain weight during the run.",
  },
  {
    when: (i) => extremeHeat(i),
    note: () => "Extreme heat: sweat estimates are least reliable here. Watch for dizziness, chills or confusion, and stop if they appear.",
  },
  {
    when: (i) => !extremeHeat(i) && (i.tempC >= 25 || i.humidityPct >= 70),
    note: () => "Heat and humidity raise sweat and sodium losses. Pre-hydrate with 5-7 ml/kg 2-4 h before and keep fluids cool.",
  },
  {
    when: (i) => i.tempC < 5,
    note: () => "In the cold, thirst fades but you still lose fluid. Insulate bottles, keep gels in an inner pocket, and expect solids to harden.",
  },
  {
    when: (i) => i.indoor && i.airflow === "none",
    note: () => "Without a fan you sweat about a third more indoors. A fan cuts sweat losses and makes the session easier.",
  },
  {
    when: (i) => i.altitudeM >= 2000,
    note: () => "At altitude you lose more water by breathing; the fluid estimate allows for it.",
  },
  {
    when: (i) => i.workout === "ultra",
    note: () => "In ultras, mix real food with sports products and add 5-10 g of protein an hour. Intake tends to drop late on; keep offering yourself food.",
  },
  {
    when: (i) => i.terrain === "trail",
    note: () => "On trail, eat solids and take gels on climbs and walking sections, not on technical descents.",
  },
  {
    when: (i, t) => i.sport !== "ride" && t.carbsPerHour > 0,
    note: () => "Running tolerates less than riding. Take each gel with 150-250 ml of water, and test every product in training first.",
  },
  {
    when: (i) => i.caffeineMgKg > 3,
    note: () => "Above 3 mg/kg, caffeine adds little and raises the risk of gut upset, jitters and poor sleep.",
  },
  {
    when: (i) => i.caffeineMgKg > 0 && i.durationMin <= 90,
    note: () => "For a session this short, take caffeine 45-60 min before the start rather than during it.",
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
