/**
 * The drag-session laws, encoded (S1). These are the exactly-once and
 * lifecycle guarantees the canvas integration relies on — do not weaken
 * them to make an implementation convenient.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  beginSession,
  cancel,
  commit,
  move,
  setPlan,
  NODE_DRAG_THRESHOLD,
} from "./drag-session.js";
import type { DragSource } from "./types.js";
import type { DropPlan } from "../insertion.js";

const NODE_SOURCE: DragSource = {
  type: "existing-node",
  nodeId: "n1",
  label: "button",
  excludeNodeIds: new Set(["n1"]),
};
const PALETTE_SOURCE: DragSource = { type: "palette", kind: "text" };

const PLAN: DropPlan = { kind: "insert", containerId: "root", index: 0, targetBoxId: "b0" };

test("law 1: pending → dragging — node drags need the threshold, palette activates on first move", () => {
  let node = beginSession(1, NODE_SOURCE, 100, 100);
  assert.equal(node.phase, "pending");
  node = move(node, 1, 101, 101); // under 4px
  assert.equal(node.phase, "pending", "sub-threshold movement stays pending");
  node = move(node, 1, 100 + NODE_DRAG_THRESHOLD, 100);
  assert.equal(node.phase, "dragging");

  let palette = beginSession(2, PALETTE_SOURCE, 50, 50);
  palette = move(palette, 2, 50, 50); // zero distance still activates
  assert.equal(palette.phase, "dragging");
});

test("law 2: pending → cancelled — via cancel, and via a release that was just a click", () => {
  const s = beginSession(1, NODE_SOURCE, 0, 0);
  assert.equal(cancel(s).phase, "cancelled");

  const { session: clicked, plan } = commit(s, 1);
  assert.equal(clicked.phase, "cancelled");
  assert.equal(plan, null, "a click never surfaces a plan");
});

test("law 3: dragging → committed surfaces the plan exactly once", () => {
  let s = move(beginSession(1, NODE_SOURCE, 0, 0), 1, 10, 10);
  s = setPlan(s, PLAN);
  const first = commit(s, 1);
  assert.equal(first.session.phase, "committed");
  assert.deepEqual(first.plan, PLAN);
});

test("law 4: dragging → cancelled clears the plan", () => {
  let s = move(beginSession(1, NODE_SOURCE, 0, 0), 1, 10, 10);
  s = setPlan(s, PLAN);
  const c = cancel(s);
  assert.equal(c.phase, "cancelled");
  assert.equal(c.plan, null);
});

test("law 5: committed never becomes dragging again — moves and plans bounce off", () => {
  let s = move(beginSession(1, NODE_SOURCE, 0, 0), 1, 10, 10);
  s = commit(setPlan(s, PLAN), 1).session;
  assert.equal(s.phase, "committed");
  const after = setPlan(move(s, 1, 99, 99), PLAN);
  assert.equal(after.phase, "committed");
  assert.deepEqual(after.current, s.current, "position frozen after commit");
});

test("law 6: a cancelled session cannot commit", () => {
  let s = move(beginSession(1, NODE_SOURCE, 0, 0), 1, 10, 10);
  s = cancel(setPlan(s, PLAN));
  const { session: after, plan } = commit(s, 1);
  assert.equal(plan, null);
  assert.equal(after.phase, "cancelled");
});

test("laws 7 + 10: a second commit is ignored and yields no plan", () => {
  let s = move(beginSession(1, NODE_SOURCE, 0, 0), 1, 10, 10);
  s = setPlan(s, PLAN);
  const first = commit(s, 1);
  assert.deepEqual(first.plan, PLAN);
  const second = commit(first.session, 1);
  assert.equal(second.plan, null, "duplicate pointerup must not commit twice");
  assert.equal(second.session.phase, "committed");
  const third = commit(second.session, 1);
  assert.equal(third.plan, null);
});

test("law 8: events from the wrong pointerId never mutate the session", () => {
  let s = move(beginSession(1, NODE_SOURCE, 0, 0), 1, 10, 10);
  s = setPlan(s, PLAN);

  const movedByOther = move(s, 2, 500, 500);
  assert.deepEqual(movedByOther, s, "foreign move ignored");

  const { session: after, plan } = commit(s, 2);
  assert.equal(plan, null, "foreign pointerup cannot commit");
  assert.deepEqual(after, s, "session unchanged by foreign commit");
});

test("law 9: cancellation is idempotent", () => {
  const s = move(beginSession(1, NODE_SOURCE, 0, 0), 1, 10, 10);
  const once = cancel(s);
  const twice = cancel(once);
  assert.deepEqual(twice, once);
});

test("cancel after commit keeps committed (no un-commit, no re-open)", () => {
  let s = move(beginSession(1, NODE_SOURCE, 0, 0), 1, 10, 10);
  s = commit(setPlan(s, PLAN), 1).session;
  const c = cancel(s);
  assert.equal(c.phase, "committed");
  assert.equal(c.committed, true);
});

test("a committed no-op drop (plan null) still ends the session with zero mutations", () => {
  const s = move(beginSession(1, NODE_SOURCE, 0, 0), 1, 10, 10);
  const { session: after, plan } = commit(s, 1); // off-sheet: no plan attached
  assert.equal(plan, null);
  assert.equal(after.phase, "committed");
  assert.equal(commit(after, 1).plan, null);
});

test("setPlan only takes effect while dragging", () => {
  const pending = beginSession(1, NODE_SOURCE, 0, 0);
  assert.equal(setPlan(pending, PLAN).plan, null);
  const cancelled = cancel(move(pending, 1, 10, 10));
  assert.equal(setPlan(cancelled, PLAN).plan, null);
});

// ------------------------------------------------- Magic Frame (Phase 2) --

test("marquee source rides the same laws: threshold, single commit, cancel", () => {
  let s = beginSession(7, { type: "marquee" }, 100, 100);
  assert.equal(s.phase, "pending");
  // Below the threshold it is still a click…
  s = move(s, 7, 102, 101);
  assert.equal(s.phase, "pending");
  // …and a pending release is a cancelled click: NO plan, no mutation.
  const click = commit(s, 7);
  assert.equal(click.plan, null);
  assert.equal(click.session.phase, "cancelled");

  // Crossing the threshold drags; commit yields the plan exactly once.
  let d = beginSession(8, { type: "marquee" }, 100, 100);
  d = move(d, 8, 140, 160);
  assert.equal(d.phase, "dragging");
  const plan: import("../insertion").DropPlan = {
    kind: "marquee",
    nodeIds: ["a"],
    boxIds: ["b0"],
  };
  d = setPlan(d, plan);
  const first = commit(d, 8);
  assert.equal(first.plan, plan);
  const second = commit(first.session, 8);
  assert.equal(second.plan, null, "law 7/10: never twice");
});
