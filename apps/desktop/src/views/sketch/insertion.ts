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

/**
 * Where a drop lands (Rev 3 §7.1 side-drop amendment): either an ordinary
 * gap insertion, or the ONE sanctioned structure creation — wrapping a leaf
 * sibling and the dragged node in a single perpendicular stack, decided
 * purely by pointer geometry (the outer SIDE_ZONE of the leaf's cross axis),
 * never by layout analysis.
 */
export type DropPlan =
  | ({ kind: "insert" } & Insertion)
  | {
      kind: "wrap";
      /** The leaf being joined side-by-side. */
      targetNodeId: string;
      targetBoxId: string;
      /** Dragged node lands before (left/top) or after (right/bottom). */
      side: "before" | "after";
      /** Wrapper direction — perpendicular to the parent container's. */
      direction: "row" | "col";
      /** §7.1 spread amendment: pointing AT the leaf (its outer SIDE_ZONE)
       *  means "snuggle beside it" — the wrapper hugs, pair sits together.
       *  Pointing at the EMPTY flank strip means "over there, apart" — the
       *  wrapper fills the main axis with `between`, so the dragged node
       *  actually lands where the pointer is. Both are pointer geometry;
       *  neither infers structure. */
      spread: boolean;
    };

/** Outer fraction of a leaf's cross-axis extent that triggers a wrap. */
export const SIDE_ZONE = 0.25;

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
function deepestContainer(
  point: Point,
  boxes: LayoutBox[],
  byId: Map<string, LayoutBox>,
  excludeNodeIds?: ReadonlySet<string>,
): LayoutBox | null {
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
  return target;
}

/** Nearest gap: count children whose main-axis midpoint precedes the point. */
function gapIndex(point: Point, target: LayoutBox, byId: Map<string, LayoutBox>): number {
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
  return index;
}

export function computeInsertion(
  point: Point,
  boxes: LayoutBox[],
  excludeNodeIds?: ReadonlySet<string>,
): Insertion | null {
  const byId = new Map(boxes.map((b) => [b.boxId, b]));
  const target = deepestContainer(point, boxes, byId, excludeNodeIds);
  if (!target) return null;
  return {
    containerId: target.nodeId,
    index: gapIndex(point, target, byId),
    targetBoxId: target.boxId,
  };
}

/**
 * The full drop decision: gap insertion, plus the side-drop wrap — "place
 * the dragged node beside this one" → wrap exactly {target, dragged} in one
 * perpendicular stack. Two pointer geometries mean it:
 *
 * - ON a leaf child, in the outer SIDE_ZONE of its cross axis (left/right in
 *   a col parent, top/bottom in a row parent). Containers can't be hit this
 *   way — a point inside a non-excluded container routes to that deeper
 *   insertion target instead.
 * - BESIDE a child: within its main-axis extent but outside its box — the
 *   empty strip a narrow child (fixed-width image, hug button) leaves on its
 *   flank belongs to that child's pairing gesture. Unambiguous because
 *   siblings never overlap on the parent's main axis.
 *
 * The dragged subtree never wraps with itself, and the middle band of a
 * child's own box keeps the ordinary gap semantics.
 */
export function computeDrop(
  point: Point,
  boxes: LayoutBox[],
  excludeNodeIds?: ReadonlySet<string>,
): DropPlan | null {
  const byId = new Map(boxes.map((b) => [b.boxId, b]));
  const target = deepestContainer(point, boxes, byId, excludeNodeIds);
  if (!target) return null;

  const sidesAreHorizontal = target.container!.direction === "col"; // cross axis
  const direction = sidesAreHorizontal ? "row" : "col";
  const wrap = (child: LayoutBox, side: "before" | "after", spread: boolean): DropPlan => ({
    kind: "wrap",
    targetNodeId: child.nodeId,
    targetBoxId: child.boxId,
    side,
    direction,
    spread,
  });

  let beside: DropPlan | null = null;
  for (const childId of target.childBoxIds) {
    const child = byId.get(childId);
    if (!child) continue;
    const excluded = excludeNodeIds?.has(child.nodeId) ?? false;

    if (contains(child.rect, point)) {
      // Only leaves wrap from inside; the dragged subtree never pairs with
      // itself. Anything else inside a child's box is gap territory.
      if (child.container || excluded) {
        beside = null;
        break;
      }
      const [lo, size, p] = sidesAreHorizontal
        ? [child.rect.x, child.rect.width, point.x]
        : [child.rect.y, child.rect.height, point.y];
      if (p < lo + size * SIDE_ZONE) return wrap(child, "before", false);
      if (p > lo + size * (1 - SIDE_ZONE)) return wrap(child, "after", false);
      beside = null;
      break; // middle band → ordinary gap semantics
    }

    if (!beside && !excluded) {
      // The flank strip: inside the child's main-axis extent, outside its
      // box on the cross axis. Pointing at empty flank space = "apart".
      const inBand = sidesAreHorizontal
        ? point.y >= child.rect.y && point.y <= child.rect.y + child.rect.height
        : point.x >= child.rect.x && point.x <= child.rect.x + child.rect.width;
      if (inBand) {
        const before = sidesAreHorizontal ? point.x < child.rect.x : point.y < child.rect.y;
        beside = wrap(child, before ? "before" : "after", true);
      }
    }
  }
  if (beside) return beside;

  return {
    kind: "insert",
    containerId: target.nodeId,
    index: gapIndex(point, target, byId),
    targetBoxId: target.boxId,
  };
}

/** Indicator for a full DropPlan: the gap line for insertions (null → the
 *  caller rings the empty container), or a translucent zone for a wrap.
 *  Snuggle wraps highlight the target's joined half; spread wraps highlight
 *  the PARENT's far half at the target's band — the zone sits where the
 *  dragged node will actually land, so the preview tells the truth. */
export function indicatorFor(
  plan: DropPlan,
  boxes: LayoutBox[],
): { rect: Rect; kind: "line" | "zone" } | null {
  if (plan.kind === "insert") {
    const rect = indicatorRect(plan, boxes);
    return rect ? { rect, kind: "line" } : null;
  }
  const target = boxes.find((b) => b.boxId === plan.targetBoxId);
  if (!target) return null;
  const r = target.rect;
  const parent = plan.spread
    ? (boxes.find((b) => b.boxId === target.parentBoxId) ?? null)
    : null;
  if (plan.direction === "row") {
    // Spread: halves of the parent's width, at the target's vertical band.
    const lo = parent ? parent.rect.x : r.x;
    const w = (parent ? parent.rect.width : r.width) / 2;
    return {
      rect: { x: plan.side === "before" ? lo : lo + w, y: r.y, width: w, height: r.height },
      kind: "zone",
    };
  }
  const lo = parent ? parent.rect.y : r.y;
  const h = (parent ? parent.rect.height : r.height) / 2;
  return {
    rect: { x: r.x, y: plan.side === "before" ? lo : lo + h, width: r.width, height: h },
    kind: "zone",
  };
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
