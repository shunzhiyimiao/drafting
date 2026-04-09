import { Plus } from "lucide-react";
import { usePatchboardStore } from "../../../../stores/patchboard-store";

export function CanvasListPanel() {
  const canvasList = usePatchboardStore((s) => s.canvasList);
  const activeCanvasId = usePatchboardStore((s) => s.activeCanvasId);
  const loadCanvas = usePatchboardStore((s) => s.loadCanvas);
  const createCanvas = usePatchboardStore((s) => s.createCanvas);

  const handleCreate = async () => {
    const name = prompt("Canvas name:");
    if (name) {
      await createCanvas(name);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Canvases
        </span>
        <button
          onClick={handleCreate}
          className="text-text-muted hover:text-text-secondary"
          title="New Canvas"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {canvasList.length === 0 ? (
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
