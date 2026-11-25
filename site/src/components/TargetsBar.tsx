import type { Plan } from "../lib/types.ts";
import { targetValues } from "./ui.tsx";

/**
 * The phone's sticky strip of per-hour targets, so they stay in sight while the inputs below are
 * edited. Hidden from lg up, where the whole plan column is sticky instead. It is not a live
 * region: the summary carries the same numbers, and announcing every keystroke would be noise.
 */
export default function TargetsBar({ plan }: { plan: Plan }) {
  const bar = "sticky top-0 z-10 -mx-4 border-b border-hairline bg-bg/95 px-4 py-2 backdrop-blur lg:hidden";
  if (plan.blocked) {
    return (
      <div className={bar}>
        <p className="text-sm font-semibold text-bad">Too hot to plan safely</p>
      </div>
    );
  }
  const value = targetValues(plan.targets);
  const items = [["Carbs", value.carbs], ["Fluid", value.fluid], ["Sodium", value.sodium]] as const;
  return (
    <div className={bar}>
      <dl aria-label="Targets per hour" className="grid grid-cols-3 gap-2">
        {items.map(([label, v]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="tabular truncate text-sm font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
