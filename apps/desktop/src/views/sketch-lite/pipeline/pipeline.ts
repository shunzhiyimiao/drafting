/**
 * The Generate UI pipeline — the whole conceptual sequence in one place:
 *
 *   SketchDocument → analyzeGeometry(确定性) → interpretSketch(mock/AI)
 *   → generateIntent(mock/AI) → compileIntent(确定性) → Sketch(现有 Spec)
 *   → printSketchMarkup → `.sketch` 文本
 *
 * 每一级中间产物都返回给调用方 —— 可检视、可测试、可日后换成真 AI。
 */
import {
  printSketchMarkup,
  validate,
  type Sketch,
  type ValidationError,
} from "@drafting/sketch-core";
import type { SketchDocument } from "../model/types";
import { analyzeGeometry, type GeometryAnalysis } from "../geometry/analyze";
import { interpretSketch, type SketchInterpretation } from "./interpret";
import { generateIntent } from "./generate-intent";
import type { UIIntentNode } from "./intent";
import { compileIntent } from "./compile";

export interface GenerateResult {
  analysis: GeometryAnalysis;
  interpretation: SketchInterpretation;
  intent: UIIntentNode;
  sketch: Sketch;
  markup: string;
  /** 编译产物过一遍现有 validate() — 空数组是编译器的正确性合同。 */
  validationErrors: ValidationError[];
}

export async function generateUiFromSketch(
  doc: SketchDocument,
  opts: { sketchId: string; mint: () => string },
): Promise<GenerateResult> {
  const analysis = analyzeGeometry(doc);
  const interpretation = await interpretSketch(doc, analysis);
  const intent = await generateIntent(interpretation, {
    title: doc.title,
    mint: opts.mint,
  });
  const root = compileIntent(intent, opts.mint);
  const sketch: Sketch = {
    id: opts.sketchId,
    name: doc.title,
    blueprintRef: null,
    schemaVersion: 3,
    root,
  };
  return {
    analysis,
    interpretation,
    intent,
    sketch,
    markup: printSketchMarkup(sketch),
    validationErrors: validate(sketch),
  };
}
