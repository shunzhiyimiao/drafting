/**
 * Designer geometry (S1 extraction): the pure DOM-measurement half of the
 * canvas, moved out of Canvas.tsx. Measures every rendered `[data-sk]`
 * element into the LayoutBox shape `computeDrop` consumes.
 *
 * Invariants preserved from the original in-component implementation:
 * - `boxId` is unique per RENDERED ELEMENT; `nodeId` is not — a list
 *   template renders once per sample row (plural data-sk), so several boxes
 *   may map to one node, and dropping into any instance edits the template.
 * - Rects are relative to the surface origin (scroll-consistent: both the
 *   element and the origin come from live getBoundingClientRect calls).
 * - parent/child box relationships follow the nearest [data-sk] ancestor,
 *   children in document order.
 */
import type { SketchNode } from "@drafting/sketch-core";
import type { LayoutBox } from "../insertion";

/** Container facts per node id: a stack's direction, or the frame marker
 *  (Rev 5 — a positioned drop target with no flow axes). */
export type ContainerInfo = NonNullable<LayoutBox["container"]>;

/** The containers of the Spec tree (drop targets), incl. templates. */
export function collectContainers(
  root: SketchNode,
  map = new Map<string, ContainerInfo>(),
): Map<string, ContainerInfo> {
  if (root.kind === "stack") {
    map.set(root.id, { direction: root.layout.direction });
    for (const child of root.children) collectContainers(child, map);
  } else if (root.kind === "frame") {
    map.set(root.id, { frame: true });
    for (const child of root.children) collectContainers(child, map);
  } else if (root.kind === "list") {
    collectContainers(root.template, map);
  }
  return map;
}

/** Snapshot every rendered [data-sk] element as a LayoutBox.
 *
 *  `scale` (S2a): when the surface renders under a CSS transform zoom,
 *  getBoundingClientRect returns VISUAL coordinates. Dividing both the
 *  rects here and the pointer (caller-side) by the same scale keeps all
 *  drop math in logical surface units — overlays drawn inside the scaled
 *  surface then line up by construction. Default 1 = exact old behavior. */
export function measureLayoutBoxes(
  surface: HTMLElement,
  root: SketchNode,
  scale = 1,
): LayoutBox[] {
  const containers = collectContainers(root);
  const origin = surface.getBoundingClientRect();
  const els = Array.from(surface.querySelectorAll<HTMLElement>("[data-sk]"));
  const idOf = new Map<HTMLElement, string>();
  els.forEach((el, i) => idOf.set(el, `b${i}`));

  const boxes: LayoutBox[] = els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const nodeId = el.getAttribute("data-sk") ?? "";
    const info = containers.get(nodeId);
    const parentEl = el.parentElement?.closest<HTMLElement>("[data-sk]") ?? null;
    return {
      boxId: `b${i}`,
      nodeId,
      rect: {
        x: (r.x - origin.x) / scale,
        y: (r.y - origin.y) / scale,
        width: r.width / scale,
        height: r.height / scale,
      },
      container: info,
      parentBoxId: parentEl && surface.contains(parentEl) ? (idOf.get(parentEl) ?? null) : null,
      childBoxIds: [],
    };
  });
  const byId = new Map(boxes.map((b) => [b.boxId, b]));
  for (const b of boxes) {
    if (b.parentBoxId) byId.get(b.parentBoxId)?.childBoxIds.push(b.boxId);
  }
  return boxes;
}
