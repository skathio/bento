import { fmtClock, fmtFluid, fmtGrams } from "../lib/format.ts";
import type { IntakeEvent } from "../lib/types.ts";
import { Card, KindBadge } from "./ui.tsx";

function detail(e: IntakeEvent): string {
  const parts = e.carbsG > 0 ? [fmtGrams(e.carbsG) + " carbs"] : [`${e.sodiumMg} mg sodium`];
  if (e.fluidMl > 0) parts.push(`${fmtFluid(e.fluidMl)} bottle, sip it until the next prompt`);
  if (e.caffeineMg > 0) parts.push(`${e.caffeineMg} mg caffeine`);
  return parts.join(" · ");
}

export default function Timeline({ events, fuelOwed }: { events: IntakeEvent[]; fuelOwed: boolean }) {
  let cumulative = 0;
  return (
    <Card title="Timeline" aside={<span className="text-xs text-muted">elapsed time</span>}>
      {events.length === 0 ? (
        <p className="text-sm text-muted">
          {fuelOwed ? "No timeline yet: carry at least one pack with carbs." : "Nothing to eat on the go for this session. Water to thirst is enough."}
        </p>
      ) : (
        <ol className="relative flex flex-col gap-0 border-l-2 border-line pl-4">
          {events.map((e) => {
            cumulative += e.carbsG;
            return (
              <li key={`${e.minute}-${e.packId}`} className="relative py-2">
                <span className="bg-lacquer absolute top-3.5 -left-[1.4rem] size-2.5 rounded-full" aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular w-12 font-mono text-sm font-semibold">{fmtClock(e.minute)}</span>
                  <span className="text-sm font-medium">{e.name}</span>
                  <KindBadge kind={e.kind} />
                  <span className="tabular ml-auto text-xs text-muted">{fmtGrams(cumulative)} total</span>
                </div>
                <div className="pl-14 text-xs text-muted">{detail(e)}</div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
