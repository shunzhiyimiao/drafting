import { Trash2, Star } from "lucide-react";
import { usePatchboardStore } from "../../../../stores/patchboard-store";
import { useT } from "../../../../lib/i18n";

export function AdapterPanel() {
  const tt = useT();
  const activeCanvas = usePatchboardStore((s) => s.activeCanvas);
  const selectedNodeId = usePatchboardStore((s) => s.selectedNodeId);
  const updateActiveCanvas = usePatchboardStore((s) => s.updateActiveCanvas);

  const adapter = activeCanvas?.adapters.find((a) => a.id === selectedNodeId);

  if (!adapter) {
    return (
      <div className="p-3 text-xs text-text-muted">
        Select an adapter to view its properties.
      </div>
    );
  }

  const isEntryPoint = activeCanvas?.entryPoints.some(
    (ep) => ep.adapterId === adapter.id,
  );

  const handleToggleEntryPoint = () => {
    updateActiveCanvas((canvas) => {
      if (isEntryPoint) {
        return {
          ...canvas,
          entryPoints: canvas.entryPoints.filter(
            (ep) => ep.adapterId !== adapter.id,
          ),
        };
      }
      return {
        ...canvas,
        entryPoints: [
          ...canvas.entryPoints,
          {
            id: `ep-${Date.now()}`,
            adapterId: adapter.id,
            exportName: `wire${adapter.name}`,
          },
        ],
      };
    });
  };

  const handleDelete = () => {
    updateActiveCanvas((canvas) => ({
      ...canvas,
      adapters: canvas.adapters.filter((a) => a.id !== adapter.id),
      wires: canvas.wires.filter(
        (w) =>
          w.fromAdapterId !== adapter.id && w.toAdapterId !== adapter.id,
      ),
      entryPoints: canvas.entryPoints.filter(
        (ep) => ep.adapterId !== adapter.id,
      ),
    }));
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted">
          Adapter Name
        </label>
        <div className="text-xs text-text-primary font-medium mt-0.5">
          {adapter.name}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted">
          Implements
        </label>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {adapter.implements.map((s) => (
            <span
              key={s}
              className="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-text-secondary"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-muted">
          Constructor Params
        </label>
        {adapter.constructorParams.length === 0 ? (
          <p className="text-[10px] text-text-muted mt-0.5">{tt("common.none")}</p>
        ) : (
          <div className="flex flex-col gap-1 mt-0.5">
            {adapter.constructorParams.map((p) => (
              <div key={p.name} className="text-[10px] text-text-secondary">
                <span className="text-text-primary">{p.name}</span>:{" "}
                {p.paramType.kind === "socketDep"
                  ? `Socket(${p.paramType.socketId})`
                  : p.paramType.typeName}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-2">
        <button
          onClick={handleToggleEntryPoint}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            isEntryPoint
              ? "bg-accent/20 text-accent"
              : "bg-bg-hover text-text-secondary hover:text-text-primary"
          }`}
        >
          <Star size={12} />
          {isEntryPoint ? "Entry Point" : "Set Entry"}
        </button>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-bg-hover text-text-muted hover:text-error transition-colors"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </div>
  );
}
