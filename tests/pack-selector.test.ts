// The compact pack selector: one list where each pack is a single row whose label is the whole row,
// so a tap anywhere on the pack toggles it, with its facts as separate items and no per-kind headings.
// FuelPackEditor is rendered through Vite's SSR loader, so no browser or test dependency is needed.
import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PRESETS } from "../site/src/lib/products.ts";
import type { FuelPack } from "../site/src/lib/types.ts";

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

interface Props { packs: FuelPack[]; selected: string[]; onToggle: () => void; onAdd: () => void; onRemove: () => void }
let Editor: ComponentType<Props> | null = null;

before(async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    Editor = (await server.ssrLoadModule("/src/components/FuelPackEditor.tsx")).default as ComponentType<Props>;
  } finally {
    await server.close();
  }
});

const MINE: FuelPack = { id: "custom-oat-square", name: "Oat square", kind: "solid", carbsG: 53, sodiumMg: 235, caffeineMg: 15, fluidMl: 20, volumeMl: 80 };
const noop = () => undefined;

function render(packs: FuelPack[] = [...PRESETS, MINE]): string {
  assert.ok(Editor, "the FuelPackEditor module loaded");
  return renderToStaticMarkup(createElement(Editor, { packs, selected: [], onToggle: noop, onAdd: noop, onRemove: noop }));
}

/** The pack list: everything before the "Add your own pack" disclosure. */
const listOf = (html: string) => html.slice(0, html.indexOf("<details"));
const rows = (html: string) => listOf(html).split("<li").slice(1);
const labelOf = (row: string) => row.slice(row.indexOf("<label"), row.indexOf("</label>"));

test("each pack is one row whose label holds its toggle, name and facts", () => {
  const html = render();
  const packs = [...PRESETS, MINE];
  assert.equal(rows(html).length, packs.length, "one row per pack");
  for (const pack of packs) {
    const row = rows(html).find((r) => r.includes(`aria-label="Carry ${pack.name}"`));
    assert.ok(row, `a row for ${pack.name}`);
    const label = labelOf(row);
    assert.ok(label.includes('type="checkbox"'), `${pack.name}: the toggle is inside the row's label`);
    assert.ok(label.includes(`>${pack.name}<`), `${pack.name}: the name is inside the label`);
    assert.ok(label.includes(`>${pack.carbsG} g carbs<`) && label.includes(`>${pack.sodiumMg} mg sodium<`), `${pack.name}: the facts are inside the label`);
  }
});

test("Remove sits beside the row's label, not inside it, so removing never toggles", () => {
  const row = rows(render()).find((r) => r.includes(`Carry ${MINE.name}`));
  assert.ok(row);
  assert.ok(row.includes(">Remove</button>"));
  assert.ok(!labelOf(row).includes("<button"), "no button inside the label");
});

test("the list has no per-kind headings, no uppercase labels and no middle-dot separators", () => {
  const list = listOf(render());
  assert.equal((list.match(/<ul/g) ?? []).length, 1, "one list for every pack");
  assert.ok(!/<h3/.test(list), "no per-kind headings");
  assert.ok(!/\buppercase\b/.test(list), "no uppercase labels");
  assert.ok(!list.includes("·"), "no middle dots between facts");
});

test("packs are listed by kind: gels, then solids, then drinks, custom packs with their kind", () => {
  const order = rows(render()).map((r) => /aria-label="Carry ([^"]+)"/.exec(r)?.[1]);
  const kinds = order.map((name) => [...PRESETS, MINE].find((p) => p.name === name)?.kind);
  assert.deepEqual(kinds, [...kinds].sort((a, b) => ["gel", "solid", "drink"].indexOf(a!) - ["gel", "solid", "drink"].indexOf(b!)));
  assert.ok(order.indexOf(MINE.name) < order.indexOf(PRESETS.find((p) => p.kind === "drink")!.name), "a custom solid sits with the solids");
});
