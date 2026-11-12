// Turn targets and the athlete's fuel packs into a timeline of intake events and a
// packing list. Pure: the same input always gives the same plan.
import { kindPreference, notesFor, targets } from "./factors.ts";
import type { FuelPack, IntakeEvent, PackLine, Plan, PlanInput, Sport, Targets, Totals } from "./types.ts";

/** Minutes between intake prompts: riders can eat more often than runners. */
export const SLOT_MIN: Record<Sport, number> = { ride: 15, run: 20, "trail-run": 20 };

/** No intake in the last minutes: it would not be absorbed in time. */
const FINAL_GAP_MIN = 10;
/** Caffeinated products wait until this share of the session has passed. */
const CAFFEINE_FROM = 0.4;
/** A bottle may run ahead of the fluid target by this many minutes of drinking. */
const BOTTLE_LEAD_MIN = 30;

export interface Running {
  carbsG: number;
  /** Carb intakes so far, to keep any 60 minutes under the hourly ceiling. */
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
}

/** Fluid the plan may have started by this minute: the target up to a bottle's lead, never past the session end. */
const fluidAllowance = (t: Targets, minute: number, durationMin: number) =>
  (t.fluidMlPerHour * Math.min(minute + BOTTLE_LEAD_MIN, durationMin)) / 60;

const caffeineOk = (pack: FuelPack, progress: number, run: Running, t: Targets) =>
  pack.caffeineMg <= 0 || (progress >= CAFFEINE_FROM && run.caffeineMg + pack.caffeineMg <= t.caffeineCapMg);

/**
 * Carbs in the 60 minutes ending at this slot, this pack included, stay within the top
 * of the carb band. A pack bigger than the band on its own may still be taken alone.
 */
function underHourlyCeiling(pack: FuelPack, minute: number, run: Running, t: Targets): boolean {
  const lastHour = run.intakes.filter((i) => i.minute > minute - 60).reduce((acc, i) => acc + i.carbsG, 0);
  return lastHour === 0 || lastHour + pack.carbsG <= t.carbBand[1];
}

function allowed(pack: FuelPack, slot: Slot, run: Running, t: Targets): boolean {
  if (pack.carbsG <= 0) return false;
  if (!caffeineOk(pack, slot.progress, run, t)) return false;
  if (pack.fluidMl > 0 && run.drinkMl + pack.fluidMl > fluidAllowance(t, slot.minute, slot.durationMin)) return false;
  return underHourlyCeiling(pack, slot.minute, run, t);
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
  const options = input.packs.filter((p) => allowed(p, slot, run, t));
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
  const progress = minute / input.durationMin;
  const bottles = input.packs.filter((p) => p.carbsG <= 0 && p.fluidMl > 0 && caffeineOk(p, progress, run, t));
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
      const slot = { minute, progress: minute / input.durationMin, deficit: owed - run.carbsG, durationMin: input.durationMin };
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

/** How many of each pack to bring, most used first. */
export function packingList(events: IntakeEvent[]): PackLine[] {
  const lines = new Map<string, PackLine>();
  for (const e of events) {
    const line = lines.get(e.packId) ?? { packId: e.packId, name: e.name, kind: e.kind, count: 0 };
    line.count++;
    lines.set(e.packId, line);
  }
  return [...lines.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const sum = (events: IntakeEvent[], key: "carbsG" | "sodiumMg" | "caffeineMg" | "fluidMl") =>
  events.reduce((acc, e) => acc + e[key], 0);

export function totals(input: PlanInput, t: Targets, events: IntakeEvent[]): Totals {
  const hours = input.durationMin / 60;
  const fluidMl = sum(events, "fluidMl");
  const sodiumMg = sum(events, "sodiumMg");
  const volume = new Map(input.packs.map((p) => [p.id, p.volumeMl]));
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

function coverageNotes(input: PlanInput, t: Targets, sums: Totals): string[] {
  const notes: string[] = [];
  const owed = (t.carbsPerHour * input.durationMin) / 60;
  if (owed > 0 && !input.packs.some((p) => p.carbsG > 0)) notes.push("Add at least one pack with carbs to build a timeline.");
  else if (owed > 0 && sums.carbsG < owed * 0.85) notes.push(`These packs cover ${Math.round(sums.carbsG)} g of the ${Math.round(owed)} g target. Add a bigger or different pack.`);
  if (sums.sodiumGapMg > 0) notes.push(`Cover about ${sums.sodiumGapMg} mg more sodium with electrolyte tabs, capsules or salty food.`);
  if (sums.carbsG > 0) notes.push("Pack one spare of your main product in case one drops or an aid station runs out.");
  return notes;
}

/** The whole plan: targets, timeline, packing list, totals and notes. */
export function buildPlan(input: PlanInput): Plan {
  const t = targets(input);
  const events = schedule(input, t);
  const sums = totals(input, t, events);
  return { targets: t, events, packing: packingList(events), totals: sums, notes: [...notesFor(input, t), ...coverageNotes(input, t, sums)] };
}
