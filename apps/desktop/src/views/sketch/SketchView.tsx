import { useEffect, useState } from "react";
import {
  BoxSelect,
  Image as ImageIcon,
  MousePointerClick,
  PenTool,
  Plus,
  TextCursorInput,
  Type,
} from "lucide-react";
import { useSketchStore, type NodeKind } from "../../stores/sketch-store";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { getProjectRoot } from "../../lib/app-bootstrap";
import { SketchOutline } from "./Outline";
import { SketchCanvas } from "./Canvas";
import { SketchInspector } from "./Inspector";

/** The §7 toolbox: exactly the finite primitive set. Clicking adds into the
 *  selected container (structured add — no free coordinates, K1). */
const TOOLBOX: { kind: NodeKind; label: string; icon: typeof Type }[] = [
  { kind: "stack", label: "Stack", icon: BoxSelect },
  { kind: "text", label: "Text", icon: Type },
  { kind: "button", label: "Button", icon: MousePointerClick },
  { kind: "input", label: "Input", icon: TextCursorInput },
  { kind: "image", label: "Image", icon: ImageIcon },
];

export function SketchView() {
  const sketches = useSketchStore((s) => s.sketches);
  const active = useSketchStore((s) => s.active);
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const dirty = useSketchStore((s) => s.dirty);
  const saving = useSketchStore((s) => s.saving);
  const lastError = useSketchStore((s) => s.lastError);
  const initialize = useSketchStore((s) => s.initialize);
  const createSketch = useSketchStore((s) => s.createSketch);
  const openSketch = useSketchStore((s) => s.openSketch);
  const addNode = useSketchStore((s) => s.addNode);

  useEffect(() => {
    void getProjectRoot().then(async (root) => {
      if (useSketchStore.getState().projectRoot !== root) {
        await initialize(root);
      }
      // The Inspector's binding surface joins blueprint data — make sure the
      // blueprint store is alive even if its view was never opened.
      const bp = useBlueprintStore.getState();
      if (!bp.initialized) void bp.initialize(root);
    });
  }, [initialize]);

  const [newName, setNewName] = useState("");

  if (!active) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="glass-panel p-6 w-96">
          <div className="flex items-center gap-2 mb-3">
            <PenTool size={16} className="text-accent" />
            <h2 className="text-sm font-medium text-text-primary">Sketches</h2>
          </div>
          {sketches.length > 0 && (
            <div className="flex flex-col gap-1 mb-4 max-h-48 overflow-auto">
              {sketches.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void openSketch(s.id)}
                  className="text-left text-xs px-2 py-1.5 rounded hover:bg-bg-hover text-text-secondary"
                >
                  {s.name}
                  {s.blueprintRef && (
                    <span className="text-text-muted ml-2">→ {s.blueprintRef.slice(0, 10)}…</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New sketch name…"
              className="flex-1 text-xs px-2 py-1.5 rounded"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  void createSketch(newName.trim(), null);
                  setNewName("");
                }
              }}
            />
            <button
              onClick={() => {
                if (newName.trim()) {
                  void createSketch(newName.trim(), null);
                  setNewName("");
                }
              }}
              className="glass-button-primary px-3 py-1.5 text-xs rounded-lg"
            >
              <Plus size={12} className="inline mr-1" />
              Create
            </button>
          </div>
          {lastError && <p className="text-[10px] text-error mt-2">{lastError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-3 p-3">
      {/* Left — toolbox + outline (the VS designer's left rail) */}
      <div className="w-56 flex flex-col gap-3 shrink-0">
        <div className="glass-panel p-2">
          <h3 className="text-[10px] uppercase tracking-wider text-text-muted px-1 mb-1.5">
            Toolbox
          </h3>
          <div className="grid grid-cols-2 gap-1">
            {TOOLBOX.map(({ kind, label, icon: Icon }) => (
              <button
                key={kind}
                onClick={() => selectedNodeId && addNode(selectedNodeId, kind)}
                disabled={!selectedNodeId}
                title={`Add ${label} into the selected container`}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="glass-panel flex-1 overflow-auto p-2">
          <h3 className="text-[10px] uppercase tracking-wider text-text-muted px-1 mb-1.5">
            Outline
          </h3>
          <SketchOutline />
        </div>
      </div>

      {/* Center — the design surface */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="glass-panel px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <PenTool size={12} className="text-accent" />
            <span className="text-text-primary font-medium">{active.name}</span>
            <select
              value={active.id}
              onChange={(e) => void openSketch(e.target.value)}
              className="text-[10px] bg-bg-primary border border-border rounded px-1 py-0.5 text-text-muted"
            >
              {sketches.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const name = prompt("New sketch name");
                if (name?.trim()) void createSketch(name.trim(), null);
              }}
              className="text-[10px] text-accent hover:text-accent-hover"
            >
              + new
            </button>
          </div>
          <span className="text-[10px] text-text-muted">
            {saving ? "saving…" : dirty ? "unsaved" : "saved · codegen follows in ~1s"}
          </span>
        </div>
        <SketchCanvas />
        {lastError && (
          <p className="text-[10px] text-error px-1 shrink-0">{lastError}</p>
        )}
      </div>

      {/* Right — the property grid */}
      <div className="w-80 shrink-0 glass-panel overflow-auto">
        <SketchInspector />
      </div>
    </div>
  );
}
