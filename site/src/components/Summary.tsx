import type { ReactNode } from "react";
import { fmtBand, fmtClock, fmtDuration, fmtFluid, fmtGrams, fmtMg } from "../lib/format.ts";
import type { IntakeEvent, PackKind, PackLine, Plan } from "../lib/types.ts";
import { targetValues } from "./ui.tsx";

// The plan is the bento box: a black-lacquer panel whose compartments, split by thin ume lines
// like the favicon's, hold the per-hour targets. It is the page's one bold element.

const ON_LACQUER: Record<PackKind, string> = {
  gel: "bg-gel-on-box",
  solid: "bg-solid-on-box",
  drink: "bg-drink-on-box",
};
const STROKE_ON_LACQUER: Record<PackKind, string> = {
  gel: "stroke-gel-on-box",
  solid: "stroke-solid-on-box",
  drink: "stroke-drink-on-box",
};

function Compartment({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-box px-4 py-3.5 sm:px-3.5">
      <span className="text-sm font-medium text-ume">{label}</span>
      <span className="tabular text-[1.75rem] leading-tight font-semibold tracking-tight whitespace-nowrap text-on-box sm:text-2xl">{value}</span>
      <span className="text-xs leading-snug text-on-box-muted">{sub}</span>
    </div>
  );
}

const STRIP_W = 1000;

/**
 * The session at a glance: a track from start to finish with a tick for each intake, coloured by
 * pack kind, and faint marks on the hours. Drawn in SVG (attributes, not style), so the CSP holds.
 */
function SessionStrip({ events, durationMin }: { events: IntakeEvent[]; durationMin: number }) {
  if (events.length === 0) return null;
  const x = (min: number) => (Math.min(min, durationMin) / durationMin) * STRIP_W;
  const hours = Array.from({ length: Math.floor((durationMin - 1) / 60) }, (_, i) => (i + 1) * 60);
  return (
    <div className="px-4 pt-1 pb-4">
      <svg
        viewBox={`0 0 ${STRIP_W} 28`}
        preserveAspectRatio="none"
        className="block h-7 w-full"
        role="img"
        aria-label={`${events.length} intakes over ${fmtDuration(durationMin)}`}
      >
        <line x1="0" y1="14" x2={STRIP_W} y2="14" className="stroke-box-ring" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {hours.map((h) => (
          <line key={h} x1={x(h)} y1="9" x2={x(h)} y2="19" className="stroke-box-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {events.map((e) => (
          <line
            key={`${e.minute}-${e.packId}`}
            x1={x(e.minute)}
            y1="3"
            x2={x(e.minute)}
            y2="25"
            className={STROKE_ON_LACQUER[e.kind]}
            strokeWidth="4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="tabular mt-1 flex justify-between text-xs text-on-box-muted">
        <span>{fmtClock(0)}</span>
        <span>{fmtClock(durationMin)}</span>
      </div>
    </div>
  );
}

function PackList({ lines, waterMl, waterLabel }: { lines: PackLine[]; waterMl: number; waterLabel: string }) {
  return (
    <ul className="flex flex-col">
      {lines.map((line) => (
        <li key={line.packId} className="flex items-center gap-3 border-t border-box-line/60 py-2 first:border-t-0">
          <span className="tabular w-8 shrink-0 text-lg font-semibold text-ume">{line.count}×</span>
          <span className="min-w-0 flex-1 wrap-anywhere text-on-box">{line.name}</span>
          <span className={`size-2 shrink-0 rounded-full ${ON_LACQUER[line.kind]}`} aria-hidden="true" />
        </li>
      ))}
      {waterMl > 0 && (
        <li className="flex items-center gap-3 border-t border-box-line/60 py-2 first:border-t-0">
          <span className="w-8 shrink-0" />
          <span className="flex-1 text-on-box">Plain water: {fmtFluid(waterMl)} {waterLabel}</span>
        </li>
      )}
    </ul>
  );
}

function caffeineSub(capMg: number, durationMin: number): string {
  if (capMg <= 0) return "no caffeinated pack, or cap 0";
  return durationMin <= 90 ? "at the start" : "half early, rest from 30%";
}

// From lg up only the head of the box sticks: the title, the compartments and the session strip,
// which keep one height whatever is carried. The packing list continues the same box below and
// scrolls with the page, so the sticky part never grows to cover the timeline and notes after it.
// Head and body are siblings in the plan column (not wrapped), so the head sticks over the whole
// column; a strip of page colour above it hides text scrolling past the gap.
const STICKY_HEAD = "lg:[@media(min-height:36rem)]:sticky lg:[@media(min-height:36rem)]:top-0 lg:[@media(min-height:36rem)]:z-10 lg:-mt-4 lg:bg-bg lg:pt-4";

function Head({ durationMin, joined = false, children }: { durationMin: number; joined?: boolean; children: ReactNode }) {
  return (
    <div className={STICKY_HEAD}>
      <div className={`bg-box text-on-box ring-1 ring-box-ring ${joined ? "rounded-t-2xl" : "rounded-2xl"}`}>
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3">
          <h2 className="text-lg font-semibold tracking-tight">Your bento</h2>
          <span className="tabular text-sm text-on-box-muted">{fmtDuration(durationMin)}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Summary({ plan, durationMin }: { plan: Plan; durationMin: number }) {
  const { targets: t, totals, packing, blocked, stretches, events } = plan;
  const value = targetValues(t);
  if (blocked) {
    return (
      <section aria-label="Your bento">
        <Head durationMin={durationMin}>
          <div role="alert" className="border-t border-box-line px-4 py-4">
            <p className="text-[1.75rem] leading-tight font-semibold text-ume">Too hot to plan safely</p>
            <p className="mt-2 text-on-box">{blocked}</p>
          </div>
        </Head>
      </section>
    );
  }
  return (
    <section aria-label="Your bento" className="contents">
      <Head durationMin={durationMin} joined>
        {/* The compartments: a 1 px gap over the divider colour draws the bento's dividers. */}
        <div className="grid grid-cols-2 gap-px border-y border-box-line bg-box-line sm:grid-cols-4">
          <Compartment label="Carbs" value={value.carbs} sub={t.carbsPerHour === 0 ? "not needed" : t.ratio ? `${fmtBand(t.carbBand, "g/h")}, glucose:fructose ${t.ratio}` : fmtBand(t.carbBand, "g/h")} />
          <Compartment label="Fluid" value={value.fluid} sub={t.fluidPlanned ? `planned, sweat ≈ ${t.sweatRateLh.toFixed(2)} L/h` : `a guide, sweat ≈ ${t.sweatRateLh.toFixed(2)} L/h`} />
          <Compartment label="Sodium" value={value.sodium} sub={t.sodiumNeeded ? "half of sweat losses" : "to taste, up to 500 mg/h"} />
          <Compartment label="Caffeine" value={t.caffeineCapMg > 0 ? `≤ ${t.caffeineCapMg} mg` : "None"} sub={caffeineSub(t.caffeineCapMg, durationMin)} />
        </div>
        <div className="pt-4">
          <SessionStrip events={events} durationMin={durationMin} />
        </div>
      </Head>
      <div className="-mt-px rounded-b-2xl border-t border-box-line bg-box px-4 pt-3 pb-4 text-on-box ring-1 ring-box-ring">
        {stretches ? (
          <>
            <h3 className="font-semibold">Carry per stretch</h3>
            <p className="text-sm text-on-box-muted">Refilling every {fmtDuration(stretches.everyMin)}, {stretches.count} stretches. Restock to this at each refill.</p>
            <PackList lines={stretches.carry} waterMl={stretches.waterMl} waterLabel="per stretch" />
            <h3 className="mt-3 font-semibold">Whole session</h3>
            <PackList lines={packing} waterMl={totals.waterMl} waterLabel="in total" />
          </>
        ) : (
          <>
            <h3 className="font-semibold">Pack this</h3>
            <PackList lines={packing} waterMl={totals.waterMl} waterLabel="(carry or refill)" />
          </>
        )}
        <p className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-0.5 border-t border-box-line/60 pt-3 text-sm text-on-box-muted">
          <span>Totals:</span>
          <span><span className="text-on-box">{fmtGrams(totals.carbsG)}</span> carbs</span>
          <span><span className="text-on-box">{fmtMg(totals.sodiumMg)}</span> sodium</span>
          <span><span className="text-on-box">{fmtFluid(totals.fluidMl + totals.waterMl)}</span> fluid</span>
          {totals.caffeineMg > 0 && <span><span className="text-on-box">{fmtMg(totals.caffeineMg)}</span> caffeine</span>}
          <span>packs take {fmtFluid(totals.carryVolumeMl)}</span>
        </p>
      </div>
    </section>
  );
}
