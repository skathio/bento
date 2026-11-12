// What the athlete picks, mapped onto the planner's model. The form branches
// Bike or Run, then a discipline, then a workout offered for that discipline.
// Each discipline sets the model's sport and terrain, and each workout sets the
// model's intensity (z2, endurance or race), so the rules in factors.ts and
// docs/methodology.md apply unchanged.
import type { Sport, Terrain, Workout } from "./types.ts";

export const ACTIVITIES = ["bike", "run"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export interface Discipline {
  activity: Activity;
  label: string;
  sport: Sport;
  terrain: Terrain;
}

export const DISCIPLINES = {
  "bike-road": { activity: "bike", label: "Road", sport: "ride", terrain: "road" },
  "bike-gravel": { activity: "bike", label: "Gravel", sport: "ride", terrain: "trail" },
  "bike-mtb": { activity: "bike", label: "MTB", sport: "ride", terrain: "trail" },
  "bike-indoor": { activity: "bike", label: "Indoor", sport: "ride", terrain: "road" },
  "run-road": { activity: "run", label: "Road", sport: "run", terrain: "road" },
  "run-trail": { activity: "run", label: "Trail", sport: "trail-run", terrain: "trail" },
  "run-treadmill": { activity: "run", label: "Treadmill", sport: "run", terrain: "road" },
} as const satisfies Record<string, Discipline>;
export type DisciplineId = keyof typeof DISCIPLINES;
export const DISCIPLINE_IDS = Object.keys(DISCIPLINES) as DisciplineId[];

export interface Effort {
  label: string;
  /** The model intensity this workout is planned at. */
  workout: Workout;
  /** Disciplines that offer it. */
  disciplines: readonly DisciplineId[];
}

const BIKE_ALL = ["bike-road", "bike-gravel", "bike-mtb", "bike-indoor"] as const;
const BIKE_OUTDOOR = ["bike-road", "bike-gravel", "bike-mtb"] as const;
const RUN_ALL = ["run-road", "run-trail", "run-treadmill"] as const;
const RUN_OUTDOOR = ["run-road", "run-trail"] as const;

export const EFFORTS = {
  "bike-z2": { label: "Zone 2", workout: "z2", disciplines: BIKE_ALL },
  "bike-endurance": { label: "Endurance", workout: "endurance", disciplines: BIKE_ALL },
  "bike-intervals": { label: "Tempo / intervals", workout: "endurance", disciplines: BIKE_ALL },
  "bike-fondo": { label: "Gran fondo", workout: "endurance", disciplines: ["bike-road", "bike-gravel"] },
  "bike-race": { label: "Race", workout: "race", disciplines: BIKE_OUTDOOR },
  "run-easy": { label: "Easy", workout: "z2", disciplines: RUN_ALL },
  "run-long": { label: "Long run", workout: "endurance", disciplines: RUN_ALL },
  "run-tempo": { label: "Tempo / intervals", workout: "endurance", disciplines: RUN_ALL },
  "run-ultra": { label: "Ultra", workout: "endurance", disciplines: ["run-trail"] },
  "run-race": { label: "Race", workout: "race", disciplines: RUN_OUTDOOR },
} as const satisfies Record<string, Effort>;
export type EffortId = keyof typeof EFFORTS;
export const EFFORT_IDS = Object.keys(EFFORTS) as EffortId[];

/** The first discipline of each activity, used when the athlete switches activity. */
export const DEFAULT_DISCIPLINE: Record<Activity, DisciplineId> = { bike: "bike-road", run: "run-road" };

export const disciplinesOf = (activity: Activity): DisciplineId[] =>
  DISCIPLINE_IDS.filter((id) => DISCIPLINES[id].activity === activity);

export const effortsFor = (discipline: DisciplineId): EffortId[] =>
  EFFORT_IDS.filter((id) => (EFFORTS[id].disciplines as readonly DisciplineId[]).includes(discipline));

const INTENSITY_ORDER: readonly Workout[] = ["z2", "endurance", "race"];
const rank = (id: EffortId) => INTENSITY_ORDER.indexOf(EFFORTS[id].workout);

/**
 * The workout to keep when the discipline changes: the same one if offered,
 * else the first one offered at the nearest intensity.
 */
export function keepEffort(effort: EffortId, discipline: DisciplineId): EffortId {
  const offered = effortsFor(discipline);
  if (offered.includes(effort)) return effort;
  const distance = (id: EffortId) => Math.abs(rank(id) - rank(effort));
  return offered.reduce((best, id) => (distance(id) < distance(best) ? id : best));
}

/** The model's sport, terrain and intensity for a discipline and workout. */
export function modelOf(discipline: DisciplineId, effort: EffortId): { sport: Sport; terrain: Terrain; workout: Workout } {
  const d = DISCIPLINES[discipline];
  return { sport: d.sport, terrain: d.terrain, workout: EFFORTS[keepEffort(effort, discipline)].workout };
}
