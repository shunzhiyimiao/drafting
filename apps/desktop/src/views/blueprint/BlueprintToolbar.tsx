import { Eye, Code, CheckCircle, Trash2 } from "lucide-react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { useT } from "../../lib/i18n";

interface Props {
  onCheck: () => void;
  onDelete: () => void;
}

export function BlueprintToolbar({ onCheck, onDelete }: Props) {
  const t = useT();
  const activeBlueprint = useBlueprintStore((s) => s.activeBlueprint);
  const viewMode = useBlueprintStore((s) => s.viewMode);
  const setViewMode = useBlueprintStore((s) => s.setViewMode);

  if (!activeBlueprint) return null;

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-secondary">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-text-primary">
          {activeBlueprint.frontMatter.displayName}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-text-muted">
          {activeBlueprint.frontMatter.type}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {/* View mode toggle */}
        <div className="flex border border-border rounded overflow-hidden mr-2">
          <button
            onClick={() => setViewMode("structured")}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] transition-colors ${
              viewMode === "structured"
                ? "bg-bg-active text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Eye size={12} />
            Structured
          </button>
          <button
            onClick={() => setViewMode("raw")}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] transition-colors ${
              viewMode === "raw"
                ? "bg-bg-active text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Code size={12} />
            Raw
          </button>
        </div>
        <button
          onClick={onCheck}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
          title={t("blueprint.check")}
        >
          <CheckCircle size={14} />
          {t("blueprint.check")}
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-error hover:bg-bg-hover rounded transition-colors"
          title={t("blueprint.delete")}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
