import type { Plan } from "../lib/types.ts";
import { Measure, targetValues } from "./ui.tsx";

/**
 * The phone's sticky strip of per-hour targets, in the plan panel's ume wash, so they stay in
 * sight while the inputs below are edited. Hidden from lg up, where the plan panel itself sticks.
 * It is not a live region: the panel carries the same numbers, and announcing every keystroke
 * would be noise.
 */
export default function TargetsBar({ plan }: { plan: Plan }) {
  const bar = "sticky top-0 z-10 -mx-4 border-b border-box-ring bg-box px-4 py-2.5 text-on-box shadow-md lg:hidden";
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
          <div key={label} className="min-w-0 bg-box px-2 first:pl-0 min-[360px]:px-3">
            <dt className="text-xs font-medium text-ume">{label}</dt>
            <dd className="tabular truncate text-sm font-semibold min-[360px]:text-base"><Measure value={v} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
