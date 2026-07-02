import React, { useMemo } from "react";
import { defaultTheme, sketchToIR, toElement, type CreateElement } from "@drafting/sketch-core";
import { useSketchStore } from "../../stores/sketch-store";

/** The design surface. Rendered via toElement — the SAME IR the generated
 *  code serializes from (K3: WYSIWYG is constructional). Selection reads
 *  data-sk, the addressing criteria and Atlas share (§7). */
export function SketchCanvas() {
  const active = useSketchStore((s) => s.active);
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const selectNode = useSketchStore((s) => s.selectNode);

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

  if (!active) return null;

  return (
    <div className="flex-1 glass-panel overflow-auto p-6 min-h-0">
      {/* selection ring for the current node — an overlay concern, so it
          lives here and not in the shared IR */}
      <style>
        {selectedNodeId
          ? `[data-sk="${selectedNodeId}"] { outline: 2px solid #3b82f6; outline-offset: 1px; }`
          : ""}
        {`[data-sk] { cursor: default; }`}
      </style>
      <div
        className="mx-auto bg-white text-slate-900 rounded-lg shadow-lg min-h-[420px] max-w-3xl overflow-hidden"
        onMouseDownCapture={(e) => {
          // Canvas interactions select, never activate (inputs don't focus,
          // buttons don't fire — the sketch is a drawing, not a form).
          e.preventDefault();
          const hit = (e.target as HTMLElement).closest("[data-sk]");
          selectNode(hit ? hit.getAttribute("data-sk") : active.root.id);
        }}
      >
        {element}
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
