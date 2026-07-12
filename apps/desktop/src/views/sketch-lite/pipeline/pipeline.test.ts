/** Sketch Lite pure layers: geometry facts, mock interpretation, intent
 *  orchestration, deterministic compilation into the EXISTING Spec. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSketchMarkup, type Container } from "@drafting/sketch-core";
import { emptyDocument, normalizeBounds, type SketchShape } from "../model/types.js";
import { analyzeGeometry } from "../geometry/analyze.js";
import { interpretSketch } from "./interpret.js";
import { toSpacingStep } from "./compile.js";
import { generateUiFromSketch } from "./pipeline.js";

let n = 0;
const mint = () => `01TESTLITE${String(++n).padStart(16, "0")}`;

const shape = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<SketchShape> = {},
): SketchShape => ({
  id,
  type: "rectangle",
  bounds: { x, y, width: w, height: h },
  zIndex: 0,
  ...extra,
});

test("normalizeBounds: drawing in any direction yields positive size", () => {
  assert.deepEqual(normalizeBounds({ x: 100, y: 80 }, { x: 40, y: 20 }), {
    x: 40,
    y: 20,
    width: 60,
    height: 60,
  });
});

test("geometry: directional, containment, overlap and alignment facts", () => {
  const doc = emptyDocument("d1");
  doc.shapes = [
    shape("a", 0, 0, 100, 50),
    shape("b", 200, 2, 100, 50), // right of a, same band → aligned_horizontal
    shape("c", 0, 200, 300, 100),
    shape("inner", 20, 220, 50, 40), // inside c
    shape("ov", 280, 260, 60, 60), // overlaps c
  ];
  const g = analyzeGeometry(doc);
  const has = (type: string, a: string, b: string) =>
    g.relationships.some((r) => r.type === type && r.a === a && r.b === b);

  assert.ok(has("left_of", "a", "b"));
  assert.ok(has("right_of", "b", "a"));
  assert.ok(has("above", "a", "c"));
  assert.ok(has("below", "c", "a"));
  assert.ok(has("contains", "c", "inner"));
  assert.ok(has("inside", "inner", "c"));
  assert.ok(has("overlaps", "c", "ov"));
  assert.ok(has("aligned_horizontal", "a", "b"));
});

test("geometry: three similar shapes in a band group into a horizontal row", () => {
  const doc = emptyDocument("d2");
  doc.shapes = [
    shape("k1", 20, 100, 120, 80),
    shape("k2", 160, 104, 120, 80),
    shape("k3", 300, 98, 124, 82),
    shape("lone", 20, 300, 400, 60), // different band, not a member
  ];
  const g = analyzeGeometry(doc);
  assert.equal(g.groups.length, 1);
  assert.deepEqual(g.groups[0].shapeIds.sort(), ["k1", "k2", "k3"]);
});

test("interpret: hints beat geometry; archetypes fill in; silence becomes an ambiguity", async () => {
  const doc = emptyDocument("d3");
  doc.pagePrompt = "一个现代 CRM dashboard,浅色主题";
  doc.shapes = [
    shape("top", 0, 0, 960, 80, { annotation: "顶部栏,放标题和搜索" }), // wide+top → header
    shape("left", 0, 90, 200, 480), // tall+left → sidebar
    shape("odd", 500, 400, 40, 40), // no hint, no annotation → ambiguity
    shape("hinted", 700, 400, 60, 60, { semanticHint: "chart" }), // hint wins
  ];
  const interp = await interpretSketch(doc, analyzeGeometry(doc));
  assert.equal(interp.pageType, "dashboard");
  const roleOf = (sid: string) =>
    interp.regions.find((r) => r.sourceShapeIds.includes(sid));
  assert.equal(roleOf("top")?.role, "header");
  assert.equal(roleOf("top")?.confidence, "medium");
  assert.equal(roleOf("left")?.role, "sidebar");
  assert.equal(roleOf("hinted")?.role, "chart");
  assert.equal(roleOf("hinted")?.confidence, "high");
  assert.ok(interp.ambiguities.some((a) => a.shapeIds.includes("odd")));
});

test("interpret: containment nests child regions under the outer shape", async () => {
  const doc = emptyDocument("d4");
  doc.shapes = [
    shape("panel", 100, 100, 400, 300, { annotation: "设置面板" }),
    shape("btn", 140, 320, 80, 40, { semanticHint: "form", annotation: "保存表单" }),
  ];
  const interp = await interpretSketch(doc, analyzeGeometry(doc));
  const panel = interp.regions.find((r) => r.sourceShapeIds.includes("panel"));
  assert.ok(panel, "panel region exists");
  assert.equal(interp.regions.length, 1, "inner shape is not top-level");
  assert.equal(panel!.children?.length, 1);
  assert.equal(panel!.children?.[0].role, "form");
});

test("toSpacingStep snaps px to the finite ramp", () => {
  assert.equal(toSpacingStep(16, 0), 4);
  assert.equal(toSpacingStep(0, 4), 0);
  assert.equal(toSpacingStep(100, 0), 24);
  assert.equal(toSpacingStep(undefined, 3), 3);
});

test("full pipeline: dashboard sketch → valid Spec in the EXISTING dialect", async () => {
  const doc = emptyDocument("d5", "CRM Dashboard");
  doc.pagePrompt = "一个现代 CRM dashboard";
  doc.shapes = [
    shape("top", 0, 0, 960, 70, { annotation: "顶部栏" }),
    shape("nav", 0, 80, 190, 500, { semanticHint: "sidebar", annotation: "左侧导航" }),
    shape("k1", 220, 100, 200, 100, { annotation: "总客户数" }),
    shape("k2", 440, 100, 200, 100, { annotation: "本月成交" }),
    shape("k3", 660, 100, 200, 100, { annotation: "转化率" }),
  ];
  const result = await generateUiFromSketch(doc, { sketchId: "sk_gen_test", mint });

  // 1. The compiled Spec passes the EXISTING validate() — compiler contract.
  assert.deepEqual(result.validationErrors, []);

  // 2. The markup round-trips through the EXISTING dialect parser.
  const parsed = parseSketchMarkup(result.markup).sketch;
  assert.equal(parsed.name, "CRM Dashboard");

  // 3. Structure: root col → [header row, body row [sidebar, content]].
  const root = result.sketch.root;
  assert.equal(root.layout.direction, "col");
  const header = root.children[0] as Container;
  assert.equal(header.kind, "stack");
  assert.equal(header.layout.direction, "row");
  assert.ok(
    header.children.some((c) => c.kind === "text" && c.content === "顶部栏"),
    "header carries the annotation title",
  );
  const body = root.children[1] as Container;
  assert.equal(body.layout.direction, "row");
  const sidebar = body.children[0] as Container;
  assert.equal(sidebar.sizing.width.mode, "fixed");
  assert.equal(sidebar.sizing.height.mode, "fill");

  // 4. The three KPI shapes became ONE horizontal group of three cards.
  const content = body.children[1] as Container;
  const row = content.children.find(
    (c): c is Container => c.kind === "stack" && c.layout.direction === "row",
  );
  assert.ok(row, "card group compiled to a row");
  assert.equal(row!.children.length, 3);
  for (const card of row!.children) {
    assert.equal(card.kind, "stack");
    assert.equal((card as Container).style?.bg, "raised");
  }

  // 5. Deterministic: same input + fresh mint sequence → same markup shape
  //    modulo ids (strip sk:id occurrences).
  let m = 0;
  const mint2 = () => `01TESTLITE2${String(++m).padStart(15, "0")}`;
  const again = await generateUiFromSketch(doc, { sketchId: "sk_gen_test", mint: mint2 });
  const strip = (s: string) => s.replace(/ sk:id="[^"]*"/g, "");
  assert.equal(strip(again.markup), strip(result.markup));
});
