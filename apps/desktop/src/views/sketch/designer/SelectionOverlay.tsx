import { useLayoutEffect, useRef, useState } from "react";
import type { SketchNode } from "@drafting/sketch-core";
import { findNode, useSketchStore } from "../../../stores/sketch-store";
import { computeResize, type Handle, type Rect, type ResizeResult } from "./resize";
import { PANEL_VARIANTS, type PanelVariant } from "@drafting/sketch-core";

/** Professional selection chrome (S3) + live resize handles (S4).
 *
 *  Dragging a handle writes `fixed` px into the node's sizing — the Spec's
 *  one open escape hatch, so this is K1-safe by construction. The gesture
 *  follows the S1 laws in miniature: pointerId-guarded, exactly one
 *  mutation per gesture (a single updateNode → ONE undo unit), and Escape/
 *  pointercancel/blur cancel without touching the document. While
 *  resizing, a dashed outline + px badge preview the result; the document
 *  changes only on release. Double-click a handle to return its axis to
 *  `hug`.
 *
 *  Everything here carries data-designer-overlay so the canvas's capture
 *  handlers ignore it (a handle press must not arm a node drag or reset
 *  the selection). */
function labelOf(node: SketchNode): string {
  const base =
    node.kind === "stack"
      ? `Stack · ${node.layout.direction}`
      : node.kind === "list"
        ? `List · ${node.dataKey}`
        : node.kind.charAt(0).toUpperCase() + node.kind.slice(1);
  // A frame child wears its coordinates (Rev 5) — the position IS the fact.
  return node.pos ? `${base} · ${node.pos.x}, ${node.pos.y}` : base;
}

const HANDLES: Handle[] = [
  { hx: 0, hy: 0 },
  { hx: 0.5, hy: 0 },
  { hx: 1, hy: 0 },
  { hx: 0, hy: 0.5 },
  { hx: 1, hy: 0.5 },
  { hx: 0, hy: 1 },
  { hx: 0.5, hy: 1 },
  { hx: 1, hy: 1 },
];

function cursorFor(h: Handle): string {
  if (h.hx === 0.5) return "ns-resize";
  if (h.hy === 0.5) return "ew-resize";
  return (h.hx === 0) === (h.hy === 0) ? "nwse-resize" : "nesw-resize";
}

interface ResizeGesture {
  pointerId: number;
  nodeId: string;
  handle: Handle;
  startRect: Rect;
  siblingWidths: number[];
  siblingHeights: number[];
}

export function SelectionOverlay({ surface }: { surface: HTMLElement | null }) {
  const active = useSketchStore((s) => s.active);
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const zoom = useSketchStore((s) => s.zoom);
  const canvasWidth = useSketchStore((s) => s.canvasWidth);
  const updateNode = useSketchStore((s) => s.updateNode);
  const [rects, setRects] = useState<Rect[]>([]);
  const [live, setLive] = useState<ResizeResult | null>(null);
  const gestureRef = useRef<ResizeGesture | null>(null);

  useLayoutEffect(() => {
    if (!surface || !selectedNodeId) {
      setRects([]);
      return;
    }
    const measure = () => {
      const origin = surface.getBoundingClientRect();
      const els = Array.from(
        surface.querySelectorAll<HTMLElement>(`[data-sk="${CSS.escape(selectedNodeId)}"]`),
      );
      setRects(
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: (r.x - origin.x) / zoom,
            y: (r.y - origin.y) / zoom,
            width: r.width / zoom,
            height: r.height / zoom,
          };
        }),
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // `active` re-measures after every document change (reprint reflows).
  }, [surface, selectedNodeId, active, zoom, canvasWidth]);

  if (rects.length === 0 || !active || !selectedNodeId) return null;
  const node = findNode(active.root, selectedNodeId)?.node ?? null;
  const isRoot = selectedNodeId === active.root.id;

  const surfacePoint = (clientX: number, clientY: number) => {
    const r = surface!.getBoundingClientRect();
    return { x: (clientX - r.x) / zoom, y: (clientY - r.y) / zoom };
  };

  /** Sibling dimensions for snap — first rendered instance of each. */
  const measureSiblings = (nodeId: string): { widths: number[]; heights: number[] } => {
    const widths: number[] = [];
    const heights: number[] = [];
    const parent = findNode(active.root, nodeId)?.parent;
    if (parent && surface) {
      for (const sib of parent.children) {
        if (sib.id === nodeId) continue;
        const el = surface.querySelector<HTMLElement>(`[data-sk="${CSS.escape(sib.id)}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        widths.push(Math.round(r.width / zoom));
        heights.push(Math.round(r.height / zoom));
      }
    }
    return { widths, heights };
  };

  const endGesture = (commit: boolean, clientX = 0, clientY = 0) => {
    const g = gestureRef.current;
    gestureRef.current = null; // exactly-once: nothing can commit after this
    setLive(null);
    if (!g) return;
    if (commit) {
      const result = computeResize(
        g.handle,
        g.startRect,
        surfacePoint(clientX, clientY),
        g.siblingWidths,
        g.siblingHeights,
      );
      // ONE mutation per gesture — one undo unit on the shared stack.
      updateNode(g.nodeId, (n) => {
        if (result.width !== undefined) n.sizing.width = { mode: "fixed", px: result.width };
        if (result.height !== undefined) n.sizing.height = { mode: "fixed", px: result.height };
      });
    }
  };

  const startResize = (e: React.PointerEvent, handle: Handle, rect: Rect) => {
    if (gestureRef.current || !node) return;
    e.preventDefault();
    e.stopPropagation();
    const siblings = measureSiblings(selectedNodeId);
    const g: ResizeGesture = {
      pointerId: e.pointerId,
      nodeId: selectedNodeId,
      handle,
      startRect: rect,
      siblingWidths: siblings.widths,
      siblingHeights: siblings.heights,
    };
    gestureRef.current = g;

    const onMove = (ev: PointerEvent) => {
      const cur = gestureRef.current;
      if (!cur || ev.pointerId !== cur.pointerId) return;
      setLive(
        computeResize(
          cur.handle,
          cur.startRect,
          surfacePoint(ev.clientX, ev.clientY),
          cur.siblingWidths,
          cur.siblingHeights,
        ),
      );
    };
    const onUp = (ev: PointerEvent) => {
      if (gestureRef.current && ev.pointerId !== gestureRef.current.pointerId) return;
      cleanup();
      endGesture(true, ev.clientX, ev.clientY);
    };
    const onCancel = (ev: PointerEvent) => {
      if (gestureRef.current && ev.pointerId !== gestureRef.current.pointerId) return;
      cleanup();
      endGesture(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        cleanup();
        endGesture(false);
      }
    };
    const onBlur = () => {
      cleanup();
      endGesture(false);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
  };

  const resetAxis = (handle: Handle) => {
    if (!node) return;
    updateNode(selectedNodeId, (n) => {
      if (handle.hx !== 0.5) n.sizing.width = { mode: "hug" };
      if (handle.hy !== 0.5) n.sizing.height = { mode: "hug" };
    });
  };

  const primary = rects[0];

  return (
    <>
      {rects.map((r, i) => (
        <div
          key={i}
          data-designer-overlay
          className="absolute pointer-events-none z-10"
          style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
        >
          <div className="absolute inset-0 border-2 border-blue-500/90 rounded-[2px]" />
          {/* Handles: live on the first instance, decorative on the rest. */}
          {!isRoot &&
            HANDLES.map((h, j) => (
              <div
                key={j}
                data-designer-overlay
                onPointerDown={i === 0 ? (e) => startResize(e, h, r) : undefined}
                onDoubleClick={i === 0 ? () => resetAxis(h) : undefined}
                title="拖动 = 设为固定像素 · 双击 = 回到 hug"
                className="absolute w-[7px] h-[7px] bg-white border border-blue-500 rounded-[1.5px] shadow-sm pointer-events-auto"
                style={{
                  left: `calc(${h.hx * 100}% - 3.5px)`,
                  top: `calc(${h.hy * 100}% - 3.5px)`,
                  cursor: cursorFor(h),
                }}
              />
            ))}
          {/* Kind chip on the first instance, WPF/Studio style. */}
          {i === 0 && node && (
            <div className="absolute -top-5 left-0 px-1.5 py-0.5 rounded-t bg-blue-500 text-white text-[9px] font-medium leading-tight whitespace-nowrap">
              {labelOf(node)}
            </div>
          )}
          {/* Panel intent chips (Magic Frame): what should this panel BE?
              Plain/card/island — intent only; the fold owns the look. Shown
              for any selected non-root stack, so the post-marquee picker is
              just "the wrapper got selected". */}
          {i === 0 && node && node.kind === "stack" && !isRoot && (
            <div
              data-designer-overlay
              data-variant-chips
              className="absolute left-0 flex items-center gap-1 pointer-events-auto"
              style={{ top: "100%", marginTop: 4 }}
            >
              {PANEL_VARIANTS.map((v) => {
                const current = node.variant ?? "plain";
                return (
                  <button
                    key={v}
                    data-variant-chip={v}
                    onClick={() =>
                      updateNode(selectedNodeId, (n) => {
                        if (n.kind !== "stack") return;
                        if (v === "plain") delete (n as { variant?: PanelVariant }).variant;
                        else n.variant = v;
                      })
                    }
                    className={`px-1.5 py-0.5 rounded-full text-[9px] leading-tight border ${
                      current === v
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-white/90 text-slate-600 border-slate-300 hover:border-blue-400"
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      {/* Live resize preview: dashed outline at the pending size + badge.
          The document mutates only on release. */}
      {live && primary && (
        <div
          data-designer-overlay
          className="absolute pointer-events-none z-20 border-2 border-dashed border-blue-400 rounded-[2px]"
          style={{
            left: primary.x,
            top: primary.y,
            width: live.width ?? primary.width,
            height: live.height ?? primary.height,
          }}
        >
          <div className="absolute -bottom-5 right-0 px-1.5 py-0.5 rounded bg-slate-900/85 text-white text-[9px] whitespace-nowrap">
            {live.width !== undefined ? `W ${live.width}px` : ""}
            {live.width !== undefined && live.height !== undefined ? " · " : ""}
            {live.height !== undefined ? `H ${live.height}px` : ""}
            {live.snapped ? " ⌁ 对齐" : ""}
          </div>
        </div>
      )}
    </>
  );
}
