import { useState } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";
import { usePatchboardStore } from "../../../stores/patchboard-store";
import { SocketEditor } from "./SocketEditor";
import { LifecycleBadge } from "./LifecycleBadge";
import type { SocketLifecycle } from "../../../types/patchboard-types";

export function RegistryPanel() {
  const registry = usePatchboardStore((s) => s.registry);
  const deleteSocket = usePatchboardStore((s) => s.deleteSocket);
  const [editingSocketId, setEditingSocketId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (creating || editingSocketId) {
    return (
      <SocketEditor
        socketId={editingSocketId}
        onClose={() => {
          setEditingSocketId(null);
          setCreating(false);
        }}
      />
    );
  }

  // Group by namespace
  const sockets = registry?.sockets ?? [];
  const grouped: Record<string, typeof sockets> = {};
  for (const socket of registry?.sockets ?? []) {
    const parts = socket.fullName.split("/");
    const ns = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    if (!grouped[ns]) grouped[ns] = [];
    grouped[ns].push(socket);
  }

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete socket "${name}"?`)) {
      await deleteSocket(id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Sockets
        </span>
        <button
          onClick={() => setCreating(true)}
          className="text-text-muted hover:text-text-secondary"
          title="New Socket"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {(registry?.sockets ?? []).length === 0 ? (
          <p className="p-3 text-xs text-text-muted">
            No sockets defined. Create one to get started.
          </p>
        ) : (
          Object.entries(grouped).map(([ns, sockets]) => (
            <div key={ns}>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-text-muted bg-bg-primary">
                {ns}
              </div>
              {sockets.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-3 py-1.5 border-b border-border hover:bg-bg-hover group"
                >
                  <div>
                    <div className="text-xs text-text-primary">
                      {s.displayName}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <LifecycleBadge lifecycle={s.lifecycle as SocketLifecycle} />
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingSocketId(s.id)}
                      className="text-text-muted hover:text-text-secondary"
                      title="Edit"
                    >
                      <Edit size={12} />
                    </button>
                    {s.lifecycle === "draft" && (
                      <button
                        onClick={() => handleDelete(s.id, s.displayName)}
                        className="text-text-muted hover:text-error"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
