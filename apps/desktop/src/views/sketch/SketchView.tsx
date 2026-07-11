import { useEffect, useState } from "react";
import {
  ArrowLeft,
  PenTool,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useSketchStore } from "../../stores/sketch-store";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { getProjectRoot } from "../../lib/app-bootstrap";
import { Dropdown } from "../../components/Dropdown";
import { SketchOutline } from "./Outline";
import { SketchCanvas } from "./Canvas";
import { SketchInspector } from "./Inspector";
import { SketchPalette } from "./Palette";
import { BottomDock } from "./BottomDock";

/** Sheet width presets (visual viewport only — K1 untouched). */
const WIDTHS = [375, 768, 1024, 1280];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

export function SketchView() {
  const sketches = useSketchStore((s) => s.sketches);
  const active = useSketchStore((s) => s.active);
  const dirty = useSketchStore((s) => s.dirty);
  const saving = useSketchStore((s) => s.saving);
  const lastError = useSketchStore((s) => s.lastError);
  const initialize = useSketchStore((s) => s.initialize);
  const createSketch = useSketchStore((s) => s.createSketch);
  const openSketch = useSketchStore((s) => s.openSketch);
  const closeSketch = useSketchStore((s) => s.closeSketch);
  const deleteSketchById = useSketchStore((s) => s.deleteSketchById);
  const openDocs = useSketchStore((s) => s.openDocs);
  const activeFile = useSketchStore((s) => s.activeFile);
  const switchDoc = useSketchStore((s) => s.switchDoc);
  const closeDoc = useSketchStore((s) => s.closeDoc);
  const undoBuffer = useSketchStore((s) => s.undoBuffer);
  const redoBuffer = useSketchStore((s) => s.redoBuffer);
  const canvasWidth = useSketchStore((s) => s.canvasWidth);
  const zoom = useSketchStore((s) => s.zoom);
  const setCanvasWidth = useSketchStore((s) => s.setCanvasWidth);
  const setZoom = useSketchStore((s) => s.setZoom);

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
            {/* min-w-0 lets the input shrink below its placeholder width. */}
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
    <div className="h-full flex flex-col gap-2 p-2">
      {/* Designer toolbar (S2a): document identity · undo/redo (the ONE
          Monaco stack) · viewport width/zoom · save state. */}
      <div className="glass-panel px-3 py-1.5 flex items-center gap-2 shrink-0">
        <button
          onClick={() => void closeSketch()}
          title="返回列表（先保存）"
          className="text-text-muted hover:text-accent"
        >
          <ArrowLeft size={13} />
        </button>
        <PenTool size={12} className="text-accent" />
        {/* Document tabs (S2b): every open doc, dirty dot, close, add. */}
        <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto">
          {openDocs.map((d) => (
            <span
              key={d.file}
              className={`group flex items-center gap-1 pl-2 pr-1 py-1 rounded-md text-[11px] cursor-pointer shrink-0 ${
                d.file === activeFile
                  ? "bg-bg-hover text-text-primary"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-hover/50"
              }`}
              onClick={() => d.file !== activeFile && void switchDoc(d.file)}
            >
              {d.name}
              {(d.file === activeFile ? dirty : d.dirty) && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void closeDoc(d.file);
                }}
                title="关闭（先保存）"
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-opacity"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <Dropdown
          className="min-w-28"
          value={active.id}
          options={sketches.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => void openSketch(v)}
        />
        <button
          onClick={() => void closeSketch()}
          title="回列表新建"
          className="text-[10px] text-accent hover:text-accent-hover shrink-0"
        >
          + new
        </button>

        <span className="mx-1 h-4 w-px bg-border/60" />
        <button onClick={undoBuffer} title="撤销 (⌘Z)" className="text-text-muted hover:text-text-primary">
          <Undo2 size={13} />
        </button>
        <button onClick={redoBuffer} title="重做 (⇧⌘Z)" className="text-text-muted hover:text-text-primary">
          <Redo2 size={13} />
        </button>

        <span className="flex-1" />

        <Dropdown
          className="w-24"
          value={String(canvasWidth)}
          options={WIDTHS.map((w) => ({ value: String(w), label: `${w} px` }))}
          onChange={(v) => setCanvasWidth(Number(v))}
        />
        <Dropdown
          className="w-20"
          value={String(zoom)}
          options={ZOOMS.map((z) => ({ value: String(z), label: `${Math.round(z * 100)}%` }))}
          onChange={(v) => setZoom(Number(v))}
        />
        <span className="text-[10px] text-text-muted w-40 text-right">
          {saving ? "saving…" : dirty ? "unsaved" : "saved · codegen follows in ~1s"}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex gap-2">
        {/* Left — palette + layers */}
        <div className="w-52 flex flex-col gap-2 shrink-0 min-h-0">
          <SketchPalette />
          <div className="glass-panel flex-1 overflow-auto p-2 min-h-0">
            <h3 className="text-[9px] uppercase tracking-widest text-text-muted px-1 mb-1.5">
              Layers
            </h3>
            <SketchOutline />
          </div>
        </div>

        {/* Center — canvas over the bottom dock (markup/code) */}
        <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
          <div className="flex-[5] min-h-0 flex flex-col">
            <SketchCanvas />
          </div>
          <div className="flex-[4] min-h-0">
            <BottomDock />
          </div>
          {lastError && (
            <p className="text-[10px] text-error px-1 shrink-0">{lastError}</p>
          )}
        </div>

        {/* Right — inspector */}
        <div className="w-80 shrink-0 glass-panel overflow-auto min-h-0">
          <SketchInspector />
        </div>
      </div>
    </div>
  );
}
