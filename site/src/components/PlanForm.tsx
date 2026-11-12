import {
  ACTIVITIES, DEFAULT_DISCIPLINE, DISCIPLINES, disciplinesOf, EFFORTS, effortsFor, keepEffort,
  type Activity, type DisciplineId, type EffortId,
} from "../lib/activities.ts";
import { useState, type ReactNode } from "react";
import { commitNumber, inRange, RANGES, type Session } from "../lib/storage.ts";
import { GUT_LEVELS } from "../lib/types.ts";
import { Card, Segmented } from "./ui.tsx";

type NumberKey = keyof typeof RANGES;

interface FieldProps {
  field: NumberKey;
  label: string;
  unit: string;
  hint?: string;
  session: Session;
  onChange: (patch: Partial<Session>) => void;
}

function NumberField({ field, label, unit, hint, session, onChange }: FieldProps) {
  const [min, max, step] = RANGES[field];
  // The text being typed; null while the field shows the committed value.
  const [draft, setDraft] = useState<string | null>(null);
  const type = (raw: string) => {
    setDraft(raw);
    if (inRange(field, raw)) onChange({ [field]: Number(raw) });
  };
  const commit = () => {
    const v = draft === null ? null : commitNumber(field, draft);
    if (v !== null) onChange({ [field]: v });
    setDraft(null);
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 focus-within:border-accent">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft ?? session[field]}
          onChange={(e) => type(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          className="tabular w-full min-w-0 bg-transparent outline-none"
        />
        <span className="text-xs text-muted">{unit}</span>
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

const ACTIVITY_LABEL: Record<Activity, string> = { bike: "Bike", run: "Run" };
const DISCIPLINE_LABEL = Object.fromEntries(Object.entries(DISCIPLINES).map(([id, d]) => [id, d.label])) as Record<DisciplineId, string>;
const EFFORT_LABEL = Object.fromEntries(Object.entries(EFFORTS).map(([id, e]) => [id, e.label])) as Record<EffortId, string>;

// Line icons in the skathio marks' stroke style; they take the text colour.
const ICON: Record<Activity, ReactNode> = {
  bike: (
    <>
      <circle cx="5.5" cy="16.5" r="3.5" />
      <circle cx="18.5" cy="16.5" r="3.5" />
      <path d="M5.5 16.5 9.5 9h6.5l2.5 7.5M9.5 9l3 7.5L16 9M8 6.5h3M15 6.5h2.5L16 9" />
    </>
  ),
  run: (
    <>
      <circle cx="14.5" cy="4.5" r="1.8" />
      <path d="M7 21l3.5-5 2.5 2v4M10.5 16 12 9.5l-3 1.5-1.5 3M12 9.5l3 3 3.5-1M12 9.5l2.5-2.5" />
    </>
  ),
};

/** Bike or Run: the first branch, which sets the disciplines and workouts offered below. */
function ActivityPicker({ value, onChange }: { value: Activity; onChange: (a: Activity) => void }) {
  return (
    <div role="radiogroup" aria-label="Activity" className="grid grid-cols-2 gap-3">
      {ACTIVITIES.map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={a === value}
          onClick={() => onChange(a)}
          className={`flex items-center justify-center gap-2 rounded-2xl border-2 px-3 py-3 text-base font-semibold transition-colors ${a === value ? "border-accent bg-lacquer text-on-accent" : "border-line bg-surface hover:border-accent"}`}
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICON[a]}
          </svg>
          {ACTIVITY_LABEL[a]}
        </button>
      ))}
    </div>
  );
}
const GUT_LABEL = { low: "New", moderate: "Some", high: "Trained" } as const;

export default function PlanForm({ session, onChange }: { session: Session; onChange: (patch: Partial<Session>) => void }) {
  const field = { session, onChange };
  const activity = DISCIPLINES[session.discipline].activity;
  const pickDiscipline = (discipline: DisciplineId) => onChange({ discipline, effort: keepEffort(session.effort, discipline) });
  return (
    <Card title="Session">
      <div className="flex flex-col gap-3">
        <ActivityPicker value={activity} onChange={(a) => a !== activity && pickDiscipline(DEFAULT_DISCIPLINE[a])} />
        <Segmented label={`${ACTIVITY_LABEL[activity]} type`} value={session.discipline} options={disciplinesOf(activity)} labels={DISCIPLINE_LABEL} onChange={pickDiscipline} />
        <Segmented label="Workout" value={session.effort} options={effortsFor(session.discipline)} labels={EFFORT_LABEL} onChange={(effort) => onChange({ effort })} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField field="durationMin" label="Duration" unit="min" {...field} />
          <NumberField field="bodyKg" label="Body weight" unit="kg" {...field} />
          <NumberField field="tempC" label="Temperature" unit="°C" {...field} />
          <NumberField field="humidityPct" label="Humidity" unit="%" {...field} />
        </div>
        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="text-sm font-medium">More factors: sweat, altitude, gut, caffeine</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <NumberField field="sweatRateLh" label="Sweat rate" unit="L/h" hint="0 = estimate it" {...field} />
            <NumberField field="sweatSodiumMgL" label="Sweat sodium" unit="mg/L" hint="Typical 900" {...field} />
            <NumberField field="altitudeM" label="Altitude" unit="m" {...field} />
            <NumberField field="caffeineMgKg" label="Caffeine cap" unit="mg/kg" hint="0 = none, 3 typical" {...field} />
          </div>
          <div className="mt-3">
            <Segmented label="Gut training" value={session.gut} options={GUT_LEVELS} labels={GUT_LABEL} onChange={(gut) => onChange({ gut })} />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={session.carbLoaded} onChange={(e) => onChange({ carbLoaded: e.target.checked })} className="size-4 accent-accent" />
            I carb-loaded in the 36-48 h before
          </label>
        </details>
      </div>
    </Card>
  );
}
