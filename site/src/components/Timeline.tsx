import { fmtClock, fmtFluid, fmtGrams } from "../lib/format.ts";
import type { IntakeEvent } from "../lib/types.ts";
import { KindDot, Section } from "./ui.tsx";

/** What to take at a prompt, as separate items, so the line reads without separator characters. */
function detail(e: IntakeEvent): string[] {
  const parts = e.carbsG > 0 ? [fmtGrams(e.carbsG) + " carbs"] : [`${e.sodiumMg} mg sodium`];
  if (e.fluidMl > 0) parts.push(`${fmtFluid(e.fluidMl)} bottle, sip it until the next prompt`);
  if (e.kind === "gel") parts.push("with 150-250 ml water");
  if (e.caffeineMg > 0) parts.push(`${e.caffeineMg} mg caffeine`);
  return parts;
}

// A table-like list: elapsed time in a fixed column, then what to take, then the running carb
// total. The kind dot repeats the colour of the session strip in the plan panel.
export default function Timeline({ events, fuelOwed, blocked }: { events: IntakeEvent[]; fuelOwed: boolean; blocked: boolean }) {
  let cumulative = 0;
  return (
    <Section title="Timeline" aside="elapsed time">
      {events.length === 0 ? (
        <p className="text-[0.9375rem] text-muted">
          {blocked
            ? "No timeline in these conditions."
            : fuelOwed
              ? "No timeline yet: carry at least one pack with carbs."
              : "Nothing to eat on the go for this session. Drink to thirst."}
        </p>
      ) : (
        <ol className="flex flex-col">
          {events.map((e) => {
            cumulative += e.carbsG;
            return (
              <li key={`${e.minute}-${e.packId}`} className="grid grid-cols-[3.25rem_1fr_auto] gap-x-3 border-t border-hairline py-2.5 first:border-t-0">
                <span className="tabular pt-px text-[0.9375rem] font-semibold">{fmtClock(e.minute)}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <KindDot kind={e.kind} />
                    <span className="min-w-0 text-[0.9375rem] font-medium wrap-anywhere">{e.name}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 pl-4 text-sm text-muted">{detail(e).map((d) => <span key={d}>{d}</span>)}</span>
                </span>
                <span className="tabular pt-px text-right text-sm text-muted">{e.carbsG > 0 && `${fmtGrams(cumulative)} total`}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
