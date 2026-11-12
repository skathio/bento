// Domain types for the fueling planner. Everything in lib/ is pure and runs under
// node --test without a browser.

export const SPORTS = ["ride", "run", "trail-run"] as const;
export type Sport = (typeof SPORTS)[number];

/** Intensities the rules plan at; the workouts the athlete picks map onto these. */
export const WORKOUTS = ["z2", "endurance", "tempo", "race", "ultra"] as const;
export type Workout = (typeof WORKOUTS)[number];

export const TERRAINS = ["road", "trail"] as const;
export type Terrain = (typeof TERRAINS)[number];

export const PACK_KINDS = ["gel", "solid", "drink"] as const;
export type PackKind = (typeof PACK_KINDS)[number];

export const GUT_LEVELS = ["low", "moderate", "high"] as const;
export type GutLevel = (typeof GUT_LEVELS)[number];

/** Air moving over an indoor rider or runner. Outdoors the movement itself cools. */
export const AIRFLOWS = ["none", "fan", "strong"] as const;
export type Airflow = (typeof AIRFLOWS)[number];

/** One serving of a fuel product: a gel, a solid (bar, chews, rice cake) or a drink (one bottle mixed). */
export interface FuelPack {
  id: string;
  name: string;
  kind: PackKind;
  carbsG: number;
  sodiumMg: number;
  caffeineMg: number;
  /** Fluid one serving supplies (a mixed bottle); 0 for gels and solids. */
  fluidMl: number;
  /** Space one serving takes to carry, in ml: a gel ~40, a bar ~60, a bottle its size. */
  volumeMl: number;
}

export interface PlanInput {
  sport: Sport;
  workout: Workout;
  terrain: Terrain;
  /** Indoor trainer or treadmill: no cooling from moving through the air. */
  indoor: boolean;
  /** Fans on an indoor session; ignored outdoors. */
  airflow: Airflow;
  durationMin: number;
  /** Running pace in seconds per km; 0 means unknown, so the workout's typical pace is used. */
  paceSecKm: number;
  /** Average riding power in W; 0 means unknown, so the workout's typical power is used. */
  powerW: number;
  /** Functional threshold power in W/kg; with power it sets the carb intensity. 0 means unknown. */
  ftpWkg: number;
  /** Threshold (about 1-hour race) pace in seconds per km; with pace it sets the carb intensity. 0 means unknown. */
  thresholdPaceSecKm: number;
  bodyKg: number;
  tempC: number;
  humidityPct: number;
  altitudeM: number;
  /** Measured sweat rate in L/h; 0 means unknown, so it is estimated. */
  sweatRateLh: number;
  /** Sweat sodium concentration in mg/L (typical 900, range ~200-2000). */
  sweatSodiumMgL: number;
  gut: GutLevel;
  /** Trained guts only: allow 90-120 g/h in races over 2.5 h. */
  highCarb: boolean;
  /** Fuel short or easy sessions anyway, to train the gut or after a fasted start or double day. */
  practise: boolean;
  /** Minutes between refill points (aid stations, shops, a support car); 0 means carry everything. */
  refillEveryMin: number;
  /** Caffeine allowed during the session, as a total cap in mg per kg (0 = none). */
  caffeineMgKg: number;
  packs: FuelPack[];
}

export interface Targets {
  carbsPerHour: number;
  carbBand: [number, number];
  fluidMlPerHour: number;
  sweatRateLh: number;
  sodiumMgPerHour: number;
  caffeineCapMg: number;
  /** Advised glucose:fructose ratio, or null when one carb source is enough. */
  ratio: string | null;
  /** Whether fluid is a planned rate (long or hot sessions) or a guide to drink to thirst. */
  fluidPlanned: boolean;
  /** Whether sodium is needed, or only optional to taste. */
  sodiumNeeded: boolean;
}

export interface IntakeEvent {
  minute: number;
  packId: string;
  name: string;
  kind: PackKind;
  carbsG: number;
  sodiumMg: number;
  caffeineMg: number;
  fluidMl: number;
}

export interface PackLine {
  packId: string;
  name: string;
  kind: PackKind;
  count: number;
}

export interface Totals {
  carbsG: number;
  sodiumMg: number;
  caffeineMg: number;
  fluidMl: number;
  /** Plain water to carry or collect on top of mixed drinks. */
  waterMl: number;
  /** Sodium still to cover with electrolyte tabs or salt, in mg. */
  sodiumGapMg: number;
  carryVolumeMl: number;
}

/** What to carry when the session has refill points: enough for the longest stretch. */
export interface Stretches {
  everyMin: number;
  count: number;
  carry: PackLine[];
  waterMl: number;
}

export interface Plan {
  targets: Targets;
  /** Set when conditions are too dangerous to plan: the reason, shown instead of a timeline. */
  blocked: string | null;
  stretches: Stretches | null;
  events: IntakeEvent[];
  packing: PackLine[];
  totals: Totals;
  notes: string[];
}
