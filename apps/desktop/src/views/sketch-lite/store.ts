/**
 * Sketch Lite state — zustand, following the app's store conventions.
 *
 * 铁律:SketchDocument 只装文档事实;工具/选中/拖拽这些 UI 临时态住在
 * store 的独立字段,绝不混进文档。Generate 的落点不在这里 —— 管线产物
 * 交给 sketch-store 的 generateFromLite(真相进现有 `.sketch` 体系)。
 */
import { create } from "zustand";
import { ulid } from "../../lib/ulid";
import {
  emptyDocument,
  normalizeBounds,
  type Bounds,
  type SketchDocument,
  type SketchShape,
} from "./model/types";

export type LiteTool = "select" | "rectangle";

/** One in-flight pointer gesture on the Lite canvas (UI-only state). */
export type LiteGesture =
  | { kind: "draw"; pointerId: number; start: { x: number; y: number }; draft: Bounds }
  | {
      kind: "move";
      pointerId: number;
      shapeId: string;
      start: { x: number; y: number };
      startBounds: Bounds;
      moved: boolean;
    }
  | {
      kind: "resize";
      pointerId: number;
      shapeId: string;
      /** Which corner is being dragged: 0|1 per axis. */
      hx: 0 | 1;
      hy: 0 | 1;
      startBounds: Bounds;
    };

export interface SketchLiteState {
  doc: SketchDocument;
  /** The sketch FILE this napkin belongs to (Lite is the sketch surface
   *  now — one drawing per document, stashed per file for the session). */
  boundFile: string | null;
  stash: Record<string, SketchDocument>;
  tool: LiteTool;
  selectedShapeId: string | null;
  gesture: LiteGesture | null;

  /** Bind the surface to a sketch file: restore its stashed drawing or
   *  start an empty one titled after the sketch. Idempotent per file. */
  bindTo: (file: string, name: string) => void;
  setTool: (t: LiteTool) => void;
  select: (id: string | null) => void;
  setGesture: (g: LiteGesture | null) => void;

  addShape: (bounds: Bounds) => string;
  updateShapeBounds: (id: string, bounds: Bounds) => void;
  deleteShape: (id: string) => void;
  /** 数组序即画序(后画者在上);zIndex 随位置归一。 */
  reorderShape: (id: string, dir: "forward" | "backward") => void;
  setAnnotation: (id: string, annotation: string) => void;
  setSemanticHint: (id: string, hint: string) => void;
  setPagePrompt: (prompt: string) => void;
  setTitle: (title: string) => void;
  reset: () => void;
}

/** 最小可辨形状 — 比这小的一律当误点丢弃。 */
export const MIN_SHAPE_SIZE = 8;

function round(b: Bounds): Bounds {
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
  };
}

export const useSketchLiteStore = create<SketchLiteState>((set) => ({
  doc: emptyDocument(ulid(), "Untitled sketch"),
  boundFile: null,
  stash: {},
  tool: "rectangle",
  selectedShapeId: null,
  gesture: null,

  bindTo: (file, name) =>
    set((s) => {
      if (s.boundFile === file) return s;
      const stash = s.boundFile ? { ...s.stash, [s.boundFile]: s.doc } : s.stash;
      return {
        stash,
        boundFile: file,
        doc: stash[file] ?? emptyDocument(ulid(), name),
        selectedShapeId: null,
        gesture: null,
        tool: "rectangle",
      };
    }),
  setTool: (tool) => set({ tool }),
  select: (selectedShapeId) => set({ selectedShapeId }),
  setGesture: (gesture) => set({ gesture }),

  addShape: (bounds) => {
    const id = ulid();
    set((s) => ({
      doc: {
        ...s.doc,
        shapes: [
          ...s.doc.shapes,
          {
            id,
            type: "rectangle",
            bounds: round(bounds),
            zIndex: s.doc.shapes.length,
          } satisfies SketchShape,
        ],
      },
      selectedShapeId: id,
      tool: "select", // 画完即选中,顺手进入调整
    }));
    return id;
  },

  updateShapeBounds: (id, bounds) =>
    set((s) => ({
      doc: {
        ...s.doc,
        shapes: s.doc.shapes.map((sh) => (sh.id === id ? { ...sh, bounds: round(bounds) } : sh)),
      },
    })),

  reorderShape: (id, dir) =>
    set((s) => {
      const i = s.doc.shapes.findIndex((sh) => sh.id === id);
      const j = dir === "forward" ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= s.doc.shapes.length) return s;
      const shapes = [...s.doc.shapes];
      [shapes[i], shapes[j]] = [shapes[j], shapes[i]];
      return { doc: { ...s.doc, shapes: shapes.map((sh, k) => ({ ...sh, zIndex: k })) } };
    }),

  deleteShape: (id) =>
    set((s) => ({
      doc: { ...s.doc, shapes: s.doc.shapes.filter((sh) => sh.id !== id) },
      selectedShapeId: s.selectedShapeId === id ? null : s.selectedShapeId,
    })),

  setAnnotation: (id, annotation) =>
    set((s) => ({
      doc: {
        ...s.doc,
        shapes: s.doc.shapes.map((sh) =>
          sh.id === id ? { ...sh, annotation: annotation || undefined } : sh,
        ),
      },
    })),

  setSemanticHint: (id, hint) =>
    set((s) => ({
      doc: {
        ...s.doc,
        shapes: s.doc.shapes.map((sh) =>
          sh.id === id ? { ...sh, semanticHint: hint || undefined } : sh,
        ),
      },
    })),

  setPagePrompt: (pagePrompt) => set((s) => ({ doc: { ...s.doc, pagePrompt } })),
  setTitle: (title) => set((s) => ({ doc: { ...s.doc, title } })),

  reset: () =>
    set({
      doc: emptyDocument(ulid(), "Untitled sketch"),
      selectedShapeId: null,
      gesture: null,
      tool: "rectangle",
    }),
}));

export { normalizeBounds };
