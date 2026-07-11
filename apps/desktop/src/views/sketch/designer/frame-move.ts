/**
 * Frame-move math (Rev 5 / S5): dragging a Frame child writes its pos —
 * an attribute gesture like resize (S4), not a tree drag. Pure: points come
 * in LOGICAL surface units (the caller divides by zoom), so the delta IS
 * the frame-local delta; the result rounds to integer px. Negative results
 * are legal — a child may hang off the frame's edge (frames don't clip).
 */
import type { Pos } from "@drafting/sketch-core";

export interface Point {
  x: number;
  y: number;
}

export function computeFrameMove(startPos: Pos, start: Point, current: Point): Pos {
  return {
    x: Math.round(startPos.x + (current.x - start.x)),
    y: Math.round(startPos.y + (current.y - start.y)),
  };
}
