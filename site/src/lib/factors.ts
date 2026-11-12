// The physiology rules behind a plan: carbs, fluid, sodium and caffeine per hour,
// and the advisory notes. Sources and assumptions are in docs/methodology.md.
import type { Airflow, GutLevel, PackKind, PlanInput, Sport, Targets, Terrain, Workout } from "./types.ts";

type Cell = readonly [lo: number, hi: number, target: number];
/** A point on a carb curve: from this many minutes on, this band and target (g/h). */
type Anchor = readonly [minutes: number, lo: number, hi: number, target: number];

/**
 * Carbs in g/h by intensity, as curves over duration (evidence review A1). The anchors sit on the
 * review's matrix (none under 45 min; 1-2.5 h endurance 30-60 per ACSM 2016; up to 90 beyond
 * 2.5 h) and Bento interpolates linearly between them, so one more minute never moves the plan by
 * a whole row. The curves themselves are PC.
 */
export const CARB_CURVES: Record<Workout, readonly Anchor[]> = {
  z2: [[0, 0, 0, 0], [90, 0, 30, 0], [180, 30, 60, 45]],
  endurance: [[0, 0, 0, 0], [60, 0, 0, 0], [90, 30, 60, 45], [150, 40, 70, 55], [180, 60, 90, 70]],
  tempo: [[0, 0, 0, 0], [45, 0, 0, 0], [60, 0, 30, 10], [75, 0, 30, 25], [90, 30, 60, 45], [105, 45, 60, 50], [150, 50, 70, 55], [180, 60, 90, 70]],
  race: [[0, 0, 0, 0], [45, 0, 0, 0], [60, 0, 30, 20], [75, 0, 30, 30], [105, 60, 80, 70], [150, 60, 80, 70], [180, 60, 90, 75]],
  ultra: [[0, 0, 0, 0], [60, 0, 0, 0], [90, 30, 60, 40], [180, 30, 70, 50]],
};
/** Trained guts end higher on long races and ultras (A1, A4). */
const TRAINED_TAIL: Partial<Record<Workout, Anchor>> = { race: [180, 60, 90, 90], ultra: [180, 30, 70, 60] };
/** The opt-in 90-120 g/h band for trained guts in races over 2.5 h. */
const HIGH_CARB_TAIL: readonly Anchor[] = [[150, 60, 80, 70], [180, 90, 120, 105]];

/** The band and target on a curve at this duration, interpolated between anchors. */
export function onCurve(curve: readonly Anchor[], minutes: number): Cell {
  const first = curve[0]!;
  if (minutes < 45) return [0, 0, 0];
  let prev = first;
  for (const next of curve) {
    if (minutes <= next[0]) {
      const span = next[0] - prev[0];
      const f = span > 0 ? (minutes - prev[0]) / span : 1;
      const mix = (k: 1 | 2 | 3) => prev[k] + f * (next[k] - prev[k]);
      return [mix(1), mix(2), mix(3)];
    }
    prev = next;
  }
  return [prev[1], prev[2], prev[3]];
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

type CarbInput = Pick<PlanInput, "sport" | "workout" | "durationMin" | "gut" | "highCarb" | "practise"> &
  Partial<Pick<PlanInput, "powerW" | "ftpW" | "paceSecKm" | "thresholdPaceSecKm" | "bodyKg">>;

/** Riders often know FTP in W/kg; no adult's FTP in watts is this low, so smaller values are W/kg. */
export const FTP_W_KG_BELOW = 10;

/** FTP in watts, converting a W/kg entry with body weight; 0 when unknown. */
export function ftpWatts(i: Pick<CarbInput, "ftpW" | "bodyKg">): number {
  const ftp = i.ftpW ?? 0;
  if (ftp <= 0) return 0;
  return ftp < FTP_W_KG_BELOW ? Math.round(ftp * (i.bodyKg ?? 70)) : ftp;
}

/**
 * Plausible effort ÷ threshold for a whole session. Outside it the threshold was almost certainly
 * mistyped (an FTP in the wrong unit, a pace from another distance), so it is ignored and the
 * athlete is asked to check it. Power can briefly exceed FTP by far, but not averaged over a session.
 */
export const PLAUSIBLE_RATIO: Record<"ride" | "run", readonly [number, number]> = { ride: [0.4, 1.5], run: [0.5, 1.3] };

/** Effort ÷ threshold as entered, valid or not, or null when either is missing. */
export function rawThresholdRatio(i: CarbInput): number | null {
  if (i.sport === "ride") {
    const ftp = ftpWatts(i);
    return i.powerW && ftp ? i.powerW / ftp : null;
  }
  return i.paceSecKm && i.thresholdPaceSecKm ? i.thresholdPaceSecKm / i.paceSecKm : null;
}

/** Whether effort could change the carbs at this duration: not for ultras or sessions every effort fuels alike. */
export function intensityChangesCarbs(i: CarbInput): boolean {
  if (i.workout === "ultra") return false;
  const bare = { ...i, powerW: 0, ftpW: 0, paceSecKm: 0, thresholdPaceSecKm: 0 };
  const efforts: Workout[] = ["z2", "endurance", "tempo", "race"];
  return new Set(efforts.map((workout) => carbPlan({ ...bare, workout }).target)).size > 1;
}

/** Whether a threshold was entered but gives an impossible ratio. */
export function implausibleThreshold(i: CarbInput): boolean {
  const ratio = rawThresholdRatio(i);
  const [lo, hi] = PLAUSIBLE_RATIO[i.sport === "ride" ? "ride" : "run"];
  return ratio !== null && (ratio < lo || ratio > hi);
}

/**
 * Intensity from effort relative to threshold, upper bounds of each band. Bike: power ÷ FTP, after
 * Coggan's training zones (endurance up to 75%, tempo and sweet spot to 95%). Run: speed ÷
 * threshold speed, after Daniels' paces (easy below ~85%, marathon to ~94%, threshold to 100%).
 * Training-zone conventions, not from the evidence review.
 */
export const THRESHOLD_BANDS: Record<"ride" | "run", readonly [number, Workout][]> = {
  ride: [[0.76, "z2"], [0.86, "endurance"], [0.96, "tempo"], [Infinity, "race"]],
  run: [[0.85, "z2"], [0.94, "endurance"], [1.0, "tempo"], [Infinity, "race"]],
};

/** Effort as a fraction of threshold, or null when power and FTP (or pace and threshold pace) are not both known. */
export function thresholdRatio(i: CarbInput): number | null {
  return implausibleThreshold(i) ? null : rawThresholdRatio(i);
}

/** The intensity carbs are planned at: from threshold when known, else the workout picked. Ultras keep their own band. */
export function carbIntensity(i: CarbInput): Workout {
  const ratio = thresholdRatio(i);
  if (ratio === null || i.workout === "ultra") return i.workout;
  const bands = THRESHOLD_BANDS[i.sport === "ride" ? "ride" : "run"];
  return bands.find(([upTo]) => ratio < upTo)![1];
}

/** Whether this session may use the 90-120 g/h band: trained gut, opted in, a race over 2.5 h. */
const highCarbAllowed = (i: CarbInput) => i.highCarb && i.gut === "high" && i.workout === "race" && i.durationMin > 150;

function curveFor(input: CarbInput): readonly Anchor[] {
  const i = { ...input, workout: carbIntensity(input) };
  const base = CARB_CURVES[i.workout];
  if (highCarbAllowed(i)) return [...base.filter((a) => a[0] < 150), ...HIGH_CARB_TAIL];
  const tail = i.gut === "high" ? TRAINED_TAIL[i.workout] : undefined;
  return tail ? [...base.slice(0, -1), tail] : base;
}

/** The curve's band and target for the session, before the sport factor and gut ceiling. */
function rawCell(i: CarbInput): Cell {
  const cell = onCurve(curveFor(i), i.durationMin);
  if (i.practise && i.durationMin >= 45 && cell[2] < PRACTISE[2]) return [Math.max(cell[0], PRACTISE[0]), Math.max(cell[1], PRACTISE[1]), PRACTISE[2]];
  return cell;
}

function ceilingFor(i: CarbInput): number {
  return highCarbAllowed(i) ? HIGH_CARB_CEILING : GUT_CEILING[i.gut];
}

/** Below this, a target is too small for any pack to deliver, so it is none. */
const MIN_TARGET_G_H = 10;

/** Band and target in g/h after the sport factor and the gut ceiling, rounded to 5 g. */
export function carbPlan(input: CarbInput): { band: [number, number]; target: number; limitedByGut: boolean } {
  const i = { ...input, workout: carbIntensity(input) };
  const [lo, hi, raw] = rawCell(i);
  const factor = i.workout === "ultra" ? 1 : SPORT_GUT_FACTOR[i.sport];
  const ceiling = ceilingFor(i);
  const top = Math.min(round(hi * factor, 5), ceiling);
  const bottom = Math.min(round(lo * factor, 5), top);
  const target = clamp(round(raw * factor, 5), bottom, top);
  return { band: [bottom, top], target: target < MIN_TARGET_G_H ? 0 : target, limitedByGut: round(hi * factor, 5) > ceiling };
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

type SweatInput = Pick<PlanInput, "sport" | "workout" | "terrain" | "indoor" | "airflow" | "bodyKg" | "tempC" | "humidityPct" | "altitudeM" | "paceSecKm" | "powerW" | "durationMin">;

/**
 * Typical running speed in m/s. Race pace depends on how long the race is: Riegel's fatigue
 * exponent (time ∝ distance^1.06) makes a 45-min race faster than a 3.5 h one, from the 12 km/h
 * marathon reference.
 */
export function typicalRunSpeed(i: Pick<PlanInput, "terrain" | "workout" | "durationMin">): number {
  const kmh = TYPICAL_KMH[i.terrain][i.workout];
  const race = i.workout === "race" ? Math.pow(Math.max(i.durationMin, 20) / 210, -0.06) : 1;
  return (kmh * race) / 3.6;
}

/** Running sweat from metabolic heat: about 1 kcal per kg per km (evidence review C4). */
function runSweat(i: SweatInput): number {
  const speed = i.paceSecKm > 0 ? 1000 / i.paceSecKm : typicalRunSpeed(i);
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

/** 0 at `from` minutes, rising linearly to 1 at `to`. */
const ramp = (minutes: number, from: number, to: number) => clamp((minutes - from) / (to - from), 0, 1);

/**
 * Planned drinking ceilings in ml/h (evidence review C1): runners tolerate less, and long runs risk
 * hyponatraemia, so the running ceiling eases from 750 at 4 h to 600 at 5 h.
 */
export function fluidCeiling(sport: Sport, durationMin: number): number {
  if (sport === "ride") return 1000;
  return Math.round(750 - 150 * ramp(durationMin, 240, 300));
}

type FluidInput = Pick<PlanInput, "sport" | "durationMin" | "tempC" | "indoor">;

/**
 * Fluid in ml/h: about 60% of sweat, under the sport's ceiling, and always 200 ml/h below sweat
 * losses. Short cool outdoor sessions need none; drinking eases in over the next 45 min (from
 * 60 min, or from 30 min indoors or at 25 °C+) rather than switching on.
 */
export function fluidTarget(sweatRateLh: number, i: FluidInput): number {
  const start = i.indoor || i.tempC >= 25 ? 30 : 60;
  const share = ramp(i.durationMin, start, start + 45);
  if (share <= 0) return 0;
  const floor = i.tempC < 5 ? 250 : 300;
  const planned = Math.max(sweatRateLh * 600, floor);
  const belowSweat = sweatRateLh * 1000 - 200;
  return Math.max(0, round(share * Math.min(planned, fluidCeiling(i.sport, i.durationMin), belowSweat), 50));
}

/** Plan fluid as a rate on long or hot sessions; otherwise it is a guide and thirst leads (evidence review C2). */
export const fluidPlanned = (i: Pick<PlanInput, "durationMin" | "tempC">) => i.durationMin > 180 || i.tempC >= 25;

/**
 * How much of the full sodium replacement a session needs, 0 to 1 (evidence review C5): all of it
 * when drinking replaces 70% or more of sweat, and on sessions of 4 h or more, easing in from 3 h
 * so 4 h is not a cliff.
 */
export function sodiumShare(sweatRateLh: number, fluidMlPerHour: number, durationMin: number): number {
  if (sweatRateLh > 0 && fluidMlPerHour >= 0.7 * sweatRateLh * 1000) return 1;
  return ramp(durationMin, 180, 240);
}

/** Sodium in mg/h: the needed share of half what the sweat carries away, up to 1000 mg/h. */
export function sodiumTarget(sweatRateLh: number, sweatSodiumMgL: number, share: number): number {
  return clamp(round(share * sweatRateLh * sweatSodiumMgL * 0.5, 50), 0, 1000);
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
  const sodium = sodiumTarget(sweat, input.sweatSodiumMgL, sodiumShare(sweat, fluid, input.durationMin));
  return {
    carbsPerHour: carbs.target,
    carbBand: carbs.band,
    fluidMlPerHour: fluid,
    sweatRateLh: sweat,
    sodiumMgPerHour: sodium,
    // The cap only means something with a caffeinated pack to schedule.
    caffeineCapMg: input.packs.some((p) => p.caffeineMg > 0) ? caffeineCap(input.bodyKg, input.caffeineMgKg) : 0,
    ratio: carbRatio(carbs.target),
    fluidPlanned: fluidPlanned(input),
    sodiumNeeded: sodium > 0,
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

const INTENSITY_WORDS: Record<Workout, string> = { z2: "an easy", endurance: "a steady", tempo: "a tempo", race: "a race-level", ultra: "an ultra" };

const RULES: Rule[] = [
  {
    when: (i) => implausibleThreshold(i) && intensityChangesCarbs(i),
    note: (i) => {
      const pct = Math.round((rawThresholdRatio(i) ?? 0) * 100);
      return i.sport === "ride"
        ? `${i.powerW} W is ${pct}% of the FTP you entered, which no one holds for a whole session, so the FTP is ignored. Check it: enter it in watts (e.g. 250) or W/kg (e.g. 3.5).`
        : `Your pace is ${pct}% of the threshold pace you entered, which is not possible for a whole session, so the threshold pace is ignored. Check it: it is about your 1-hour race pace.`;
    },
  },
  {
    // Only when the threshold actually moves the carbs, not just the label.
    when: (i) => carbPlan(i).target !== carbPlan({ ...i, ftpW: 0, thresholdPaceSecKm: 0 }).target,
    note: (i) => {
      const pct = Math.round((thresholdRatio(i) ?? 0) * 100);
      if (i.sport === "ride" && i.ftpW < FTP_W_KG_BELOW) return `At ${pct}% of your FTP (${ftpWatts(i)} W from ${i.ftpW} W/kg), carbs are planned for ${INTENSITY_WORDS[carbIntensity(i)]} effort, not the workout you picked.`;
      const of = i.sport === "ride" ? "your FTP" : "your threshold pace";
      return `At ${pct}% of ${of}, carbs are planned for ${INTENSITY_WORDS[carbIntensity(i)]} effort, not the workout you picked.`;
    },
  },
  {
    when: (i) => i.durationMin < 45,
    note: () => "Under 45 minutes, stored glycogen covers the work. Rinse your mouth with a sports drink if you want a lift.",
  },
  {
    when: (i, t) => i.durationMin >= 45 && t.carbsPerHour === 0 && !i.practise,
    note: () => "No fuel needed for an easy session this short. Tick \"Practise fueling\" under More options to train your gut, or after a fasted start or a second session that day.",
  },
  {
    when: (i) => i.workout === "race" && i.durationMin >= 90,
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
    when: (_i, t) => t.caffeineCapMg > 0 && _i.caffeineMgKg > 3,
    note: () => "Above 3 mg/kg, caffeine adds little and raises the risk of gut upset, jitters and poor sleep.",
  },
  {
    when: (i, t) => t.caffeineCapMg > 0 && i.durationMin <= 90,
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
