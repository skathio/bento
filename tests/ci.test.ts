import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const workflowUrl = (name: string) => new URL(`../.github/workflows/${name}`, import.meta.url);

test("every hashira pin names the same 40-character SHA", () => {
  const text = readFileSync(workflowUrl("ci.yml"), "utf8");
  const pins = [...text.matchAll(/skathio\/hashira\/[^@\s]+@(\S+)/g)].map((m) => m[1]);
  assert.equal(pins.length, 2);
  for (const pin of pins) assert.match(pin ?? "", /^[0-9a-f]{40}$/);
  assert.equal(new Set(pins).size, 1);
});

test("hashira v3 inputs: no library_ref, and no second caller file", () => {
  const text = readFileSync(workflowUrl("ci.yml"), "utf8");
  assert.doesNotMatch(text, /library_ref/);
  assert.equal(existsSync(workflowUrl("pr.yml")), false);
  assert.equal(existsSync(workflowUrl("deploy.yml")), false);
});
