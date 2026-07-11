import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BoxSelect,
  Group,
  Image as ImageIcon,
  List as ListIcon,
  MousePointerClick,
  PenTool,
  Plus,
  TextCursorInput,
  Trash2,
  Type,
} from "lucide-react";
import { findNode, useSketchStore, type NodeKind } from "../../stores/sketch-store";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { getProjectRoot } from "../../lib/app-bootstrap";
import { Dropdown } from "../../components/Dropdown";
import { SketchOutline } from "./Outline";
import { SketchCanvas } from "./Canvas";
import { SketchInspector } from "./Inspector";
import { SketchTextPanel } from "./SketchTextPanel";

/** The §7 toolbox: exactly the finite primitive set. Clicking adds into the
 *  selected container (structured add — no free coordinates, K1). */
const TOOLBOX: { kind: NodeKind; label: string; icon: typeof Type }[] = [
  { kind: "stack", label: "Stack", icon: BoxSelect },
  { kind: "text", label: "Text", icon: Type },
  { kind: "button", label: "Button", icon: MousePointerClick },
  { kind: "input", label: "Input", icon: TextCursorInput },
  { kind: "image", label: "Image", icon: ImageIcon },
  { kind: "list", label: "List", icon: ListIcon },
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
  const closeSketch = useSketchStore((s) => s.closeSketch);
  const deleteSketchById = useSketchStore((s) => s.deleteSketchById);
  const addNode = useSketchStore((s) => s.addNode);
  const setPaletteDrag = useSketchStore((s) => s.setPaletteDrag);
  const wrapInStack = useSketchStore((s) => s.wrapInStack);
  // Structured edits disable while the document is outside the dialect —
  // editing a stale tree would clobber the user's text.
  const parseError = useSketchStore((s) => s.parseError);

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
  // Two-step inline delete confirm — WKWebView has no confirm() dialog, and
  // deleting a sketch also drops its generated React (bound criteria go
  // dangling, never cascaded).
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

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
                <div
                  key={s.id}
                  className="group flex items-center gap-1 rounded hover:bg-bg-hover"
                >
                  <button
                    onClick={() => void openSketch(s.id)}
                    className="flex-1 text-left text-xs px-2 py-1.5 text-text-secondary truncate"
                  >
                    {s.name}
                    {s.blueprintRef && (
                      <span className="text-text-muted ml-2">
                        → {s.blueprintRef.slice(0, 10)}…
                      </span>
                    )}
                  </button>
                  {confirmingDelete === s.id ? (
                    <span className="flex items-center gap-1 pr-1.5 shrink-0">
                      <button
                        onClick={() => {
                          void deleteSketchById(s.id);
                          setConfirmingDelete(null);
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-error/15 text-error hover:bg-error/25"
                      >
                        Delete?
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(null)}
                        className="text-[10px] px-1 text-text-muted hover:text-text-secondary"
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingDelete(s.id)}
                      title="Delete sketch (generated React goes too; bound criteria go dangling)"
                      className="pr-2 shrink-0 text-text-muted opacity-0 group-hover:opacity-100 hover:text-error transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            {/* min-w-0 lets the input shrink below its placeholder width —
                without it the row overflows the panel padding and the button
                lands flush against the border. */}
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New sketch name…"
              className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-md"
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
              className="glass-button-primary shrink-0"
            >
              <Plus size={12} />
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
                // Drag-to-canvas (§7.1): arm the palette drag; the canvas's
                // session controller consumes the arm on this pointer's
                // first move (S1 — one-shot, pointerId-bound). A plain click
                // (pointer released on the button) still adds into the
                // selection.
                onPointerDown={(e) => setPaletteDrag({ kind, pointerId: e.pointerId })}
                disabled={!selectedNodeId || !!parseError}
                title={`Add ${label} into the selected container — or drag it onto the canvas`}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
          {/* The explicit structure command (§7.1): wrapping is never
              inferred from a drop — it is asked for, on the selection. */}
          <button
            onClick={() => selectedNodeId && wrapInStack(selectedNodeId)}
            disabled={
              !selectedNodeId ||
              !active ||
              !!parseError ||
              !findNode(active.root, selectedNodeId)?.parent
            }
            title="Wrap the selected node in a new Stack"
            className="mt-1 w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
          >
            <Group size={12} />
            Wrap in Stack
          </button>
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
            <button
              onClick={() => void closeSketch()}
              title="Back to sketches (saves first)"
              className="text-text-muted hover:text-accent"
            >
              <ArrowLeft size={13} />
            </button>
            <PenTool size={12} className="text-accent" />
            <span className="text-text-primary font-medium">{active.name}</span>
            <Dropdown
              className="min-w-32"
              value={active.id}
              options={sketches.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => void openSketch(v)}
            />
            <button
              onClick={() => void closeSketch()}
              title="Back to the list to create a new sketch"
              className="text-[10px] text-accent hover:text-accent-hover"
            >
              + new
            </button>
          </div>
          <span className="text-[10px] text-text-muted">
            {saving ? "saving…" : dirty ? "unsaved" : "saved · codegen follows in ~1s"}
          </span>
        </div>
        {/* Text-as-truth (Rev 4 §7): the text pane is the PRIMARY editing
            surface; the canvas above it is the live projection. */}
        <div className="flex-[4] min-h-0 flex flex-col">
          <SketchCanvas />
        </div>
        <div className="flex-[5] min-h-0">
          <SketchTextPanel />
        </div>
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
