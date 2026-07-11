/** Frame-move math (S5): logical-delta application, rounding, negatives. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { computeFrameMove } from "./frame-move.js";

test("delta in logical units lands on startPos + Δ, rounded to integers", () => {
  const start = { x: 100, y: 50 };
  assert.deepEqual(computeFrameMove({ x: 20, y: 30 }, start, { x: 140.4, y: 55.8 }), {
    x: 60,
    y: 36,
  });
  // Zero delta is the identity.
  assert.deepEqual(computeFrameMove({ x: 20, y: 30 }, start, start), { x: 20, y: 30 });
});

test("negative positions are legal — the child may hang off the edge", () => {
  const out = computeFrameMove({ x: 4, y: 4 }, { x: 0, y: 0 }, { x: -30, y: -10 });
  assert.deepEqual(out, { x: -26, y: -6 });
});
