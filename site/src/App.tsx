import { useEffect, useMemo, useState } from "react";
import FuelPackEditor from "./components/FuelPackEditor.tsx";
import PlanForm from "./components/PlanForm.tsx";
import Summary from "./components/Summary.tsx";
import TargetsBar from "./components/TargetsBar.tsx";
import ThemeToggle from "./components/ThemeToggle.tsx";
import Timeline from "./components/Timeline.tsx";
import { useLgUp } from "./components/media.ts";
import logo from "../favicon.svg";
import { relevantOptions } from "./lib/options.ts";
import { buildPlan } from "./lib/plan.ts";
import { PRESETS } from "./lib/products.ts";
import { CUSTOM_MAX, loadSettings, saveSettings, toPlanInput, type Session, type Settings } from "./lib/storage.ts";
import type { FuelPack } from "./lib/types.ts";

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  useEffect(() => saveSettings(settings), [settings]);
  const lgUp = useLgUp();

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
    <div className="mx-auto max-w-6xl px-4 pb-safe">
      <header className="flex items-center gap-3 py-5">
        <img src={logo} alt="" className="size-9" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Bento</h1>
          <p className="text-sm text-muted">Pack your fuel: carbs, fluid and sodium for rides, runs and trail runs.</p>
        </div>
        <ThemeToggle />
      </header>
      <TargetsBar plan={plan} />
      <main className="grid gap-5 pt-4 pb-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pt-0 lg:pb-6">
        <div className="flex flex-col gap-5">
          <PlanForm session={settings.session} relevant={relevant} onChange={setSession} />
          <FuelPackEditor packs={allPacks} selected={settings.selected} onToggle={toggle} onAdd={addPack} onRemove={removePack} />
        </div>
        {/* From lg up the plan stays in view beside the inputs; a long plan scrolls inside its column,
            so only there is it a tab stop, letting keyboard users scroll it. */}
        <section
          aria-label="Your plan"
          tabIndex={lgUp ? 0 : undefined}
          className="flex flex-col gap-5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto"
        >
          <Summary plan={plan} durationMin={settings.session.durationMin} />
          <Timeline events={plan.events} fuelOwed={plan.targets.carbsPerHour > 0} blocked={plan.blocked !== null} />
        </section>
      </main>
      <footer className="border-t border-hairline py-6 text-xs text-muted">
        Bento gives general guidance from sports-nutrition research, not medical advice. Test every product in training.
      </footer>
    </div>
  );
}
