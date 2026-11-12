import { fmtBand, fmtDuration, fmtFluid, fmtGrams, fmtMg } from "../lib/format.ts";
import type { PackLine, Plan } from "../lib/types.ts";
import { Card, KindBadge } from "./ui.tsx";

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="tabular text-xl font-bold">{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
}

function PackList({ lines, waterMl, waterLabel }: { lines: PackLine[]; waterMl: number; waterLabel: string }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {lines.map((line) => (
        <li key={line.packId} className="flex items-center gap-2 py-1.5">
          <span className="tabular w-8 font-semibold">{line.count}×</span>
          <span className="flex-1">{line.name}</span>
          <KindBadge kind={line.kind} />
        </li>
      ))}
      {waterMl > 0 && (
        <li className="flex items-center gap-2 py-1.5">
          <span className="tabular w-8 font-semibold" />
          <span className="flex-1">Plain water: {fmtFluid(waterMl)} {waterLabel}</span>
        </li>
      )}
    </ul>
  );
}

function caffeineSub(capMg: number, durationMin: number): string {
  if (capMg <= 0) return "no caffeinated pack, or cap 0";
  return durationMin <= 90 ? "at the start" : "half early, rest from 30%";
}

export default function Summary({ plan, durationMin }: { plan: Plan; durationMin: number }) {
  const { targets: t, totals, packing, notes, blocked, stretches } = plan;
  if (blocked) {
    return (
      <Card title="Your bento" aside={<span className="text-xs text-muted">{fmtDuration(durationMin)}</span>}>
        <div role="alert" className="rounded-xl border-2 border-bad px-4 py-3">
          <p className="font-semibold text-bad">Too hot to plan safely</p>
          <p className="mt-1 text-sm">{blocked}</p>
        </div>
      </Card>
    );
  }
  return (
    <Card title="Your bento" aside={<span className="text-xs text-muted">{fmtDuration(durationMin)}</span>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Carbs" value={t.carbsPerHour > 0 ? `${t.carbsPerHour} g/h` : "None"} sub={t.carbsPerHour === 0 ? "not needed" : t.ratio ? `${fmtBand(t.carbBand, "g/h")}, glucose:fructose ${t.ratio}` : fmtBand(t.carbBand, "g/h")} />
        <Tile label="Fluid" value={t.fluidMlPerHour > 0 ? `${fmtFluid(t.fluidMlPerHour)}/h` : "To thirst"} sub={t.fluidPlanned ? `planned · sweat ≈ ${t.sweatRateLh.toFixed(2)} L/h` : `a guide · sweat ≈ ${t.sweatRateLh.toFixed(2)} L/h`} />
        <Tile label="Sodium" value={t.sodiumNeeded ? `${t.sodiumMgPerHour} mg/h` : "Optional"} sub={t.sodiumNeeded ? "half of sweat losses" : "to taste, up to 500 mg/h"} />
        <Tile label="Caffeine" value={t.caffeineCapMg > 0 ? `≤ ${t.caffeineCapMg} mg` : "None"} sub={caffeineSub(t.caffeineCapMg, durationMin)} />
      </div>

      {stretches ? (
        <>
          <h3 className="mt-4 mb-1 text-sm font-semibold">Carry per stretch</h3>
          <p className="text-xs text-muted">Refilling every {fmtDuration(stretches.everyMin)}, {stretches.count} stretches. Restock to this at each refill.</p>
          <PackList lines={stretches.carry} waterMl={stretches.waterMl} waterLabel="per stretch" />
          <h3 className="mt-3 mb-1 text-sm font-semibold">Whole session</h3>
          <PackList lines={packing} waterMl={totals.waterMl} waterLabel="in total" />
        </>
      ) : (
        <>
          <h3 className="mt-4 mb-1 text-sm font-semibold">Packing list</h3>
          <PackList lines={packing} waterMl={totals.waterMl} waterLabel="(carry or refill)" />
        </>
      )}
      <p className="tabular mt-2 text-xs text-muted">
        Totals: {fmtGrams(totals.carbsG)} carbs · {fmtMg(totals.sodiumMg)} sodium · {fmtFluid(totals.fluidMl + totals.waterMl)} fluid
        {totals.caffeineMg > 0 && ` · ${fmtMg(totals.caffeineMg)} caffeine`} · packs take {fmtFluid(totals.carryVolumeMl)}
      </p>

      {notes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n} className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-ink">{n}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
