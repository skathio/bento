import { useEffect, useMemo, useState } from "react";
import Advice from "./components/Advice.tsx";
import FuelPackEditor from "./components/FuelPackEditor.tsx";
import PlanForm from "./components/PlanForm.tsx";
import Summary from "./components/Summary.tsx";
import TargetsBar from "./components/TargetsBar.tsx";
import ThemeToggle from "./components/ThemeToggle.tsx";
import Timeline from "./components/Timeline.tsx";
import logo from "../favicon.svg";
import { relevantOptions } from "./lib/options.ts";
import { buildPlan } from "./lib/plan.ts";
import { PRESETS } from "./lib/products.ts";
import { CUSTOM_MAX, loadSettings, saveSettings, toPlanInput, type Session, type Settings } from "./lib/storage.ts";
import type { FuelPack } from "./lib/types.ts";

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  useEffect(() => saveSettings(settings), [settings]);

  const allPacks = useMemo(() => [...PRESETS, ...settings.custom], [settings.custom]);
  const { plan, relevant } = useMemo(() => {
    const packs = allPacks.filter((p) => settings.selected.includes(p.id));
    const input = toPlanInput(settings.session, packs);
    return { plan: buildPlan(input), relevant: relevantOptions(input, packs) };
  }, [allPacks, settings.selected, settings.session]);

  const setSession = (patch: Partial<Session>) => setSettings((s) => ({ ...s, session: { ...s.session, ...patch } }));
  const toggle = (id: string) =>
    setSettings((s) => ({ ...s, selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] }));
  const addPack = (p: FuelPack) =>
    setSettings((s) => (s.custom.length >= CUSTOM_MAX ? s : { ...s, custom: [...s.custom, p], selected: [...s.selected, p.id] }));
  const removePack = (id: string) =>
    setSettings((s) => ({ ...s, custom: s.custom.filter((p) => p.id !== id), selected: s.selected.filter((x) => x !== id) }));

  return (
    <div className="mx-auto max-w-6xl px-4 pb-safe lg:px-8">
      <header className="flex items-center gap-3 py-4 lg:py-6">
        <img src={logo} alt="" className="size-10" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl leading-tight font-bold tracking-tight">Bento</h1>
          <p className="text-sm text-muted">Fuel, fluid and sodium for rides and runs.</p>
        </div>
        <ThemeToggle />
      </header>
      <TargetsBar plan={plan} />
      <main className="grid gap-10 pt-6 pb-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12 lg:pt-2">
        <div className="flex flex-col gap-10">
          <PlanForm session={settings.session} relevant={relevant} onChange={setSession} />
          <FuelPackEditor packs={allPacks} selected={settings.selected} onToggle={toggle} onAdd={addPack} onRemove={removePack} />
        </div>
        <div aria-label="Your plan" role="region" className="flex flex-col gap-10">
          {/* From lg up (on screens tall enough to hold it) the lacquer panel sticks while the inputs
              scroll; the timeline and notes flow with the page, so nothing scrolls in a box. The
              backing strip above it keeps scrolled text from showing through the gap. */}
          <div className="lg:[@media(min-height:46rem)]:sticky lg:[@media(min-height:46rem)]:top-0 lg:[@media(min-height:46rem)]:z-10 lg:-mt-4 lg:bg-bg lg:pt-4">
            <Summary plan={plan} durationMin={settings.session.durationMin} />
          </div>
          <Advice notes={plan.notes} />
          <Timeline events={plan.events} fuelOwed={plan.targets.carbsPerHour > 0} blocked={plan.blocked !== null} />
        </div>
      </main>
      <footer className="border-t border-hairline py-6 text-sm text-muted">
        Bento gives general guidance from sports-nutrition research, not medical advice. Test every product in training.
      </footer>
    </div>
  );
}
