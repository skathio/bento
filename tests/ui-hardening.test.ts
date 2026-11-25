// Defences around the reworked UI: the per-hour target strings shared by the summary and the phone's
// targets bar, the plan column being a tab stop only where it scrolls (lg and wider), and CLAUDE.md's
// architecture list naming every component and test file. Components load through Vite's SSR loader.
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Targets } from "../site/src/lib/types.ts";

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

type TargetValues = (t: Targets) => { carbs: string; fluid: string; sodium: string };
interface Media { LG_UP: string; isLgUp: () => boolean; onLgUpChange: (cb: () => void) => () => void }

let targetValues: TargetValues | null = null;
let media: Media | null = null;
let App: ComponentType | null = null;

before(async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    targetValues = (await server.ssrLoadModule("/src/components/ui.tsx")).targetValues as TargetValues;
    media = (await server.ssrLoadModule("/src/components/media.ts")) as unknown as Media;
    App = (await server.ssrLoadModule("/src/App.tsx")).default as ComponentType;
  } finally {
    await server.close();
  }
});

// ---- targetValues --------------------------------------------------------------------------

const BASE: Targets = {
  carbsPerHour: 60, carbBand: [50, 70], fluidMlPerHour: 600, sweatRateLh: 0.8, sodiumMgPerHour: 500,
  caffeineCapMg: 200, ratio: null, fluidPlanned: true, sodiumNeeded: true,
} as Targets;
const values = (patch: Partial<Targets> = {}) => {
  assert.ok(targetValues, "targetValues loaded");
  return targetValues({ ...BASE, ...patch });
};

test("targetValues shows each per-hour target with its unit", () => {
  assert.deepEqual(values(), { carbs: "60 g/h", fluid: "600 ml/h", sodium: "500 mg/h" });
});

test("targetValues words the empty targets instead of printing zero", () => {
  assert.equal(values({ carbsPerHour: 0 }).carbs, "None");
  assert.equal(values({ fluidMlPerHour: 0 }).fluid, "To thirst");
  assert.equal(values({ sodiumNeeded: false }).sodium, "Optional");
});

test("targetValues keeps the smallest positive amounts and formats a litre or more in L", () => {
  assert.equal(values({ carbsPerHour: 1 }).carbs, "1 g/h");
  assert.equal(values({ fluidMlPerHour: 1 }).fluid, "1 ml/h");
  assert.equal(values({ fluidMlPerHour: 999 }).fluid, "999 ml/h");
  assert.equal(values({ fluidMlPerHour: 1000 }).fluid, "1 L/h");
  assert.equal(values({ fluidMlPerHour: 1250 }).fluid, "1.3 L/h");
});

test("targetValues shows sodium whenever it is needed, even at zero mg, and hides the number when optional", () => {
  assert.equal(values({ sodiumMgPerHour: 0 }).sodium, "0 mg/h");
  assert.equal(values({ sodiumMgPerHour: 900, sodiumNeeded: false }).sodium, "Optional");
});

// ---- the plan column is a tab stop only at lg and wider ------------------------------------

type Listener = () => void;
function stubWindow(matches: boolean) {
  const listeners = new Set<Listener>();
  const queries: string[] = [];
  const mql = {
    get matches() { return matches; },
    addEventListener: (type: string, cb: Listener) => { assert.equal(type, "change"); listeners.add(cb); },
    removeEventListener: (type: string, cb: Listener) => { assert.equal(type, "change"); listeners.delete(cb); },
  };
  const win = { matchMedia: (q: string) => { queries.push(q); return mql; } };
  return { win, listeners, queries, set: (m: boolean) => { matches = m; } };
}

function withWindow<T>(win: unknown, run: () => T): T {
  const g = globalThis as { window?: unknown };
  const saved = g.window;
  g.window = win;
  try {
    return run();
  } finally {
    g.window = saved;
  }
}

test("the lg query is the 64rem breakpoint the plan column turns sticky at", () => {
  assert.ok(media, "media module loaded");
  assert.equal(media.LG_UP, "(min-width: 64rem)");
});

test("isLgUp follows matchMedia on the lg query", () => {
  assert.ok(media);
  const wide = stubWindow(true);
  assert.equal(withWindow(wide.win, () => media!.isLgUp()), true);
  assert.deepEqual(wide.queries, ["(min-width: 64rem)"]);
  const narrow = stubWindow(false);
  assert.equal(withWindow(narrow.win, () => media!.isLgUp()), false);
  narrow.set(true);
  assert.equal(withWindow(narrow.win, () => media!.isLgUp()), true, "it reads the current match, not a cached one");
});

test("onLgUpChange subscribes to the query's change event and its cleanup unsubscribes", () => {
  assert.ok(media);
  const s = stubWindow(false);
  let calls = 0;
  const stop = withWindow(s.win, () => media!.onLgUpChange(() => { calls += 1; }));
  assert.equal(s.listeners.size, 1);
  for (const cb of s.listeners) cb();
  assert.equal(calls, 1);
  withWindow(s.win, stop);
  assert.equal(s.listeners.size, 0);
});

const planSection = (html: string) => {
  const m = /<section[^>]*aria-label="Your plan"[^>]*>/.exec(html);
  assert.ok(m, "the plan section renders");
  return m[0];
};

test("the plan section renders with no tabindex before the width is known (server snapshot: narrow)", () => {
  assert.ok(App, "App loaded");
  // Even with a wide window, the server render takes the server snapshot, so the markup is the phone's.
  const html = withWindow(stubWindow(true).win, () => renderToStaticMarkup(createElement(App!)));
  assert.doesNotMatch(planSection(html), /tabindex/i);
});

// ---- CLAUDE.md names every component and test file -----------------------------------------

test("CLAUDE.md's architecture list names every component and every render or built-site test", () => {
  const doc = readFileSync(repo("CLAUDE.md"), "utf8");
  const arch = /## Architecture\s*```([\s\S]*?)```/.exec(doc)?.[1] ?? "";
  const componentsLine = arch.slice(arch.indexOf("src/components/"), arch.indexOf("src/lib/"));
  const components = readdirSync(repo("site/src/components")).filter((f) => f.endsWith(".tsx")).map((f) => f.replace(/\.tsx$/, ""));
  assert.deepEqual(components.filter((c) => !new RegExp(`\\b${c}\\b`).test(componentsLine)), [], "components missing from CLAUDE.md");
  const testsBlock = arch.slice(arch.indexOf("tests/"), arch.indexOf("docs/"));
  const named = ["accessibility", "layout", "typeface-tokens", "built-site-walk", "design-decisions", "pack-selector", "fuel-packs"];
  assert.deepEqual(named.filter((t) => !testsBlock.includes(t)), [], "test files missing from CLAUDE.md");
});
