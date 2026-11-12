// Built-in fuel packs with typical label values, and the checks for packs the
// athlete enters. Values are generic, not any one brand's.
import { PACK_KINDS, type FuelPack, type PackKind } from "./types.ts";

export const PRESETS: readonly FuelPack[] = [
  { id: "gel-22", name: "Standard gel", kind: "gel", carbsG: 22, sodiumMg: 50, caffeineMg: 0, fluidMl: 0, volumeMl: 35 },
  { id: "gel-40", name: "High-carb gel (2:1)", kind: "gel", carbsG: 40, sodiumMg: 100, caffeineMg: 0, fluidMl: 0, volumeMl: 60 },
  { id: "gel-caf", name: "Caffeine gel", kind: "gel", carbsG: 22, sodiumMg: 50, caffeineMg: 75, fluidMl: 0, volumeMl: 35 },
  { id: "chews", name: "Energy chews (sleeve)", kind: "solid", carbsG: 45, sodiumMg: 100, caffeineMg: 0, fluidMl: 0, volumeMl: 60 },
  { id: "bar", name: "Energy bar", kind: "solid", carbsG: 40, sodiumMg: 150, caffeineMg: 0, fluidMl: 0, volumeMl: 70 },
  { id: "rice-cake", name: "Rice cake", kind: "solid", carbsG: 30, sodiumMg: 200, caffeineMg: 0, fluidMl: 0, volumeMl: 120 },
  { id: "drink-40", name: "Drink mix, 500 ml", kind: "drink", carbsG: 40, sodiumMg: 350, caffeineMg: 0, fluidMl: 500, volumeMl: 500 },
  { id: "drink-80", name: "High-carb drink mix, 500 ml", kind: "drink", carbsG: 80, sodiumMg: 500, caffeineMg: 0, fluidMl: 500, volumeMl: 500 },
  { id: "electrolyte", name: "Electrolyte drink, no carbs, 500 ml", kind: "drink", carbsG: 0, sodiumMg: 500, caffeineMg: 0, fluidMl: 500, volumeMl: 500 },
];

export const KIND_LABEL: Record<PackKind, string> = { gel: "Gel", solid: "Solid", drink: "Drink" };

/** Longest pack name the editor and storage accept. */
export const NAME_MAX = 60;
/** Custom pack ids as packId makes them, so a stored entry cannot shadow a preset. */
const CUSTOM_ID = /^custom-[a-z0-9-]{1,80}$/;

/** Upper bounds that catch typos, such as 400 g of carbs in one gel. */
const LIMITS = { carbsG: 200, sodiumMg: 3000, caffeineMg: 400, fluidMl: 2000, volumeMl: 2000 } as const;
type NumberField = keyof typeof LIMITS;
const NUMBER_FIELDS = Object.keys(LIMITS) as NumberField[];

const isKind = (k: unknown): k is PackKind => PACK_KINDS.includes(k as PackKind);

/** Problems with a pack the athlete entered; empty when it is usable. */
export function validatePack(p: Partial<FuelPack>): string[] {
  const errors: string[] = [];
  if (typeof p.name !== "string" || !p.name.trim()) errors.push("Give the pack a name.");
  else if (p.name.trim().length > NAME_MAX) errors.push(`Keep the name to ${NAME_MAX} characters.`);
  if (!isKind(p.kind)) errors.push("Pick gel, solid or drink.");
  for (const field of NUMBER_FIELDS) {
    const v = p[field];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > LIMITS[field]) errors.push(`${field} must be 0-${LIMITS[field]}.`);
  }
  if (p.kind === "drink" && !(Number(p.fluidMl) > 0)) errors.push("A drink needs its fluid volume.");
  if (Number(p.carbsG) <= 0 && Number(p.fluidMl) <= 0) errors.push("A pack needs carbs or fluid.");
  return errors;
}

/** A URL- and storage-safe id from a name, unique among the existing ids. */
export function packId(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pack";
  let id = `custom-${base}`;
  for (let n = 2; taken.includes(id); n++) id = `custom-${base}-${n}`;
  return id;
}

/** A pack read back from storage, or null if it is not a valid pack. */
export function asPack(raw: unknown): FuelPack | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Partial<FuelPack>;
  if (typeof p.id !== "string" || !CUSTOM_ID.test(p.id) || validatePack(p).length > 0) return null;
  return {
    id: p.id, name: String(p.name).trim(), kind: p.kind as PackKind,
    carbsG: Number(p.carbsG), sodiumMg: Number(p.sodiumMg), caffeineMg: Number(p.caffeineMg),
    fluidMl: Number(p.fluidMl), volumeMl: Number(p.volumeMl),
  };
}
