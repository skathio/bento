// The page layout of the UI rework. On a 390 px phone the page is one scrolling column in a set
// order, under a sticky bar of the per-hour targets (or the blocked state). At 1280 px the inputs
// and the plan sit side by side, the plan column is sticky and the phone bar is gone. What works
// today keeps working. The real App is rendered through Vite's SSR loader and laid out against
// the built stylesheet at both widths, so no browser and no test dependency is needed.
import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { fmtClock, fmtFluid } from "../site/src/lib/format.ts";
import { relevantOptions } from "../site/src/lib/options.ts";
import { buildPlan } from "../site/src/lib/plan.ts";
import { PRESETS } from "../site/src/lib/products.ts";
import { DEFAULT_SETTINGS, loadSettings, RANGES, toPlanInput, type Session, type Settings } from "../site/src/lib/storage.ts";
import type { Plan } from "../site/src/lib/types.ts";

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const PHONE = 390;
const DESKTOP = 1280;

// ---- a small HTML tree for React's static markup ----------------------------------------

interface El { tag: string; attrs: Map<string, string>; kids: (El | Txt)[]; parent: El | null; index: number; last: number }
interface Txt { text: string; index: number; parent: El }

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#39": "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#x27|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "");
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const TOKEN = /<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)((?:\s+[^\s=/>]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;

function readAttrs(text: string): Map<string, string> {
  return new Map([...text.matchAll(/([^\s=/>]+)(?:="([^"]*)")?/g)].map((m) => [m[1]!.toLowerCase(), decode(m[2] ?? "")]));
}

function openTag(m: RegExpMatchArray, parent: El, index: number): El {
  const tag = m[2]!.toLowerCase();
  const node: El = { tag, attrs: readAttrs(m[3] ?? ""), kids: [], parent, index, last: index };
  parent.kids.push(node);
  return VOID.has(tag) || m[4] === "/" ? parent : node;
}

function parseHtml(markup: string): El {
  const root: El = { tag: "#root", attrs: new Map(), kids: [], parent: null, index: 0, last: 0 };
  let current = root;
  let index = 0;
  for (const m of markup.replace(/<!--[\s\S]*?-->/g, "").matchAll(TOKEN)) {
    index++;
    if (m[1]) {
      current.last = index;
      current = current.parent ?? root;
    } else if (m[2]) current = openTag(m, current, index);
    else current.kids.push({ text: decode(m[5] ?? ""), index, parent: current });
  }
  root.last = index;
  return root;
}

const isEl = (n: El | Txt): n is El => "tag" in n;
const elements = (el: El): El[] => [el, ...el.kids.filter(isEl).flatMap(elements)];
const texts = (el: El): Txt[] => el.kids.flatMap((k) => (isEl(k) ? texts(k) : [k]));
const textOf = (el: El) => texts(el).map((t) => t.text).join(" ").replace(/\s+/g, " ").trim();
const contains = (el: El, index: number) => el.index <= index && index <= el.last;
const lineage = (el: El): El[] => (el.parent ? [el, ...lineage(el.parent)] : [el]);
const classes = (el: El) => (el.attrs.get("class") ?? "").split(/\s+/).filter(Boolean);

/** The lowest element holding every given index. */
function lca(root: El, indexes: number[]): El {
  const holders = elements(root).filter((el) => indexes.every((i) => contains(el, i)));
  return holders.at(-1) ?? root;
}

function role(el: El): string {
  const type = el.attrs.get("type");
  const implicit = el.tag === "input" && (type === "checkbox" || type === "radio") ? type : el.tag;
  return el.attrs.get("role") ?? implicit;
}

/** The accessible name: aria-label, aria-labelledby, an enclosing label or label[for]. */
function accName(el: El, root: El): string {
  const own = el.attrs.get("aria-label");
  if (own) return own;
  const ids = (el.attrs.get("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const byId = elements(root).filter((e) => ids.includes(e.attrs.get("id") ?? ""));
  const id = el.attrs.get("id");
  const labels = lineage(el).filter((e) => e.tag === "label");
  const forId = id ? elements(root).filter((e) => e.tag === "label" && e.attrs.get("for") === id) : [];
  return [...byId, ...labels, ...forId].map(textOf).join(" ").trim();
}

// ---- the built stylesheet, evaluated at a viewport width ---------------------------------

interface Decl { value: string; important: boolean }
interface Rule { selectors: string[]; decls: Map<string, Decl>; media: string[]; layered: boolean; order: number }
interface Ctx { media: string[]; layered: boolean }

/** The top-level `prelude { body }` blocks of a stylesheet fragment. */
function blocks(text: string): { prelude: string; body: string }[] {
  const found: { prelude: string; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let open = 0;
  [...text].forEach((ch, i) => {
    if (ch === "{" && depth++ === 0) open = i;
    else if (ch === "}" && --depth === 0) {
      found.push({ prelude: text.slice(start, open).trim(), body: text.slice(open + 1, i) });
      start = i + 1;
    } else if (ch === ";" && depth === 0) start = i + 1;
  });
  return found;
}

function readDecls(body: string): Map<string, Decl> {
  const decls = new Map<string, Decl>();
  for (const part of body.split(";")) {
    const m = /^\s*([\w-]+)\s*:([^{}]*)$/.exec(part);
    if (m) decls.set(m[1]!.toLowerCase(), { value: m[2]!.replace(/!important\s*$/, "").trim(), important: /!important\s*$/.test(m[2]!) });
  }
  return decls;
}

/** A rule's selectors. A plain class never holds an unescaped comma, so a split at the others is enough. */
const splitSelectors = (prelude: string) => prelude.split(/(?<!\\),/).map((sel) => sel.trim());

/** How each at-rule's block applies: @media adds its query, @layer marks the rules layered. Others are skipped. */
const AT_RULES: Record<string, (ctx: Ctx, rest: string) => Ctx> = {
  media: (ctx, query) => ({ ...ctx, media: [...ctx.media, query] }),
  layer: (ctx) => ({ ...ctx, layered: true }),
  supports: (ctx) => ctx,
};

function visit(text: string, ctx: Ctx, rules: Rule[]): void {
  for (const { prelude, body } of blocks(text)) {
    const at = /^@([\w-]+)\s*(.*)$/s.exec(prelude);
    const inner = at && AT_RULES[at[1]!]?.(ctx, at[2]!);
    if (inner) visit(body, inner, rules);
    else if (!at) rules.push({ selectors: splitSelectors(prelude), decls: readDecls(body), ...ctx, order: rules.length });
  }
}

const toPx = (n: string, unit: string) => Number(n) * (unit === "px" ? 1 : 16);

const COMPARE: Record<string, (a: number, b: number) => boolean> = {
  ">=": (a, b) => a >= b, ">": (a, b) => a > b, "<=": (a, b) => a <= b, "<": (a, b) => a < b,
};

/** One width feature, min-width and max-width written as ranges first; any other feature is false. */
function feature(f: string, width: number): boolean {
  const range = /^width(>=|>|<=|<)([\d.]+)(px|r?em)$/.exec(f.replace(/^min-width:/, "width>=").replace(/^max-width:/, "width<="));
  return range ? COMPARE[range[1]!]!(width, toPx(range[2]!, range[3]!)) : false;
}

function mediaMatches(query: string, width: number): boolean {
  return query.split(",").some((q) => {
    const one = q.trim().toLowerCase();
    const features = [...one.matchAll(/\(([^()]+)\)/g)].map((m) => m[1]!.replace(/\s+/g, ""));
    const ok = !/\bprint\b/.test(one) && features.every((f) => feature(f, width));
    return one.startsWith("not ") ? !ok : ok;
  });
}

/** The class a selector names when it is one plain class, unescaped; null for anything else. */
function plainClass(selector: string): string | null {
  const m = /^\.((?:\\[0-9a-f]{1,6}\s?|\\.|[\w-])+)$/i.exec(selector.trim());
  if (!m) return null;
  return m[1]!.replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_, hex?: string, ch?: string) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch ?? ""));
}

let rules: Rule[] = [];
let vars = new Map<string, string>();

function specificity(rule: Rule, el: El): number {
  const own = classes(el);
  const scores = rule.selectors.map((s) => (own.includes(plainClass(s) ?? "\0") ? 10 : s === el.tag ? 1 : 0));
  return Math.max(0, ...scores);
}

/** The value `prop` computes to on `el` at `width`, from the built CSS cascade (no inheritance). */
function style(el: El, prop: string, width: number): string | undefined {
  const hits = rules
    .filter((r) => r.decls.has(prop) && r.media.every((m) => mediaMatches(m, width)))
    .map((r) => ({ d: r.decls.get(prop)!, key: [0, r.layered ? 0 : 1, specificity(r, el), r.order] }))
    .filter((h) => h.key[2]! > 0)
    .map((h) => ({ value: h.d.value, key: [h.d.important ? 1 : 0, ...h.key.slice(1)] }));
  hits.sort((a, b) => cascade(a.key, b.key));
  return hits.at(-1)?.value;
}

/** Orders two cascade keys: importance, unlayered over layered, specificity, then source order. */
function cascade(a: number[], b: number[]): number {
  const i = a.findIndex((v, j) => v !== b[j]);
  return i < 0 ? 0 : a[i]! - b[i]!;
}

const resolve = (value: string): string =>
  value.replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (_, name: string) => resolve(vars.get(name) ?? "0")).replace(/\s+/g, "");

/** An absolute length in px, or null for a relative or unknown one. */
function lengthPx(value: string | undefined): number | null {
  const v = resolve(value ?? "");
  const plain = /^([\d.]+)(px|rem)$/.exec(v);
  if (plain) return toPx(plain[1]!, plain[2]!);
  const calc = /^calc\(([\d.]+)(px|rem)\*([\d.]+)\)$/.exec(v);
  return calc ? toPx(calc[1]!, calc[2]!) * Number(calc[3]) : null;
}

const hiddenAt = (el: El, width: number) => lineage(el).some((n) => style(n, "display", width) === "none");
const stickyAt = (el: El, width: number) => /sticky/.test(style(el, "position", width) ?? "");

function tracks(value: string | undefined): number {
  if (!value || value === "none") return 1;
  const parts = value.replace(/\[[^\]]*\]/g, " ").match(/repeat\(\s*\d+[^()]*(?:\([^()]*\)[^()]*)*\)|[^\s(]+(?:\([^()]*(?:\([^()]*\))*[^()]*\))?/g) ?? [];
  return parts.reduce((n, p) => n + (/^repeat\(\s*(\d+)/.exec(p) ? Number(/^repeat\(\s*(\d+)/.exec(p)![1]) : 1), 0);
}

/** True when the children of `el` are laid out in a row at `width`. */
function sideBySide(el: El, width: number): boolean {
  const display = style(el, "display", width) ?? "";
  if (/grid/.test(display)) return tracks(style(el, "grid-template-columns", width)) >= 2;
  return /flex/.test(display) && !/column/.test(style(el, "flex-direction", width) ?? "row");
}

// ---- rendering the App -------------------------------------------------------------------

let App: ComponentType | null = null;
let out = "";

before(async () => {
  const { build, createServer } = await import("vite");
  out = mkdtempSync(join(tmpdir(), "bento-layout-"));
  await build({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
  const css = readdirSync(out, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(out, f), "utf8")).join("\n");
  rules = [];
  visit(css.replace(/\/\*[\s\S]*?\*\//g, ""), { media: [], layered: false }, rules);
  const rootRules = rules.filter((r) => r.selectors.some((s) => s === ":root" || s === ":host"));
  vars = new Map(rootRules.flatMap((r) => [...r.decls].filter(([k]) => k.startsWith("--")).map(([k, d]) => [k, d.value] as [string, string])));
  const server = await createServer({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    App = (await server.ssrLoadModule("/src/App.tsx")).default as ComponentType;
  } finally {
    await server.close();
  }
});

after(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

interface Page { root: El; plan: Plan; settings: Settings; flat: Txt[] }

function render(session: Partial<Session> = {}, selected = DEFAULT_SETTINGS.selected, theme?: string): Page {
  const settings: Settings = { session: { ...DEFAULT_SETTINGS.session, ...session }, selected, custom: [] };
  const store: Record<string, string> = { "bento.settings.v1": JSON.stringify(settings) };
  if (theme) store["bento.theme"] = theme;
  const g = globalThis as { window?: unknown };
  const saved = g.window;
  g.window = { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: () => undefined, removeItem: () => undefined } };
  try {
    assert.ok(App, "the App module loaded");
    const root = parseHtml(renderToStaticMarkup(createElement(App)));
    const loaded = loadSettings();
    const packs = PRESETS.filter((p) => loaded.selected.includes(p.id));
    return { root, plan: buildPlan(toPlanInput(loaded.session, packs)), settings: loaded, flat: texts(root) };
  } finally {
    g.window = saved;
  }
}

/** The first text node after `from` (document order) whose text, joined with what follows, matches. */
function textAfter(page: Page, needle: string | RegExp, from = 0): Txt | undefined {
  const hit = (t: string) => (typeof needle === "string" ? t.includes(needle) : needle.test(t));
  const later = page.flat.filter((t) => t.index > from);
  return later.find((_, i) => hit(later.slice(i, i + 4).map((x) => x.text).join(" ")));
}

function must<T>(value: T | undefined | null, what: string): T {
  assert.ok(value, `the page has ${what}`);
  return value;
}

const byRole = (page: Page, r: string, name?: RegExp) =>
  elements(page.root).filter((el) => role(el) === r && (!name || name.test(accName(el, page.root))));
const field = (page: Page, name: string) =>
  must(elements(page.root).find((el) => ["input", "select", "textarea"].includes(el.tag) && accName(el, page.root).startsWith(name)), `a ${name} field`);
const radiogroup = (page: Page, name: string) => must(byRole(page, "radiogroup", new RegExp(`^${name}$`))[0], `the ${name} radio group`);
const details = (page: Page, summary: string) =>
  elements(page.root).find((el) => el.tag === "details" && el.kids.some((k) => isEl(k) && k.tag === "summary" && textOf(k).includes(summary)));

/** The fuel-pack selection: every preset's toggle and the "Add your own pack" disclosure. */
function packSection(page: Page): El {
  const toggles = byRole(page, "checkbox").filter((el) => PRESETS.some((p) => accName(el, page.root).includes(p.name)));
  assert.equal(toggles.length, PRESETS.length, "every preset pack has a checkbox named after it");
  const add = must(elements(page.root).find((el) => el.tag === "summary" && textOf(el).includes("Add your own pack")), '"Add your own pack"');
  return lca(page.root, [...toggles.map((t) => t.index), add.index]);
}

/** The sticky phone bar: the outermost element, sticky at 390 px, that ends before the inputs. */
function phoneBar(page: Page): El {
  const activity = radiogroup(page, "Activity");
  const bar = elements(page.root).find((el) => el.last < activity.index && stickyAt(el, PHONE) && !hiddenAt(el, PHONE) && textOf(el) !== "");
  return must(bar, "a sticky bar above the inputs at 390 px");
}

const OVERFLOW = ["overflow", "overflow-x", "overflow-y"];
const PER_HOUR = /\d\s*(g|ml|mg|L)\s*\/\s*h\b/;
const num = (n: number) => new RegExp(`(^|[^\\d.])${n}([^\\d]|$)`);

/** The plan's markers in document order: summary (carb target), packing list, notes, timeline. */
function planMarkers(page: Page): Txt[] {
  const { plan } = page;
  const start = packSection(page).last;
  const summary = must(textAfter(page, new RegExp(`(^|\\D)${plan.targets.carbsPerHour}\\s*g\\s*/\\s*h`), start), "the summary's carb target");
  const packing = must(textAfter(page, plan.packing[0]!.name, start), "the packing list");
  const notes = must(textAfter(page, plan.notes[0]!, start), "the notes");
  const timeline = must(textAfter(page, new RegExp(`^\\s*${fmtClock(plan.events[0]!.minute)}\\b`), notes.index), "the timeline");
  return [summary, packing, notes, timeline];
}

// Sessions where carbs, fluid and sodium are all per-hour numbers, then the ends of the ranges.
const FULL: Partial<Session>[] = [{ tempC: 25, durationMin: 240 }, { tempC: 30, durationMin: 300 }];
const [MIN_MIN, MAX_MIN] = RANGES.durationMin;
const [MIN_C, MAX_C] = RANGES.tempC;
// Each end of the duration and temperature ranges, a step inside it and one past it (stored settings clamp).
const EDGES: Partial<Session>[] = [
  ...[MIN_MIN - 1, MIN_MIN, MIN_MIN + 5, MAX_MIN - 5, MAX_MIN, MAX_MIN + 1].map((durationMin) => ({ durationMin })),
  ...[MIN_C - 1, MIN_C, MIN_C + 1, MAX_C - 1, MAX_C, MAX_C + 1].map((tempC) => ({ tempC })),
];

// ---- the sticky targets bar on the phone ---------------------------------------------------

test("at 390 px a sticky bar above the inputs shows the per-hour carbs, fluid and sodium targets", () => {
  for (const page of FULL.map((s) => render(s))) {
    const t = page.plan.targets;
    assert.ok(t.sodiumNeeded, "the session has three numeric targets");
    const text = textOf(phoneBar(page));
    assert.match(text, num(t.carbsPerHour), `carbs ${t.carbsPerHour} in "${text}"`);
    assert.ok([String(t.fluidMlPerHour), fmtFluid(t.fluidMlPerHour)].some((f) => text.includes(f)), `fluid ${t.fluidMlPerHour} in "${text}"`);
    assert.match(text, num(t.sodiumMgPerHour), `sodium ${t.sodiumMgPerHour} in "${text}"`);
    for (const unit of [/g\s*\/\s*h/, /(ml|L)\s*\/\s*h/, /mg\s*\/\s*h/]) assert.match(text, unit);
  }
});

test("the bar follows the inputs: other settings give the other plan's numbers", () => {
  const [a, b] = FULL.map((s) => render(s));
  assert.notEqual(a!.plan.targets.fluidMlPerHour, b!.plan.targets.fluidMlPerHour);
  for (const page of [a!, b!]) assert.match(textOf(phoneBar(page)), num(page.plan.targets.fluidMlPerHour));
});

test("the bar sits at the top of the page and sticks over the whole column, plan included", () => {
  const page = render(FULL[0]);
  const bar = phoneBar(page);
  assert.ok(style(bar, "top", PHONE) !== undefined, "the sticky bar sets top");
  const [, , , timeline] = planMarkers(page);
  assert.ok(bar.parent && contains(bar.parent, timeline!.index), "the bar's containing block runs down to the timeline");
  const clipping = lineage(bar).slice(1).flatMap((el) => OVERFLOW.map((prop) => style(el, prop, PHONE) ?? "visible"));
  assert.deepEqual(clipping.filter((v) => /hidden|auto|scroll/.test(v)), [], "no ancestor's overflow stops the bar sticking");
});

test("when the plan is blocked (too hot), the bar shows the blocked state and no per-hour numbers", () => {
  const page = render({ tempC: MAX_C });
  const blocked = must(page.plan.blocked, "a blocked plan at the top of the temperature range");
  const text = textOf(phoneBar(page));
  assert.doesNotMatch(text, PER_HOUR);
  assert.ok(/too hot/i.test(text) || text.includes(blocked), `"${text}" shows the blocked state`);
});

test("the bar is there at each end of the duration and temperature ranges, and with no pack carried", () => {
  const pages = [...EDGES.map((s) => render(s)), render({}, [])];
  const blocked = pages.filter((page) => page.plan.blocked);
  const fuelled = pages.filter((page) => !page.plan.blocked && page.plan.targets.carbsPerHour > 0);
  assert.ok(blocked.length > 0 && fuelled.length > 0, "the edges cover a blocked plan and a fuelled one");
  for (const page of pages) assert.match(textOf(phoneBar(page)), /\S/);
  for (const page of blocked) assert.doesNotMatch(textOf(phoneBar(page)), PER_HOUR);
  for (const page of fuelled) assert.match(textOf(phoneBar(page)), num(page.plan.targets.carbsPerHour));
});

// ---- the phone column and its order --------------------------------------------------------

test("at 390 px the page runs in order: header, targets bar, activity, discipline, workout", () => {
  const page = render(FULL[0]);
  const header = must(elements(page.root).find((el) => el.tag === "header"), "a header");
  const bar = phoneBar(page);
  const targets = must(texts(bar).find((t) => /g\s*\/\s*h/.test(t.text) || num(page.plan.targets.carbsPerHour).test(t.text)), "targets in the bar");
  assert.ok(header.last < targets.index, "the targets come after the header");
  const groups = ["Activity", "Bike type", "Workout"].map((name) => radiogroup(page, name));
  assert.ok(bar.last < groups[0]!.index, "the bar comes before the activity");
  assert.ok(groups[0]!.last < groups[1]!.index && groups[1]!.last < groups[2]!.index, "activity, then discipline, then workout");
});

test("at 390 px duration and temperature follow the workout, then More options, then the fuel packs", () => {
  const page = render(FULL[0]);
  const workout = radiogroup(page, "Workout");
  const more = must(details(page, "More options"), "a More options disclosure");
  for (const name of ["Duration", "Temperature"]) {
    const input = field(page, name);
    assert.ok(workout.last < input.index && input.index < more.index, `${name} sits between the workout and More options`);
  }
  assert.ok(more.last < packSection(page).index, "the fuel-pack selection comes after More options");
});

test("More options is collapsed by default", () => {
  for (const page of [render(), render(FULL[0])]) assert.equal(must(details(page, "More options"), "More options").attrs.has("open"), false);
});

test("at 390 px the plan comes last: summary, packing list, notes, then the timeline", () => {
  const page = render(FULL[0]);
  const [summary, packing, notes, timeline] = planMarkers(page);
  assert.ok(packSection(page).last < summary!.index, "the plan follows the fuel-pack selection");
  assert.ok(summary!.index < packing!.index, "summary before the packing list");
  assert.ok(packing!.index < notes!.index, "packing list before the notes");
  assert.ok(notes!.index < timeline!.index, "notes before the timeline");
});

test("at 390 px the page is one column whose visual order is its document order", () => {
  const page = render(FULL[0]);
  const [summary] = planMarkers(page);
  const layout = lca(page.root, [radiogroup(page, "Activity").index, summary!.index]);
  for (const el of lineage(layout)) assert.equal(sideBySide(el, PHONE), false, `<${el.tag} class="${classes(el).join(" ")}"> is not a row`);
  for (const el of elements(page.root)) {
    assert.ok(["0", undefined].includes(style(el, "order", PHONE)), `<${el.tag}> keeps its order`);
    assert.doesNotMatch(style(el, "flex-direction", PHONE) ?? "", /reverse/);
  }
});

test("no horizontal scroll at 390 px: no element is wider than the viewport", () => {
  const pages = [render(FULL[0]), render({ tempC: MAX_C }), render({ discipline: "run-road", effort: "run-steady" })];
  const widths = pages.flatMap((page) => elements(page.root)).flatMap((el) =>
    ["width", "min-width", "flex-basis"].map((prop) => ({ at: `<${el.tag} class="${classes(el).join(" ")}"> ${prop}`, px: lengthPx(style(el, prop, PHONE)) })),
  );
  assert.deepEqual(widths.filter((w) => w.px !== null && w.px > PHONE), []);
});

// ---- the desktop layout ---------------------------------------------------------------------

function desktopColumns(page: Page): { layout: El; plan: El; summary: Txt; timeline: Txt } {
  const [summary, , , timeline] = planMarkers(page);
  const activity = radiogroup(page, "Activity");
  const layout = lca(page.root, [activity.index, summary!.index]);
  const plan = must(layout.kids.filter(isEl).find((k) => contains(k, summary!.index)), "a plan column");
  assert.equal(contains(plan, activity.index), false, "the inputs and the plan are separate columns");
  assert.ok(contains(plan, timeline!.index), "the plan column holds the timeline");
  return { layout, plan, summary: summary!, timeline: timeline! };
}

test("at 1280 px the inputs and the plan sit side by side", () => {
  const { layout } = desktopColumns(render(FULL[0]));
  assert.equal(sideBySide(layout, DESKTOP), true);
});

test("at 1280 px the plan column is sticky and stays in view while the inputs scroll", () => {
  const { layout, plan, summary, timeline } = desktopColumns(render(FULL[0]));
  const sticky = must(lineage(summary.parent).find((el) => contains(plan, el.index) && contains(el, timeline.index) && stickyAt(el, DESKTOP)), "a sticky plan column at 1280 px");
  assert.ok(style(sticky, "top", DESKTOP) !== undefined, "the sticky plan column sets top");
  if (sticky.parent === layout) {
    const align = style(sticky, "align-self", DESKTOP) ?? style(layout, "align-items", DESKTOP) ?? "stretch";
    assert.match(align, /start|end|center|baseline/, "a stretched grid item cannot stick");
  }
});

test("at 1280 px no sticky phone bar is shown", () => {
  for (const page of [render(FULL[0]), render({ tempC: MAX_C })]) {
    const bar = phoneBar(page);
    const state = texts(bar).filter((t) => PER_HOUR.test(t.text) || /too hot/i.test(t.text) || t.text.includes(page.plan.blocked ?? "\0"));
    assert.ok(hiddenAt(bar, DESKTOP) || state.length > 0, "the bar shows targets or the blocked state");
    for (const t of state) assert.ok(hiddenAt(t.parent, DESKTOP), `"${t.text}" is hidden at 1280 px`);
  }
});

// ---- what keeps working ---------------------------------------------------------------------

test("the blocked plan still shows its alert with the planner's own text", () => {
  const page = render({ tempC: MAX_C });
  const blocked = must(page.plan.blocked, "a blocked plan");
  assert.ok(byRole(page, "alert").some((el) => textOf(el).includes(blocked)), "an alert holds the blocked text");
});

test("the empty-timeline messages are unchanged", () => {
  const cases: [Partial<Session>, string[], string][] = [
    [{ tempC: MAX_C }, DEFAULT_SETTINGS.selected, "No timeline in these conditions."],
    [{}, [], "No timeline yet: carry at least one pack with carbs."],
    [{ durationMin: MIN_MIN }, DEFAULT_SETTINGS.selected, "Nothing to eat on the go for this session. Drink to thirst."],
  ];
  for (const [session, selected, message] of cases) {
    const page = render(session, selected);
    assert.equal(page.plan.events.length, 0);
    assert.ok(textAfter(page, message), `"${message}" is shown`);
  }
});

test("the theme toggle still offers Auto, Light and Dark", () => {
  for (const [stored, label] of [[undefined, "Auto"], ["light", "Light"], ["dark", "Dark"]] as const) {
    const page = render({}, DEFAULT_SETTINGS.selected, stored);
    assert.ok(byRole(page, "button").some((el) => textOf(el) === label || accName(el, page.root).includes(label)), `a ${label} theme toggle`);
  }
});

test("the footer still says Bento is not medical advice", () => {
  for (const page of [render(), render({ tempC: MAX_C })]) {
    const footer = must(elements(page.root).find((el) => el.tag === "footer"), "a footer");
    assert.match(textOf(footer), /not medical advice/i);
  }
});

test("options still appear in the form only when they can change the plan", () => {
  const sessions: [Partial<Session>, string[]][] = [[{}, DEFAULT_SETTINGS.selected], [FULL[0]!, ["gel-caf", ...DEFAULT_SETTINGS.selected]], [{ durationMin: MIN_MIN }, []]];
  const named = { caffeine: "Caffeine cap", refill: "Refill every", sweatSodium: "Sweat sodium" } as const;
  const keys = Object.keys(named) as (keyof typeof named)[];
  const rows = sessions.map(([session, selected]) => render(session, selected)).flatMap((page) => {
    const packs = PRESETS.filter((p) => page.settings.selected.includes(p.id));
    const relevant = relevantOptions(toPlanInput(page.settings.session, packs), packs);
    const shown = (name: string) => elements(page.root).some((el) => el.tag === "input" && accName(el, page.root).startsWith(name));
    return keys.map((key) => ({ option: named[key], shown: shown(named[key]), relevant: relevant[key] }));
  });
  assert.deepEqual(rows.filter((r) => r.shown !== r.relevant), []);
  assert.ok(rows.some((r) => r.relevant) && rows.some((r) => !r.relevant), "the sessions cover shown and hidden options");
});

test("the plan text on the page is the planner's own: notes and timeline times", () => {
  const page = render(FULL[0]);
  for (const note of page.plan.notes) assert.ok(textAfter(page, note), `note "${note}" is shown`);
  for (const e of page.plan.events) assert.ok(textAfter(page, fmtClock(e.minute)), `${fmtClock(e.minute)} is in the timeline`);
});
