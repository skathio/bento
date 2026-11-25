// Accessibility and motion across every control and both themes. On a 390 px phone every control
// has a touch target of at least 44 x 44 px and a visible keyboard focus, and keeps the role and
// accessible name it has today. Text, focus indicators and control boundaries meet WCAG 2.2 AA in
// light and dark. Nothing scrolls sideways at 390 px, even with the longest pack name allowed.
// Motion only answers the user and stops under reduced motion, and every font stack falls back
// to a generic family. The real App is rendered through Vite's SSR loader and measured against
// the built stylesheet, so no browser and no test dependency is needed. Sizes are estimates from
// the CSS (a set size, or padding, border and one line of text), not a layout engine.
import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NAME_MAX, PRESETS } from "../site/src/lib/products.ts";
import { CUSTOM_MAX, DEFAULT_SETTINGS, type Session, type Settings } from "../site/src/lib/storage.ts";
import type { FuelPack } from "../site/src/lib/types.ts";

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const PHONE = 390;
const TARGET = 44;

// ---- a small HTML tree for React's static markup ----------------------------------------

interface El { tag: string; attrs: Map<string, string>; kids: (El | Txt)[]; parent: El | null }
interface Txt { text: string }
type Groups = Record<string, string | undefined>;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#39": "'", nbsp: " " };
const decode = (s = "") => s.replace(/&(amp|lt|gt|quot|#x27|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "");
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const TOKEN = /<\/(?<close>[a-z][\w-]*)\s*>|<(?<open>[a-z][\w-]*)(?<attrs>(?:\s+[^\s=/>]+(?:="[^"]*")?)*)\s*(?<self>\/?)>|(?<text>[^<]+)/gi;

/** What each markup token does to the element being filled: close it, open a child, or add text. */
const STEP: Record<string, (at: El, g: Groups) => El> = {
  close: (at) => at.parent ?? at,
  open: (at, g) => {
    const attrs = new Map([...(g.attrs ?? "").matchAll(/([^\s=/>]+)(?:="([^"]*)")?/g)].map((a) => [a[1]!.toLowerCase(), decode(a[2])]));
    const node: El = { tag: g.open!.toLowerCase(), attrs, kids: [], parent: at };
    at.kids.push(node);
    return VOID.has(node.tag) || g.self === "/" ? at : node;
  },
  text: (at, g) => {
    at.kids.push({ text: decode(g.text) });
    return at;
  },
};

function parseHtml(markup: string): El {
  const root: El = { tag: "#root", attrs: new Map(), kids: [], parent: null };
  let at = root;
  for (const m of markup.matchAll(TOKEN)) {
    const g: Groups = m.groups ?? {};
    at = STEP[Object.keys(STEP).find((k) => g[k] !== undefined)!]!(at, g);
  }
  return root;
}

const isEl = (n: El | Txt): n is El => "tag" in n;
const elements = (el: El): El[] => [el, ...el.kids.filter(isEl).flatMap(elements)];
const lineage = (el: El | null): El[] => (el ? [el, ...lineage(el.parent)] : []);
const classes = (el: El) => (el.attrs.get("class") ?? "").split(/\s+/).filter(Boolean);
const ownText = (el: El) => el.kids.filter((k): k is Txt => !isEl(k)).map((t) => t.text).join("").trim();
const shown = (k: El | Txt) => !isEl(k) || k.attrs.get("aria-hidden") !== "true";
const textOf = (el: El): string => el.kids.filter(shown).map((k) => (isEl(k) ? textOf(k) : k.text)).join(" ").replace(/\s+/g, " ").trim();
const describe = (el: El) => `<${el.tag} class="${classes(el).join(" ")}">${textOf(el).slice(0, 30)}`;

const INPUT_ROLE: Record<string, string> = { checkbox: "checkbox", radio: "radio", number: "spinbutton" };
const TAG_ROLE: Record<string, string> = { button: "button", select: "combobox", textarea: "textbox", summary: "summary", a: "link" };
const role = (el: El) => el.attrs.get("role") ?? (el.tag === "input" ? INPUT_ROLE[el.attrs.get("type") ?? ""] ?? "textbox" : TAG_ROLE[el.tag] ?? el.tag);

/** The label that activates a control: an enclosing <label>, or one that names it by id. */
const labelOf = (el: El, root: El) =>
  lineage(el).find((n) => n.tag === "label") ?? elements(root).find((n) => n.tag === "label" && n.attrs.get("for") === (el.attrs.get("id") ?? "\0"));

/** The accessible name: aria-label, aria-labelledby, or the control's label or own text. */
function accName(el: El, root: El): string {
  const ids = (el.attrs.get("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const byIds = elements(root).filter((n) => ids.includes(n.attrs.get("id") ?? "")).map(textOf).join(" ");
  return el.attrs.get("aria-label") ?? (byIds || textOf(labelOf(el, root) ?? el));
}

const FIELDS = new Set(["input", "select", "textarea"]);
const CONTROL_TAGS = new Set([...FIELDS, "button", "summary"]);
const CONTROL_ROLES = new Set(["button", "radio", "checkbox", "switch", "textbox", "spinbutton", "combobox", "link", "tab"]);
const isControl = (el: El) => CONTROL_TAGS.has(el.tag) || CONTROL_ROLES.has(el.attrs.get("role") ?? "") || (el.tag === "a" && el.attrs.has("href"));
const controls = (root: El) => elements(root).filter(isControl);

// ---- the built stylesheet, evaluated at 390 px -------------------------------------------

interface Rule { selectors: string[]; decls: Map<string, string>; media: string[]; layered: boolean; order: number }

function readDecls(body: string): Map<string, string> {
  const parts = body.split(/;(?![^(]*\))/).map((p) => /^\s*([\w-]+)\s*:([^{}]*)$/.exec(p)).filter((m) => m !== null);
  return new Map(parts.map((m) => [m[1]!.toLowerCase(), m[2]!.trim()]));
}

/** Every style rule of a flat (un-nested) stylesheet, with the @media queries and @layer around it. */
function parseCss(css: string): Rule[] {
  const rules: Rule[] = [];
  const open: string[] = [];
  for (const [, text, brace] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]*)([{}])/g)) {
    if (brace === "{") open.push(text!.split(";").at(-1)!.trim());
    else rules.push({ selectors: (open.pop() ?? "").split(/(?<!\\),/).map((s) => s.trim()), decls: readDecls(text!), media: open.filter((s) => s.startsWith("@media")), layered: open.some((s) => s.startsWith("@layer")), order: rules.length });
  }
  return rules.filter((r) => !r.selectors[0]!.startsWith("@"));
}

const COMPARE: Record<string, (a: number, b: number) => boolean> = {
  "min-width:": (a, b) => a >= b, "max-width:": (a, b) => a <= b, ">=": (a, b) => a >= b, ">": (a, b) => a > b, "<=": (a, b) => a <= b, "<": (a, b) => a < b,
};
const WIDTH_FEATURE = /\(\s*(?:width\s*)?(min-width:|max-width:|>=|<=|>|<)\s*([\d.]+)(px|r?em)\s*\)/g;

/** A query holds at `width` when its width features hold there and it has no other feature. */
const mediaHolds = (query: string, width: number) =>
  !/\(|print/.test(query.replace(WIDTH_FEATURE, (all, op: string, n: string, unit: string) => (COMPARE[op]!(width, Number(n) * (unit === "px" ? 1 : 16)) ? "" : all)));

/** The class a selector names when it is one plain class, unescaped; undefined for anything else. */
const plainClass = (selector: string) =>
  /^\.((?:\\[0-9a-f]{1,6}\s?|\\.|[\w-])+)$/i.exec(selector)?.[1]!.replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_, hex?: string, ch?: string) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch!));

let rules: Rule[] = [];
let vars = new Map<string, string>();
let builtCss = "";

/** The value `prop` takes on `el` at `width` from plain-class and tag rules (no inheritance). */
function style(el: El | null, prop: string, width = PHONE): string | undefined {
  const own = el ? classes(el) : [];
  const spec = (r: Rule) => Math.max(0, ...r.selectors.map((s) => (own.includes(plainClass(s) ?? "\0") ? 10 : Number(s === el?.tag))));
  const key = (r: Rule) => Number(/!important/.test(r.decls.get(prop)!)) * 1e9 + Number(!r.layered) * 1e8 + spec(r) * 1e6 + r.order;
  const hits = rules.filter((r) => r.decls.has(prop) && spec(r) > 0 && r.media.every((m) => mediaHolds(m, width)));
  return hits.sort((a, b) => key(a) - key(b)).at(-1)?.decls.get(prop)?.replace(/\s*!important$/, "");
}

const VAR = /var\((--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g;

/** Replaces each var(--x, fallback) with the root value of --x, or its fallback. */
function resolve(value = ""): string {
  let out = value;
  for (let i = 0; i < 8; i++) out = out.replace(VAR, (_, name: string, fallback?: string) => vars.get(name) ?? fallback ?? "");
  return out.trim();
}

const OPS: Record<string, (a: number, b: number) => number> = { "*": (a, b) => a * b, "/": (a, b) => a / b, "": (a) => a };
const LENGTH = /^(?:calc\()?\s*(-?[\d.]+)(px|rem|em)?\s*(?:([*/])\s*(-?[\d.]+)(px|rem|em)?)?\s*\)?$/;

/** A length or a one-operator calc(): its value in px (em against `em`), and whether it had a unit. */
function measure(raw: string | undefined, em = 16): { v: number; unit: boolean } | null {
  const m = LENGTH.exec(resolve(raw));
  const scale = (unit = "") => ({ px: 1, rem: 16, em } as Record<string, number>)[unit] ?? 1;
  return m && { v: OPS[m[3] ?? ""]!(Number(m[1]) * scale(m[2]), Number(m[4]) * scale(m[5])), unit: Boolean(m[2] ?? m[5]) };
}
const px = (raw: string | undefined, em = 16) => measure(raw, em)?.v ?? 0;

/** The first value set on the element or an ancestor (a stand-in for inheritance). */
const inherited = (el: El, prop: string) => lineage(el).map((n) => style(n, prop)).find((v) => v !== undefined);
const fontSize = (el: El) => px(inherited(el, "font-size")) || 16;

function lineHeight(el: El): number {
  const q = measure(inherited(el, "line-height") ?? "1.5", fontSize(el)) ?? { v: 1.5, unit: false };
  return q.unit ? q.v : q.v * fontSize(el);
}

const AXIS = { top: "block", bottom: "block", left: "inline", right: "inline" } as const;

/** Padding plus border width on one side, from the longhand, the logical pair or the shorthand. */
function edge(el: El, side: keyof typeof AXIS): number {
  const pad = style(el, `padding-${side}`) ?? style(el, `padding-${AXIS[side]}`) ?? style(el, "padding")?.split(/\s+(?![^(]*\))/)[0];
  return px(pad, fontSize(el)) + px(style(el, `border-${side}-width`) ?? style(el, `border-${AXIS[side]}-width`) ?? style(el, "border-width"));
}

const INLINE = new Set(["span", "a", "svg", "img", "input", "button", "select", "textarea", "label", "strong", "em", "b", "i", "code"]);
const display = (el: El | null) => style(el, "display") ?? (INLINE.has(el?.tag ?? "") ? "inline" : "block");
const hiddenAt = (el: El) => lineage(el).some((n) => style(n, "display") === "none" || classes(n).includes("sr-only"));
const isRow = (el: El | null) => /flex/.test(display(el)) && !/column/.test(style(el, "flex-direction") ?? "");
const HEIGHTS = ["height", "min-height", "block-size", "min-block-size"];
const WIDTHS = ["width", "min-width", "inline-size", "min-inline-size", "flex-basis"];

/** The element's height: its set size, or one line of its text (or field) plus padding and border. */
function height(el: El): number {
  const content = textOf(el) !== "" || FIELDS.has(el.tag) || el.kids.some((k) => isEl(k) && FIELDS.has(k.tag));
  const padded = Number(content) * (lineHeight(el) + edge(el, "top") + edge(el, "bottom"));
  return Math.max(padded, ...HEIGHTS.map((p) => px(style(el, p), fontSize(el))));
}

/** True when the element is at least 44 px wide: by its set width, by growing or stretching, or by its text. */
function wideEnough(el: El): boolean {
  const sized = WIDTHS.some((p) => px(style(el, p), fontSize(el)) >= TARGET || style(el, p) === "100%");
  const grows = /^(auto|1\b)/.test(style(el, "flex") ?? "") || style(el, "flex-grow") === "1";
  const free = !/start|end|center|baseline/.test(style(el, "align-self") ?? style(el.parent, "align-items") ?? "");
  const stretched = (/grid/.test(display(el.parent)) || (/flex/.test(display(el.parent)) && !isRow(el.parent))) && free;
  const block = !/flex|grid/.test(display(el.parent)) && !INLINE.has(el.tag) && display(el) !== "inline";
  const text = textOf(el).length * 0.5 * fontSize(el) + edge(el, "left") + edge(el, "right");
  return sized || (grows && isRow(el.parent)) || stretched || block || text >= TARGET;
}

/** The control and what makes up its hit area: the elements up to and including its label. */
function hitPath(el: El, root: El): El[] {
  const label = labelOf(el, root);
  const up = lineage(el);
  return up.includes(label!) ? up.slice(0, up.indexOf(label!) + 1) : [el, ...(label ? [label] : [])];
}

// ---- colour tokens (from the @theme block in styles.css) --------------------------------

type RGB = [number, number, number];
const gamma = (v: number) => Math.round(Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)) * 255);

function oklch(l: number, c: number, h: number): RGB {
  const [a, b] = [c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  const [x, y, z] = [(l + 0.3963377774 * a + 0.2158037573 * b) ** 3, (l - 0.1055613458 * a - 0.0638541728 * b) ** 3, (l - 0.0894841775 * a - 1.291485548 * b) ** 3];
  return [4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z, -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z, -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z].map(gamma) as RGB;
}

/** sRGB from #rgb, #rrggbb, rgb() or oklch(), the forms a token may take. */
const COLOURS: [RegExp, (m: RegExpExecArray) => RGB][] = [
  [/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, (m) => [1, 2, 3].map((i) => parseInt(m[i]! + m[i]!, 16)) as RGB],
  [/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i, (m) => [1, 2, 3].map((i) => parseInt(m[i]!, 16)) as RGB],
  [/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i, (m) => [1, 2, 3].map((i) => Number(m[i])) as RGB],
  [/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i, (m) => oklch(Number(m[1]) / (m[2] ? 100 : 1), Number(m[3]), Number(m[4]))],
];
function parseColor(text: string): RGB {
  const hit = COLOURS.map(([re, to]) => ({ m: re.exec(text.trim()), to })).find((x) => x.m);
  assert.ok(hit?.m, `cannot read colour ${text}`);
  return hit.to(hit.m);
}

const channel = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const luminance = (c: RGB) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
const contrast = (x: RGB, y: RGB) => (Math.max(luminance(x), luminance(y)) + 0.05) / (Math.min(luminance(x), luminance(y)) + 0.05);

let tokens = new Map<string, string>();
type Mode = "light" | "dark";
const SIDE = /^light-dark\(\s*((?:[^(),]|\([^()]*\))+?)\s*,\s*((?:[^(),]|\([^()]*\))+?)\s*\)$/;

function tokenColor(name: string, mode: Mode): RGB {
  const value = tokens.get(`--color-${name}`) ?? "";
  const side = SIDE.exec(value)?.[mode === "light" ? 1 : 2] ?? value;
  const ref = /^var\(--color-([\w-]+)\)$/.exec(side)?.[1];
  return ref ? tokenColor(ref, mode) : parseColor(side);
}

/** The colour tokens a declared value refers to, e.g. "var(--color-muted)" -> ["muted"]. */
const tokenRefs = (value: string | undefined) => [...(value ?? "").matchAll(/var\(--color-([\w-]+)/g)].map((m) => m[1]!).filter((n) => tokens.has(`--color-${n}`));
const paint = (n: El) => ["background-color", "background", "background-image"].flatMap((p) => tokenRefs(style(n, p)));

/** The colour tokens behind the element: its own background or the nearest ancestor's, else the page. */
const backdrop = (el: El | null) => lineage(el).map(paint).find((list) => list.length > 0) ?? ["bg"];
const foreground = (el: El) => lineage(el).map((n) => tokenRefs(style(n, "color"))[0]).find(Boolean) ?? "ink";

function failing(fg: string, bgs: string[], min: number, where: string): string[] {
  const pairs = (["light", "dark"] as Mode[]).flatMap((mode) => bgs.map((bg) => ({ mode, bg, ratio: contrast(tokenColor(fg, mode), tokenColor(bg, mode)) })));
  return pairs.filter((p) => p.ratio + 1e-9 < min).map((p) => `${p.mode}: ${fg} on ${p.bg} is ${p.ratio.toFixed(2)}:1, want ${min}:1 at ${where}`);
}

// ---- rendering the App -------------------------------------------------------------------

let App: ComponentType | null = null;
let out = "";

before(async () => {
  const { build, createServer } = await import("vite");
  out = mkdtempSync(join(tmpdir(), "bento-a11y-"));
  await build({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
  builtCss = readdirSync(out, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(out, f), "utf8")).join("\n");
  rules = parseCss(builtCss);
  vars = new Map(rules.filter((r) => r.selectors.includes(":root")).flatMap((r) => [...r.decls].filter(([k]) => k.startsWith("--"))));
  const theme = /@theme\s*{([^}]*)}/.exec(readFileSync(repo("site/src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""));
  tokens = new Map([...(theme?.[1] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  const server = await createServer({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  App = (await server.ssrLoadModule("/src/App.tsx").finally(() => server.close())).default as ComponentType;
});

after(() => rmSync(out, { recursive: true, force: true }));

function render(session: Partial<Session> = {}, selected = DEFAULT_SETTINGS.selected, custom: FuelPack[] = []): El {
  const settings: Settings = { session: { ...DEFAULT_SETTINGS.session, ...session }, selected, custom };
  const g = globalThis as { window?: unknown };
  const saved = g.window;
  g.window = { localStorage: { getItem: (k: string) => (k === "bento.settings.v1" ? JSON.stringify(settings) : null), setItem: () => undefined, removeItem: () => undefined } };
  try {
    return parseHtml(renderToStaticMarkup(createElement(App!)));
  } finally {
    g.window = saved;
  }
}

const mine = (i: number, name = `My pack ${i}`): FuelPack => ({ id: `custom-${i}`, name, kind: "solid", carbsG: 40, sodiumMg: 100, caffeineMg: 0, fluidMl: 0, volumeMl: 60 });
const customs = (count: number) => Array.from({ length: count }, (_, i) => mine(i));
const RUN: Partial<Session> = { discipline: "run-road", effort: "run-steady", durationMin: 240 };
const RUN_PACKS = ["gel-caf", ...DEFAULT_SETTINGS.selected];

/** Bike, run with more options shown, a hot-day blocked plan with a custom pack, no pack, and CUSTOM_MAX custom packs. */
const pages = () => [
  render(), render(RUN, RUN_PACKS), render({ tempC: 45 }, DEFAULT_SETTINGS.selected, [mine(1, "Oat")]), render({}, []), render({}, DEFAULT_SETTINGS.selected, customs(CUSTOM_MAX)),
];

// ---- names and roles as they are today -----------------------------------------------------

const radios = (group: string, labels: string[], checked: string) => labels.map((l) => `radio|${group} > ${l}${l === checked ? " (checked)" : ""}`);
const fields = (names: string[]) => names.map((n) => `spinbutton|${n}`);
const ADD_PACK = ["summary|Add your own pack", "textbox|Name", ...radios("Kind", ["Gel", "Solid", "Drink"], "Gel"),
  ...fields(["Carbs (g)", "Sodium (mg)", "Caffeine (mg)", "Fluid (ml)", "Pack volume (ml)"]), "button|Add pack"];
const SHARED = ["button|Theme: Auto. Switch theme", ...radios("Workout", ["Easy", "Steady", "Tempo / intervals", "Race"], "Steady"),
  ...fields(["Duration min", "Temperature °C", "Body weight kg", "Humidity %", "Sweat rate L/h", "Refill every min"]), "summary|More options",
  ...radios("Gut training", ["New", "Some", "Trained"], "Some"), "checkbox|Above 2000 m altitude", ...PRESETS.map((p) => `checkbox|Carry ${p.name}`), ...ADD_PACK];
const BIKE = [...SHARED, ...radios("Activity", ["Bike", "Run"], "Bike"), ...radios("Bike type", ["Road", "Gravel", "MTB", "Indoor"], "Road"), ...fields(["Average power W"])];
const RUN_CONTROLS = [...SHARED, ...radios("Activity", ["Bike", "Run"], "Run"), ...radios("Run type", ["Road", "Trail", "Treadmill"], "Road"),
  "textbox|Pace /km", ...fields(["Sweat sodium mg/L", "Caffeine cap mg/kg"])];

/** Every control as "role|name", radios with their group's name and their checked state. */
const controlList = (root: El) => controls(root).map((el) => {
  const group = lineage(el).find((n) => n.attrs.get("role") === "radiogroup" && role(el) === "radio");
  const checked = role(el) === "radio" && el.attrs.get("aria-checked") === "true";
  return `${role(el)}|${group ? `${accName(group, root)} > ` : ""}${accName(el, root).replace(/\s+/g, " ").trim()}${checked ? " (checked)" : ""}`;
});

/** The expected entries the actual list lacks, counting repeats. */
const missing = (expected: string[], actual: string[]) => {
  const left = [...actual];
  return expected.filter((e) => left.splice(left.indexOf(e) >>> 0, Number(left.includes(e))).length === 0);
};

test("every control keeps the role and accessible name it has today (bike, run, custom pack on a hot day)", () => {
  assert.deepEqual(missing(BIKE, controlList(render())), []);
  assert.deepEqual(missing(RUN_CONTROLS, controlList(render(RUN, RUN_PACKS))), []);
  assert.deepEqual(missing([...BIKE, "checkbox|Carry Oat", "button|Remove"], controlList(render({ tempC: 45 }, DEFAULT_SETTINGS.selected, [mine(1, "Oat")]))), []);
});

test("with none, one and CUSTOM_MAX custom packs, each keeps its Carry checkbox and its Remove button", () => {
  for (const count of [0, 1, CUSTOM_MAX]) {
    const list = controlList(render({}, DEFAULT_SETTINGS.selected, customs(count)));
    assert.equal(list.filter((c) => c === "button|Remove").length, count);
    assert.deepEqual(missing(customs(count).map((p) => `checkbox|Carry ${p.name}`), list), []);
  }
});

// ---- touch targets and keyboard ------------------------------------------------------------

test("at 390 px every control's touch target is at least 44 x 44 px", () => {
  const small = pages().flatMap((root) => controls(root).flatMap((el) => {
    const path = hitPath(el, root).filter((n) => !hiddenAt(n));
    const tall = Math.max(0, ...path.map(height));
    return [tall < TARGET && `${describe(el)}: about ${Math.round(tall)} px tall`, !path.some(wideEnough) && `${describe(el)}: under ${TARGET} px wide`];
  }));
  assert.deepEqual([...new Set(small.filter(Boolean))], []);
});

test("every control stays in the tab order, and no tabindex jumps ahead of the visual order", () => {
  const all = pages().flatMap(elements);
  assert.deepEqual(all.filter((el) => Number(el.attrs.get("tabindex") ?? 0) > 0).map(describe), []);
  assert.deepEqual(all.filter((el) => isControl(el) && Number(el.attrs.get("tabindex") ?? 0) < 0).map(describe), []);
});

test("the built CSS draws a :focus-visible outline with a style and a width", () => {
  const focus = rules.filter((r) => r.selectors.some((s) => /^\*?:focus-visible$/.test(s)));
  const outline = resolve(focus.flatMap((r) => ["outline", "outline-style", "outline-width"].map((p) => r.decls.get(p) ?? "")).join(" "));
  assert.doesNotMatch(outline, /\bnone\b/);
  assert.match(outline, /\b(solid|auto|dashed|dotted|double)\b/);
  assert.ok(outline.split(/\s+/).some((v) => px(v) > 0), `the outline has a width: ${outline}`);
});

const SUPPRESS = /(^|:)(outline-none|outline-hidden|outline-0|outline-transparent|sr-only)$/;
const INDICATOR = /^(?:focus|focus-visible|focus-within|has-focus|has-focus-visible|has-\[:focus(?:-visible)?\]|group-focus(?:-visible|-within)?|peer-focus(?:-visible)?):(?:outline|ring|border|shadow|inset-ring)(?:-([\w-]+))?$/;

/** Where a control turns its outline off, the focus indicators on its hit area or nearest ancestors. */
function indicators(el: El, root: El): { n: El; token: string }[] {
  const near = [...hitPath(el, root), ...lineage(el).slice(1, 4)];
  const found = near.flatMap((n) => classes(n).map((c) => INDICATOR.exec(c)).filter((m) => m !== null).map((m) => ({ n, token: m[1] ?? "" })));
  return found.filter((f) => !/^(none|0|transparent)$/.test(f.token));
}

test("every focusable control shows a visible focus: its outline, or a 3:1 indicator where the outline is off", () => {
  const bad = pages().flatMap((root) => [...controls(root), ...elements(root).filter((el) => el.attrs.get("tabindex") === "0")]
    .filter((el) => classes(el).some((c) => SUPPRESS.test(c)) || /none|hidden/.test(style(el, "outline-style") ?? style(el, "outline") ?? ""))
    .flatMap((el) => {
      const found = indicators(el, root);
      const colours = found.filter((f) => tokens.has(`--color-${f.token}`)).flatMap((f) => failing(f.token, backdrop(f.n.parent), 3, describe(f.n)));
      return [...colours, ...[`${describe(el)} turns its outline off with no other focus indicator`].slice(Math.min(found.length, 1))];
    }));
  assert.deepEqual([...new Set(bad)], []);
});

// ---- contrast in light and dark ------------------------------------------------------------

const large = (el: El) => fontSize(el) >= 24 || (fontSize(el) >= 18.66 && Number(resolve(inherited(el, "font-weight"))) >= 700);
const hasText = (el: El) => (ownText(el) !== "" || (FIELDS.has(el.tag) && !["checkbox", "radio"].includes(role(el)))) && !hiddenAt(el);

test("all text reaches 4.5:1 (3:1 when large) on what is behind it, in light and dark", () => {
  const texty = pages().flatMap(elements).filter((el) => hasText(el) && lineage(el).every(shown));
  const bad = texty.flatMap((el) => failing(foreground(el), backdrop(el), large(el) ? 3 : 4.5, describe(el)));
  assert.deepEqual([...new Set(bad)], []);
});

test("control boundaries drawn as borders reach 3:1 on what is behind them, in light and dark", () => {
  const edged = pages().flatMap((root) => controls(root).flatMap((el) => [...hitPath(el, root), ...lineage(el.parent).filter(() => el.tag === "summary").slice(0, 1)]));
  const bordered = [...new Set(edged)].filter((n) => px(style(n, "border-width") ?? style(n, "border-bottom-width")) > 0);
  const bad = bordered.flatMap((n) => tokenRefs(style(n, "border-color")).flatMap((c) => failing(c, backdrop(n.parent), 3, describe(n))));
  assert.deepEqual([...new Set(bad)], []);
});

// ---- no sideways scroll at the longest pack name ---------------------------------------------

/** An item of a flex row or of a grid whose columns may grow past their share. */
const pinned = (n: El) => isRow(n.parent) || (/grid/.test(display(n.parent)) && !/minmax\(0/.test(resolve(style(n.parent, "grid-template-columns"))));
const shrinks = (n: El) => style(n, "min-width") !== undefined && px(style(n, "min-width")) === 0;
const breaks = (n: El, kind: RegExp) => kind.test(`${style(n, "overflow-wrap") ?? ""} ${style(n, "word-break") ?? ""} ${style(n, "text-overflow") ?? ""}`);

/** True when an unbroken word in the element wraps without widening its flex and grid ancestors. */
function wraps(el: El): boolean {
  const near = lineage(el).slice(0, 4);
  return near.some((n) => breaks(n, /anywhere|break-all/)) || (near.some((n) => breaks(n, /break-word|ellipsis/)) && lineage(el).filter(pinned).every(shrinks));
}

test(`at 390 px a pack name of NAME_MAX (${NAME_MAX}) characters with no space wraps everywhere it is shown`, () => {
  const long = "R".repeat(NAME_MAX);
  const root = render({ durationMin: 240 }, ["custom-0"], [mine(0, long)]);
  const holders = elements(root).filter((el) => ownText(el).includes(long));
  assert.ok(holders.length >= 3, "the long name shows in the pack list, the packing list and the timeline");
  assert.deepEqual(holders.filter((el) => !wraps(el)).map(describe), []);
});

// ---- motion ---------------------------------------------------------------------------------

test("under prefers-reduced-motion: reduce, an unlayered rule turns transitions and animations off for every element", () => {
  const reduce = rules.filter((r) => !r.layered && r.media.some((m) => /prefers-reduced-motion:\s*reduce/.test(m)) && r.selectors.includes("*"));
  const value = (p: string) => reduce.map((r) => r.decls.get(p) ?? r.decls.get(`${p}-duration`)).find(Boolean) ?? "";
  assert.match(value("transition"), /^(none|0s?)\b/);
  assert.match(value("animation"), /^(none|0s?)\b/);
  assert.ok(!/scroll-behavior:\s*smooth/.test(builtCss) || value("scroll-behavior") === "auto", "smooth scrolling stops too");
});

test("motion only answers the user: nothing loops, and nothing outside a disclosure animates on load", () => {
  assert.doesNotMatch(builtCss, /animation[^;{}]*\binfinite\b/);
  const all = pages().flatMap(elements);
  assert.deepEqual(all.filter((el) => classes(el).some((c) => /^animate-(spin|ping|pulse|bounce)$/.test(c))).map(describe), []);
  const moving = all.filter((el) => (style(el, "animation") ?? style(el, "animation-name") ?? "none") !== "none");
  assert.deepEqual(moving.filter((el) => !lineage(el).some((n) => n.tag === "details")).map(describe), []);
});

// ---- fonts, inline styles and remote resources ---------------------------------------------

const GENERIC = /^(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|cursive|fantasy|math|emoji|inherit|initial|unset)$/;

test("every font stack in the built CSS ends in a generic family, so a failed font falls back to the system", () => {
  const stacks = rules.flatMap((r) => ["font-family", "--font-sans", "--font-mono"].map((p) => r.decls.get(p))).filter((s) => s !== undefined).map((s) => resolve(s));
  assert.ok(stacks.length > 0, "the built CSS sets a font family");
  assert.deepEqual(stacks.filter((s) => !GENERIC.test(s.split(",").at(-1)!.trim().replace(/^["']|["']$/g, ""))), []);
});

test("the rendered page has no inline style attribute and loads nothing from another origin", () => {
  const all = pages().flatMap(elements);
  assert.deepEqual(all.filter((el) => el.attrs.has("style")).map(describe), []);
  const remote = all.filter((el) => ["src", "href", "srcset", "action", "poster"].some((a) => /^(https?:)?\/\//.test(el.attrs.get(a) ?? "")));
  assert.deepEqual(remote.map(describe), []);
});
