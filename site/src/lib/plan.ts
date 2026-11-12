// Turn targets and the athlete's fuel packs into a timeline of intake events and a
// packing list. Pure: the same input always gives the same plan.
import { blockedReason, kindPreference, notesFor, targets } from "./factors.ts";
import type { FuelPack, IntakeEvent, PackLine, Plan, PlanInput, Sport, Stretches, Targets, Totals } from "./types.ts";

/** Minutes between intake prompts: riders can eat more often than runners. */
export const SLOT_MIN: Record<Sport, number> = { ride: 15, run: 20, "trail-run": 20 };

/** No intake in the last minutes: it would not be absorbed in time. */
const FINAL_GAP_MIN = 10;
/** On sessions over 90 min, caffeine beyond half the cap waits until this share has passed. */
const CAFFEINE_FROM = 0.3;
/** No caffeine in the last minutes: it would peak after the finish and cost sleep. */
const CAFFEINE_END_GAP_MIN = 30;
/** Largest single carb dose that keeps a rolling hour reasonable (evidence review B1). */
export const MAX_DOSE_G: Record<Sport, number> = { ride: 40, run: 30, "trail-run": 30 };
/** Marks a half serving that runners can take from a big gel. */
export const HALF = "~half";
/** A bottle may run ahead of the fluid target by this many minutes of drinking. */
const BOTTLE_LEAD_MIN = 30;

export interface Running {
  carbsG: number;
  /** Carb intakes so far, to keep any 60 minutes within target plus one dose. */
  intakes: { minute: number; carbsG: number }[];
  caffeineMg: number;
  drinkMl: number;
  lastId: string | null;
}

interface Slot {
  minute: number;
  progress: number;
  deficit: number;
  durationMin: number;
  step: number;
  sport: Sport;
}

/** Fluid the plan may have started by this minute: the target up to a bottle's lead, never past the session end. */
const fluidAllowance = (t: Targets, minute: number, durationMin: number) =>
  (t.fluidMlPerHour * Math.min(minute + BOTTLE_LEAD_MIN, durationMin)) / 60;

/**
 * Caffeine timing (evidence review D): within the cap and never in the last 30 min. Sessions up to
 * 90 min take it at the first prompt only; longer ones take up to half the cap early and the rest
 * from 30% of the way.
 */
export function caffeineOk(pack: FuelPack, slot: Pick<Slot, "minute" | "durationMin" | "step">, run: Running, t: Targets): boolean {
  if (pack.caffeineMg <= 0) return true;
  const total = run.caffeineMg + pack.caffeineMg;
  if (total > t.caffeineCapMg || slot.minute > slot.durationMin - CAFFEINE_END_GAP_MIN) return false;
  if (slot.durationMin <= 90) return slot.minute <= slot.step;
  return total <= t.caffeineCapMg / 2 || slot.minute >= slot.durationMin * CAFFEINE_FROM;
}

/** Carbs in any 60 minutes stay within the hourly target plus one dose (evidence review B1). */
function withinRollingHour(pack: FuelPack, slot: Slot, run: Running, t: Targets): boolean {
  const lastHour = run.intakes.filter((i) => i.minute > slot.minute - 60).reduce((acc, i) => acc + i.carbsG, 0);
  return lastHour === 0 || lastHour + pack.carbsG <= t.carbsPerHour + MAX_DOSE_G[slot.sport];
}

function allowed(pack: FuelPack, slot: Slot, run: Running, t: Targets): boolean {
  if (pack.carbsG <= 0) return false;
  if (!caffeineOk(pack, slot, run, t)) return false;
  if (pack.fluidMl > 0 && run.drinkMl + pack.fluidMl > fluidAllowance(t, slot.minute, slot.durationMin)) return false;
  return withinRollingHour(pack, slot, run, t);
}

/** Runners can take half of a gel bigger than one running dose. */
export function servings(input: PlanInput): FuelPack[] {
  if (input.sport === "ride") return input.packs;
  const halves = input.packs
    .filter((p) => p.kind === "gel" && p.carbsG > MAX_DOSE_G[input.sport])
    .map((p) => ({ ...p, id: p.id + HALF, name: `½ ${p.name}`, carbsG: p.carbsG / 2, sodiumMg: p.sodiumMg / 2, caffeineMg: p.caffeineMg / 2, volumeMl: p.volumeMl / 2 }));
  return [...input.packs, ...halves];
}

/** Lower is better: how far the pack is from the carbs owed, its unsuitability and repetition; bottles and caffeine late earn a bonus. */
function score(pack: FuelPack, slot: Slot, run: Running, input: PlanInput): number {
  const fit = Math.abs(pack.carbsG - slot.deficit) / Math.max(slot.deficit, 1);
  const unsuited = 1 - kindPreference(pack.kind, input, slot.progress);
  const repeat = run.lastId === pack.id ? 0.25 : 0;
  const caffeineBonus = pack.caffeineMg > 0 ? 0.1 : 0;
  const fluidBonus = pack.fluidMl > 0 ? 0.15 : 0; // a bottle also covers fluid and sodium
  return fit + unsuited + repeat - caffeineBonus - fluidBonus;
}

/** The pack to take at this slot, or null when nothing is owed yet or nothing fits. */
export function choosePack(input: PlanInput, slot: Slot, run: Running, t: Targets): FuelPack | null {
  const options = servings(input).filter((p) => allowed(p, slot, run, t));
  if (options.length === 0) return null;
  const smallest = Math.min(...options.map((p) => p.carbsG));
  if (slot.deficit < smallest * 0.5) return null;
  let best = options[0] ?? null;
  for (const p of options) if (best && score(p, slot, run, input) < score(best, slot, run, input)) best = p;
  return best;
}

const toEvent = (minute: number, p: FuelPack): IntakeEvent => ({
  minute, packId: p.id, name: p.name, kind: p.kind,
  carbsG: p.carbsG, sodiumMg: p.sodiumMg, caffeineMg: p.caffeineMg, fluidMl: p.fluidMl,
});

/**
 * A carb-free bottle (an electrolyte drink) to start at this slot, or null. It is
 * taken only when the drink-mix bottles so far leave a whole bottle of the fluid
 * target uncovered, so it never pushes drinking past the target.
 */
export function chooseBottle(input: PlanInput, minute: number, run: Running, t: Targets): FuelPack | null {
  const owedMl = fluidAllowance(t, minute, input.durationMin);
  const slot = { minute, durationMin: input.durationMin, step: SLOT_MIN[input.sport] };
  const bottles = input.packs.filter((p) => p.carbsG <= 0 && p.fluidMl > 0 && caffeineOk(p, slot, run, t));
  return bottles.find((p) => run.drinkMl + p.fluidMl <= owedMl) ?? null;
}

/** The intake timeline: a carb pack where carbs are owed, plus electrolyte bottles where fluid is. */
export function schedule(input: PlanInput, t: Targets): IntakeEvent[] {
  const events: IntakeEvent[] = [];
  const step = SLOT_MIN[input.sport];
  const run: Running = { carbsG: 0, intakes: [], caffeineMg: 0, drinkMl: 0, lastId: null };
  const take = (minute: number, pack: FuelPack) => {
    events.push(toEvent(minute, pack));
    run.carbsG += pack.carbsG;
    if (pack.carbsG > 0) run.intakes.push({ minute, carbsG: pack.carbsG });
    run.caffeineMg += pack.caffeineMg;
    run.drinkMl += pack.fluidMl;
  };
  for (let minute = step; minute <= input.durationMin - FINAL_GAP_MIN; minute += step) {
    if (t.carbsPerHour > 0) {
      // Fuel now for the interval ahead, so the carbs owed by the end are taken before it.
      const owed = (t.carbsPerHour * Math.min(minute + step, input.durationMin)) / 60;
      const slot = { minute, progress: minute / input.durationMin, deficit: owed - run.carbsG, durationMin: input.durationMin, step, sport: input.sport };
      const pack = choosePack(input, slot, run, t);
      if (pack) {
        take(minute, pack);
        run.lastId = pack.id;
      }
    }
    const bottle = chooseBottle(input, minute, run, t);
    if (bottle) take(minute, bottle);
  }
  return events;
}

/** How many of each pack to bring, most used first. Half servings round up to whole packs. */
export function packingList(events: IntakeEvent[], packs: FuelPack[] = []): PackLine[] {
  const names = new Map(packs.map((p) => [p.id, p.name]));
  const lines = new Map<string, PackLine>();
  for (const e of events) {
    const half = e.packId.endsWith(HALF);
    const id = half ? e.packId.slice(0, -HALF.length) : e.packId;
    const line = lines.get(id) ?? { packId: id, name: names.get(id) ?? e.name, kind: e.kind, count: 0 };
    line.count += half ? 0.5 : 1;
    lines.set(id, line);
  }
  return [...lines.values()].map((l) => ({ ...l, count: Math.ceil(l.count) })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * With refill points, carry enough for the longest stretch between them: per pack the most any
 * stretch uses, and the plain water that stretch needs on top of its drinks.
 */
export function stretches(input: PlanInput, t: Targets, events: IntakeEvent[]): Stretches | null {
  const every = input.refillEveryMin;
  if (every <= 0 || every >= input.durationMin) return null;
  const count = Math.ceil(input.durationMin / every);
  const carry = new Map<string, PackLine>();
  let waterMl = 0;
  for (let k = 0; k < count; k++) {
    const from = k * every;
    const to = Math.min(input.durationMin, from + every);
    const inStretch = events.filter((e) => e.minute >= from && e.minute < to);
    for (const line of packingList(inStretch, input.packs)) {
      const prev = carry.get(line.packId);
      if (!prev || prev.count < line.count) carry.set(line.packId, line);
    }
    const drinks = inStretch.reduce((acc, e) => acc + e.fluidMl, 0);
    waterMl = Math.max(waterMl, (t.fluidMlPerHour * (to - from)) / 60 - drinks);
  }
  const lines = [...carry.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { everyMin: every, count, carry: lines, waterMl: Math.max(0, Math.round(waterMl / 50) * 50) };
}

const sum = (events: IntakeEvent[], key: "carbsG" | "sodiumMg" | "caffeineMg" | "fluidMl") =>
  events.reduce((acc, e) => acc + e[key], 0);

export function totals(input: PlanInput, t: Targets, events: IntakeEvent[]): Totals {
  const hours = input.durationMin / 60;
  const fluidMl = sum(events, "fluidMl");
  const sodiumMg = sum(events, "sodiumMg");
  const volume = new Map(servings(input).map((p) => [p.id, p.volumeMl]));
  return {
    carbsG: sum(events, "carbsG"),
    sodiumMg,
    caffeineMg: sum(events, "caffeineMg"),
    fluidMl,
    waterMl: Math.max(0, Math.round((t.fluidMlPerHour * hours - fluidMl) / 50) * 50),
    sodiumGapMg: Math.max(0, Math.round((t.sodiumMgPerHour * hours - sodiumMg) / 50) * 50),
    carryVolumeMl: events.reduce((acc, e) => acc + (volume.get(e.packId) ?? 0), 0),
  };
}

/**
 * How far below the session's carbs a plan may land and still count as on target: the larger of
 * the review's tolerance (±10 g/h or ±15%, B2) and half the smallest pack, since packs come whole.
 */
export function shortfallAllowance(input: PlanInput, t: Targets): number {
  const hours = input.durationMin / 60;
  const smallest = Math.min(...servings(input).filter((p) => p.carbsG > 0).map((p) => p.carbsG), Infinity);
  return Math.max(Math.max(10, t.carbsPerHour * 0.15) * hours, Number.isFinite(smallest) ? smallest / 2 : 0);
}

function coverageNotes(input: PlanInput, t: Targets, sums: Totals): string[] {
  const notes: string[] = [];
  const owed = (t.carbsPerHour * input.durationMin) / 60;
  if (owed > 0 && !input.packs.some((p) => p.carbsG > 0)) notes.push("Add at least one pack with carbs to build a timeline.");
  else if (owed > 0 && sums.carbsG < owed - shortfallAllowance(input, t)) notes.push(`These packs cover ${Math.round(sums.carbsG)} g of the ${Math.round(owed)} g target. Add a bigger or different pack.`);
  if (sums.sodiumGapMg > 0 && t.sodiumNeeded) notes.push(`Cover about ${sums.sodiumGapMg} mg more sodium with electrolyte tabs, capsules or salty food.`);
  if (sums.carbsG > 0) notes.push("Pack one spare of your main product in case one drops or a refill point runs out.");
  return notes;
}

/** The whole plan: targets, timeline, packing list, totals and notes. */
export function buildPlan(input: PlanInput): Plan {
  const t = targets(input);
  const blocked = blockedReason(input);
  const events = blocked ? [] : schedule(input, t);
  const sums = totals(input, t, events);
  const notes = blocked ? notesFor(input, t) : [...notesFor(input, t), ...coverageNotes(input, t, sums)];
  return { targets: t, blocked, events, packing: packingList(events, input.packs), stretches: stretches(input, t, events), totals: sums, notes };
}
