import { useEffect, useMemo, useState } from "react";
import FuelPackEditor from "./components/FuelPackEditor.tsx";
import PlanForm from "./components/PlanForm.tsx";
import Summary from "./components/Summary.tsx";
import ThemeToggle from "./components/ThemeToggle.tsx";
import Timeline from "./components/Timeline.tsx";
import logo from "../favicon.svg";
import { buildPlan } from "./lib/plan.ts";
import { PRESETS } from "./lib/products.ts";
import { CUSTOM_MAX, loadSettings, saveSettings, toPlanInput, type Session, type Settings } from "./lib/storage.ts";
import type { FuelPack } from "./lib/types.ts";

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  useEffect(() => saveSettings(settings), [settings]);

  const allPacks = useMemo(() => [...PRESETS, ...settings.custom], [settings.custom]);
  const plan = useMemo(() => {
    const packs = allPacks.filter((p) => settings.selected.includes(p.id));
    return buildPlan(toPlanInput(settings.session, packs));
  }, [allPacks, settings.selected, settings.session]);

  const setSession = (patch: Partial<Session>) => setSettings((s) => ({ ...s, session: { ...s.session, ...patch } }));
  const toggle = (id: string) =>
    setSettings((s) => ({ ...s, selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] }));
  const addPack = (p: FuelPack) =>
    setSettings((s) => (s.custom.length >= CUSTOM_MAX ? s : { ...s, custom: [...s.custom, p], selected: [...s.selected, p.id] }));
  const removePack = (id: string) =>
    setSettings((s) => ({ ...s, custom: s.custom.filter((p) => p.id !== id), selected: s.selected.filter((x) => x !== id) }));

  return (
    <div className="mx-auto max-w-6xl px-4 pb-safe">
      <header className="flex items-center gap-3 py-5">
        <img src={logo} alt="" className="size-9" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Bento</h1>
          <p className="text-sm text-muted">Pack your fuel: carbs, fluid and sodium for rides, runs and trail runs.</p>
        </div>
        <ThemeToggle />
      </header>
      <main className="grid gap-5 pb-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-5">
          <PlanForm session={settings.session} onChange={setSession} />
          <FuelPackEditor packs={allPacks} selected={settings.selected} onToggle={toggle} onAdd={addPack} onRemove={removePack} />
        </div>
        <div className="flex flex-col gap-5">
          <Summary plan={plan} durationMin={settings.session.durationMin} />
          <Timeline events={plan.events} fuelOwed={plan.targets.carbsPerHour > 0} />
        </div>
      </main>
      <footer className="border-t border-line py-6 text-xs text-muted">
        Bento gives general guidance from sports-nutrition research, not medical advice. Test every product in training.
      </footer>
    </div>
  );
}
