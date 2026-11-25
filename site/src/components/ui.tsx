import type { ReactNode } from "react";
import { fmtFluid } from "../lib/format.ts";
import type { Targets } from "../lib/types.ts";

/**
 * A titled section of the page. Only a raised one is a card (the plan summary, the page's result);
 * the rest sit flat on the page, set apart by a rule, so the sections do not all look the same.
 */
export function Card({ title, aside, raised = false, children }: { title: string; aside?: ReactNode; raised?: boolean; children: ReactNode }) {
  return (
    <section className={raised ? "rounded-2xl border border-hairline bg-surface p-4 shadow-sm" : "border-t border-hairline pt-4 first:border-t-0 first:pt-0"}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}

/** A row of mutually exclusive buttons, announced as a radio group. */
export function Segmented<T extends string>({ label, value, options, labels, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex flex-wrap rounded-xl bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            onClick={() => onChange(o)}
            className={`flex-auto min-h-11 rounded-lg px-2 py-1.5 text-sm whitespace-nowrap transition-colors ${o === value ? "bg-accent font-semibold text-on-accent shadow-sm" : "text-ink hover:bg-surface"}`}
          >
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

const KIND_CLASS = {
  gel: "bg-gel-bg text-gel",
  solid: "bg-solid-bg text-solid",
  drink: "bg-drink-bg text-drink",
} as const;

export function KindBadge({ kind }: { kind: keyof typeof KIND_CLASS }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${KIND_CLASS[kind]}`}>{kind}</span>;
}

/** The per-hour targets as shown in the summary tiles and the phone's targets bar. */
export function targetValues(t: Targets): { carbs: string; fluid: string; sodium: string } {
  return {
    carbs: t.carbsPerHour > 0 ? `${t.carbsPerHour} g/h` : "None",
    fluid: t.fluidMlPerHour > 0 ? `${fmtFluid(t.fluidMlPerHour)}/h` : "To thirst",
    sodium: t.sodiumNeeded ? `${t.sodiumMgPerHour} mg/h` : "Optional",
  };
}
