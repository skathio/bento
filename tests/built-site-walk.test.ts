// What a keyboard walk through the built site showed.
//
// A number or pace field turns its input's own outline off, because the box around the input and
// its unit is what the eye reads as the field. That box must then show keyboard focus as strongly
// as every other control does: a 2 px accent outline, not only a 1 px change of border colour.

import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DEFAULT_SETTINGS, type Session } from "../site/src/lib/storage.ts";

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

let App: ComponentType | null = null;
let builtCss = "";
let out = "";

before(async () => {
  const { build, createServer } = await import("vite");
  out = mkdtempSync(join(tmpdir(), "bento-focus-"));
  await build({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
  builtCss = readdirSync(out, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(out, f), "utf8")).join("\n");
  const server = await createServer({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  App = (await server.ssrLoadModule("/src/App.tsx").finally(() => server.close())).default as ComponentType;
});

after(() => rmSync(out, { recursive: true, force: true }));

function render(session: Partial<Session>, selected: string[]): string {
  const settings = { ...DEFAULT_SETTINGS, session: { ...DEFAULT_SETTINGS.session, ...session }, selected };
  const g = globalThis as { window?: unknown };
  const saved = g.window;
  g.window = { localStorage: { getItem: (k: string) => (k === "bento.settings.v1" ? JSON.stringify(settings) : null), setItem: () => undefined, removeItem: () => undefined } };
  try {
    return renderToStaticMarkup(createElement(App!));
  } finally {
    g.window = saved;
  }
}

/** The class list of the box around each input that turns its own outline off. */
function boxes(page: string): string[][] {
  const found = [...page.matchAll(/<span class="([^"]*)">\s*<input\b[^>]*\bclass="[^"]*\boutline-none\b[^"]*"/g)];
  return found.map((m) => m[1]!.split(/\s+/));
}

// Bike shows the number fields; a long run with a caffeinated pack shows a pace field.
const pages = () => [render({}, DEFAULT_SETTINGS.selected), render({ discipline: "run-road", effort: "run-steady", durationMin: 240 }, ["gel-caf", ...DEFAULT_SETTINGS.selected])];

test("every field that turns its input's outline off sits in a box", () => {
  const [bike, run] = pages();
  assert.ok(boxes(bike!).length >= 7, "duration, temperature, power, body weight, humidity, sweat rate, refill");
  assert.ok(run!.includes('placeholder="m:ss"'), "the run page shows a pace field");
  const inputs = (page: string) => (page.match(/<input\b[^>]*\boutline-none\b/g) ?? []).length;
  for (const page of [bike!, run!]) assert.equal(boxes(page).length, inputs(page));
});

test("each such box shows keyboard focus as a 2 px accent outline set off from the box", () => {
  const WANT = ["focus-within:outline-2", "focus-within:outline-offset-2", "focus-within:outline-accent"];
  const weak = pages().flatMap(boxes).filter((cls) => !WANT.every((w) => cls.includes(w)));
  assert.deepEqual(weak.map((cls) => cls.join(" ")), []);
});

test("the built CSS gives that outline a 2 px width, a style and the accent colour on :focus-within", () => {
  const rule = (name: string) => new RegExp(`\\.focus-within\\\\:${name}:focus-within\\s*{([^}]*)}`).exec(builtCss)?.[1] ?? "";
  assert.match(rule("outline-2"), /outline-width:\s*2px/);
  assert.match(rule("outline-2"), /outline-style:\s*(var\(--tw-outline-style\)|solid)/);
  assert.match(rule("outline-offset-2"), /outline-offset:\s*2px/);
  assert.match(rule("outline-accent"), /outline-color:\s*var\(--color-accent\)/);
});
