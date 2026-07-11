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

/** The stack containers of the Spec tree (drop targets), incl. templates. */
export function collectContainers(
  root: SketchNode,
  map = new Map<string, "row" | "col">(),
): Map<string, "row" | "col"> {
  if (root.kind === "stack") {
    map.set(root.id, root.layout.direction);
    for (const child of root.children) collectContainers(child, map);
  } else if (root.kind === "list") {
    collectContainers(root.template, map);
  }
  return map;
}

/** Snapshot every rendered [data-sk] element as a LayoutBox. */
export function measureLayoutBoxes(surface: HTMLElement, root: SketchNode): LayoutBox[] {
  const containers = collectContainers(root);
  const origin = surface.getBoundingClientRect();
  const els = Array.from(surface.querySelectorAll<HTMLElement>("[data-sk]"));
  const idOf = new Map<HTMLElement, string>();
  els.forEach((el, i) => idOf.set(el, `b${i}`));

  const boxes: LayoutBox[] = els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const nodeId = el.getAttribute("data-sk") ?? "";
    const direction = containers.get(nodeId);
    const parentEl = el.parentElement?.closest<HTMLElement>("[data-sk]") ?? null;
    return {
      boxId: `b${i}`,
      nodeId,
      rect: { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height },
      container: direction ? { direction } : undefined,
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
