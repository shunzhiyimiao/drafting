import { useState } from "react";
import { X, FileText, File } from "lucide-react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import type { TemplateInfo } from "../../types/blueprint-types";
import { useT } from "../../lib/i18n";

interface Props {
  onClose: () => void;
}

/** "displayName" → "Display Name", "table_name" → "Table name". */
function humanizePlaceholder(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function TemplatePickerDialog({ onClose }: Props) {
  const t = useT();
  const templates = useBlueprintStore((s) => s.templates);
  const createFromTemplate = useBlueprintStore((s) => s.createFromTemplate);

  const [selected, setSelected] = useState<TemplateInfo | null>(null);
  // One value per placeholder the template declares (displayName always
  // among them). Humanized labels; displayName drives the fallback for any
  // left blank, so a template never ships raw {{…}}.
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const pickTemplate = (t: TemplateInfo) => {
    setSelected(t);
    setValues(Object.fromEntries(t.placeholders.map((p) => [p, ""])));
  };

  const displayName = values.displayName ?? "";

  const handleCreate = async () => {
    if (!selected || !displayName.trim()) return;
    setLoading(true);
    try {
      // Send only non-empty fields; the backend backstops the rest to
      // displayName so nothing is left unsubstituted.
      const filled = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v.trim() !== ""),
      );
      await createFromTemplate(selected.name, filled);
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
                  onClick={() => pickTemplate(t)}
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
              {Object.keys(values).map((name) => (
                <div key={name}>
                  <label className="text-[10px] uppercase tracking-wider text-text-muted">
                    {humanizePlaceholder(name)}
                  </label>
                  <input
                    value={values[name] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [name]: e.target.value }))
                    }
                    placeholder={
                      name === "displayName"
                        ? t("blueprint.featureNamePlaceholder")
                        : undefined
                    }
                    autoFocus={name === "displayName"}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                  />
                </div>
              ))}
              <p className="text-[10px] text-text-muted">
                Blank fields fall back to the display name.
              </p>
            </div>
          )}
        </div>

        {selected && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <button
              onClick={() => setSelected(null)}
              className="glass-button px-4 py-2 text-sm rounded-lg transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleCreate}
              disabled={!displayName || loading}
              className="glass-button-primary px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating..." : "Create Blueprint"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
