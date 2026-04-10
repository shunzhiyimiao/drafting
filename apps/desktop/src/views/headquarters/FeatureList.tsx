import { FileText } from "lucide-react";
import { useEffect } from "react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { useNavigationStore } from "../../stores/navigation-store";
import type { BlueprintIndexEntry } from "../../types/blueprint-types";

export function FeatureList() {
  const initialized = useBlueprintStore((s) => s.initialized);
  const initialize = useBlueprintStore((s) => s.initialize);
  const index = useBlueprintStore((s) => s.index);
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint);
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  useEffect(() => {
    if (!initialized) {
      initialize(".");
    }
  }, [initialized, initialize]);

  const features = (index?.blueprints ?? []).filter((b) => b.type === "feature");

  const handleOpen = async (e: BlueprintIndexEntry) => {
    await loadBlueprint(e.blueprintId);
    setActiveView("blueprint");
  };

  return (
    <div className="bg-bg-secondary rounded-lg border border-border h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Features
        </h2>
        <span className="text-xs text-text-muted">
          {features.length} {features.length === 1 ? "feature" : "features"}
        </span>
      </div>
      {features.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <FileText size={32} className="text-text-muted mb-3" />
          <p className="text-sm text-text-secondary mb-1">No features yet</p>
          <p className="text-xs text-text-muted">
            Create a Blueprint to define your first feature.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-2 flex flex-col gap-2">
          {features.map((f) => {
            const progress =
              f.criteriaTotal > 0
                ? Math.round((f.criteriaDone / f.criteriaTotal) * 100)
                : 0;
            return (
              <button
                key={f.blueprintId}
                onClick={() => handleOpen(f)}
                className="text-left p-3 bg-bg-primary border border-border rounded hover:border-accent transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-text-primary">
                    {f.displayName}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={f.status} />
                    <PriorityBadge priority={f.priority} />
                  </div>
                </div>
                {f.criteriaTotal > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-bg-hover rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-text-muted">
                      {f.criteriaDone}/{f.criteriaTotal}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
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

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: "text-text-muted",
    medium: "text-text-secondary",
    high: "text-warning",
    critical: "text-error",
  };
  return (
    <span className={`text-[9px] font-medium ${colors[priority] ?? ""}`}>
      {priority}
    </span>
  );
}
