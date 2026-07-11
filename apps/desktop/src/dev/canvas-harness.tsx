/**
 * Dev-only harness: mounts the Sketch canvas in a plain browser (no Tauri)
 * with a seeded store, so drag/insertion behavior is debuggable with real
 * devtools. Served by vite dev at /canvas-harness.html — never bundled into
 * the app (only index.html is the Tauri entry) and autosave invokes fail
 * loudly into lastError, which is fine here.
 */
import ReactDOM from "react-dom/client";
import { parseSketchMarkup, printSketchMarkup, type Sketch } from "@drafting/sketch-core";
import { SketchCanvas } from "../views/sketch/Canvas";
import { SketchTextPanel } from "../views/sketch/SketchTextPanel";
import { useSketchStore, type NodeKind } from "../stores/sketch-store";
import "../index.css";

// Puppeteer's window into the store — assertion access for the e2e checks
// (drag → text, ⌘Z → both revert). Dev-only page, never bundled.
(window as unknown as { __sketchStore: typeof useSketchStore }).__sketchStore = useSketchStore;
// And the dialect halves, so e2e can construct extra documents (S2b).
(window as unknown as { __sketchCore: object }).__sketchCore = {
  parseSketchMarkup,
  printSketchMarkup,
};

const FIXTURE: Sketch = {
  id: "sk_harness",
  name: "Harness",
  blueprintRef: null,
  schemaVersion: 2,
  root: {
    kind: "stack",
    id: "root",
    layout: {
      direction: "col",
      gap: 4,
      padding: { top: 4, right: 4, bottom: 4, left: 4 },
      mainAxis: "start",
      crossAxis: "stretch",
    },
    sizing: { width: { mode: "fill" }, height: { mode: "fill" } },
    children: [
      { kind: "text", id: "t1", role: "heading", content: "Harness", sizing: { width: { mode: "hug" }, height: { mode: "hug" } } },
      { kind: "input", id: "i1", label: "Email", type: "email", sizing: { width: { mode: "fill" }, height: { mode: "hug" } } },
      {
        kind: "button",
        id: "b1",
        label: "Go",
        variant: "primary",
        intent: { kind: "none" },
        sizing: { width: { mode: "hug" }, height: { mode: "hug" } },
      },
      {
        kind: "stack",
        id: "row1",
        layout: {
          direction: "row",
          gap: 4,
          padding: { top: 2, right: 2, bottom: 2, left: 2 },
          mainAxis: "start",
          crossAxis: "center",
        },
        sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
        children: [
          { kind: "button", id: "r1", label: "One", variant: "secondary", sizing: { width: { mode: "hug" }, height: { mode: "hug" } } },
          { kind: "button", id: "r2", label: "Two", variant: "secondary", sizing: { width: { mode: "hug" }, height: { mode: "hug" } } },
          { kind: "button", id: "r3", label: "Three", variant: "secondary", sizing: { width: { mode: "hug" }, height: { mode: "hug" } } },
        ],
      },
    ],
  },
};

// Text-as-truth: seed the store the way openSketch would — text first,
// parsed views derived (FIXTURE's literal ids are non-temp, so they print
// as sk:id and survive the round-trip).
const HARNESS_TEXT = printSketchMarkup(FIXTURE);
const HARNESS_PARSED = parseSketchMarkup(HARNESS_TEXT);
useSketchStore.setState({
  projectRoot: "/dev/null",
  sketches: [
    { file: "sketches/harness.sketch", id: FIXTURE.id, name: FIXTURE.name, blueprintRef: null },
  ],
  text: HARNESS_TEXT,
  parsed: HARNESS_PARSED,
  active: HARNESS_PARSED.sketch,
  canonical: true,
  activeFile: "sketches/harness.sketch",
  selectedNodeId: "root",
});

function outlineOf(sketch: Sketch): string {
  const lines: string[] = [];
  const walk = (n: (typeof sketch)["root"] | (typeof sketch)["root"]["children"][number], depth: number) => {
    lines.push(`${"  ".repeat(depth)}${n.kind}:${n.id}`);
    if (n.kind === "stack") n.children.forEach((c) => walk(c, depth + 1));
    if (n.kind === "list") walk(n.template, depth + 1);
  };
  walk(sketch.root, 0);
  return lines.join("\n");
}

function Harness() {
  const active = useSketchStore((s) => s.active);
  const paletteDrag = useSketchStore((s) => s.paletteDrag);
  const setPaletteDrag = useSketchStore((s) => s.setPaletteDrag);
  const kinds: NodeKind[] = ["stack", "text", "button", "input", "image", "list"];
  return (
    <div className="h-screen flex flex-col gap-2 p-3 bg-slate-800">
      <div className="flex items-center gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            data-harness-palette={k}
            onPointerDown={(e) => setPaletteDrag({ kind: k, pointerId: e.pointerId })}
            className="px-2 py-1 text-xs rounded bg-slate-600 text-white"
          >
            {k}
          </button>
        ))}
        <span data-harness-palette-state className="text-xs text-white">
          paletteDrag: {String(paletteDrag)}
        </span>
      </div>
      <div className="flex-1 flex min-h-0">
        <SketchCanvas />
      </div>
      <div className="h-56 min-h-0">
        <SketchTextPanel />
      </div>
      <pre data-harness-outline className="text-[10px] text-lime-300 bg-black/40 p-2 rounded max-h-32 overflow-auto">
        {active ? outlineOf(active) : "no active"}
      </pre>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Harness />);
