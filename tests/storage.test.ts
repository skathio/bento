import { strict as assert } from "node:assert";
import { test } from "node:test";

import { commitNumber, CUSTOM_MAX, DEFAULT_SETTINGS, inRange, parseSession, parseSettings } from "../site/src/lib/storage.ts";

test("missing or corrupt storage gives the defaults", () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("{not json"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("42"), DEFAULT_SETTINGS);
});

test("sessions are clamped and enums checked", () => {
  const s = parseSession({ discipline: "run-trail", effort: "swim", durationMin: 99999, bodyKg: "heavy", gut: "huge" });
  assert.equal(s.discipline, "run-trail");
  assert.equal(s.effort, "run-steady");
  assert.equal(s.durationMin, 1440);
  assert.equal(s.bodyKg, DEFAULT_SETTINGS.session.bodyKg);
  assert.equal(s.gut, DEFAULT_SETTINGS.session.gut);
});

test("custom packs and selections survive a round trip; unknown ids drop", () => {
  const custom = { id: "custom-x", name: "X", kind: "solid", carbsG: 30, sodiumMg: 0, caffeineMg: 0, fluidMl: 0, volumeMl: 50 };
  const json = JSON.stringify({ session: {}, selected: ["custom-x", "gel-22", "gone", 7], custom: [custom, { id: "bad" }] });
  const s = parseSettings(json);
  assert.deepEqual(s.custom, [custom]);
  assert.deepEqual(s.selected, ["custom-x", "gel-22"]);
});

test("commitNumber clamps on commit and rejects non-numbers", () => {
  assert.equal(commitNumber("bodyKg", "85"), 85);
  assert.equal(commitNumber("bodyKg", "8"), 30);
  assert.equal(commitNumber("bodyKg", "305"), 150);
  assert.equal(commitNumber("durationMin", ""), null);
  assert.equal(commitNumber("durationMin", "abc"), null);
});

test("inRange lets a partial value through only when it is already valid", () => {
  assert.equal(inRange("bodyKg", "8"), false);
  assert.equal(inRange("bodyKg", "85"), true);
  assert.equal(inRange("durationMin", "9"), false);
  assert.equal(inRange("durationMin", "90"), true);
});

test("stored custom packs cannot reuse preset ids, repeat, or grow without bound", () => {
  const pack = (id: string) => ({ id, name: "X", kind: "solid", carbsG: 30, sodiumMg: 0, caffeineMg: 0, fluidMl: 0, volumeMl: 50 });
  assert.deepEqual(parseSettings(JSON.stringify({ custom: [pack("gel-22")] })).custom, []);
  assert.equal(parseSettings(JSON.stringify({ custom: [pack("custom-a"), pack("custom-a")] })).custom.length, 1);
  const many = Array.from({ length: CUSTOM_MAX + 10 }, (_, i) => pack(`custom-p${i}`));
  assert.equal(parseSettings(JSON.stringify({ custom: many })).custom.length, CUSTOM_MAX);
});

test("a stored pack with a non-text name is dropped without losing the rest", () => {
  const json = JSON.stringify({
    session: { bodyKg: 90 },
    custom: [{ id: "custom-b", name: 5, kind: "gel", carbsG: 20, sodiumMg: 1, caffeineMg: 0, fluidMl: 0, volumeMl: 1 }],
  });
  const s = parseSettings(json);
  assert.deepEqual(s.custom, []);
  assert.equal(s.session.bodyKg, 90);
});

test("stored selections keep each pack once", () => {
  assert.deepEqual(parseSettings(JSON.stringify({ selected: ["gel-40", "gel-40", "bar"] })).selected, ["gel-40", "bar"]);
});
