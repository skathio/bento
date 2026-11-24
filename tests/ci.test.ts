import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const workflowUrl = (name: string) => new URL(`../.github/workflows/${name}`, import.meta.url);

test("every hashira ref tracks the same moving major tag", () => {
  const text = readFileSync(workflowUrl("ci.yml"), "utf8");
  const refs = [...text.matchAll(/skathio\/hashira\/[^@\s]+@(\S+)/g)].map((m) => m[1]);
  assert.equal(refs.length, 2);
  for (const ref of refs) assert.match(ref ?? "", /^v[0-9]+$/);
  assert.equal(new Set(refs).size, 1);
});

test("the caller job is named ci, so the required check is ci / passed", () => {
  const text = readFileSync(workflowUrl("ci.yml"), "utf8");
  assert.match(text, /^ {2}ci:\n(?: {4}.*\n)*? {4}uses: skathio\/hashira\/\.github\/workflows\/static-webapp-ci\.yml@/m);
});

test("hashira v3 inputs: no library_ref, and no second caller file", () => {
  const text = readFileSync(workflowUrl("ci.yml"), "utf8");
  assert.doesNotMatch(text, /library_ref/);
  assert.equal(existsSync(workflowUrl("pr.yml")), false);
  assert.equal(existsSync(workflowUrl("deploy.yml")), false);
});
