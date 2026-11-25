// The typeface, CSP and palette tokens behind the UI rework. The font is one pinned
// @fontsource variable family, emitted as same-origin files that the CSP allows; the
// light and dark tokens meet WCAG 2.2 AA; motion stops under reduced motion; and the
// planner's numbers and text stay exactly as they were.
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { DISCIPLINE_IDS, effortsFor } from "../site/src/lib/activities.ts";
import { fmtClock, fmtDuration, fmtFluid, fmtPace } from "../site/src/lib/format.ts";
import { buildPlan } from "../site/src/lib/plan.ts";
import { PRESETS } from "../site/src/lib/products.ts";
import { DEFAULT_SETTINGS, loadSettings, toPlanInput, type Session } from "../site/src/lib/storage.ts";
import { loadTheme } from "../site/src/lib/theme.ts";
import { CSP } from "../vite.config.ts";

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const read = (path: string) => readFileSync(repo(path), "utf8");

// ---- colours ---------------------------------------------------------------------------

type RGB = [number, number, number];

/** sRGB 0-255 from #rgb, #rrggbb, rgb() or oklch(), the forms a token may take. */
function parseColor(text: string): RGB {
  const c = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((d) => d + d).join("") : hex[1]!;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const ok = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?/.exec(c);
  if (ok) return oklchToRgb(Number(ok[1]) / (ok[2] ? 100 : 1), Number(ok[3]), Number(ok[4]));
  throw new Error(`cannot read colour ${text}`);
}

function oklchToRgb(l: number, chroma: number, hue: number): RGB {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const gamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return lin.map((v) => Math.round(Math.min(1, Math.max(0, gamma(v))) * 255)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Splits "light-dark(a, b)" at its top-level comma. */
function lightDark(value: string): [string, string] | null {
  const m = /^light-dark\((.*)\)$/s.exec(value.trim());
  if (!m) return null;
  let depth = 0;
  for (let i = 0; i < m[1]!.length; i++) {
    const ch = m[1]![i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) return [m[1]!.slice(0, i).trim(), m[1]!.slice(i + 1).trim()];
  }
  return null;
}

const styles = () => read("site/src/styles.css");

/** The raw `--name: value` declarations of the @theme block. */
function themeTokens(): Map<string, string> {
  const css = styles();
  const start = css.indexOf("@theme");
  assert.ok(start >= 0, "styles.css has an @theme block");
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < css.length; end++) {
    if (css[end] === "{") depth++;
    else if (css[end] === "}" && --depth === 0) break;
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

type Mode = "light" | "dark";

/** A colour token's value in one mode, following var() references to other tokens. */
function token(name: string, mode: Mode, tokens = themeTokens()): RGB {
  const value = tokens.get(`--color-${name}`);
  assert.ok(value, `--color-${name} is a token`);
  const pair = lightDark(value);
  const side = pair ? pair[mode === "light" ? 0 : 1] : value;
  const ref = /^var\(--color-([\w-]+)\)$/.exec(side);
  return ref ? token(ref[1]!, mode, tokens) : parseColor(side);
}

const MODES: Mode[] = ["light", "dark"];

function assertPair(fg: string, bg: string, min: number) {
  const tokens = themeTokens();
  for (const mode of MODES) {
    const ratio = contrast(token(fg, mode, tokens), token(bg, mode, tokens));
    assert.ok(ratio >= min, `${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, want ${min}:1`);
  }
}

// ---- the typeface ----------------------------------------------------------------------

const pkg = () => JSON.parse(read("package.json")) as Record<string, Record<string, string> | undefined>;

function fontDeps(): [string, string][] {
  const p = pkg();
  return [...Object.entries(p.dependencies ?? {}), ...Object.entries(p.devDependencies ?? {})].filter(([n]) => n.startsWith("@fontsource"));
}

test("exactly one @fontsource typeface is a dependency, and it is a variable family", () => {
  const deps = fontDeps();
  assert.equal(deps.length, 1, `want one @fontsource package, got ${deps.map(([n]) => n).join(", ") || "none"}`);
  assert.match(deps[0]![0], /^@fontsource-variable\/[a-z0-9-]+$/);
});

test("the typeface's version is pinned exactly, in package.json and the lockfile", () => {
  const [name, version] = fontDeps()[0] ?? ["", ""];
  assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must be an exact version, got ${version}`);
  const lock = JSON.parse(read("package-lock.json")) as { packages: Record<string, { version?: string }> };
  assert.equal(lock.packages[`node_modules/${name}`]?.version, version);
});

test("the site imports the typeface from its package, not from a remote URL", () => {
  const [name] = fontDeps()[0] ?? [""];
  assert.ok(name, "a @fontsource package is a dependency");
  const sources = [read("site/src/main.tsx"), styles()].join("\n");
  assert.ok(sources.includes(name), `main.tsx or styles.css imports ${name}`);
});

/** The families of a CSS font stack, unquoted. */
const families = (stack: string) => stack.split(",").map((f) => f.trim().replace(/^["']|["']$/g, ""));

test("--font-sans names the typeface first, then falls back to the system font stack", () => {
  const stack = themeTokens().get("--font-sans");
  assert.ok(stack, "--font-sans is a token");
  const list = families(stack);
  assert.ok(list.length >= 3, `want the typeface plus a system stack, got ${stack}`);
  assert.doesNotMatch(list[0]!, /^(system-ui|-apple-system|sans-serif|ui-sans-serif)$/, "the typeface comes first");
  assert.ok(list.slice(1).includes("system-ui"), "the fallback includes system-ui");
  assert.equal(list.at(-1), "sans-serif", "the stack ends in the generic sans-serif");
});

// ---- the CSP ---------------------------------------------------------------------------

const directive = (name: string) => CSP.split(";").map((d) => d.trim()).find((d) => d.split(/\s+/)[0] === name);

test("the CSP allows fonts from the site's own origin only", () => {
  assert.equal(directive("font-src"), "font-src 'self'");
});

test("the CSP keeps blocking everything else: default none, no inline style or script, no remote hosts", () => {
  assert.equal(directive("default-src"), "default-src 'none'");
  assert.equal(directive("script-src"), "script-src 'self'");
  assert.equal(directive("style-src"), "style-src 'self'");
  assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval|https?:|\*/);
});

// ---- the built site --------------------------------------------------------------------

let out = "";
let builtFiles: string[] = [];
const builtText = (ext: string) => builtFiles.filter((f) => f.endsWith(ext)).map((f) => readFileSync(join(out, f), "utf8")).join("\n");

before(async () => {
  out = mkdtempSync(join(tmpdir(), "bento-build-"));
  const { build } = await import("vite");
  await build({
    configFile: repo("vite.config.ts"),
    root: repo("site"),
    logLevel: "silent",
    build: { outDir: out, emptyOutDir: true },
  });
  builtFiles = readdirSync(out, { recursive: true, encoding: "utf8" });
});

after(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

test("the build emits the typeface as .woff2 files, not data: URIs", () => {
  assert.ok(builtFiles.some((f) => f.endsWith(".woff2")), "dist holds a .woff2 file");
  assert.doesNotMatch(builtText(".css"), /url\(\s*["']?data:(font|application\/(font|x-font))/);
});

test("every @font-face in the built CSS loads a same-origin file that was emitted", () => {
  const css = builtText(".css");
  const urls = [...css.matchAll(/@font-face\s*{[^}]*}/g)].flatMap((face) => [...face[0].matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]!));
  assert.ok(urls.length > 0, "the built CSS declares the typeface");
  for (const url of urls) {
    assert.doesNotMatch(url, /^(https?:)?\/\/|^data:/, `${url} is same-origin`);
    const file = url.split(/[?#]/)[0]!.split("/").at(-1)!;
    assert.ok(builtFiles.some((f) => f.endsWith(file)), `${file} is in dist`);
  }
});

test("the built CSS declares one font family, the one --font-sans names first", () => {
  const css = builtText(".css");
  const declared = new Set([...css.matchAll(/@font-face\s*{[^}]*?font-family:\s*([^;}]+)/g)].map((m) => families(m[1]!)[0]));
  assert.equal(declared.size, 1, `want one family, got ${[...declared].join(", ")}`);
  assert.equal([...declared][0], families(themeTokens().get("--font-sans") ?? "")[0]);
});

test("the built page carries the CSP with font-src 'self', and no inline style or remote resource", () => {
  const html = builtText(".html").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  assert.ok(html.includes(`content="${CSP}"`), "the CSP meta is in the built page");
  assert.match(CSP, /font-src 'self'/);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /<style[\s>]/i);
  assert.doesNotMatch(html, /\s(src|href)\s*=\s*["']?(https?:)?\/\//i);
  assert.doesNotMatch(builtText(".css"), /url\(\s*["']?(https?:)?\/\//);
  assert.doesNotMatch(builtText(".css"), /@import\s+(url\()?\s*["']?(https?:)?\/\//);
});

// ---- source conventions ----------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  return readdirSync(repo(dir), { recursive: true, encoding: "utf8" }).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => `${dir}/${f}`);
}

test("no component, page or stylesheet uses an inline style attribute or a dark: variant", () => {
  for (const file of [...sourceFiles("site/src"), "site/index.html"]) {
    const text = read(file);
    assert.doesNotMatch(text, /\sstyle\s*=\s*[{"']/, `${file} has an inline style`);
    assert.doesNotMatch(text, /["'`\s]dark:[\w[-]/, `${file} has a dark: variant`);
  }
});

test("every colour token holds its light and dark value through light-dark()", () => {
  const colours = [...themeTokens()].filter(([name]) => name.startsWith("--color-"));
  assert.ok(colours.length > 0, "@theme defines colour tokens");
  for (const [name, value] of colours) {
    assert.ok(lightDark(value) || /^var\(--color-[\w-]+\)$/.test(value), `${name} uses light-dark(): ${value}`);
  }
});

test("the theme-color metas match the light and dark page background", () => {
  const html = read("site/index.html");
  for (const mode of MODES) {
    const meta = new RegExp(`<meta name="theme-color" content="([^"]+)" media="\\(prefers-color-scheme: ${mode}\\)">`).exec(html);
    assert.ok(meta, `a ${mode} theme-color meta`);
    assert.deepEqual(parseColor(meta[1]!), token("bg", mode), `${mode} theme-color follows --color-bg`);
  }
});

// ---- contrast (WCAG 2.2 AA) ------------------------------------------------------------

const SURFACES = ["bg", "surface", "surface-2"];

test("body and secondary text reach 4.5:1 on every surface in light and dark", () => {
  for (const fg of ["ink", "muted"]) for (const bg of SURFACES) assertPair(fg, bg, 4.5);
});

test("error text reaches 4.5:1 on the page and card surfaces in light and dark", () => {
  for (const bg of ["bg", "surface"]) assertPair("bad", bg, 4.5);
});

test("text on the accent fill reaches 4.5:1 in light and dark", () => {
  assertPair("on-accent", "accent", 4.5);
});

test("pack-kind labels reach 4.5:1 on their tinted backgrounds in light and dark", () => {
  for (const kind of ["gel", "solid", "drink"]) assertPair(kind, `${kind}-bg`, 4.5);
});

test("note text reaches 4.5:1 on the warning background in light and dark", () => {
  assertPair("ink", "warn-bg", 4.5);
});

test("the accent, which draws focus rings and selected borders, reaches 3:1 on the page and cards", () => {
  for (const bg of ["bg", "surface"]) assertPair("accent", bg, 3);
});

test("the focus ring is drawn in a token colour that reaches 3:1", () => {
  const rule = /:focus-visible\s*{([^}]*)}/.exec(styles());
  assert.ok(rule, "styles.css sets a :focus-visible outline");
  const colour = /var\(--color-([\w-]+)\)/.exec(rule[1]!);
  assert.ok(colour, "the outline uses a colour token");
  for (const bg of ["bg", "surface"]) assertPair(colour[1]!, bg, 3);
});

test("control boundaries (the line token on inputs and toggles) reach 3:1 on the page and cards", () => {
  for (const bg of ["bg", "surface"]) assertPair("line", bg, 3);
});

test("the invalid-input border reaches 3:1 on the card surface", () => {
  assertPair("bad", "surface", 3);
});

// ---- motion ----------------------------------------------------------------------------

test("prefers-reduced-motion: reduce turns transitions and animations off", () => {
  const css = styles();
  const at = css.search(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
  assert.ok(at >= 0, "styles.css has a reduced-motion block");
  const block = css.slice(at, css.indexOf("}", css.indexOf("{", css.indexOf("{", at) + 1)) + 1);
  assert.match(block, /\*/, "the block applies to every element");
  assert.match(block, /transition(-duration)?\s*:\s*(none|0s?)\b/);
  assert.match(block, /animation(-duration)?\s*:\s*(none|0s?)\b/);
});

// ---- what must not change --------------------------------------------------------------

function withStorage<T>(entries: Record<string, string>, run: () => T): T {
  const g = globalThis as { window?: unknown };
  const saved = g.window;
  g.window = { localStorage: { getItem: (k: string) => entries[k] ?? null, setItem: () => undefined } };
  try {
    return run();
  } finally {
    g.window = saved;
  }
}

test("saved settings still load from bento.settings.v1", () => {
  const stored = JSON.stringify({ session: { ...DEFAULT_SETTINGS.session, durationMin: 240 }, selected: ["gel-22"], custom: [] });
  const s = withStorage({ "bento.settings.v1": stored }, loadSettings);
  assert.equal(s.session.durationMin, 240);
  assert.deepEqual(s.selected, ["gel-22"]);
});

test("the pinned theme still loads from bento.theme", () => {
  assert.equal(withStorage({ "bento.theme": "dark" }, loadTheme), "dark");
  assert.equal(withStorage({ "bento.theme": "light" }, loadTheme), "light");
});

/** Every combination of the given lists, first list outermost. */
const grid = <T extends unknown[]>(...lists: { [K in keyof T]: readonly T[K][] }): T[] =>
  lists.reduce<unknown[][]>((acc, list) => acc.flatMap((row) => list.map((v) => [...row, v])), [[]]) as T[];

/** Every plan over a grid of sessions and packs, plus the display formatting, as one string. */
function plannerOutput(): string {
  const packSets = [[], DEFAULT_SETTINGS.selected, PRESETS.map((p) => p.id)].map((ids) => PRESETS.filter((p) => ids.includes(p.id)));
  const extras: Partial<Session>[] = [{}, { altitudeM: 2400, humidityPct: 80, gut: "high", caffeineMgKg: 0, airflow: "none" }];
  const activities = DISCIPLINE_IDS.flatMap((discipline) => effortsFor(discipline).map((effort) => ({ discipline, effort })));
  const parts: unknown[] = grid(activities, [15, 90, 300, 1440], [-20, 18, 32, 45], extras, packSets).map(([activity, durationMin, tempC, extra, packs]) =>
    buildPlan(toPlanInput({ ...DEFAULT_SETTINGS.session, ...activity, durationMin, tempC, ...extra }, packs)),
  );
  for (const m of [0, 5, 59, 60, 61, 135, 1440]) parts.push(fmtClock(m), fmtDuration(m));
  for (const ml of [0, 150, 999, 1000, 2500]) parts.push(fmtFluid(ml));
  for (const s of [0, 299, 330, 405, 1200]) parts.push(fmtPace(s));
  return JSON.stringify(parts);
}

// The planner's output for the grid above, taken before the UI rework. The rework changes
// only layout, styling and component copy, so this must not move.
const PLANNER_FINGERPRINT = "273f215e82ea5337e85dc2a1a8be21e111997bc2946d112b9823054500560704";

test("the planner produces the same numbers and text as before the UI rework", () => {
  const hash = createHash("sha256").update(plannerOutput()).digest("hex");
  assert.equal(hash, PLANNER_FINGERPRINT);
});
