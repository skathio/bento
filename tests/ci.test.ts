import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = (name: string) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");

test("every hashira pin and library_ref names the same SHA", () => {
  const text = workflow("deploy.yml") + workflow("pr.yml");
  const pins = [...text.matchAll(/skathio\/hashira\/[^@\s]+@([0-9a-f]{40})/g)].map((m) => m[1]);
  const refs = [...text.matchAll(/library_ref:\s*"([0-9a-f]{40})"/g)].map((m) => m[1]);
  assert.equal(pins.length, 3);
  assert.equal(refs.length, 2);
  assert.equal(new Set([...pins, ...refs]).size, 1);
});
