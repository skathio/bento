// Requirement tests for the Bento MVP, written before the build.
// They check only what the request states. The request gives no function
// names or result shapes for the planner, so the domain rules are checked as
// supported vocabulary in site/src/lib rather than through invented APIs; the
// builder chooses the API and adds behaviour tests next to it.
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...parts: string[]) => join(ROOT, ...parts);
const read = (...parts: string[]) => readFileSync(p(...parts), "utf8");

function libSource(): string {
  const dir = p("site", "src", "lib");
  assert.ok(existsSync(dir), "site/src/lib must hold the planner logic");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n")
    .toLowerCase();
}

function workflows(): string[] {
  const dir = p(".github", "workflows");
  assert.ok(existsSync(dir), ".github/workflows must exist");
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => readFileSync(join(dir, f), "utf8"));
}

test("the web app is called Bento", () => {
  assert.ok(existsSync(p("site", "index.html")), "site/index.html must exist");
  const title = /<title>([^<]*)<\/title>/i.exec(read("site", "index.html"));
  assert.ok(title, "site/index.html needs a <title>");
  assert.match(title[1], /bento/i);
});

test("the MVP is a buildable, testable site (npm build and npm test)", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(typeof pkg.scripts?.build, "string");
  assert.equal(typeof pkg.scripts?.test, "string");
});

test("CI/CD runs on hashira's reusable static-webapp workflow", () => {
  const all = workflows();
  assert.ok(
    all.some((y) => /uses:\s*skathio\/hashira\/\.github\/workflows\/static-webapp-ci\.yml@/.test(y)),
    "a workflow must call skathio/hashira static-webapp-ci.yml",
  );
});

test("CD deploys through hashira's pages-deploy action", () => {
  assert.ok(
    workflows().some((y) => /uses:\s*skathio\/hashira\/\.github\/actions\/pages-deploy@/.test(y)),
    "a workflow must deploy with skathio/hashira pages-deploy",
  );
});

test("plans cover bike, running and trail running", () => {
  const src = libSource();
  assert.match(src, /\b(bike|ride|cycling)\b/, "bike sport");
  assert.match(src, /\b(run|running)\b/, "running sport");
  assert.match(src, /trail[ _-]?run/, "trail running sport");
});

test("plans vary by workout type: endurance, race, z2", () => {
  const src = libSource();
  for (const w of ["endurance", "race", "z2"]) assert.match(src, new RegExp(`\\b${w}\\b`), w);
});

test("fuel packs can be gels, solids or drinks", () => {
  const src = libSource();
  assert.match(src, /\bgels?\b/, "gel");
  assert.match(src, /\bsolids?\b/, "solid");
  assert.match(src, /\bdrinks?\b/, "drink");
});

test("plans vary by terrain: road or trail", () => {
  const src = libSource();
  assert.match(src, /\broad\b/, "road");
  assert.match(src, /\btrail\b/, "trail");
});
