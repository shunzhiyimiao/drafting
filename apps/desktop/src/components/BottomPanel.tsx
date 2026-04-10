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
      className={`glass-thin border-t border-white/5 flex flex-col ${
        bottomPanelCollapsed ? "" : "h-48"
      }`}
    >
      <div className="flex items-center justify-between px-3 h-8 shrink-0">
        <div className="flex items-center gap-1">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                if (bottomPanelCollapsed) {
                  toggleBottomPanel();
                }
                setBottomPanelTab(id);
              }}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                bottomPanelActiveTab === id && !bottomPanelCollapsed
                  ? "text-text-primary bg-white/8 border border-white/10"
                  : "text-text-muted hover:text-text-secondary hover:bg-white/5"
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
