import { useEffect, useState } from "react";
import { PenTool, Plus, Trash2 } from "lucide-react";
import { useSketchStore } from "../../stores/sketch-store";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { getProjectRoot } from "../../lib/app-bootstrap";
import { SketchLitePage } from "../sketch-lite/components/SketchLitePage";

/** The Sketch view. 入口与创建窗口不变(列表卡片);打开/新建一个 sketch
 *  之后,工作面就是 Sketch Lite —— 画个大概,Generate UI 写进当前文档,
 *  预览页签用现有运行时看结果。旧设计器 chrome(palette/layers/dock/
 *  多 tab 工具栏)不再路由;真相仍是 `.sketch` 文本,codegen 照常。 */
export function SketchView() {
  const sketches = useSketchStore((s) => s.sketches);
  const active = useSketchStore((s) => s.active);
  const lastError = useSketchStore((s) => s.lastError);
  const initialize = useSketchStore((s) => s.initialize);
  const createSketch = useSketchStore((s) => s.createSketch);
  const openSketch = useSketchStore((s) => s.openSketch);
  const closeSketch = useSketchStore((s) => s.closeSketch);
  const deleteSketchById = useSketchStore((s) => s.deleteSketchById);

  useEffect(() => {
    void getProjectRoot().then(async (root) => {
      if (useSketchStore.getState().projectRoot !== root) {
        await initialize(root);
      }
      // The binding surface joins blueprint data — keep that store alive
      // even if its view was never opened.
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

  return <SketchLitePage onExit={() => void closeSketch()} />;
}
