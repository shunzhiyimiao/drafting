/**
 * Resize math (S4) — pure and unit-tested, like every designer decision.
 * Dragging a selection handle writes `fixed` px into the node's sizing:
 * the Spec's ONE open escape hatch (§5), so handles are K1-safe by
 * construction — no coordinates, just a parameter the dialect already has.
 *
 * Semantics:
 * - A handle resizes toward its own edge; the magnitude is the pointer's
 *   distance from the OPPOSITE edge (auto-layout owns position, so a west
 *   pull and an east pull both just set WIDTH).
 * - Corners resize both axes; edge midpoints resize one.
 * - Values round to integers and snap to a sibling's identical dimension
 *   within SNAP_TOLERANCE (adopting it exactly) — the WPF snapline idea
 *   reduced to what auto-layout leaves meaningful: matching sizes.
 * - Results are clamped to ≥ 1 (the dialect requires positive px).
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Handle identity as its unit position on the frame: 0=left/top,
 *  0.5=middle, 1=right/bottom — matches SelectionOverlay's dot layout. */
export interface Handle {
  hx: 0 | 0.5 | 1;
  hy: 0 | 0.5 | 1;
}

export const SNAP_TOLERANCE = 4;

export interface ResizeResult {
  /** New fixed widths/heights (absent axis = untouched by this handle). */
  width?: number;
  height?: number;
  /** Which sibling dimension a snap adopted, for the badge (null = none). */
  snapped: { axis: "width" | "height"; px: number } | null;
}

function snap(value: number, candidates: number[]): number | null {
  let best: number | null = null;
  for (const c of candidates) {
    if (Math.abs(c - value) <= SNAP_TOLERANCE) {
      if (best === null || Math.abs(c - value) < Math.abs(best - value)) best = c;
    }
  }
  return best;
}

export function computeResize(
  handle: Handle,
  start: Rect,
  pointer: { x: number; y: number },
  siblingWidths: number[] = [],
  siblingHeights: number[] = [],
): ResizeResult {
  const result: ResizeResult = { snapped: null };

  if (handle.hx !== 0.5) {
    // Opposite vertical edge anchors the width.
    const anchorX = handle.hx === 1 ? start.x : start.x + start.width;
    let width = Math.max(1, Math.round(Math.abs(pointer.x - anchorX)));
    const s = snap(width, siblingWidths);
    if (s !== null) {
      width = s;
      result.snapped = { axis: "width", px: s };
    }
    result.width = width;
  }

  if (handle.hy !== 0.5) {
    const anchorY = handle.hy === 1 ? start.y : start.y + start.height;
    let height = Math.max(1, Math.round(Math.abs(pointer.y - anchorY)));
    const s = snap(height, siblingHeights);
    if (s !== null) {
      height = s;
      // A corner may snap both; the badge reports the latest axis.
      result.snapped = { axis: "height", px: s };
    }
    result.height = height;
  }

  return result;
}
