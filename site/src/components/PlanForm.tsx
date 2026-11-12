import { SPORT_LABEL, WORKOUT_LABEL } from "../lib/format.ts";
import { useState } from "react";
import { commitNumber, inRange, RANGES, type Session } from "../lib/storage.ts";
import { GUT_LEVELS, SPORTS, TERRAINS, WORKOUTS } from "../lib/types.ts";
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

const TERRAIN_LABEL = { road: "Road", trail: "Trail" } as const;
const GUT_LABEL = { low: "New", moderate: "Some", high: "Trained" } as const;

export default function PlanForm({ session, onChange }: { session: Session; onChange: (patch: Partial<Session>) => void }) {
  const field = { session, onChange };
  return (
    <Card title="Session">
      <div className="flex flex-col gap-3">
        <Segmented label="Sport" value={session.sport} options={SPORTS} labels={SPORT_LABEL} onChange={(sport) => onChange({ sport, ...(sport === "trail-run" ? { terrain: "trail" } : {}) })} />
        <Segmented label="Workout" value={session.workout} options={WORKOUTS} labels={WORKOUT_LABEL} onChange={(workout) => onChange({ workout })} />
        <Segmented label="Terrain" value={session.terrain} options={TERRAINS} labels={TERRAIN_LABEL} onChange={(terrain) => onChange({ terrain })} />
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
