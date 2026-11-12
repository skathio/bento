import { strict as assert } from "node:assert";
import { test } from "node:test";

import { asPack, NAME_MAX, packId, PRESETS, validatePack } from "../site/src/lib/products.ts";
import { PACK_KINDS } from "../site/src/lib/types.ts";

const gel = { name: "My gel", kind: "gel", carbsG: 25, sodiumMg: 50, caffeineMg: 0, fluidMl: 0, volumeMl: 40 } as const;

test("presets are valid and cover every pack kind", () => {
  for (const p of PRESETS) assert.deepEqual(validatePack(p), [], p.id);
  for (const kind of PACK_KINDS) assert.ok(PRESETS.some((p) => p.kind === kind), kind);
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
});

test("validatePack catches bad entries", () => {
  assert.deepEqual(validatePack(gel), []);
  assert.ok(validatePack({ ...gel, name: " " }).length > 0);
  assert.ok(validatePack({ ...gel, carbsG: 500 }).length > 0);
  assert.ok(validatePack({ ...gel, sodiumMg: -1 }).length > 0);
  assert.ok(validatePack({ ...gel, kind: "pill" as never }).length > 0);
  assert.ok(validatePack({ ...gel, kind: "drink" }).some((e) => /fluid/.test(e)));
  assert.ok(validatePack({ ...gel, carbsG: 0 }).some((e) => /carbs or fluid/.test(e)));
  assert.deepEqual(validatePack({ ...gel, kind: "drink", carbsG: 0, fluidMl: 500 }), []);
});

test("packId is safe and unique", () => {
  assert.equal(packId("Maurten 100!", []), "custom-maurten-100");
  assert.equal(packId("???", []), "custom-pack");
  assert.equal(packId("Bar", ["custom-bar", "custom-bar-2"]), "custom-bar-3");
});

test("asPack accepts only valid stored packs", () => {
  assert.deepEqual(asPack({ ...gel, id: "custom-my-gel", name: " My gel " }), { ...gel, id: "custom-my-gel" });
  assert.equal(asPack(null), null);
  assert.equal(asPack("gel"), null);
  assert.equal(asPack(gel), null);
  assert.equal(asPack({ ...gel, id: "custom-x", carbsG: "lots" }), null);
  assert.equal(asPack({ ...gel, id: "gel-22" }), null);
  assert.equal(asPack({ ...gel, id: "custom-x", name: "n".repeat(NAME_MAX + 1) }), null);
});
