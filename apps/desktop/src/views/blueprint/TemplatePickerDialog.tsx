import { useState } from "react";
import { X, FileText, File } from "lucide-react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import type { TemplateInfo } from "../../types/blueprint-types";

interface Props {
  onClose: () => void;
}

export function TemplatePickerDialog({ onClose }: Props) {
  const templates = useBlueprintStore((s) => s.templates);
  const createFromTemplate = useBlueprintStore((s) => s.createFromTemplate);

  const [selected, setSelected] = useState<TemplateInfo | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!selected || !displayName) return;
    setLoading(true);
    try {
      await createFromTemplate(selected.name, { displayName });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl w-[640px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium text-text-primary">
            {selected ? `Configure: ${selected.displayName}` : "Choose a Template"}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!selected ? (
            <div className="grid grid-cols-2 gap-2">
              {templates.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setSelected(t)}
                  className="flex flex-col gap-1 text-left p-3 bg-bg-primary border border-border rounded hover:border-accent transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {t.type === "feature" ? (
                      <FileText size={12} className="text-accent" />
                    ) : (
                      <File size={12} className="text-success" />
                    )}
                    <span className="text-xs font-medium text-text-primary">
                      {t.displayName}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted">
                    {t.description}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-text-muted">
                  Display Name
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. User Authentication"
                  autoFocus
                  className="w-full mt-1 px-2 py-1.5 text-xs bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-text-muted">
                Additional fields can be filled in after creation.
              </p>
            </div>
          )}
        </div>

        {selected && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-text-muted hover:text-text-secondary"
            >
              ← Back to templates
            </button>
            <button
              onClick={handleCreate}
              disabled={!displayName || loading}
              className="px-4 py-1.5 text-xs bg-accent text-bg-primary font-medium rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating..." : "Create Blueprint"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
