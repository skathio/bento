// The compact fuel-pack selector of the UI rework. Every preset and custom pack is a toggle that
// shows its name and kind, with its facts on the pack, and "Add your own pack" starts collapsed.
// The custom-pack validation and the CUSTOM_MAX limit behave as they do today. The real App is
// rendered through Vite's SSR loader from stored settings, so no browser or test dependency is needed.
import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { fmtFluid } from "../site/src/lib/format.ts";
import { KIND_LABEL, NAME_MAX, PRESETS, validatePack } from "../site/src/lib/products.ts";
import { CUSTOM_MAX, DEFAULT_SETTINGS, loadSettings } from "../site/src/lib/storage.ts";
import { PACK_KINDS, type FuelPack } from "../site/src/lib/types.ts";

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

// ---- a minimal tree of React's static markup -------------------------------------------------

interface Node { tag: string; attrs: Map<string, string>; kids: Node[]; text: string; parent: Node | null }

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#39": "'", nbsp: " " };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#x27|#39|nbsp);/g, (_, e: string) => ENTITY[e] ?? "");
const EMPTY_TAGS = new Set(["br", "hr", "img", "input", "link", "meta", "source", "wbr"]);
const PIECE = /<\/[a-z][\w-]*\s*>|<([a-z][\w-]*)((?:\s+[^\s=/>]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;

function attrsOf(source: string): Map<string, string> {
  return new Map([...source.matchAll(/([^\s=/>]+)(?:="([^"]*)")?/g)].map((m) => [m[1]!.toLowerCase(), unescape(m[2] ?? "")]));
}

function addTag(m: RegExpMatchArray, parent: Node): Node {
  const node: Node = { tag: m[1]!.toLowerCase(), attrs: attrsOf(m[2] ?? ""), kids: [], text: "", parent };
  parent.kids.push(node);
  return EMPTY_TAGS.has(node.tag) || m[3] === "/" ? parent : node;
}

function tree(markup: string): Node {
  const root: Node = { tag: "#root", attrs: new Map(), kids: [], text: "", parent: null };
  let at = root;
  for (const m of markup.replace(/<!--[\s\S]*?-->/g, "").matchAll(PIECE)) {
    if (m[0].startsWith("</")) at = at.parent ?? root;
    else if (m[1]) at = addTag(m, at);
    else at.kids.push({ tag: "#text", attrs: new Map(), kids: [], text: unescape(m[4] ?? ""), parent: at });
  }
  return root;
}

const all = (n: Node): Node[] => [n, ...n.kids.flatMap(all)];
const textOf = (n: Node): string => all(n).filter((k) => k.tag === "#text").map((k) => k.text).join(" ").replace(/\s+/g, " ").trim();
const ancestors = (n: Node): Node[] => (n.parent ? [n.parent, ...ancestors(n.parent)] : []);
const holds = (outer: Node, inner: Node) => outer === inner || ancestors(inner).includes(outer);

function roleOf(n: Node): string {
  const implicit = n.tag === "input" ? n.attrs.get("type") ?? "textbox" : n.tag;
  return n.attrs.get("role") ?? implicit;
}

/** aria-label, aria-labelledby, an enclosing label, label[for], or the element's own text. */
function nameOf(n: Node, root: Node): string {
  const label = n.attrs.get("aria-label");
  if (label) return label;
  const ids = (n.attrs.get("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const id = n.attrs.get("id");
  const named = all(root).filter((k) => ids.includes(k.attrs.get("id") ?? "") || (k.tag === "label" && id !== undefined && k.attrs.get("for") === id));
  const sources = [...named, ...ancestors(n).filter((k) => k.tag === "label")];
  return sources.length ? sources.map(textOf).join(" ").trim() : textOf(n);
}

const isOn = (n: Node) => n.attrs.has("checked") || n.attrs.get("aria-checked") === "true";

// ---- rendering the App from stored settings ----------------------------------------------------

let App: ComponentType | null = null;

before(async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    App = (await server.ssrLoadModule("/src/App.tsx")).default as ComponentType;
  } finally {
    await server.close();
  }
});

interface Page { root: Node; packs: FuelPack[]; selected: string[] }

function render(custom: FuelPack[] = [], selected: string[] = DEFAULT_SETTINGS.selected): Page {
  const store: Record<string, string> = { "bento.settings.v1": JSON.stringify({ session: DEFAULT_SETTINGS.session, selected, custom }) };
  const g = globalThis as { window?: unknown };
  const saved = g.window;
  g.window = { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: () => undefined, removeItem: () => undefined } };
  try {
    assert.ok(App, "the App module loaded");
    const root = tree(renderToStaticMarkup(createElement(App)));
    const loaded = loadSettings();
    return { root, packs: [...PRESETS, ...loaded.custom], selected: loaded.selected };
  } finally {
    g.window = saved;
  }
}

const toggles = (page: Page) => all(page.root).filter((n) => roleOf(n) === "checkbox");

/** The one toggle named after the pack (the shortest name that holds it, as one name can hold another). */
function toggleFor(page: Page, pack: FuelPack): Node {
  const hits = toggles(page).filter((n) => nameOf(n, page.root).includes(pack.name));
  hits.sort((a, b) => nameOf(a, page.root).length - nameOf(b, page.root).length);
  assert.ok(hits[0], `a toggle named after "${pack.name}"`);
  return hits[0];
}

/** The pack's chip or row: the outermost element around its toggle that holds no other pack's toggle. */
function packEl(page: Page, pack: FuelPack): Node {
  const own = toggleFor(page, pack);
  const others = toggles(page).filter((n) => n !== own);
  const lone = ancestors(own).filter((a) => a.tag !== "#root" && !others.some((o) => holds(a, o)));
  return lone.at(-1) ?? own;
}

const addSummary = (page: Page) => all(page.root).find((n) => n.tag === "summary" && textOf(n).includes("Add your own pack"));

const num = (n: number) => new RegExp(`(^|[^\\d.])${n}([^\\d]|$)`);
const kindShown = (text: string, pack: FuelPack) => new RegExp(`\\b(${KIND_LABEL[pack.kind]}|${pack.kind})s?\\b`, "i").test(text);

function custom(name: string, kind: FuelPack["kind"], facts: Partial<FuelPack> = {}): FuelPack {
  const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return { id, name, kind, carbsG: 30, sodiumMg: 120, caffeineMg: 0, fluidMl: kind === "drink" ? 450 : 0, volumeMl: 80, ...facts };
}

// One custom pack of each kind, with facts that no preset shares, and every fact above zero.
const MINE: FuelPack[] = [
  custom("Zest goo", "gel", { carbsG: 37, sodiumMg: 415, caffeineMg: 65, fluidMl: 330 }),
  custom("Oat square", "solid", { carbsG: 53, sodiumMg: 235, caffeineMg: 15, fluidMl: 20 }),
  custom("Fizz bottle", "drink", { carbsG: 61, sodiumMg: 615, caffeineMg: 35, fluidMl: 1500 }),
];

/** `count` valid custom packs with distinct names and ids. */
const many = (count: number) => Array.from({ length: count }, (_, i) => custom(`Pack no ${i + 1}x`, PACK_KINDS[i % PACK_KINDS.length]!, { fluidMl: 300 }));

// ---- each pack is a toggle with its name and kind ----------------------------------------------

test("every preset pack is a toggle named after it, with its name and kind on the pack", () => {
  const page = render();
  for (const pack of PRESETS) {
    const text = textOf(packEl(page, pack));
    assert.ok(text.includes(pack.name), `"${text}" shows the name ${pack.name}`);
    assert.ok(kindShown(text, pack), `"${text}" shows the kind ${pack.kind}`);
  }
});

test("every custom pack is a toggle named after it, with its name and kind on the pack", () => {
  const page = render(MINE, []);
  for (const pack of MINE) {
    const text = textOf(packEl(page, pack));
    assert.ok(text.includes(pack.name), `"${text}" shows the name ${pack.name}`);
    assert.ok(kindShown(text, pack), `"${text}" shows the kind ${pack.kind}`);
  }
});

test("each pack has exactly one toggle of its own", () => {
  const page = render(MINE);
  assert.equal(toggles(page).length >= PRESETS.length + MINE.length, true);
  const own = page.packs.map((p) => toggleFor(page, p));
  assert.equal(new Set(own).size, page.packs.length, "no two packs share a toggle");
});

test("a pack's toggle is on exactly when the pack is carried: none, one, some, all", () => {
  const everyId = [...PRESETS, ...MINE].map((p) => p.id);
  for (const selected of [[], [PRESETS[0]!.id], [MINE[0]!.id], DEFAULT_SETTINGS.selected, everyId]) {
    const page = render(MINE, selected);
    const wrong = page.packs.filter((p) => isOn(toggleFor(page, p)) !== page.selected.includes(p.id)).map((p) => p.id);
    assert.deepEqual(wrong, [], `carrying [${selected.join(", ")}]`);
  }
});

// ---- the facts are on the pack -----------------------------------------------------------------

function missingFacts(page: Page, pack: FuelPack): string[] {
  const text = textOf(packEl(page, pack));
  const fluid = pack.fluidMl > 0 && !(text.includes(fmtFluid(pack.fluidMl)) || num(pack.fluidMl).test(text));
  const wanted = [["carbs", pack.carbsG], ["sodium", pack.sodiumMg], ["caffeine", pack.caffeineMg]] as const;
  const absent = wanted.filter(([, v]) => v > 0 && !num(v).test(text)).map(([k]) => k);
  return [...absent, ...(fluid ? ["fluid"] : [])].map((k) => `${pack.name}: ${k}`);
}

test("each preset pack carries its facts: carbs, sodium, and caffeine and fluid where it has them", () => {
  const page = render();
  assert.deepEqual(PRESETS.flatMap((p) => missingFacts(page, p)), []);
});

test("each custom pack carries its carbs, sodium, caffeine and fluid", () => {
  for (const selected of [[], MINE.map((p) => p.id)]) {
    const page = render(MINE, selected);
    assert.deepEqual(MINE.flatMap((p) => missingFacts(page, p)), [], "carried or not");
  }
});

test("a pack's facts sit on its own pack, not on another's", () => {
  const page = render(MINE);
  for (const pack of MINE) {
    const others = MINE.filter((p) => p !== pack);
    const text = textOf(packEl(page, pack));
    assert.deepEqual(others.filter((o) => text.includes(o.name)).map((o) => o.name), [], `${pack.name} holds no other pack`);
  }
});

// ---- custom packs and the CUSTOM_MAX limit -------------------------------------------------------

test("CUSTOM_MAX is still 50 and NAME_MAX still 60", () => {
  assert.equal(CUSTOM_MAX, 50);
  assert.equal(NAME_MAX, 60);
});

test("the list shows no custom pack, one, CUSTOM_MAX - 1 and CUSTOM_MAX, and stored packs past CUSTOM_MAX are dropped", () => {
  for (const [stored, shown] of [[0, 0], [1, 1], [CUSTOM_MAX - 1, CUSTOM_MAX - 1], [CUSTOM_MAX, CUSTOM_MAX], [CUSTOM_MAX + 1, CUSTOM_MAX]] as const) {
    const page = render(many(stored), []);
    assert.equal(page.packs.length, PRESETS.length + shown);
    for (const pack of page.packs) assert.ok(toggleFor(page, pack), pack.name);
  }
});

test("only custom packs can be removed, each from its own pack", () => {
  const page = render(MINE);
  const removable = (pack: FuelPack) => all(packEl(page, pack)).some((n) => roleOf(n) === "button" && /remove/i.test(nameOf(n, page.root)));
  assert.deepEqual(MINE.filter((p) => !removable(p)).map((p) => p.name), [], "every custom pack has a Remove button");
  assert.deepEqual(PRESETS.filter(removable).map((p) => p.name), [], "no preset has one");
});

test("a custom pack with a name of NAME_MAX characters is listed under its full name", () => {
  const long = custom(`L${"o".repeat(NAME_MAX - 2)}g`, "solid");
  assert.equal(long.name.length, NAME_MAX);
  assert.deepEqual(validatePack(long), []);
  const page = render([long]);
  assert.ok(nameOf(toggleFor(page, long), page.root).includes(long.name));
});

// ---- "Add your own pack" -----------------------------------------------------------------------

test('"Add your own pack" is collapsed by default, with no custom pack, one, and CUSTOM_MAX', () => {
  for (const mine of [[], MINE.slice(0, 1), many(CUSTOM_MAX)]) {
    const summary = addSummary(render(mine));
    assert.ok(summary && summary.parent?.tag === "details", 'a disclosure named "Add your own pack"');
    assert.equal(summary.parent.attrs.has("open"), false);
  }
});

function addField(page: Page, name: string): Node {
  const box = addSummary(page)?.parent;
  assert.ok(box, 'the "Add your own pack" disclosure');
  const hit = all(box).find((n) => ["input", "select", "textarea"].includes(n.tag) && nameOf(n, page.root).startsWith(name));
  assert.ok(hit, `a ${name} field in "Add your own pack"`);
  return hit;
}

test("the add form keeps its fields, defaults and name limit", () => {
  const page = render();
  assert.equal(addField(page, "Name").attrs.get("maxlength"), String(NAME_MAX));
  const defaults = [["Carbs", "25"], ["Sodium", "50"], ["Caffeine", "0"], ["Fluid", "0"], ["Pack volume", "40"]] as const;
  for (const [name, value] of defaults) {
    const input = addField(page, name);
    assert.equal(input.attrs.get("type"), "number", name);
    assert.equal(input.attrs.get("value"), value, name);
  }
});

test("the add form keeps its Kind choice: gel, solid or drink, gel first picked", () => {
  const page = render();
  const box = addSummary(page)?.parent;
  assert.ok(box);
  const group = all(box).find((n) => roleOf(n) === "radiogroup" && nameOf(n, page.root).startsWith("Kind"));
  assert.ok(group, "a Kind radio group");
  const radios = all(group).filter((n) => roleOf(n) === "radio");
  assert.deepEqual(radios.map((r) => nameOf(r, page.root).toLowerCase()), PACK_KINDS.map((k) => KIND_LABEL[k].toLowerCase()));
  assert.deepEqual(radios.filter(isOn).map((r) => nameOf(r, page.root).toLowerCase()), ["gel"]);
});

// ---- the custom-pack validation is unchanged ---------------------------------------------------

const GEL = { name: "My gel", kind: "gel", carbsG: 25, sodiumMg: 50, caffeineMg: 0, fluidMl: 0, volumeMl: 40 } as const;
const LIMITS = { carbsG: 200, sodiumMg: 3000, caffeineMg: 400, fluidMl: 2000, volumeMl: 2000 } as const;

test("each number field is accepted at 0 and at its limit, and rejected just past either end or when empty", () => {
  for (const [field, max] of Object.entries(LIMITS)) {
    const message = `${field} must be 0-${max}.`;
    for (const ok of [0, max]) assert.ok(!validatePack({ ...GEL, kind: "drink", carbsG: 25, fluidMl: 500, [field]: ok }).includes(message), `${field} = ${ok}`);
    for (const bad of [-1, max + 1, Number.NaN]) assert.ok(validatePack({ ...GEL, [field]: bad }).includes(message), `${field} = ${bad}`);
  }
});

test("the name is required and kept to NAME_MAX characters", () => {
  assert.deepEqual(validatePack({ ...GEL, name: "n".repeat(NAME_MAX) }), []);
  assert.deepEqual(validatePack({ ...GEL, name: "n".repeat(NAME_MAX + 1) }), [`Keep the name to ${NAME_MAX} characters.`]);
  assert.deepEqual(validatePack({ ...GEL, name: "  " }), ["Give the pack a name."]);
});

test("a drink needs its fluid, and every pack needs carbs or fluid", () => {
  assert.ok(validatePack({ ...GEL, kind: "drink" }).includes("A drink needs its fluid volume."));
  assert.ok(validatePack({ ...GEL, carbsG: 0 }).includes("A pack needs carbs or fluid."));
  assert.deepEqual(validatePack({ ...GEL, kind: "drink", carbsG: 0, fluidMl: 1 }), []);
});

// ---- the project's conventions ---------------------------------------------------------------

test("the pack selector carries no inline style attribute", () => {
  for (const page of [render(), render(MINE, []), render(many(CUSTOM_MAX))]) {
    assert.deepEqual(all(page.root).filter((n) => n.attrs.has("style")).map((n) => n.tag), []);
  }
});
