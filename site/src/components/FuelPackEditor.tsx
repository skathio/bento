import { useState } from "react";
import { fmtFluid } from "../lib/format.ts";
import { KIND_LABEL, NAME_MAX, packId, validatePack } from "../lib/products.ts";
import { CUSTOM_MAX } from "../lib/storage.ts";
import { PACK_KINDS, type FuelPack, type PackKind } from "../lib/types.ts";
import { KindDot, Section, Segmented } from "./ui.tsx";

interface Props {
  packs: FuelPack[];
  selected: string[];
  onToggle: (id: string) => void;
  onAdd: (p: FuelPack) => void;
  onRemove: (id: string) => void;
}

/** The pack's facts as separate items, so the tile reads without separator characters. */
function packFacts(pack: FuelPack): string[] {
  const facts = [`${pack.carbsG} g carbs`, `${pack.sodiumMg} mg sodium`];
  if (pack.caffeineMg > 0) facts.push(`${pack.caffeineMg} mg caffeine`);
  if (pack.fluidMl > 0) facts.push(fmtFluid(pack.fluidMl));
  return facts;
}

// A tile is the checkbox's label, so a tap anywhere on it toggles the pack. The checkbox stays a
// real one for assistive tech; the tile draws its state (ink border and a tick in the corner).
// Remove sits beside the label, not in it, so removing a pack never also toggles it.
function PackTile({ pack, checked, onToggle, onRemove }: { pack: FuelPack; checked: boolean; onToggle: () => void; onRemove?: () => void }) {
  return (
    <li className="relative flex">
      <label className={`relative flex min-h-16 min-w-0 flex-1 cursor-pointer flex-col justify-between gap-1 rounded-xl border bg-surface py-2.5 pr-8 pl-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${checked ? "border-select" : "border-transparent hover:border-line"} ${onRemove ? "pb-11" : ""}`}>
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Carry ${pack.name}`} className="sr-only" />
        <span className="flex items-baseline gap-2">
          <KindDot kind={pack.kind} className="translate-y-[-0.1rem]" />
          <span className="sr-only">{KIND_LABEL[pack.kind]}</span>
          <span className="min-w-0 text-[0.9375rem] leading-snug font-medium wrap-anywhere">{pack.name}</span>
        </span>
        <span className="tabular flex flex-wrap gap-x-2 pl-4 text-xs text-muted">
          {packFacts(pack).map((f) => <span key={f}>{f}</span>)}
        </span>
        <span aria-hidden="true" className={`absolute top-2.5 right-2.5 grid size-4.5 place-items-center rounded-full border transition-colors ${checked ? "border-select bg-select text-on-select" : "border-line"}`}>
          {checked && <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>}
        </span>
      </label>
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute right-0.5 bottom-0.5 grid size-11 place-items-center rounded-lg text-muted hover:text-bad">
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
          <span className="sr-only">Remove</span>
        </button>
      )}
    </li>
  );
}

const NUMBER_INPUTS = [
  ["carbsG", "Carbs", "g"],
  ["sodiumMg", "Sodium", "mg"],
  ["caffeineMg", "Caffeine", "mg"],
  ["fluidMl", "Fluid", "ml"],
  ["volumeMl", "Pack volume", "ml"],
] as const;
type NumberKey = (typeof NUMBER_INPUTS)[number][0];
type Texts = Record<NumberKey, string>;

type Draft = Omit<FuelPack, "id">;
const EMPTY: Draft = { name: "", kind: "gel", carbsG: 25, sodiumMg: 50, caffeineMg: 0, fluidMl: 0, volumeMl: 40 };
const EMPTY_TEXTS = Object.fromEntries(NUMBER_INPUTS.map(([k]) => [k, String(EMPTY[k])])) as Texts;
// An empty field becomes NaN, which validatePack rejects with the field's range.
const numbersFrom = (texts: Texts) =>
  Object.fromEntries(NUMBER_INPUTS.map(([k]) => [k, texts[k].trim() === "" ? Number.NaN : Number(texts[k])])) as Record<NumberKey, number>;

function AddPack({ taken, full, onAdd }: { taken: string[]; full: boolean; onAdd: (p: FuelPack) => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  // Number fields keep the typed text, so clearing one does not snap it to 0.
  const [texts, setTexts] = useState<Texts>(EMPTY_TEXTS);
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const submit = () => {
    const pack: Draft = { ...draft, ...numbersFrom(texts) };
    const problems = full ? [`You can keep up to ${CUSTOM_MAX} packs of your own. Remove one first.`] : validatePack(pack);
    setErrors(problems);
    if (problems.length > 0) return;
    onAdd({ ...pack, name: pack.name.trim(), id: packId(pack.name, taken) });
    setDraft(EMPTY);
    setTexts(EMPTY_TEXTS);
  };
  return (
    <details className="group mt-4 rounded-xl border border-dashed border-line px-3.5">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 text-[0.9375rem] font-medium">
        <svg viewBox="0 0 16 16" className="size-4 shrink-0 transition-transform group-open:rotate-45" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
        Add your own pack
      </summary>
      <div className="flex flex-col gap-3 border-t border-hairline pt-3 pb-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted">Name</span>
          <input value={draft.name} maxLength={NAME_MAX} onChange={(e) => set({ name: e.target.value })} className="min-h-11 rounded-xl border border-line px-3 py-1.5" />
        </label>
        <Segmented<PackKind> label="Kind" value={draft.kind} options={PACK_KINDS} labels={KIND_LABEL} onChange={(kind) => set({ kind })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {NUMBER_INPUTS.map(([key, label, unit]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted">{label} ({unit})</span>
              <input type="number" inputMode="decimal" min={0} value={texts[key]} onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))} className="tabular min-h-11 rounded-xl border border-line px-3 py-1.5" />
            </label>
          ))}
        </div>
        {errors.length > 0 && <ul className="text-xs text-bad" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <button type="button" onClick={submit} className="bg-lacquer min-h-11 self-start rounded-xl px-4 py-2 text-sm font-semibold text-on-accent">Add pack</button>
      </div>
    </details>
  );
}

export default function FuelPackEditor({ packs, selected, onToggle, onAdd, onRemove }: Props) {
  const carried = packs.filter((p) => selected.includes(p.id)).length;
  return (
    <Section title="What you carry" aside={`${carried} carried`}>
      <div className="flex flex-col gap-4">
        {PACK_KINDS.map((kind) => {
          const ofKind = packs.filter((p) => p.kind === kind);
          if (ofKind.length === 0) return null;
          return (
            <div key={kind}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted">
                <KindDot kind={kind} />
                {KIND_LABEL[kind]}s
              </h3>
              <ul aria-label={`${KIND_LABEL[kind]}s`} className="grid grid-cols-2 gap-2 lg:grid-cols-2">
                {ofKind.map((p) => (
                  <PackTile key={p.id} pack={p} checked={selected.includes(p.id)} onToggle={() => onToggle(p.id)} onRemove={p.id.startsWith("custom-") ? () => onRemove(p.id) : undefined} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <AddPack taken={packs.map((p) => p.id)} full={packs.filter((p) => p.id.startsWith("custom-")).length >= CUSTOM_MAX} onAdd={onAdd} />
    </Section>
  );
}
