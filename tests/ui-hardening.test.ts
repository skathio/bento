// Defences around the reworked UI: the per-hour target strings shared by the summary and the phone's
// targets bar, and CLAUDE.md's architecture list naming every component and test file. Components load through Vite's SSR loader.
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Targets } from "../site/src/lib/types.ts";

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

type TargetValues = (t: Targets) => { carbs: string; fluid: string; sodium: string };

let targetValues: TargetValues | null = null;
let Measure: ComponentType<{ value: string }> | null = null;

before(async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const ui = await server.ssrLoadModule("/src/components/ui.tsx");
    targetValues = ui.targetValues as TargetValues;
    Measure = ui.Measure as ComponentType<{ value: string }>;
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

// ---- Measure: the unit set smaller than the number ----------------------------------------

const measure = (value: string) => {
  assert.ok(Measure, "Measure loaded");
  return renderToStaticMarkup(createElement(Measure, { value }));
};

test("Measure sets each per-hour or caffeine unit in its own smaller span, after the number", () => {
  for (const [value, num, unit] of [["1000 mg/h", "1000", "mg/h"], ["70 g/h", "70", "g/h"], ["500 ml/h", "500", "ml/h"], ["1.25 L/h", "1.25", "L/h"], ["≤ 400 mg", "≤ 400", "mg"]]) {
    const html = measure(value!);
    assert.match(html, new RegExp(`^${num!.replace(".", "\\.")}<span class="[^"]*text-\\[0\\.6em\\][^"]*">${unit!.replace("/", "\\/")}</span>$`), html);
  }
});

test("Measure leaves a target with no unit as plain text, and never drops characters", () => {
  for (const value of ["Optional", "To thirst", "None", "", "mg/h", "1000mg/h"]) assert.equal(measure(value), value.replace("&", "&amp;"));
  assert.equal(measure("1000 mg/h").replace(/<[^>]+>/g, ""), "1000mg/h", "the number and unit both reach the page");
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
