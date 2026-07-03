/**
 * Free-drag, narrowed (docs/sketch-design.md §7.1): drag only EXPRESSES tree
 * operations — it never infers structure. This module is the pure half: given
 * a pointer position and the measured layout boxes, decide which container
 * receives an insertion and at which child index (nearest gap on the
 * container's main axis). No DOM, no store — unit-testable geometry.
 *
 * The event layer (Canvas.tsx) only collects the point, measures boxes, and
 * dispatches the existing tree ops with the result.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One rendered element. `boxId` is unique per element while `nodeId` is not:
 * a list template renders once per sample row (plural data-sk), so several
 * boxes can map to one node — dropping into ANY instance targets the template
 * container, and the tree edit updates every instance.
 */
export interface LayoutBox {
  boxId: string;
  nodeId: string;
  rect: Rect;
  /** Present iff this element is a stack container (a valid drop target). */
  container?: { direction: "row" | "col" };
  parentBoxId: string | null;
  /** Direct child boxes in document order (containers only). */
  childBoxIds: string[];
}

export interface Insertion {
  containerId: string;
  index: number;
  /** The specific rendered box the indicator draws over (disambiguates
   *  template instances). */
  targetBoxId: string;
}

function contains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

/**
 * The deepest stack container under the point, and the child index whose gap
 * is nearest along the main axis. Landing on a primitive means its parent
 * container at that child's slot — primitives are simply not candidates, so
 * the point falls through to the enclosing container and the midpoint rule
 * picks the slot. Returns null when the point is over no container (dropping
 * on empty canvas is a no-op — structure is never invented from a drop).
 *
 * `excludeNodeIds` removes the dragged subtree's containers from candidacy
 * (a node can't be dropped into itself or a descendant).
 */
export function computeInsertion(
  point: Point,
  boxes: LayoutBox[],
  excludeNodeIds?: ReadonlySet<string>,
): Insertion | null {
  const byId = new Map(boxes.map((b) => [b.boxId, b]));

  const depthOf = (b: LayoutBox): number => {
    let depth = 0;
    let cur = b;
    while (cur.parentBoxId) {
      const parent = byId.get(cur.parentBoxId);
      if (!parent) break;
      depth += 1;
      cur = parent;
    }
    return depth;
  };

  let target: LayoutBox | null = null;
  let targetDepth = -1;
  for (const b of boxes) {
    if (!b.container) continue;
    if (excludeNodeIds?.has(b.nodeId)) continue;
    if (!contains(b.rect, point)) continue;
    const depth = depthOf(b);
    if (depth > targetDepth) {
      target = b;
      targetDepth = depth;
    }
  }
  if (!target) return null;

  // Nearest gap: count children whose main-axis midpoint precedes the point.
  const axis = target.container!.direction === "row" ? point.x : point.y;
  let index = 0;
  for (const childId of target.childBoxIds) {
    const child = byId.get(childId);
    if (!child) continue;
    const mid =
      target.container!.direction === "row"
        ? child.rect.x + child.rect.width / 2
        : child.rect.y + child.rect.height / 2;
    if (axis > mid) index += 1;
  }
  return { containerId: target.nodeId, index, targetBoxId: target.boxId };
}

/**
 * The insertion indicator: a 2px line in the gap the insertion names,
 * spanning the container's cross axis. Null for an empty container — the
 * caller draws a ring around the target box instead (look the box up by
 * `targetBoxId`).
 */
export function indicatorRect(insertion: Insertion, boxes: LayoutBox[]): Rect | null {
  const byId = new Map(boxes.map((b) => [b.boxId, b]));
  const target = byId.get(insertion.targetBoxId);
  if (!target?.container) return null;
  const children = target.childBoxIds
    .map((id) => byId.get(id))
    .filter((b): b is LayoutBox => b !== undefined);
  if (children.length === 0) return null;

  const i = Math.min(insertion.index, children.length);
  if (target.container.direction === "row") {
    const x =
      i === 0
        ? children[0].rect.x - 1
        : i === children.length
          ? children[i - 1].rect.x + children[i - 1].rect.width - 1
          : (children[i - 1].rect.x + children[i - 1].rect.width + children[i].rect.x) / 2 - 1;
    return { x, y: target.rect.y, width: 2, height: target.rect.height };
  }
  const y =
    i === 0
      ? children[0].rect.y - 1
      : i === children.length
        ? children[i - 1].rect.y + children[i - 1].rect.height - 1
        : (children[i - 1].rect.y + children[i - 1].rect.height + children[i].rect.y) / 2 - 1;
  return { x: target.rect.x, y, width: target.rect.width, height: 2 };
}
