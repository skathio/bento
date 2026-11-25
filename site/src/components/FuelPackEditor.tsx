import { useState } from "react";
import { fmtFluid } from "../lib/format.ts";
import { KIND_LABEL, NAME_MAX, packId, validatePack } from "../lib/products.ts";
import { CUSTOM_MAX } from "../lib/storage.ts";
import { PACK_KINDS, type FuelPack, type PackKind } from "../lib/types.ts";
import { Card, KindBadge, Segmented } from "./ui.tsx";

interface Props {
  packs: FuelPack[];
  selected: string[];
  onToggle: (id: string) => void;
  onAdd: (p: FuelPack) => void;
  onRemove: (id: string) => void;
}

/** The pack's facts as separate items, so the list reads without separator characters. */
function packFacts(pack: FuelPack): string[] {
  const facts = [`${pack.carbsG} g carbs`, `${pack.sodiumMg} mg sodium`];
  if (pack.caffeineMg > 0) facts.push(`${pack.caffeineMg} mg caffeine`);
  if (pack.fluidMl > 0) facts.push(fmtFluid(pack.fluidMl));
  return facts;
}

// The whole row is the checkbox's label, so a tap anywhere on the pack toggles it. Remove sits
// beside the label, not in it, so removing a pack never also toggles it.
function PackRow({ pack, checked, onToggle, onRemove }: { pack: FuelPack; checked: boolean; onToggle: () => void; onRemove?: () => void }) {
  return (
    <li className="flex items-center gap-1">
      <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2 has-checked:bg-surface-2">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Carry ${pack.name}`} className="size-5 shrink-0 accent-accent" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="min-w-0 wrap-anywhere">{pack.name}</span>
            <KindBadge kind={pack.kind} />
          </span>
          <span className="tabular flex flex-wrap gap-x-3 text-xs text-muted">
            {packFacts(pack).map((f) => <span key={f}>{f}</span>)}
          </span>
        </span>
      </label>
      {onRemove && (
        <button type="button" onClick={onRemove} className="min-h-11 shrink-0 rounded-lg px-2 text-xs text-muted underline hover:text-bad">Remove</button>
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
    <details className="mt-3 rounded-xl border border-line px-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Add your own pack</summary>
      <div className="flex flex-col gap-3 pb-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Name</span>
          <input value={draft.name} maxLength={NAME_MAX} onChange={(e) => set({ name: e.target.value })} className="min-h-11 rounded-xl border border-line px-3 py-1.5" />
        </label>
        <Segmented<PackKind> label="Kind" value={draft.kind} options={PACK_KINDS} labels={KIND_LABEL} onChange={(kind) => set({ kind })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {NUMBER_INPUTS.map(([key, label, unit]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">{label} ({unit})</span>
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
  return (
    <Card title="Fuel packs" aside={<span className="text-xs text-muted">{selected.length} carried</span>}>
      {/* One list ordered by kind; each pack's badge names its kind, so no per-kind headings. */}
      <ul className="-mx-2 flex flex-col gap-0.5">
        {PACK_KINDS.flatMap((kind) => packs.filter((p) => p.kind === kind)).map((p) => (
          <PackRow key={p.id} pack={p} checked={selected.includes(p.id)} onToggle={() => onToggle(p.id)} onRemove={p.id.startsWith("custom-") ? () => onRemove(p.id) : undefined} />
        ))}
      </ul>
      <AddPack taken={packs.map((p) => p.id)} full={packs.filter((p) => p.id.startsWith("custom-")).length >= CUSTOM_MAX} onAdd={onAdd} />
    </Card>
  );
}
