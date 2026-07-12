/**
 * Sketch Lite — the low-fidelity visual intent input surface (Phase 1).
 *
 * 定位:用户画个大概,AI 补全真正的设计。这里的"草图文档"是 AI 的输入格式,
 * 不是真相 —— 真相仍然是管线终点的 `.sketch` 方言文档(K1-K4 不动)。
 * 管线:SketchDocument → 几何分析(确定性)→ 解释 → UI Intent → 确定性编译
 * → SketchNode 树 → canonical markup → 现有设计器/运行时。
 *
 * 本模块只有数据模型:与 React 无关,UI 临时态(工具/选中/拖拽/悬停)一律
 * 不进 SketchDocument —— 它们住在 store 的独立字段里。
 */

export type SketchShapeType = "rectangle" | "rounded_rectangle" | "text" | "arrow";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SketchShape {
  id: string;
  type: SketchShapeType;
  bounds: Bounds;
  /** Literal text content (for future `text` shapes). */
  text?: string;
  /** Natural-language note: "左侧导航栏"。喂给解释层的主要语义信号。 */
  annotation?: string;
  /** Optional WEAK hint ("sidebar") — never the final component type. */
  semanticHint?: string;
  zIndex: number;
}

export interface SketchDocument {
  id: string;
  version: "0.1";
  title: string;
  canvas: { width: number; height: number };
  /** Page-level natural language: global semantics + style direction. */
  pagePrompt: string;
  shapes: SketchShape[];
}

export function emptyDocument(id: string, title = "Untitled sketch"): SketchDocument {
  return {
    id,
    version: "0.1",
    title,
    canvas: { width: 960, height: 600 },
    pagePrompt: "",
    shapes: [],
  };
}

/** Drawing in any direction is legal — bounds normalize to positive size. */
export function normalizeBounds(a: { x: number; y: number }, b: { x: number; y: number }): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}
