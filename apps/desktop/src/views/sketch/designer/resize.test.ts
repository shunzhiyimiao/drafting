/** Resize math (S4): axis selection per handle, opposite-edge anchoring,
 *  integer rounding, sibling snap, positive clamp. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { computeResize, SNAP_TOLERANCE, type Rect } from "./resize.js";

const START: Rect = { x: 100, y: 50, width: 200, height: 80 };

test("east handle sets width from the west edge; corners set both axes", () => {
  const east = computeResize({ hx: 1, hy: 0.5 }, START, { x: 340, y: 999 });
  assert.equal(east.height, undefined, "midpoint handle never touches the other axis");
  assert.deepEqual(east, { width: 240, snapped: null });

  const corner = computeResize({ hx: 1, hy: 1 }, START, { x: 350, y: 170 });
  assert.equal(corner.width, 250);
  assert.equal(corner.height, 120);
});

test("west/north handles anchor on the opposite edge (position is the tree's)", () => {
  // Pulling the west edge 30px left of x → width grows to 230.
  const west = computeResize({ hx: 0, hy: 0.5 }, START, { x: 70, y: 0 });
  assert.equal(west.width, 230);
  // North: anchor is the bottom edge (y+height=130).
  const north = computeResize({ hx: 0.5, hy: 0 }, START, { x: 0, y: 40 });
  assert.equal(north.height, 90);
});

test("values round to integers and clamp to ≥ 1", () => {
  const r = computeResize({ hx: 1, hy: 0.5 }, START, { x: 100.4, y: 0 });
  assert.equal(r.width, 1, "collapsing past the anchor clamps to 1");
  const frac = computeResize({ hx: 1, hy: 0.5 }, START, { x: 340.6, y: 0 });
  assert.equal(frac.width, 241);
});

test("sibling snap adopts a matching dimension within tolerance", () => {
  const near = computeResize({ hx: 1, hy: 0.5 }, START, { x: 100 + 238, y: 0 }, [240, 500]);
  assert.equal(near.width, 240, "238 snaps to the 240 sibling");
  assert.deepEqual(near.snapped, { axis: "width", px: 240 });

  const far = computeResize(
    { hx: 1, hy: 0.5 },
    START,
    { x: 100 + 240 + SNAP_TOLERANCE + 2, y: 0 },
    [240],
  );
  assert.equal(far.snapped, null, "outside tolerance keeps the raw value");
  assert.equal(far.width, 246);
});
