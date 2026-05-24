import { Trash2, ArrowRight } from "lucide-react";
import { usePatchboardStore } from "../../../../stores/patchboard-store";

export function WirePanel() {
  const activeCanvas = usePatchboardStore((s) => s.activeCanvas);
  const selectedEdgeId = usePatchboardStore((s) => s.selectedEdgeId);
  const setSelectedEdge = usePatchboardStore((s) => s.setSelectedEdge);
  const updateActiveCanvas = usePatchboardStore((s) => s.updateActiveCanvas);
  const registry = usePatchboardStore((s) => s.registry);

  const wire = activeCanvas?.wires.find((w) => w.id === selectedEdgeId);

  if (!wire || !activeCanvas) {
    return null;
  }

  const fromAdapter = activeCanvas.adapters.find(
    (a) => a.id === wire.fromAdapterId,
  );
  const toAdapter = activeCanvas.adapters.find(
    (a) => a.id === wire.toAdapterId,
  );

  // wire.fromSocketId is the Handle id (which we set to socket displayName
  // in useCanvasState). Resolve it back to a Socket entry for richer info.
  const socketEntry = registry?.sockets.find(
    (s) => s.displayName === wire.fromSocketId || s.id === wire.fromSocketId,
  );

  const handleDelete = () => {
    updateActiveCanvas((canvas) => ({
      ...canvas,
      wires: canvas.wires.filter((w) => w.id !== wire.id),
    }));
    setSelectedEdge(null);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted">
          Wire
        </label>
        <div className="text-[10px] text-text-muted mt-0.5 font-mono break-all">
          {wire.id}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted">
          From
        </label>
        <div className="mt-0.5">
          <div className="text-xs text-text-primary font-medium">
            {fromAdapter?.name ?? "(unknown adapter)"}
          </div>
          <div className="text-[10px] text-text-muted">
            via{" "}
            <span className="text-success">
              {socketEntry?.displayName ?? wire.fromSocketId}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-center text-text-muted">
        <ArrowRight size={14} />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted">
          To
        </label>
        <div className="mt-0.5">
          <div className="text-xs text-text-primary font-medium">
            {toAdapter?.name ?? "(unknown adapter)"}
          </div>
          <div className="text-[10px] text-text-muted">
            param{" "}
            <span className="text-warning">{wire.toParamName}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleDelete}
        className="glass-button-error mt-2 px-3 py-1.5 text-xs rounded-lg font-medium inline-flex items-center justify-center gap-1.5"
      >
        <Trash2 size={12} />
        Delete Wire
      </button>
    </div>
  );
}
