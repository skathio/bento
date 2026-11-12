// Domain types for the fueling planner. Everything in lib/ is pure and runs under
// node --test without a browser.

export const SPORTS = ["ride", "run", "trail-run"] as const;
export type Sport = (typeof SPORTS)[number];

export const WORKOUTS = ["z2", "endurance", "race"] as const;
export type Workout = (typeof WORKOUTS)[number];

export const TERRAINS = ["road", "trail"] as const;
export type Terrain = (typeof TERRAINS)[number];

export const PACK_KINDS = ["gel", "solid", "drink"] as const;
export type PackKind = (typeof PACK_KINDS)[number];

export const GUT_LEVELS = ["low", "moderate", "high"] as const;
export type GutLevel = (typeof GUT_LEVELS)[number];

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
  durationMin: number;
  bodyKg: number;
  tempC: number;
  humidityPct: number;
  altitudeM: number;
  /** Measured sweat rate in L/h; 0 means unknown, so it is estimated. */
  sweatRateLh: number;
  /** Sweat sodium concentration in mg/L (typical 900, range ~200-2000). */
  sweatSodiumMgL: number;
  gut: GutLevel;
  /** Caffeine allowed during the session, as a total cap in mg per kg (0 = none). */
  caffeineMgKg: number;
  /** Whether the athlete carb-loaded in the 36-48 h before. */
  carbLoaded: boolean;
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

export interface Plan {
  targets: Targets;
  events: IntakeEvent[];
  packing: PackLine[];
  totals: Totals;
  notes: string[];
}
