import type { ReactNode } from "react";
import { fmtFluid } from "../lib/format.ts";
import type { PackKind, Targets } from "../lib/types.ts";

/**
 * A titled section of the page. Sections sit flat on the page, set apart by space and a heading,
 * not boxed: the plan panel is the only box, so it reads as the result.
 */
export function Section({ title, aside, children, label }: { title: string; aside?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {aside && <span className="text-sm text-muted">{aside}</span>}
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
  /** Show the group's label above it; off when a heading nearby already names it. */
  showLabel?: boolean;
}

/** A row of mutually exclusive buttons, announced as a radio group. The chosen one is filled with ink. */
export function Segmented<T extends string>({ label, value, options, labels, onChange, showLabel = true }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      {showLabel && <span className="text-sm font-medium text-muted">{label}</span>}
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            onClick={() => onChange(o)}
            className={`min-h-11 min-w-0 flex-auto rounded-lg px-2 py-1 text-[0.9375rem] leading-tight text-balance sm:px-3 sm:whitespace-nowrap transition-colors ${o === value ? "bg-select font-semibold text-on-select" : "text-ink hover:bg-surface"}`}
          >
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

const DOT_CLASS: Record<PackKind, string> = { gel: "bg-gel", solid: "bg-solid", drink: "bg-drink" };

/** A pack kind's colour as a small dot; decorative, a text label always sits beside it. */
export function KindDot({ kind, className = "" }: { kind: PackKind; className?: string }) {
  return <span className={`size-2 shrink-0 rounded-full ${DOT_CLASS[kind]} ${className}`} aria-hidden="true" />;
}

const UNIT = /^(.*\d)\s+((?:g|ml|L|mg)(?:\/h)?)$/;

/**
 * A target such as "1000 mg/h" with its unit set smaller than the number, the way measurements
 * are printed, so a four-digit value still fits a narrow compartment on one line. A value with
 * no unit ("Optional", "To thirst") shows as it is. The text read out is unchanged.
 */
export function Measure({ value }: { value: string }) {
  const m = UNIT.exec(value);
  if (!m) return <>{value}</>;
  return <>{m[1]}<span className="ml-[0.2em] text-[0.6em] font-medium">{m[2]}</span></>;
}

/** The per-hour targets as shown in the plan panel and the phone's targets bar. */
export function targetValues(t: Targets): { carbs: string; fluid: string; sodium: string } {
  return {
    carbs: t.carbsPerHour > 0 ? `${t.carbsPerHour} g/h` : "None",
    fluid: t.fluidMlPerHour > 0 ? `${fmtFluid(t.fluidMlPerHour)}/h` : "To thirst",
    sodium: t.sodiumNeeded ? `${t.sodiumMgPerHour} mg/h` : "Optional",
  };
}
