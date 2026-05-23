import { FileText, File, Plus, Sparkles } from "lucide-react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import type { BlueprintIndexEntry } from "../../types/blueprint-types";
import { useT } from "../../lib/i18n";

interface Props {
  onNewBlueprint: () => void;
  onAiDraft: () => void;
}

export function BlueprintListPanel({ onNewBlueprint, onAiDraft }: Props) {
  const t = useT();
  const index = useBlueprintStore((s) => s.index);
  const activeId = useBlueprintStore((s) => s.activeBlueprintId);
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint);

  const features = (index?.blueprints ?? []).filter(
    (b) => b.type === "feature",
  );
  const files = (index?.blueprints ?? []).filter((b) => b.type === "file");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Blueprints
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onAiDraft}
            className="text-accent hover:text-accent/80"
            title={t("blueprint.ai.draftTitle")}
          >
            <Sparkles size={14} />
          </button>
          <button
            onClick={onNewBlueprint}
            className="text-text-muted hover:text-text-secondary"
            title={t("blueprint.newBlueprint")}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {(index?.blueprints ?? []).length === 0 ? (
          <p className="p-3 text-xs text-text-muted">
            No blueprints yet. Create one from a template.
          </p>
        ) : (
          <>
            {features.length > 0 && (
              <Section
                icon={<FileText size={12} />}
                title={t("blueprint.features")}
                entries={features}
                activeId={activeId}
                onSelect={loadBlueprint}
              />
            )}
            {files.length > 0 && (
              <Section
                icon={<File size={12} />}
                title={t("blueprint.files")}
                entries={files}
                activeId={activeId}
                onSelect={loadBlueprint}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  entries,
  activeId,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  entries: BlueprintIndexEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 px-3 py-1 text-[10px] uppercase tracking-wider text-text-muted bg-bg-primary">
        {icon}
        {title}
      </div>
      {entries.map((e) => {
        const progress =
          e.criteriaTotal > 0
            ? Math.round((e.criteriaDone / e.criteriaTotal) * 100)
            : 0;
        return (
          <button
            key={e.blueprintId}
            onClick={() => onSelect(e.blueprintId)}
            className={`w-full text-left px-3 py-2 text-xs border-b border-border transition-colors ${
              activeId === e.blueprintId
                ? "bg-bg-active text-text-primary"
                : "text-text-secondary hover:bg-bg-hover"
            }`}
          >
            <div className="font-medium truncate">{e.displayName}</div>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={e.status} />
              {e.criteriaTotal > 0 && (
                <>
                  <div className="flex-1 h-1 bg-bg-primary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-text-muted">
                    {e.criteriaDone}/{e.criteriaTotal}
                  </span>
                </>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-accent/20 text-accent",
    "in-progress": "bg-warning/20 text-warning",
    completed: "bg-success/20 text-success",
    deprecated: "bg-error/20 text-error",
  };
  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${colors[status] ?? "bg-bg-hover text-text-muted"}`}
    >
      {status}
    </span>
  );
}
