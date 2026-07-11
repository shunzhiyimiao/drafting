import React, { useMemo } from "react";
import {
  defaultTheme,
  toElement,
  toIR,
  type CreateElement,
  type SketchNode,
} from "@drafting/sketch-core";
import { defaultNode, findNode, useSketchStore } from "../../../stores/sketch-store";
import type { LayoutBox } from "../insertion";
import type { DragSession } from "../interaction/types";

/** The real-rendered drag preview (S3, replacing the text-chip ghost): the
 *  dragged node — or the exact default node a palette drop would insert —
 *  rendered through the SAME IR the canvas and codegen share (K3), floating
 *  at the cursor. Purely visual: pointer-events-none, and data-sk is
 *  STRIPPED so the preview can never pollute geometry measurement or
 *  selection queries. */
const previewCreateElement: CreateElement<React.ReactElement> = (tag, props, ...children) => {
  const p: Record<string, unknown> = { ...(props ?? {}) };
  delete p["data-sk"]; // never leak addressable ids into an overlay
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
  if (tag === "input") p.readOnly = true;
  return React.createElement(tag, p, ...children);
};

export function DragPreview({
  session,
  boxes,
  pointer,
}: {
  session: DragSession;
  boxes: LayoutBox[] | null;
  /** Logical surface coordinates of the cursor. */
  pointer: { x: number; y: number };
}) {
  const active = useSketchStore((s) => s.active);

  // Which node are we showing, and how wide was it on the sheet?
  const { node, width } = useMemo((): { node: SketchNode | null; width: number } => {
    if (session.source.type === "palette") {
      return { node: defaultNode(session.source.kind), width: 200 };
    }
    const found = active ? findNode(active.root, session.source.nodeId) : null;
    const box = boxes?.find(
      (b) => session.source.type === "existing-node" && b.nodeId === session.source.nodeId,
    );
    return { node: found?.node ?? null, width: box ? Math.min(box.rect.width, 360) : 200 };
  }, [session.source, active, boxes]);

  const element = useMemo(() => {
    if (!node) return null;
    try {
      // A neutral non-stretching context: previews hug their content.
      const ir = toIR(node, { direction: "col", crossAxis: "start" }, defaultTheme);
      return toElement(ir, previewCreateElement);
    } catch {
      return null;
    }
  }, [node]);

  if (!element) return null;
  return (
    <div
      className="absolute z-20 pointer-events-none opacity-80"
      style={{ left: pointer.x + 12, top: pointer.y + 14, width }}
    >
      <div className="rounded-md shadow-xl ring-1 ring-blue-500/40 bg-white text-slate-900 overflow-hidden max-h-48">
        {element}
      </div>
    </div>
  );
}
