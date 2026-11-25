import type { Plan } from "../lib/types.ts";
import { targetValues } from "./ui.tsx";

/**
 * The phone's sticky strip of per-hour targets, a slice of the lacquer plan panel, so they stay in
 * sight while the inputs below are edited. Hidden from lg up, where the plan panel itself sticks.
 * It is not a live region: the panel carries the same numbers, and announcing every keystroke
 * would be noise.
 */
export default function TargetsBar({ plan }: { plan: Plan }) {
  const bar = "sticky top-0 z-10 -mx-4 bg-box px-4 py-2.5 text-on-box shadow-md lg:hidden";
  if (plan.blocked) {
    return (
      <div className={bar}>
        <p className="font-semibold text-ume">Too hot to plan safely</p>
      </div>
    );
  }
  const value = targetValues(plan.targets);
  const items = [["Carbs", value.carbs], ["Fluid", value.fluid], ["Sodium", value.sodium]] as const;
  return (
    <div className={bar}>
      <dl aria-label="Targets per hour" className="grid grid-cols-3 gap-px bg-box-line">
        {items.map(([label, v]) => (
          <div key={label} className="min-w-0 bg-box px-3 first:pl-0">
            <dt className="text-xs text-on-box-muted">{label}</dt>
            <dd className="tabular truncate text-base font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
