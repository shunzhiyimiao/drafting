import { ChevronDown, ChevronUp } from "lucide-react";
import { useLayoutStore, type BottomPanelTab } from "../stores/layout-store";

const tabs: { id: BottomPanelTab; label: string }[] = [
  { id: "checklist", label: "Checklist" },
  { id: "terminal", label: "Terminal" },
  { id: "problems", label: "Problems" },
  { id: "tasks", label: "Tasks" },
];

export function BottomPanel() {
  const {
    bottomPanelCollapsed,
    bottomPanelActiveTab,
    toggleBottomPanel,
    setBottomPanelTab,
  } = useLayoutStore();

  return (
    <div
      className={`bg-bg-secondary border-t border-border flex flex-col ${
        bottomPanelCollapsed ? "" : "h-48"
      }`}
    >
      <div className="flex items-center justify-between px-3 h-8 shrink-0">
        <div className="flex items-center gap-0.5">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                if (bottomPanelCollapsed) {
                  toggleBottomPanel();
                }
                setBottomPanelTab(id);
              }}
              className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                bottomPanelActiveTab === id && !bottomPanelCollapsed
                  ? "text-text-primary bg-bg-hover"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleBottomPanel}
          className="text-text-muted hover:text-text-secondary"
          title={bottomPanelCollapsed ? "Expand" : "Collapse"}
        >
          {bottomPanelCollapsed ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </button>
      </div>
      {!bottomPanelCollapsed && (
        <div className="flex-1 overflow-auto px-3 py-2 text-text-muted text-xs">
          {bottomPanelActiveTab === "checklist" &&
            "Acceptance Criteria checklist will appear here."}
          {bottomPanelActiveTab === "terminal" &&
            "Terminal sessions will appear here."}
          {bottomPanelActiveTab === "problems" &&
            "Diagnostics and warnings will appear here."}
          {bottomPanelActiveTab === "tasks" &&
            "Background tasks will appear here."}
        </div>
      )}
    </div>
  );
}
