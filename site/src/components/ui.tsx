import type { ReactNode } from "react";

export function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
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
            className={`flex-auto rounded-lg px-2 py-1.5 text-sm whitespace-nowrap transition-colors ${o === value ? "bg-lacquer font-semibold text-on-accent shadow-sm" : "text-ink hover:bg-surface"}`}
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
