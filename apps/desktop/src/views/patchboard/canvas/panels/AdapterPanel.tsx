import { useState } from "react";
import { Trash2, Star, Plus, X } from "lucide-react";
import { usePatchboardStore } from "../../../../stores/patchboard-store";
import { useT } from "../../../../lib/i18n";
import { Dropdown, type DropdownOption } from "../../../../components/Dropdown";

export function AdapterPanel() {
  const tt = useT();
  const activeCanvas = usePatchboardStore((s) => s.activeCanvas);
  const selectedNodeId = usePatchboardStore((s) => s.selectedNodeId);
  const updateActiveCanvas = usePatchboardStore((s) => s.updateActiveCanvas);
  const registry = usePatchboardStore((s) => s.registry);
  const [addingDep, setAddingDep] = useState(false);
  const [newDepName, setNewDepName] = useState("");
  const [newDepSocket, setNewDepSocket] = useState("");

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

  const addSocketDep = () => {
    if (!newDepName.trim() || !newDepSocket) return;
    updateActiveCanvas((canvas) => ({
      ...canvas,
      adapters: canvas.adapters.map((a) =>
        a.id === adapter.id
          ? {
              ...a,
              constructorParams: [
                ...a.constructorParams,
                {
                  name: newDepName.trim(),
                  paramType: { kind: "socketDep", socketId: newDepSocket },
                },
              ],
            }
          : a,
      ),
    }));
    setNewDepName("");
    setNewDepSocket("");
    setAddingDep(false);
  };

  const removeParam = (paramName: string) => {
    updateActiveCanvas((canvas) => ({
      ...canvas,
      adapters: canvas.adapters.map((a) =>
        a.id === adapter.id
          ? {
              ...a,
              constructorParams: a.constructorParams.filter(
                (p) => p.name !== paramName,
              ),
            }
          : a,
      ),
      // Also drop any wires that targeted this param
      wires: canvas.wires.filter(
        (w) => !(w.toAdapterId === adapter.id && w.toParamName === paramName),
      ),
    }));
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
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-wider text-text-muted">
            Constructor Params
          </label>
          {!addingDep && (
            <button
              onClick={() => setAddingDep(true)}
              className="text-text-muted hover:text-accent text-[10px] inline-flex items-center gap-0.5"
              title="Add Socket dependency"
            >
              <Plus size={10} /> Dep
            </button>
          )}
        </div>
        {adapter.constructorParams.length === 0 && !addingDep ? (
          <p className="text-[10px] text-text-muted mt-0.5">{tt("common.none")}</p>
        ) : (
          <div className="flex flex-col gap-1 mt-0.5">
            {adapter.constructorParams.map((p) => {
              const isSocketDep = p.paramType.kind === "socketDep";
              const socketEntry = isSocketDep
                ? registry?.sockets.find(
                    (s) => s.id === (p.paramType as { socketId: string }).socketId,
                  )
                : null;
              return (
                <div
                  key={p.name}
                  className="text-[10px] text-text-secondary flex items-center gap-1.5"
                >
                  <span className="text-text-primary">{p.name}</span>
                  <span className="text-text-muted">:</span>
                  <span className="flex-1 truncate">
                    {isSocketDep
                      ? socketEntry?.displayName ??
                        `Socket(${(p.paramType as { socketId: string }).socketId})`
                      : (p.paramType as { typeName: string }).typeName}
                  </span>
                  <button
                    onClick={() => removeParam(p.name)}
                    className="text-text-muted hover:text-error shrink-0"
                    title="Remove"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {addingDep && (
          <div className="mt-1 flex flex-col gap-1 p-1.5 bg-bg-primary rounded border border-border">
            <input
              value={newDepName}
              onChange={(e) => setNewDepName(e.target.value)}
              placeholder="param name (e.g. emailSender)"
              className="text-[10px] px-1.5 py-0.5 rounded"
              autoFocus
            />
            <Dropdown
              value={newDepSocket}
              onChange={setNewDepSocket}
              placeholder="pick Socket"
              options={
                (registry?.sockets ?? []).map<DropdownOption>((s) => ({
                  value: s.id,
                  label: s.displayName,
                  hint: s.fullName,
                }))
              }
              className="text-[10px] px-1.5 py-0.5"
            />
            <div className="flex justify-end gap-1">
              <button
                onClick={() => {
                  setAddingDep(false);
                  setNewDepName("");
                  setNewDepSocket("");
                }}
                className="glass-button px-2 py-0.5 text-[10px] rounded"
              >
                Cancel
              </button>
              <button
                onClick={addSocketDep}
                disabled={!newDepName.trim() || !newDepSocket}
                className="glass-button-primary px-2 py-0.5 text-[10px] rounded disabled:opacity-50"
              >
                Add
              </button>
            </div>
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
