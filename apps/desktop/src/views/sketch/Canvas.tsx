import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultTheme,
  sketchToIR,
  toElement,
  type CreateElement,
  type SketchNode,
} from "@drafting/sketch-core";
import { allNodeIds, findNode, useSketchStore, type NodeKind } from "../../stores/sketch-store";
import {
  computeInsertion,
  indicatorRect,
  type Insertion,
  type LayoutBox,
} from "./insertion";

/** The design surface. Rendered via toElement — the SAME IR the generated
 *  code serializes from (K3: WYSIWYG is constructional). Selection reads
 *  data-sk, the addressing criteria and Atlas share (§7).
 *
 *  Drag (§7.1, narrowed): drags only EXPRESS tree ops. The event layer here
 *  collects the pointer, measures boxes once per drag, and calls
 *  computeInsertion (pure, tested) + the store's insert/move ops. Pointer
 *  events, not HTML5 DnD — the Tauri webview intercepts native drag/drop. */

/** Pixels of movement before a press becomes a drag (below = click/select). */
const DRAG_THRESHOLD = 4;

interface ActiveDrag {
  /** Moving an existing node, or dropping a new palette kind. */
  source: { nodeId: string; exclude: Set<string> } | { paletteKind: NodeKind };
  /** What the ghost chip says while following the cursor. */
  label: string;
  boxes: LayoutBox[];
  insertion: Insertion | null;
  /** Cursor position relative to the surface — drives the ghost chip. */
  pointer: { x: number; y: number };
}

/** The stack containers of the Spec tree (drop targets), incl. templates. */
function collectContainers(
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

/** Snapshot every rendered [data-sk] element as a LayoutBox, rects relative
 *  to the surface origin. boxId is per ELEMENT: template instances yield
 *  several boxes for one nodeId (plural data-sk), so dropping into any
 *  instance edits the template. */
function measureBoxes(surface: HTMLElement, root: SketchNode): LayoutBox[] {
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

export function SketchCanvas() {
  const active = useSketchStore((s) => s.active);
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const selectNode = useSketchStore((s) => s.selectNode);
  const insertNodeAt = useSketchStore((s) => s.insertNodeAt);
  const moveNodeTo = useSketchStore((s) => s.moveNodeTo);
  const paletteDrag = useSketchStore((s) => s.paletteDrag);
  const setPaletteDrag = useSketchStore((s) => s.setPaletteDrag);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  /** A press that hasn't crossed the threshold yet (node drags only). */
  const pendingRef = useRef<{ nodeId: string; x: number; y: number } | null>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  dragRef.current = drag;

  const element = useMemo(() => {
    if (!active) return null;
    try {
      const ir = sketchToIR(active, defaultTheme);
      return toElement(ir, canvasCreateElement);
    } catch (e) {
      console.warn("sketch canvas render failed", e);
      return null;
    }
  }, [active]);

  /** Pointer position relative to the surface origin, scroll-consistent. */
  const surfacePoint = (e: PointerEvent | React.PointerEvent) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.x, y: e.clientY - rect.y };
  };

  // One window-level move/up pair serves both drag sources: node drags arm
  // pendingRef on the surface; palette drags arm via the store.
  useEffect(() => {
    if (!active) return;

    const onMove = (e: PointerEvent) => {
      const surface = surfaceRef.current;
      if (!surface) return;

      let current = dragRef.current;
      if (!current) {
        const pending = pendingRef.current;
        if (pending) {
          const dx = e.clientX - pending.x;
          const dy = e.clientY - pending.y;
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          const hit = findNode(active.root, pending.nodeId);
          if (!hit?.parent) {
            // Root and template roots don't drag.
            pendingRef.current = null;
            return;
          }
          current = {
            source: { nodeId: pending.nodeId, exclude: new Set(allNodeIds(hit.node)) },
            label: hit.node.kind,
            boxes: measureBoxes(surface, active.root),
            insertion: null,
            pointer: surfacePoint(e),
          };
          pendingRef.current = null;
        } else if (paletteDrag) {
          current = {
            source: { paletteKind: paletteDrag },
            label: paletteDrag,
            boxes: measureBoxes(surface, active.root),
            insertion: null,
            pointer: surfacePoint(e),
          };
        } else {
          return;
        }
      }

      const point = surfacePoint(e);
      const exclude = "exclude" in current.source ? current.source.exclude : undefined;
      const insertion = computeInsertion(point, current.boxes, exclude);
      const next = { ...current, insertion, pointer: point };
      // Keep the ref current synchronously — move events can arrive before
      // React commits, and re-measuring boxes per event would be wasteful.
      dragRef.current = next;
      setDrag(next);
    };

    const onUp = () => {
      const current = dragRef.current;
      pendingRef.current = null;
      if (paletteDrag) setPaletteDrag(null);
      if (!current) return;
      setDrag(null);
      if (!current.insertion) return; // empty-canvas drop = no-op, never invents structure
      const { containerId, index } = current.insertion;
      if ("paletteKind" in current.source) {
        insertNodeAt(containerId, index, current.source.paletteKind);
      } else {
        moveNodeTo(current.source.nodeId, containerId, index);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [active, paletteDrag, insertNodeAt, moveNodeTo, setPaletteDrag]);

  if (!active) return null;

  const indicator = drag?.insertion ? indicatorRect(drag.insertion, drag.boxes) : null;
  const ringBox =
    drag?.insertion && !indicator
      ? drag.boxes.find((b) => b.boxId === drag.insertion!.targetBoxId)
      : null;

  return (
    <div className="flex-1 glass-panel overflow-auto p-6 min-h-0">
      {/* selection ring for the current node — an overlay concern, so it
          lives here and not in the shared IR */}
      <style>
        {selectedNodeId
          ? `[data-sk="${selectedNodeId}"] { outline: 2px solid #3b82f6; outline-offset: 1px; }`
          : ""}
        {`[data-sk] { cursor: default; }`}
        {drag ? `* { cursor: grabbing !important; }` : ""}
      </style>
      {/* The surface is a flex column so the root's ROOT_CTX premise holds
          on the canvas: its fill sizing (flex-1/self-stretch) actually
          stretches, the root's box covers the whole sheet, and dropping on
          the visually-empty area IS dropping into the root container — the
          tree's own insertion rule, not a special case. */}
      <div
        ref={surfaceRef}
        className="relative mx-auto flex flex-col bg-white text-slate-900 rounded-lg shadow-lg min-h-[420px] max-w-3xl overflow-hidden"
        onMouseDownCapture={(e) => {
          // Canvas interactions select, never activate (inputs don't focus,
          // buttons don't fire — the sketch is a drawing, not a form).
          e.preventDefault();
          const hit = (e.target as HTMLElement).closest("[data-sk]");
          selectNode(hit ? hit.getAttribute("data-sk") : active.root.id);
        }}
        onPointerDownCapture={(e) => {
          const hit = (e.target as HTMLElement).closest("[data-sk]");
          const nodeId = hit?.getAttribute("data-sk");
          if (nodeId && nodeId !== active.root.id) {
            pendingRef.current = { nodeId, x: e.clientX, y: e.clientY };
          }
        }}
      >
        {element}
        {indicator && (
          <div
            className="absolute bg-blue-500 rounded pointer-events-none z-10"
            style={{
              left: indicator.x,
              top: indicator.y,
              width: indicator.width,
              height: indicator.height,
            }}
          />
        )}
        {ringBox && (
          <div
            className="absolute border-2 border-blue-500 rounded pointer-events-none z-10"
            style={{
              left: ringBox.rect.x,
              top: ringBox.rect.y,
              width: ringBox.rect.width,
              height: ringBox.rect.height,
            }}
          />
        )}
        {/* Ghost chip — the "you are dragging X" feedback that follows the
            cursor. Purely visual; the drop decision is the indicator's. */}
        {drag && (
          <div
            className="absolute z-20 pointer-events-none px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[10px] leading-tight shadow"
            style={{ left: drag.pointer.x + 10, top: drag.pointer.y + 12 }}
          >
            {drag.label}
          </div>
        )}
      </div>
    </div>
  );
}

/** React createElement with one canvas-only shim: fixed-px classes
 *  (`w-[240px]`) are arbitrary values Tailwind can't see at runtime, so they
 *  are mirrored to inline style. The className itself stays untouched —
 *  parity with the generated code is byte-level. */
const canvasCreateElement: CreateElement<React.ReactElement> = (tag, props, ...children) => {
  const p: Record<string, unknown> = { ...(props ?? {}) };
  const className = typeof p.className === "string" ? p.className : "";
  const style: React.CSSProperties = {};
  for (const cls of className.split(" ")) {
    const m = /^([wh])-\[(\d+)px\]$/.exec(cls);
    if (m) {
      if (m[1] === "w") style.width = Number(m[2]);
      else style.height = Number(m[2]);
    }
  }
  if (Object.keys(style).length > 0) {
    p.style = { ...(p.style as object | undefined), ...style };
  }
  // Canvas is display-only: inputs must not trap edits meant for the
  // Inspector (the single write path — §10 lean).
  if (tag === "input") p.readOnly = true;
  return React.createElement(tag, p, ...children);
};
