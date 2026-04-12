import { useState, useRef, useEffect } from "react";
import { Plus, Check, X } from "lucide-react";
import { usePatchboardStore } from "../../../../stores/patchboard-store";

export function CanvasListPanel() {
  const canvasList = usePatchboardStore((s) => s.canvasList);
  const activeCanvasId = usePatchboardStore((s) => s.activeCanvasId);
  const loadCanvas = usePatchboardStore((s) => s.loadCanvas);
  const createCanvas = usePatchboardStore((s) => s.createCanvas);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) {
      inputRef.current?.focus();
    }
  }, [creating]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createCanvas(trimmed);
    setName("");
    setCreating(false);
  };

  const handleCancel = () => {
    setName("");
    setCreating(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Canvases
        </span>
        <button
          onClick={() => setCreating(true)}
          className="text-text-muted hover:text-text-secondary"
          title="New Canvas"
        >
          <Plus size={14} />
        </button>
      </div>

      {creating && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") handleCancel();
            }}
            placeholder="Canvas name..."
            className="flex-1 px-2 py-1 text-xs rounded"
          />
          <button
            onClick={handleCreate}
            className="text-success hover:text-success/80"
            title="Create"
          >
            <Check size={14} />
          </button>
          <button
            onClick={handleCancel}
            className="text-text-muted hover:text-error"
            title="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {canvasList.length === 0 && !creating ? (
          <p className="p-3 text-xs text-text-muted">
            No canvases yet. Create one to start.
          </p>
        ) : (
          canvasList.map((c) => (
            <button
              key={c.id}
              onClick={() => loadCanvas(c.id)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-border transition-colors ${
                activeCanvasId === c.id
                  ? "bg-bg-active text-text-primary"
                  : "text-text-secondary hover:bg-bg-hover"
              }`}
            >
              <div className="font-medium">{c.name}</div>
              <div className="text-text-muted mt-0.5">
                {c.adapterCount} adapters, {c.wireCount} wires
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
