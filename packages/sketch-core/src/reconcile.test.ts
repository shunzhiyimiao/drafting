/** O3 reconcile laws: unique-match re-attachment, ambiguity never guesses,
 *  no duplicate ids, temp ids are never sources, purity + idempotence. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { reconcileIds, identitySignature } from "./reconcile.js";
import type { Container, SketchNode } from "./spec.js";

const hug = { mode: "hug" } as const;
const fill = { mode: "fill" } as const;
const sz = { width: hug, height: hug };

const btn = (id: string, label: string): SketchNode => ({
  kind: "button",
  id,
  label,
  variant: "primary",
  sizing: { ...sz },
});
const txt = (id: string, content: string): SketchNode => ({
  kind: "text",
  id,
  role: "body",
  content,
  sizing: { ...sz },
});
const stack = (id: string, children: SketchNode[], variant?: Container["variant"]): Container => ({
  kind: "stack",
  id,
  layout: {
    direction: "col",
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAxis: "start",
    crossAxis: "stretch",
  },
  sizing: { width: fill, height: hug },
  children,
  ...(variant ? { variant } : {}),
});

test("unique kind+text match re-attaches the old persistent id", () => {
  const oldRoot = stack("~1", [btn("01BOUND", "提交"), txt("~2", "标题")]);
  const newRoot = stack("~1", [txt("~2", "标题"), btn("~3", "提交")]);
  const { root, reattached } = reconcileIds(oldRoot, newRoot);
  const newBtn = (root as Container).children[1];
  assert.equal(newBtn.id, "01BOUND");
  assert.deepEqual(reattached, ["01BOUND"]);
  // Purity: the input trees are untouched.
  assert.equal((newRoot as Container).children[1].id, "~3");
});

test("ambiguous targets never guess (two same-label buttons)", () => {
  const oldRoot = stack("~1", [btn("01BOUND", "确定")]);
  const newRoot = stack("~1", [btn("~2", "确定"), btn("~3", "确定")]);
  const { root, reattached } = reconcileIds(oldRoot, newRoot);
  assert.deepEqual(reattached, []);
  for (const c of (root as Container).children) assert.notEqual(c.id, "01BOUND");
});

test("ambiguous sources never guess (two old persistents share a signature)", () => {
  const oldRoot = stack("~1", [btn("01A", "确定"), btn("01B", "确定")]);
  const newRoot = stack("~1", [btn("~2", "确定")]);
  const { reattached } = reconcileIds(oldRoot, newRoot);
  assert.deepEqual(reattached, []);
});

test("an id already present in the new tree is never duplicated", () => {
  const oldRoot = stack("~1", [btn("01SAME", "提交")]);
  const newRoot = stack("~1", [txt("01SAME", "别处已有"), btn("~2", "提交")]);
  const { root, reattached } = reconcileIds(oldRoot, newRoot);
  assert.deepEqual(reattached, []);
  const ids = new Set<string>();
  const collect = (n: SketchNode) => {
    assert.ok(!ids.has(n.id), "duplicate id produced");
    ids.add(n.id);
    if (n.kind === "stack" || n.kind === "frame") n.children.forEach(collect);
  };
  collect(root);
});

test("temp-id old nodes are not sources; fresh mints on new nodes may be overwritten", () => {
  const oldRoot = stack("~1", [btn("~9", "临时"), btn("01KEEP", "保存")]);
  // The offline fallback mints real ULIDs — re-attachment overwrites them.
  const newRoot = stack("~1", [btn("01FRESHMINT000000000000000", "保存"), btn("~2", "临时")]);
  const { root, reattached } = reconcileIds(oldRoot, newRoot);
  assert.deepEqual(reattached, ["01KEEP"]);
  assert.equal((root as Container).children[0].id, "01KEEP");
  assert.equal((root as Container).children[1].id, "~2", "temp source re-attaches nothing");
});

test("containers match by variant + descendant text window", () => {
  const oldCard = stack("01CARD", [txt("~a", "总客户数"), txt("~b", "1,284")], "card");
  const oldRoot = stack("~1", [oldCard, stack("~x", [txt("~c", "别的")])]);
  const newCard = stack("~n", [txt("~d", "总客户数"), txt("~e", "1,284")], "card");
  const newRoot = stack("~1", [stack("~y", [txt("~f", "别的")]), newCard]);
  const { root, reattached } = reconcileIds(oldRoot, newRoot);
  assert.deepEqual(reattached, ["01CARD"]);
  assert.equal((root as Container).children[1].id, "01CARD");
  // Sanity: the signature really keys on content, not position.
  assert.equal(identitySignature(oldCard), identitySignature(newCard));
});

test("idempotent: a second reconcile changes nothing", () => {
  const oldRoot = stack("~1", [btn("01BOUND", "提交")]);
  const newRoot = stack("~1", [btn("~2", "提交")]);
  const once = reconcileIds(oldRoot, newRoot);
  const twice = reconcileIds(oldRoot, once.root);
  assert.deepEqual(twice.reattached, [], "already attached — nothing to do");
  assert.deepEqual(twice.root, once.root);
});
