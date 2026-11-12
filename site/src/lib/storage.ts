// The athlete's settings, kept per device in localStorage. Reading is defensive:
// anything missing or out of range falls back to a default, so a stale or edited
// entry never breaks the page.
import { DISCIPLINE_IDS, EFFORT_IDS, keepEffort, modelOf, type DisciplineId, type EffortId } from "./activities.ts";
import { asPack, PRESETS } from "./products.ts";
import { AIRFLOWS, GUT_LEVELS, type FuelPack, type PlanInput } from "./types.ts";

const STORE = "bento.settings.v1";
/** Most custom packs kept; the storage origin is shared, so an entry may be oversized. */
export const CUSTOM_MAX = 50;

/** What the form holds: the discipline and workout picked, from which the model's sport, terrain and intensity follow. */
export type Session = Omit<PlanInput, "packs" | "sport" | "terrain" | "workout" | "indoor"> & { discipline: DisciplineId; effort: EffortId };
type NumberKey = { [K in keyof Session]: Session[K] extends number ? K : never }[keyof Session];

export interface Settings {
  session: Session;
  /** Ids of the packs (preset or custom) the athlete is carrying. */
  selected: string[];
  custom: FuelPack[];
}

/** Allowed range for each number the form takes: [min, max, step]. */
export const RANGES: Record<NumberKey, [number, number, number]> = {
  durationMin: [15, 1440, 5],
  bodyKg: [30, 150, 1],
  tempC: [-20, 45, 1],
  humidityPct: [0, 100, 5],
  altitudeM: [0, 5000, 100],
  sweatRateLh: [0, 3, 0.05],
  sweatSodiumMgL: [200, 2500, 50],
  caffeineMgKg: [0, 6, 0.5],
  paceSecKm: [0, 1200, 5],
  powerW: [0, 600, 5],
  ftpW: [0, 600, 5],
  thresholdPaceSecKm: [0, 1200, 5],
  refillEveryMin: [0, 600, 15],
};

export const DEFAULT_SETTINGS: Settings = {
  session: {
    discipline: "bike-road", effort: "bike-steady", durationMin: 180, bodyKg: 70, tempC: 18,
    humidityPct: 50, altitudeM: 0, sweatRateLh: 0, sweatSodiumMgL: 900, gut: "moderate", caffeineMgKg: 3,
    airflow: "fan", paceSecKm: 0, powerW: 0, ftpW: 0, thresholdPaceSecKm: 0, highCarb: false, practise: false, refillEveryMin: 0,
  },
  selected: ["gel-40", "bar", "drink-40"],
  custom: [],
};

const pick = <T>(options: readonly T[], v: unknown, fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

/**
 * The value a form field commits once the athlete leaves it: the typed number
 * clamped to its range, or null when the text is not a number. Clamping only on
 * commit lets a value like 85 be typed through "8", which is below the minimum.
 */
export function commitNumber(key: NumberKey, raw: string): number | null {
  const v = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(v)) return null;
  const [lo, hi] = RANGES[key];
  return Math.min(hi, Math.max(lo, v));
}

/** True when the typed text is already a number inside the field's range. */
export function inRange(key: NumberKey, raw: string): boolean {
  const v = commitNumber(key, raw);
  return v !== null && v === Number(raw);
}

function number(key: NumberKey, v: unknown): number {
  const [lo, hi] = RANGES[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DEFAULT_SETTINGS.session[key];
}

function activity(r: Record<string, unknown>): Pick<Session, "discipline" | "effort"> {
  const d = DEFAULT_SETTINGS.session;
  const discipline = pick(DISCIPLINE_IDS, r.discipline, d.discipline);
  return { discipline, effort: keepEffort(pick(EFFORT_IDS, r.effort, d.effort), discipline) };
}

/** The planner's input for a session and the packs carried. */
export function toPlanInput(session: Session, packs: FuelPack[]): PlanInput {
  const { discipline, effort, ...rest } = session;
  return { ...rest, ...modelOf(discipline, effort), packs };
}

export function parseSession(raw: unknown): Session {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS.session;
  const numbers = Object.fromEntries((Object.keys(RANGES) as NumberKey[]).map((k) => [k, number(k, r[k])]));
  return {
    ...d,
    ...numbers,
    ...activity(r),
    gut: pick(GUT_LEVELS, r.gut, d.gut),
    airflow: pick(AIRFLOWS, r.airflow, d.airflow),
    highCarb: r.highCarb === true,
    practise: r.practise === true,
  };
}

/** Settings from stored JSON; defaults for anything unusable. */
export function parseSettings(json: string | null): Settings {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = json ? JSON.parse(json) : {};
    if (typeof parsed === "object" && parsed !== null) raw = parsed as Record<string, unknown>;
  } catch { /* corrupt entry: start over */ }
  const custom: FuelPack[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(raw.custom) ? raw.custom : []) {
    if (custom.length >= CUSTOM_MAX) break;
    const pack = asPack(entry);
    if (pack && !seen.has(pack.id)) {
      seen.add(pack.id);
      custom.push(pack);
    }
  }
  const known = new Set([...PRESETS, ...custom].map((p) => p.id));
  // Each known id once: duplicates would inflate the carried count.
  const selected = Array.isArray(raw.selected)
    ? [...new Set(raw.selected.filter((id): id is string => typeof id === "string" && known.has(id)))]
    : DEFAULT_SETTINGS.selected;
  return { session: parseSession(raw.session), selected, custom };
}

export function loadSettings(): Settings {
  try {
    return parseSettings(window.localStorage.getItem(STORE));
  } catch {
    return parseSettings(null);
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(s));
  } catch { /* storage blocked: settings last this page view */ }
}
