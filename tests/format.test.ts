import { strict as assert } from "node:assert";
import { test } from "node:test";

import { fmtBand, fmtClock, fmtDuration, fmtFluid, fmtGrams, fmtMg, fmtPace, parsePace } from "../site/src/lib/format.ts";

test("clock and duration", () => {
  assert.equal(fmtClock(5), "0:05");
  assert.equal(fmtClock(135), "2:15");
  assert.equal(fmtClock(-3), "0:00");
  assert.equal(fmtDuration(45), "45 min");
  assert.equal(fmtDuration(180), "3 h");
  assert.equal(fmtDuration(150), "2 h 30 min");
});

test("amounts", () => {
  assert.equal(fmtFluid(750), "750 ml");
  assert.equal(fmtFluid(1000), "1 L");
  assert.equal(fmtFluid(1500), "1.5 L");
  assert.equal(fmtGrams(39.6), "40 g");
  assert.equal(fmtMg(450), "450 mg");
  assert.equal(fmtBand([60, 90], "g/h"), "60-90 g/h");
  assert.equal(fmtBand([60, 60], "g/h"), "60 g/h");
});

test("pace reads and prints as min:sec per km", () => {
  assert.equal(fmtPace(330), "5:30");
  assert.equal(fmtPace(0), "");
  assert.equal(parsePace("5:30"), 330);
  assert.equal(parsePace("5.05"), 305);
  assert.equal(parsePace("6"), 360);
  assert.equal(parsePace(""), 0);
  assert.equal(parsePace("5:75"), null);
  assert.equal(parsePace("1:00"), null, "faster than 2:30/km is a typo");
  assert.equal(parsePace("fast"), null);
});
