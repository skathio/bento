import { fmtClock, fmtFluid, fmtGrams } from "../lib/format.ts";
import type { IntakeEvent } from "../lib/types.ts";
import { Card, KindBadge } from "./ui.tsx";

/** What to take at a prompt, as separate items, so the line reads without separator characters. */
function detail(e: IntakeEvent): string[] {
  const parts = e.carbsG > 0 ? [fmtGrams(e.carbsG) + " carbs"] : [`${e.sodiumMg} mg sodium`];
  if (e.fluidMl > 0) parts.push(`${fmtFluid(e.fluidMl)} bottle, sip it until the next prompt`);
  if (e.kind === "gel") parts.push("with 150-250 ml water");
  if (e.caffeineMg > 0) parts.push(`${e.caffeineMg} mg caffeine`);
  return parts;
}

// The list's left margin holds the part of each dot that hangs over the rule: from lg up the plan
// column scrolls and clips whatever leaves it.
export default function Timeline({ events, fuelOwed, blocked }: { events: IntakeEvent[]; fuelOwed: boolean; blocked: boolean }) {
  let cumulative = 0;
  return (
    <Card title="Timeline" aside={<span className="text-xs text-muted">elapsed time</span>}>
      {events.length === 0 ? (
        <p className="text-sm text-muted">
          {blocked
            ? "No timeline in these conditions."
            : fuelOwed
              ? "No timeline yet: carry at least one pack with carbs."
              : "Nothing to eat on the go for this session. Drink to thirst."}
        </p>
      ) : (
        <ol className="relative ml-1.5 flex flex-col gap-0 border-l-2 border-hairline pl-4">
          {events.map((e) => {
            cumulative += e.carbsG;
            return (
              <li key={`${e.minute}-${e.packId}`} className="relative py-2">
                <span className="absolute top-3.5 -left-[1.4rem] size-2.5 rounded-full bg-accent" aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular w-12 font-mono text-sm font-semibold">{fmtClock(e.minute)}</span>
                  <span className="min-w-0 text-sm font-medium wrap-anywhere">{e.name}</span>
                  <KindBadge kind={e.kind} />
                  {e.carbsG > 0 && <span className="tabular ml-auto text-xs text-muted">{fmtGrams(cumulative)} total</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 pl-14 text-xs text-muted">{detail(e).map((d) => <span key={d}>{d}</span>)}</div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
