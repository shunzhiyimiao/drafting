/**
 * computeInsertion — the pure half of narrowed free-drag (§7.1). The mandated
 * cases: row/col direction, first/last edges, nested containers, empty
 * containers; plus subtree exclusion, primitive fall-through, and template
 * multi-instance boxes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeDrop,
  computeInsertion,
  indicatorFor,
  indicatorRect,
  type LayoutBox,
} from "./insertion.js";

/** A row container [a | b | c] with children at x = 0..40, 50..90, 100..140. */
function rowBoxes(): LayoutBox[] {
  return [
    {
      boxId: "root",
      nodeId: "root",
      rect: { x: 0, y: 0, width: 200, height: 50 },
      container: { direction: "row" },
      parentBoxId: null,
      childBoxIds: ["a", "b", "c"],
    },
    { boxId: "a", nodeId: "a", rect: { x: 0, y: 0, width: 40, height: 50 }, parentBoxId: "root", childBoxIds: [] },
    { boxId: "b", nodeId: "b", rect: { x: 50, y: 0, width: 40, height: 50 }, parentBoxId: "root", childBoxIds: [] },
    { boxId: "c", nodeId: "c", rect: { x: 100, y: 0, width: 40, height: 50 }, parentBoxId: "root", childBoxIds: [] },
  ];
}

test("row: nearest gap by main-axis midpoints, first and last edges included", () => {
  const boxes = rowBoxes();
  // Before a's midpoint (20) → index 0.
  assert.deepEqual(computeInsertion({ x: 5, y: 25 }, boxes), {
    containerId: "root",
    index: 0,
    targetBoxId: "root",
  });
  // Between a (mid 20) and b (mid 70) → index 1.
  assert.equal(computeInsertion({ x: 45, y: 25 }, boxes)?.index, 1);
  // Between b and c (mid 120) → index 2.
  assert.equal(computeInsertion({ x: 95, y: 25 }, boxes)?.index, 2);
  // Past c's midpoint → index 3 (append).
  assert.equal(computeInsertion({ x: 190, y: 25 }, boxes)?.index, 3);
});

test("landing ON a primitive inserts into its parent at that child's slot", () => {
  const boxes = rowBoxes();
  // Left half of b (x 50..70) → before b (index 1); right half → after (2).
  assert.equal(computeInsertion({ x: 55, y: 25 }, boxes)?.index, 1);
  assert.equal(computeInsertion({ x: 85, y: 25 }, boxes)?.index, 2);
});

test("col: same rule on the y axis", () => {
  const boxes: LayoutBox[] = [
    {
      boxId: "root",
      nodeId: "root",
      rect: { x: 0, y: 0, width: 100, height: 150 },
      container: { direction: "col" },
      parentBoxId: null,
      childBoxIds: ["a", "b"],
    },
    { boxId: "a", nodeId: "a", rect: { x: 0, y: 0, width: 100, height: 40 }, parentBoxId: "root", childBoxIds: [] },
    { boxId: "b", nodeId: "b", rect: { x: 0, y: 60, width: 100, height: 40 }, parentBoxId: "root", childBoxIds: [] },
  ];
  assert.equal(computeInsertion({ x: 50, y: 10 }, boxes)?.index, 0);
  assert.equal(computeInsertion({ x: 50, y: 50 }, boxes)?.index, 1);
  assert.equal(computeInsertion({ x: 50, y: 140 }, boxes)?.index, 2);
});

test("nested containers: the deepest one under the point wins", () => {
  const boxes: LayoutBox[] = [
    {
      boxId: "outer",
      nodeId: "outer",
      rect: { x: 0, y: 0, width: 200, height: 100 },
      container: { direction: "col" },
      parentBoxId: null,
      childBoxIds: ["inner"],
    },
    {
      boxId: "inner",
      nodeId: "inner",
      rect: { x: 20, y: 20, width: 100, height: 60 },
      container: { direction: "row" },
      parentBoxId: "outer",
      childBoxIds: [],
    },
  ];
  assert.equal(computeInsertion({ x: 50, y: 50 }, boxes)?.containerId, "inner");
  assert.equal(computeInsertion({ x: 150, y: 50 }, boxes)?.containerId, "outer");
});

test("empty container: index 0, and the indicator falls back to null (ring)", () => {
  const boxes: LayoutBox[] = [
    {
      boxId: "root",
      nodeId: "root",
      rect: { x: 0, y: 0, width: 100, height: 100 },
      container: { direction: "col" },
      parentBoxId: null,
      childBoxIds: [],
    },
  ];
  const ins = computeInsertion({ x: 50, y: 50 }, boxes);
  assert.deepEqual(ins, { containerId: "root", index: 0, targetBoxId: "root" });
  assert.equal(indicatorRect(ins!, boxes), null);
});

test("no container under the point → null (empty-canvas drops are no-ops)", () => {
  assert.equal(computeInsertion({ x: 500, y: 500 }, rowBoxes()), null);
});

test("excluded subtree containers fall through to the ancestor", () => {
  const boxes: LayoutBox[] = [
    {
      boxId: "root",
      nodeId: "root",
      rect: { x: 0, y: 0, width: 200, height: 100 },
      container: { direction: "col" },
      parentBoxId: null,
      childBoxIds: ["dragged"],
    },
    {
      boxId: "dragged",
      nodeId: "dragged",
      rect: { x: 10, y: 10, width: 180, height: 80 },
      container: { direction: "row" },
      parentBoxId: "root",
      childBoxIds: [],
    },
  ];
  // Dropping a container onto itself resolves to its parent, never itself.
  const ins = computeInsertion({ x: 50, y: 50 }, boxes, new Set(["dragged"]));
  assert.equal(ins?.containerId, "root");
});

test("template instances: several boxes, one nodeId — any instance targets the template", () => {
  const boxes: LayoutBox[] = [
    {
      boxId: "list",
      nodeId: "mail-list",
      rect: { x: 0, y: 0, width: 100, height: 200 },
      container: undefined, // lists are not drop targets themselves
      parentBoxId: null,
      childBoxIds: ["tmpl@0", "tmpl@1"],
    },
    {
      boxId: "tmpl@0",
      nodeId: "mail-row",
      rect: { x: 0, y: 0, width: 100, height: 90 },
      container: { direction: "row" },
      parentBoxId: "list",
      childBoxIds: [],
    },
    {
      boxId: "tmpl@1",
      nodeId: "mail-row",
      rect: { x: 0, y: 100, width: 100, height: 90 },
      container: { direction: "row" },
      parentBoxId: "list",
      childBoxIds: [],
    },
  ];
  const first = computeInsertion({ x: 50, y: 40 }, boxes);
  const second = computeInsertion({ x: 50, y: 150 }, boxes);
  assert.equal(first?.containerId, "mail-row");
  assert.equal(first?.targetBoxId, "tmpl@0");
  assert.equal(second?.containerId, "mail-row");
  assert.equal(second?.targetBoxId, "tmpl@1");
});

// ------------------------------------------------- side-drop wrap (§7.1) --

/** A col container with one full-width leaf child: x 0..200, child y 10..50. */
function colWithLeaf(): LayoutBox[] {
  return [
    {
      boxId: "root",
      nodeId: "root",
      rect: { x: 0, y: 0, width: 200, height: 100 },
      container: { direction: "col" },
      parentBoxId: null,
      childBoxIds: ["leaf"],
    },
    { boxId: "leaf", nodeId: "leaf", rect: { x: 0, y: 10, width: 200, height: 40 }, parentBoxId: "root", childBoxIds: [] },
  ];
}

test("side-drop: outer quarters of a leaf in a col parent wrap into a row", () => {
  const boxes = colWithLeaf();
  // Left 25% (x < 50) → wrap, dragged goes before.
  assert.deepEqual(computeDrop({ x: 30, y: 30 }, boxes), {
    kind: "wrap",
    targetNodeId: "leaf",
    targetBoxId: "leaf",
    side: "before",
    direction: "row",
  });
  // Right 25% (x > 150) → wrap, dragged goes after.
  assert.deepEqual(computeDrop({ x: 170, y: 30 }, boxes), {
    kind: "wrap",
    targetNodeId: "leaf",
    targetBoxId: "leaf",
    side: "after",
    direction: "row",
  });
  // Middle band keeps the ordinary gap semantics (midpoint rule).
  assert.deepEqual(computeDrop({ x: 100, y: 20 }, boxes), {
    kind: "insert",
    containerId: "root",
    index: 0,
    targetBoxId: "root",
  });
  assert.equal(computeDrop({ x: 100, y: 40 }, boxes)?.kind, "insert");
  // Off the leaf entirely → plain insert too.
  assert.equal(computeDrop({ x: 30, y: 80 }, boxes)?.kind, "insert");
});

test("side-drop: in a row parent the wrap sides are top/bottom and the wrapper is a col", () => {
  const boxes: LayoutBox[] = [
    {
      boxId: "row",
      nodeId: "row",
      rect: { x: 0, y: 0, width: 200, height: 100 },
      container: { direction: "row" },
      parentBoxId: null,
      childBoxIds: ["leaf"],
    },
    { boxId: "leaf", nodeId: "leaf", rect: { x: 20, y: 0, width: 60, height: 100 }, parentBoxId: "row", childBoxIds: [] },
  ];
  assert.deepEqual(computeDrop({ x: 50, y: 10 }, boxes), {
    kind: "wrap",
    targetNodeId: "leaf",
    targetBoxId: "leaf",
    side: "before",
    direction: "col",
  });
  const bottom = computeDrop({ x: 50, y: 90 }, boxes);
  assert.ok(bottom?.kind === "wrap" && bottom.side === "after", "bottom zone wraps after");
  assert.equal(computeDrop({ x: 50, y: 50 }, boxes)?.kind, "insert");
});

test("side-drop: the dragged subtree and containers never become wrap targets", () => {
  const boxes = colWithLeaf();
  // The leaf IS the dragged node → its side zones fall through to gaps.
  const excluded = computeDrop({ x: 30, y: 30 }, boxes, new Set(["leaf"]));
  assert.equal(excluded?.kind, "insert");

  // A container child absorbs the point as the deeper insertion target.
  const nested: LayoutBox[] = [
    {
      boxId: "root",
      nodeId: "root",
      rect: { x: 0, y: 0, width: 200, height: 100 },
      container: { direction: "col" },
      parentBoxId: null,
      childBoxIds: ["inner"],
    },
    {
      boxId: "inner",
      nodeId: "inner",
      rect: { x: 0, y: 10, width: 200, height: 40 },
      container: { direction: "row" },
      parentBoxId: "root",
      childBoxIds: [],
    },
  ];
  const intoInner = computeDrop({ x: 10, y: 30 }, nested);
  assert.deepEqual(intoInner, { kind: "insert", containerId: "inner", index: 0, targetBoxId: "inner" });
});

test("side-drop indicator: the joined half as a zone; insert plans stay lines", () => {
  const boxes = colWithLeaf();
  const wrap = computeDrop({ x: 170, y: 30 }, boxes)!;
  assert.deepEqual(indicatorFor(wrap, boxes), {
    rect: { x: 100, y: 10, width: 100, height: 40 },
    kind: "zone",
  });
  const before = computeDrop({ x: 30, y: 30 }, boxes)!;
  assert.deepEqual(indicatorFor(before, boxes)?.rect, { x: 0, y: 10, width: 100, height: 40 });

  const insert = computeDrop({ x: 100, y: 80 }, boxes)!;
  const line = indicatorFor(insert, boxes);
  assert.equal(line?.kind, "line");
  assert.deepEqual(line?.rect, { x: 0, y: 49, width: 200, height: 2 });
});

test("indicator geometry: vertical line in a row gap, horizontal in a col gap", () => {
  const boxes = rowBoxes();
  // Gap between a (ends 40) and b (starts 50) → line at x 44, container-tall.
  const between = indicatorRect({ containerId: "root", index: 1, targetBoxId: "root" }, boxes);
  assert.deepEqual(between, { x: 44, y: 0, width: 2, height: 50 });
  // Append end: after c (ends 140).
  const append = indicatorRect({ containerId: "root", index: 3, targetBoxId: "root" }, boxes);
  assert.deepEqual(append, { x: 139, y: 0, width: 2, height: 50 });
});
