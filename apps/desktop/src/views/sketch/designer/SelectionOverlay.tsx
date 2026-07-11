import { useLayoutEffect, useState } from "react";
import type { SketchNode } from "@drafting/sketch-core";
import { findNode, useSketchStore } from "../../../stores/sketch-store";

/** Professional selection chrome (S3): a frame with eight handle dots and a
 *  kind chip over every rendered instance of the selected node (template
 *  nodes render plurally — all instances light up, chip on the first).
 *  Purely an overlay: handles are visual scaffolding until S4 wires resize
 *  semantics (fixed-px, the K1 escape hatch). Coordinates are LOGICAL
 *  surface units — the overlay lives inside the zoomed surface, and rects
 *  divide by zoom exactly like drag geometry does. */
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function labelOf(node: SketchNode): string {
  if (node.kind === "stack") return `Stack · ${node.layout.direction}`;
  if (node.kind === "list") return `List · ${node.dataKey}`;
  return node.kind.charAt(0).toUpperCase() + node.kind.slice(1);
}

const HANDLES: [number, number][] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [0, 0.5],
  [1, 0.5],
  [0, 1],
  [0.5, 1],
  [1, 1],
];

export function SelectionOverlay({ surface }: { surface: HTMLElement | null }) {
  const active = useSketchStore((s) => s.active);
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const zoom = useSketchStore((s) => s.zoom);
  const canvasWidth = useSketchStore((s) => s.canvasWidth);
  const [rects, setRects] = useState<Rect[]>([]);

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

  if (rects.length === 0 || !active) return null;
  const node = findNode(active.root, selectedNodeId!)?.node ?? null;
  const isRoot = selectedNodeId === active.root.id;

  return (
    <>
      {rects.map((r, i) => (
        <div
          key={i}
          className="absolute pointer-events-none z-10"
          style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
        >
          <div className="absolute inset-0 border-2 border-blue-500/90 rounded-[2px]" />
          {/* Handle dots — visual scaffolding; resize lands in S4. */}
          {!isRoot &&
            HANDLES.map(([hx, hy], j) => (
              <div
                key={j}
                className="absolute w-[7px] h-[7px] bg-white border border-blue-500 rounded-[1.5px] shadow-sm"
                style={{
                  left: `calc(${hx * 100}% - 3.5px)`,
                  top: `calc(${hy * 100}% - 3.5px)`,
                }}
              />
            ))}
          {/* Kind chip on the first instance, WPF/Studio style. */}
          {i === 0 && node && (
            <div className="absolute -top-5 left-0 px-1.5 py-0.5 rounded-t bg-blue-500 text-white text-[9px] font-medium leading-tight whitespace-nowrap">
              {labelOf(node)}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
