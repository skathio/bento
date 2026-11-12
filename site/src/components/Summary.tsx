import { fmtBand, fmtDuration, fmtFluid, fmtGrams, fmtMg } from "../lib/format.ts";
import type { Plan } from "../lib/types.ts";
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

export default function Summary({ plan, durationMin }: { plan: Plan; durationMin: number }) {
  const { targets: t, totals, packing, notes } = plan;
  return (
    <Card title="Your bento" aside={<span className="text-xs text-muted">{fmtDuration(durationMin)}</span>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Carbs" value={`${t.carbsPerHour} g/h`} sub={t.ratio ? `${fmtBand(t.carbBand, "g/h")}, glucose:fructose ${t.ratio}` : fmtBand(t.carbBand, "g/h")} />
        <Tile label="Fluid" value={`${fmtFluid(t.fluidMlPerHour)}/h`} sub={`sweat ≈ ${t.sweatRateLh.toFixed(2)} L/h`} />
        <Tile label="Sodium" value={`${t.sodiumMgPerHour} mg/h`} sub="half of sweat losses" />
        <Tile label="Caffeine" value={t.caffeineCapMg > 0 ? `≤ ${t.caffeineCapMg} mg` : "None"} sub="from 40% of the way" />
      </div>

      <h3 className="mt-4 mb-1 text-sm font-semibold">Packing list</h3>
      <ul className="divide-y divide-line text-sm">
        {packing.map((line) => (
          <li key={line.packId} className="flex items-center gap-2 py-1.5">
            <span className="tabular w-8 font-semibold">{line.count}×</span>
            <span className="flex-1">{line.name}</span>
            <KindBadge kind={line.kind} />
          </li>
        ))}
        {totals.waterMl > 0 && (
          <li className="flex items-center gap-2 py-1.5">
            <span className="tabular w-8 font-semibold" />
            <span className="flex-1">Plain water: {fmtFluid(totals.waterMl)} (carry or refill)</span>
          </li>
        )}
      </ul>
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
