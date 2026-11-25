// The look the UI rework settled on, beyond what the layout and accessibility tests hold: the lacquer
// gradient marks at most one primary element and no selected control, labels are not uppercase and
// tracked, the sections do not all sit in the same rounded card, and the copy the components own
// carries no middle-dot separators (strings built by site/src/lib keep theirs).
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const repo = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const read = (path: string) => readFileSync(repo(path), "utf8");

/** Everything outside site/src/lib that puts markup or copy on the page. */
const UI_FILES = ["site/index.html", "site/src/App.tsx", ...readdirSync(repo("site/src/components")).map((f) => `site/src/components/${f}`)];
const uiSources = () => UI_FILES.map((file) => ({ file, text: read(file) }));

let page = "";

before(async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ configFile: repo("vite.config.ts"), root: repo("site"), logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const App = (await server.ssrLoadModule("/src/App.tsx")).default as ComponentType;
    page = renderToStaticMarkup(createElement(App));
  } finally {
    await server.close();
  }
});

const openTags = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? [];
const classesOf = (tag: string) => (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(/\s+/).filter(Boolean);

test("the lacquer gradient fills at most one element in the components", () => {
  const uses = uiSources().flatMap(({ file, text }) => (text.match(/\bbg-lacquer\b/g) ?? []).map(() => file));
  assert.ok(uses.length <= 1, `bg-lacquer is used ${uses.length} times: ${uses.join(", ")}`);
});

test("no selected control (a checked radio) carries the lacquer gradient", () => {
  const checked = openTags(page, "button").filter((tag) => tag.includes('aria-checked="true"'));
  assert.ok(checked.length >= 3, "the activity, discipline and workout each have a checked radio");
  assert.deepEqual(checked.filter((tag) => classesOf(tag).includes("bg-lacquer")), []);
});

test("no label is uppercase or letter-spaced wide", () => {
  const bad = uiSources().filter(({ text }) => /\b(uppercase|tracking-(wide|wider|widest))\b/.test(text)).map(({ file }) => file);
  assert.deepEqual(bad, []);
});

test("the titled sections do not all sit in the same card", () => {
  const titled = openTags(page, "section").filter((tag) => !tag.includes("aria-label"));
  assert.equal(titled.length, 4, "Session, Fuel packs, Your bento and Timeline");
  const carded = titled.filter((tag) => classesOf(tag).some((c) => /^border(-\d+)?$/.test(c)) && classesOf(tag).includes("bg-surface"));
  assert.ok(carded.length <= 1, `${carded.length} of ${titled.length} sections are bordered cards`);
});

test("copy owned by the components and the page carries no middle-dot separator", () => {
  const bad = uiSources().filter(({ text }) => text.includes("·")).map(({ file }) => file);
  assert.deepEqual(bad, []);
});

test("the page is still titled Bento", () => {
  assert.match(read("site/index.html"), /<title>Bento\b[^<]*<\/title>/);
});
