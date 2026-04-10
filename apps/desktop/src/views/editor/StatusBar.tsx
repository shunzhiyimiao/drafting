import { GitBranch, FileText, Zap } from "lucide-react";
import { useEditorStore } from "../../stores/editor-store";

export function StatusBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const activeTab = tabs.find((t) => t.path === activeTabPath);

  if (!activeTab) {
    return (
      <div className="flex items-center justify-between px-3 h-6 bg-bg-sidebar border-t border-border text-[10px] text-text-muted shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <GitBranch size={10} />
            main
          </span>
        </div>
        <div>Ready</div>
      </div>
    );
  }

  const ext = activeTab.path.split(".").pop()?.toUpperCase() ?? "TXT";

  return (
    <div className="flex flex-col bg-bg-sidebar border-t border-border shrink-0">
      {/* Line 1: standard file info */}
      <div className="flex items-center justify-between px-3 h-6 text-[10px] text-text-muted">
        <div className="flex items-center gap-3">
          <span>{ext}</span>
          <span>UTF-8</span>
          <span>LF</span>
          <span className="flex items-center gap-1">
            <GitBranch size={10} />
            main
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>{activeTab.dirty ? "Unsaved" : "Saved"}</span>
          <span>{activeTab.content.length} chars</span>
        </div>
      </div>
      {/* Line 2: Drafting-specific identity */}
      {(activeTab.identity.fileBlueprintId ||
        activeTab.identity.adapterId ||
        activeTab.identity.isGenerated) && (
        <div className="flex items-center gap-3 px-3 h-5 text-[10px] border-t border-border">
          {activeTab.identity.fileBlueprintId && (
            <span className="flex items-center gap-1 text-success">
              <FileText size={9} />
              Blueprint
            </span>
          )}
          {activeTab.identity.adapterId && (
            <span className="flex items-center gap-1 text-accent">
              <Zap size={9} />
              Adapter {activeTab.identity.adapterId.slice(0, 8)}
            </span>
          )}
          {activeTab.identity.isGenerated && (
            <span className="text-warning">⚙ AUTO-GENERATED</span>
          )}
        </div>
      )}
    </div>
  );
}
