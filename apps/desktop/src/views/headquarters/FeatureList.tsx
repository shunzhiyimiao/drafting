import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { useNavigationStore } from "../../stores/navigation-store";
import {
  useHeadquartersStore,
  type FeatureSort,
  type FeatureFilter,
} from "../../stores/headquarters-store";
import type { BlueprintIndexEntry } from "../../types/blueprint-types";

const priorityWeight: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function FeatureList() {
  const index = useBlueprintStore((s) => s.index);
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint);
  const setActiveView = useNavigationStore((s) => s.setActiveView);
  const featureSort = useHeadquartersStore((s) => s.featureSort);
  const featureFilter = useHeadquartersStore((s) => s.featureFilter);
  const setFeatureSort = useHeadquartersStore((s) => s.setFeatureSort);
  const setFeatureFilter = useHeadquartersStore((s) => s.setFeatureFilter);

  const [menuOpen, setMenuOpen] = useState(false);

  const features = useMemo(() => {
    const all = (index?.blueprints ?? []).filter((b) => b.type === "feature");
    const filtered = applyFilter(all, featureFilter);
    return applySort(filtered, featureSort);
  }, [index, featureFilter, featureSort]);

  const handleOpen = async (e: BlueprintIndexEntry) => {
    await loadBlueprint(e.blueprintId);
    setActiveView("blueprint");
  };

  return (
    <div className="glass-panel h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Features
        </h2>
        <div className="flex items-center gap-2">
          <FilterMenu
            filter={featureFilter}
            onChange={setFeatureFilter}
            open={menuOpen}
            setOpen={setMenuOpen}
          />
          <SortMenu sort={featureSort} onChange={setFeatureSort} />
          <span className="text-xs text-text-muted">
            {features.length} {features.length === 1 ? "feature" : "features"}
          </span>
        </div>
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
                className="text-left p-3 bg-white/3 border border-white/8 rounded-lg hover:bg-white/6 hover:border-accent/40 transition-all backdrop-blur-md"
                style={{ backdropFilter: "blur(12px)" }}
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
                {f.criteriaTotal > 0 ? (
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
                ) : (
                  <span className="text-[10px] text-warning">No criteria</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function applyFilter(
  features: BlueprintIndexEntry[],
  filter: FeatureFilter,
): BlueprintIndexEntry[] {
  switch (filter) {
    case "in-progress":
      return features.filter((f) => f.status === "in-progress");
    case "empty":
      return features.filter((f) => f.criteriaTotal === 0);
    case "completed":
      return features.filter((f) => f.status === "completed");
    case "stalled":
      return features.filter((f) => {
        const days = (Date.now() - f.updatedAt) / (1000 * 60 * 60 * 24);
        return f.status === "in-progress" && days > 7;
      });
    case "with-alerts":
      return features.filter((f) => f.criteriaTotal === 0);
    default:
      return features;
  }
}

function applySort(
  features: BlueprintIndexEntry[],
  sort: FeatureSort,
): BlueprintIndexEntry[] {
  const copy = [...features];
  switch (sort) {
    case "priority":
      copy.sort(
        (a, b) =>
          (priorityWeight[b.priority] ?? 0) -
          (priorityWeight[a.priority] ?? 0),
      );
      break;
    case "progress":
      copy.sort((a, b) => {
        const pa =
          a.criteriaTotal > 0 ? a.criteriaDone / a.criteriaTotal : 0;
        const pb =
          b.criteriaTotal > 0 ? b.criteriaDone / b.criteriaTotal : 0;
        return pb - pa;
      });
      break;
    case "updated":
      copy.sort((a, b) => b.updatedAt - a.updatedAt);
      break;
    case "name":
      copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
      break;
  }
  return copy;
}

function SortMenu({
  sort,
  onChange,
}: {
  sort: FeatureSort;
  onChange: (s: FeatureSort) => void;
}) {
  return (
    <select
      value={sort}
      onChange={(e) => onChange(e.target.value as FeatureSort)}
      className="text-[10px] bg-bg-primary border border-border rounded px-1 py-0.5 text-text-muted hover:text-text-secondary focus:outline-none"
    >
      <option value="priority">Priority</option>
      <option value="progress">Progress</option>
      <option value="updated">Updated</option>
      <option value="name">Name</option>
    </select>
  );
}

function FilterMenu({
  filter,
  onChange,
}: {
  filter: FeatureFilter;
  onChange: (f: FeatureFilter) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
}) {
  return (
    <select
      value={filter}
      onChange={(e) => onChange(e.target.value as FeatureFilter)}
      className="text-[10px] bg-bg-primary border border-border rounded px-1 py-0.5 text-text-muted hover:text-text-secondary focus:outline-none"
    >
      <option value="all">All</option>
      <option value="in-progress">In Progress</option>
      <option value="with-alerts">With Alerts</option>
      <option value="stalled">Stalled</option>
      <option value="empty">Empty</option>
      <option value="completed">Completed</option>
    </select>
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
