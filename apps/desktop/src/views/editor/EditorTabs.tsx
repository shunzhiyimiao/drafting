import { X } from "lucide-react";
import { useEditorStore } from "../../stores/editor-store";

export function EditorTabs() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center bg-bg-secondary border-b border-border overflow-x-auto shrink-0">
      {tabs.map((tab) => {
        const isActive = tab.path === activeTabPath;
        const fileName = tab.path.split("/").pop() ?? tab.path;
        return (
          <div
            key={tab.path}
            className={`group flex items-center gap-2 px-3 py-1.5 border-r border-border cursor-pointer shrink-0 ${
              isActive
                ? "bg-bg-primary text-text-primary"
                : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
            }`}
            onClick={() => setActiveTab(tab.path)}
          >
            {tab.identity.readonly && (
              <span className="text-[9px] text-warning">🔒</span>
            )}
            {tab.identity.adapterId && (
              <span className="text-[9px] text-accent">🔌</span>
            )}
            {tab.identity.fileBlueprintId && (
              <span className="text-[9px] text-success">📋</span>
            )}
            {tab.identity.isGenerated && !tab.identity.readonly && (
              <span className="text-[9px] text-warning">⚙</span>
            )}
            <span className="text-xs">{fileName}</span>
            {tab.dirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.path);
              }}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-opacity"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
