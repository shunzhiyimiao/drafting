import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { defaultTheme, sketchToIR, toElement, type CreateElement } from "@drafting/sketch-core";
import { allNodeIds, findNode, useSketchStore } from "../../stores/sketch-store";
import { computeDrop, indicatorFor, type LayoutBox } from "./insertion";
import { measureLayoutBoxes } from "./designer/geometry";
import { SelectionOverlay } from "./designer/SelectionOverlay";
import { DragPreview } from "./designer/DragPreview";
import { beginSession, cancel, commit, move, setPlan } from "./interaction/drag-session";
import type { DragSession } from "./interaction/types";

/** The design surface. Rendered via toElement — the SAME IR the generated
 *  code serializes from (K3: WYSIWYG is constructional). Selection reads
 *  data-sk, the addressing criteria and Atlas share (§7).
 *
 *  Drag (§7.1, narrowed): drags only EXPRESS tree ops. Since S1 the event
 *  layer is thin plumbing around the drag-session state machine
 *  (interaction/drag-session.ts, ten laws, unit-tested): it feeds pointer
 *  facts in, renders the session out, and applies a commit's plan through
 *  the four existing tree ops EXACTLY once. Geometry lives in
 *  designer/geometry.ts. Pointer events, not HTML5 DnD — the Tauri webview
 *  intercepts native drag/drop. */
export function SketchCanvas() {
  const active = useSketchStore((s) => s.active);
  const selectNode = useSketchStore((s) => s.selectNode);
  const insertNodeAt = useSketchStore((s) => s.insertNodeAt);
  const moveNodeTo = useSketchStore((s) => s.moveNodeTo);
  const insertNodeBeside = useSketchStore((s) => s.insertNodeBeside);
  const moveNodeBeside = useSketchStore((s) => s.moveNodeBeside);
  const setPaletteDrag = useSketchStore((s) => s.setPaletteDrag);
  const canvasWidth = useSketchStore((s) => s.canvasWidth);
  const zoom = useSketchStore((s) => s.zoom);
  const activeFile = useSketchStore((s) => s.activeFile);
  /** Fresh zoom for event handlers (they outlive render closures). */
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [session, setSessionState] = useState<DragSession | null>(null);
  /** One-click "spread apart" affordance after a snuggle wrap (§7.1 B). */
  const [wrapHint, setWrapHint] = useState<{ wrapperId: string } | null>(null);
  /** The surface's LAYOUT height (transform-independent). The zoom frame
   *  multiplies it by zoom so the scroll pane sees the sheet's true visual
   *  footprint — without it, zoom > 1 leaves the sheet's bottom beyond the
   *  scroll range and zoom < 1 leaves dead scroll space. */
  const [surfaceH, setSurfaceH] = useState(0);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSurfaceH(el.offsetHeight));
    ro.observe(el);
    setSurfaceH(el.offsetHeight);
    return () => ro.disconnect();
  }, [active !== null]);
  /** Synchronous mirror of the session — pointer events can arrive faster
   *  than React commits, and the exactly-once guarantee must not depend on
   *  render timing (the old dragRef-goes-stale duplicate-commit bug). */
  const sessionRef = useRef<DragSession | null>(null);
  /** Boxes measured once per gesture, at activation. */
  const boxesRef = useRef<LayoutBox[] | null>(null);

  const updateSession = (next: DragSession | null) => {
    sessionRef.current = next;
    setSessionState(next);
  };

  // The hint is a moment, not a mode — it doesn't survive leaving the doc.
  useEffect(() => setWrapHint(null), [activeFile]);

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

  /** Client → LOGICAL surface coordinates (scroll- and zoom-consistent:
   *  rect and pointer are both visual, dividing by zoom restores the
   *  surface-local units the overlays render in). */
  const surfacePoint = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const z = zoomRef.current;
    return { x: (clientX - rect.x) / z, y: (clientY - rect.y) / z };
  };

  useEffect(() => {
    if (!active) return;

    /** Tear down the gesture's transient state. Never touches the document. */
    const endGesture = () => {
      boxesRef.current = null;
      updateSession(null);
    };

    const cancelActive = () => {
      setPaletteDrag(null); // an unconsumed arm is stale the moment we cancel
      setWrapHint(null); // Escape/blur are universal dismissals
      const s = sessionRef.current;
      if (!s) return;
      cancel(s); // (law 9 — result is always cancelled; nothing to apply)
      endGesture();
    };

    const onMove = (e: PointerEvent) => {
      const surface = surfaceRef.current;
      if (!surface) return;

      let s = sessionRef.current;
      if (!s) {
        // A palette arm converts to a session on its OWN pointer's first
        // move — consumed one-shot, so it can never go stale into a later
        // gesture. Read the arm FRESH from the store: pointer events race
        // React's effect re-registration, so a closure value here can lag
        // reality by a frame. A move without buttons means the press ended
        // somewhere we couldn't see (released off-window): discard the arm.
        const arm = useSketchStore.getState().paletteDrag;
        if (!arm || e.pointerId !== arm.pointerId) return;
        if (e.buttons === 0) {
          setPaletteDrag(null);
          return;
        }
        s = beginSession(e.pointerId, { type: "palette", kind: arm.kind }, e.clientX, e.clientY);
        setPaletteDrag(null);
      }

      let next = move(s, e.pointerId, e.clientX, e.clientY);
      if (next === s) return; // foreign pointer or ended session (laws 5, 8)

      if (s.phase === "pending" && next.phase === "dragging") {
        boxesRef.current = measureLayoutBoxes(surface, active.root, zoomRef.current);
      }
      if (next.phase === "dragging" && boxesRef.current) {
        const point = surfacePoint(e.clientX, e.clientY);
        const exclude =
          next.source.type === "existing-node" ? next.source.excludeNodeIds : undefined;
        next = setPlan(next, computeDrop(point, boxesRef.current, exclude));
      }
      updateSession(next);
    };

    const onUp = (e: PointerEvent) => {
      // Hygiene: any pointer release invalidates an unconsumed palette arm
      // (fresh read — same race note as onMove).
      if (useSketchStore.getState().paletteDrag) setPaletteDrag(null);

      const s = sessionRef.current;
      if (!s) return;
      const { session: ended, plan } = commit(s, e.pointerId);
      if (ended === s) return; // foreign pointer's release — session untouched
      endGesture();
      if (!plan) return; // click, or off-sheet drop: zero mutations

      // ONE mutation per gesture, through the existing four ops only.
      if (plan.kind === "insert") {
        if (s.source.type === "palette") {
          insertNodeAt(plan.containerId, plan.index, s.source.kind);
        } else {
          moveNodeTo(s.source.nodeId, plan.containerId, plan.index);
        }
        setWrapHint(null); // a new edit outdates any lingering hint
      } else {
        const wrapperId =
          s.source.type === "palette"
            ? insertNodeBeside(plan.targetNodeId, plan.side, plan.direction, s.source.kind, plan.spread)
            : moveNodeBeside(s.source.nodeId, plan.targetNodeId, plan.side, plan.direction, plan.spread);
        // Snuggle wraps get the one-click "spread apart" affordance (§7.1
        // amendment, option B): the alignment vocabulary is already in the
        // alphabet — this makes it discoverable at the moment it applies.
        setWrapHint(!plan.spread && wrapperId ? { wrapperId } : null);
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (s && e.pointerId !== s.pointerId) return; // foreign pointer
      cancelActive();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelActive();
    };
    const onBlur = () => cancelActive();
    const onVisibility = () => {
      if (document.hidden) cancelActive();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      // No cancel here: re-registration must not kill a live gesture —
      // session state lives in refs. (The arm is deliberately NOT a dep:
      // handlers read it fresh, so arming never re-registers listeners.)
    };
  }, [active, insertNodeAt, moveNodeTo, insertNodeBeside, moveNodeBeside, setPaletteDrag]);

  if (!active) return null;

  const dragging = session?.phase === "dragging" ? session : null;
  const boxes = boxesRef.current;
  const indicator = dragging?.plan && boxes ? indicatorFor(dragging.plan, boxes) : null;
  const ringBox =
    dragging?.plan && !indicator && boxes
      ? boxes.find((b) => b.boxId === dragging.plan!.targetBoxId)
      : null;
  const pointer =
    dragging && surfaceRef.current
      ? surfacePoint(dragging.current.clientX, dragging.current.clientY)
      : null;
  const draggedNodeId =
    dragging?.source.type === "existing-node" ? dragging.source.nodeId : null;

  return (
    <div className="flex-1 glass-panel overflow-auto p-6 min-h-0 canvas-scroll">
      {/* Selection chrome moved to SelectionOverlay (S3); this style block
          keeps only cursor rules and the drag source's dimming. */}
      <style>
        {`[data-sk] { cursor: default; }`}
        {dragging ? `* { cursor: grabbing !important; }` : ""}
        {draggedNodeId
          ? `[data-sk="${draggedNodeId}"] { opacity: 0.35; }`
          : ""}
      </style>
      {/* Zoom frame (S2a): reserves the VISUAL footprint of the scaled
          sheet so scrollbars stay honest — width statically, height from
          the measured layout height (transforms don't affect layout, so
          without this the scroll range would be the UNSCALED height). The
          surface itself keeps logical width and scales via transform —
          geometry divides by zoom. */}
      <div
        className="mx-auto"
        style={{
          width: canvasWidth * zoom,
          height: surfaceH ? surfaceH * zoom : undefined,
        }}
      >
      {/* The surface is a flex column so the root's ROOT_CTX premise holds
          on the canvas: its fill sizing (flex-1/self-stretch) actually
          stretches, the root's box covers the whole sheet, and dropping on
          the visually-empty area IS dropping into the root container — the
          tree's own insertion rule, not a special case. */}
      <div
        ref={surfaceRef}
        className="relative flex flex-col bg-white text-slate-900 rounded-lg shadow-lg min-h-[420px] overflow-hidden"
        style={{ width: canvasWidth, transform: `scale(${zoom})`, transformOrigin: "top left" }}
        onMouseDownCapture={(e) => {
          // Overlay chrome (selection handles — S4) owns its own gestures.
          if ((e.target as HTMLElement).closest("[data-designer-overlay]")) return;
          // Canvas interactions select, never activate (inputs don't focus,
          // buttons don't fire — the sketch is a drawing, not a form).
          e.preventDefault();
          const hit = (e.target as HTMLElement).closest("[data-sk]");
          selectNode(hit ? hit.getAttribute("data-sk") : active.root.id);
        }}
        onPointerDownCapture={(e) => {
          if ((e.target as HTMLElement).closest("[data-designer-overlay]")) return;
          setWrapHint(null); // any fresh press dismisses the hint
          if (sessionRef.current) return; // one gesture at a time
          const hit = (e.target as HTMLElement).closest("[data-sk]");
          const nodeId = hit?.getAttribute("data-sk");
          if (!nodeId || nodeId === active.root.id) return;
          const found = findNode(active.root, nodeId);
          if (!found?.parent) return; // root and template roots don't drag
          updateSession(
            beginSession(
              e.pointerId,
              {
                type: "existing-node",
                nodeId,
                label: found.node.kind,
                excludeNodeIds: new Set(allNodeIds(found.node)),
              },
              e.clientX,
              e.clientY,
            ),
          );
        }}
      >
        {element}
        {indicator && (
          <div
            className={`absolute pointer-events-none z-10 rounded ${
              indicator.kind === "line"
                ? "bg-blue-500"
                : "bg-blue-500/25 border border-blue-500"
            }`}
            style={{
              left: indicator.rect.x,
              top: indicator.rect.y,
              width: indicator.rect.width,
              height: indicator.rect.height,
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
        {/* Selection frame + handles + kind chip (S3). Hidden mid-drag so
            the preview and indicator own the stage. */}
        {!dragging && <SelectionOverlay surface={surfaceRef.current} />}
        {!dragging && wrapHint && (
          <WrapSpreadHint
            surface={surfaceRef.current}
            wrapperId={wrapHint.wrapperId}
            onDone={() => setWrapHint(null)}
          />
        )}
        {/* Real-rendered drag preview (S3) — the dragged node itself (or
            the exact default node a palette drop inserts) follows the
            cursor; the source dims via the style block above. */}
        {dragging && pointer && (
          <DragPreview session={dragging} boxes={boxes} pointer={pointer} />
        )}
      </div>
      </div>
    </div>
  );
}

/** Post-snuggle-wrap affordance (§7.1 amendment, option B): a one-click
 *  chip on the fresh wrapper offering "spread apart" — main="between" plus
 *  main-axis fill, the exact attributes a flank drop would have written.
 *  The vocabulary already exists in the Spec and the Inspector; this makes
 *  it discoverable at the moment it's most likely wanted. Dismissed by any
 *  fresh press on the surface, Escape, or applying it. */
function WrapSpreadHint({
  surface,
  wrapperId,
  onDone,
}: {
  surface: HTMLElement | null;
  wrapperId: string;
  onDone: () => void;
}) {
  const active = useSketchStore((s) => s.active);
  const zoom = useSketchStore((s) => s.zoom);
  const updateNode = useSketchStore((s) => s.updateNode);
  const [rect, setRect] = useState<{ x: number; y: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!surface) {
      setRect(null);
      return;
    }
    const el = surface.querySelector<HTMLElement>(`[data-sk="${CSS.escape(wrapperId)}"]`);
    if (!el) {
      setRect(null); // wrapper gone (undo, doc switch) → hint hides itself
      return;
    }
    const origin = surface.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setRect({ x: (r.x - origin.x) / zoom, y: (r.y - origin.y) / zoom, width: r.width / zoom });
  }, [surface, wrapperId, active, zoom]);

  if (!rect) return null;
  return (
    <button
      data-designer-overlay
      className="absolute z-20 px-2 py-0.5 rounded-full bg-slate-900/85 text-white text-[10px] leading-tight whitespace-nowrap shadow-md hover:bg-slate-900 cursor-pointer"
      style={{
        left: rect.x + rect.width,
        // Clamp inside the sheet — the surface clips overflow.
        top: Math.max(2, rect.y - 22),
        transform: "translateX(-100%)",
      }}
      onClick={() => {
        updateNode(wrapperId, (n) => {
          if (n.kind !== "stack") return;
          n.layout.mainAxis = "between";
          if (n.layout.direction === "row") n.sizing.width = { mode: "fill" };
          else n.sizing.height = { mode: "fill" };
        });
        onDone();
      }}
    >
      ⇄ 两端分开
    </button>
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
