import React, { useEffect, useMemo, useRef, useState } from "react";
import { defaultTheme, sketchToIR, toElement, type CreateElement } from "@drafting/sketch-core";
import { allNodeIds, findNode, useSketchStore } from "../../stores/sketch-store";
import { computeDrop, indicatorFor, type LayoutBox } from "./insertion";
import { measureLayoutBoxes } from "./designer/geometry";
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
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const selectNode = useSketchStore((s) => s.selectNode);
  const insertNodeAt = useSketchStore((s) => s.insertNodeAt);
  const moveNodeTo = useSketchStore((s) => s.moveNodeTo);
  const insertNodeBeside = useSketchStore((s) => s.insertNodeBeside);
  const moveNodeBeside = useSketchStore((s) => s.moveNodeBeside);
  const setPaletteDrag = useSketchStore((s) => s.setPaletteDrag);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [session, setSessionState] = useState<DragSession | null>(null);
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

  /** Client → surface-relative coordinates (scroll-consistent). */
  const surfacePoint = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: clientX - rect.x, y: clientY - rect.y };
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
        boxesRef.current = measureLayoutBoxes(surface, active.root);
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
      } else if (s.source.type === "palette") {
        insertNodeBeside(plan.targetNodeId, plan.side, plan.direction, s.source.kind);
      } else {
        moveNodeBeside(s.source.nodeId, plan.targetNodeId, plan.side, plan.direction);
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
  const ghost =
    dragging && surfaceRef.current
      ? {
          ...surfacePoint(dragging.current.clientX, dragging.current.clientY),
          label: dragging.source.type === "palette" ? dragging.source.kind : dragging.source.label,
        }
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
        {dragging ? `* { cursor: grabbing !important; }` : ""}
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
        {/* Ghost chip — the "you are dragging X" feedback that follows the
            cursor. Purely visual; the drop decision is the indicator's. */}
        {ghost && (
          <div
            className="absolute z-20 pointer-events-none px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[10px] leading-tight shadow"
            style={{ left: ghost.x + 10, top: ghost.y + 12 }}
          >
            {ghost.label}
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
