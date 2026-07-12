/**
 * Deterministic geometry analysis (Sketch Lite pipeline stage 1).
 *
 * 原则:可测量的几何关系永远不问 AI —— 相交、包含、坐标、对齐、排序都是
 * 确定性算法;AI 只处理语义歧义。容差按画布尺寸取相对值,不要求像素级相等。
 */
import type { Bounds, SketchDocument, SketchShape } from "../model/types";

export type ShapeRelationshipType =
  | "contains"
  | "inside"
  | "above"
  | "below"
  | "left_of"
  | "right_of"
  | "overlaps"
  | "aligned_horizontal"
  | "aligned_vertical";

export interface ShapeRelationship {
  type: ShapeRelationshipType;
  /** Subject → object: `a` is <type> `b` (contains: a contains b). */
  a: string;
  b: string;
}

/** A horizontal run of similar siblings — the "three cards" heuristic. */
export interface ShapeGroup {
  kind: "horizontal_row";
  shapeIds: string[];
  bounds: Bounds;
}

export interface GeometryAnalysis {
  relationships: ShapeRelationship[];
  groups: ShapeGroup[];
}

const center = (b: Bounds) => ({ cx: b.x + b.width / 2, cy: b.y + b.height / 2 });

function containsBounds(outer: Bounds, inner: Bounds, tol: number): boolean {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.width <= outer.x + outer.width + tol &&
    inner.y + inner.height <= outer.y + outer.height + tol
  );
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

function unionBounds(all: Bounds[]): Bounds {
  const x1 = Math.min(...all.map((b) => b.x));
  const y1 = Math.min(...all.map((b) => b.y));
  const x2 = Math.max(...all.map((b) => b.x + b.width));
  const y2 = Math.max(...all.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function analyzeGeometry(doc: SketchDocument): GeometryAnalysis {
  const shapes = [...doc.shapes].sort((a, b) => a.zIndex - b.zIndex);
  // Tolerances scale with the canvas: alignment within ~2% reads as aligned.
  const alignTol = Math.max(8, doc.canvas.height * 0.02);
  const containTol = 2;

  const relationships: ShapeRelationship[] = [];
  for (let i = 0; i < shapes.length; i++) {
    for (let j = 0; j < shapes.length; j++) {
      if (i === j) continue;
      const A = shapes[i];
      const B = shapes[j];
      const a = A.bounds;
      const b = B.bounds;

      // Containment beats overlap; emit each pair once per direction.
      if (containsBounds(a, b, containTol) && !containsBounds(b, a, containTol)) {
        relationships.push({ type: "contains", a: A.id, b: B.id });
        relationships.push({ type: "inside", a: B.id, b: A.id });
        continue;
      }
      if (i < j && overlaps(a, b) && !containsBounds(b, a, containTol)) {
        relationships.push({ type: "overlaps", a: A.id, b: B.id });
      }

      if (i < j) {
        const ca = center(a);
        const cb = center(b);
        // Directional facts only for non-overlapping pairs on that axis.
        if (a.x + a.width <= b.x) {
          relationships.push({ type: "left_of", a: A.id, b: B.id });
          relationships.push({ type: "right_of", a: B.id, b: A.id });
        } else if (b.x + b.width <= a.x) {
          relationships.push({ type: "left_of", a: B.id, b: A.id });
          relationships.push({ type: "right_of", a: A.id, b: B.id });
        }
        if (a.y + a.height <= b.y) {
          relationships.push({ type: "above", a: A.id, b: B.id });
          relationships.push({ type: "below", a: B.id, b: A.id });
        } else if (b.y + b.height <= a.y) {
          relationships.push({ type: "above", a: B.id, b: A.id });
          relationships.push({ type: "below", a: A.id, b: B.id });
        }
        if (Math.abs(ca.cy - cb.cy) <= alignTol) {
          relationships.push({ type: "aligned_horizontal", a: A.id, b: B.id });
        }
        if (Math.abs(ca.cx - cb.cx) <= alignTol) {
          relationships.push({ type: "aligned_vertical", a: A.id, b: B.id });
        }
      }
    }
  }

  return { relationships, groups: findHorizontalRows(shapes, alignTol) };
}

/** Grouping heuristic: ≥2 shapes with similar size, aligned centers and
 *  roughly even horizontal gaps read as one row (e.g. three KPI cards). */
function findHorizontalRows(shapes: SketchShape[], alignTol: number): ShapeGroup[] {
  const groups: ShapeGroup[] = [];
  const used = new Set<string>();
  const sorted = [...shapes].sort((a, b) => a.bounds.x - b.bounds.x);

  for (const seed of sorted) {
    if (used.has(seed.id)) continue;
    const row = [seed];
    for (const cand of sorted) {
      if (cand.id === seed.id || used.has(cand.id)) continue;
      const last = row[row.length - 1];
      const sameBand = Math.abs(center(cand.bounds).cy - center(seed.bounds).cy) <= alignTol;
      const similarW =
        Math.abs(cand.bounds.width - seed.bounds.width) <= Math.max(24, seed.bounds.width * 0.35);
      const similarH =
        Math.abs(cand.bounds.height - seed.bounds.height) <=
        Math.max(24, seed.bounds.height * 0.35);
      const gap = cand.bounds.x - (last.bounds.x + last.bounds.width);
      const reasonableGap = gap >= -4 && gap <= Math.max(80, seed.bounds.width);
      if (sameBand && similarW && similarH && reasonableGap) row.push(cand);
    }
    if (row.length >= 2) {
      row.forEach((s) => used.add(s.id));
      groups.push({
        kind: "horizontal_row",
        shapeIds: row.map((s) => s.id),
        bounds: unionBounds(row.map((s) => s.bounds)),
      });
    }
  }
  return groups;
}
