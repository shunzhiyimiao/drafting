import { FolderTree, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useLayoutStore } from "../stores/layout-store";

export function RightPanel() {
  const { rightPanelCollapsed, toggleRightPanel } = useLayoutStore();

  if (rightPanelCollapsed) {
    return (
      <button
        onClick={toggleRightPanel}
        className="glass-thin w-8 flex items-start justify-center pt-2 shrink-0 text-text-muted hover:text-text-secondary border-l"
        title="Show Files"
      >
        <PanelRightOpen size={16} />
      </button>
    );
  }

  return (
    <div className="glass-thin w-56 flex flex-col shrink-0 border-l border-white/5">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 text-text-secondary text-xs font-medium uppercase tracking-wider">
          <FolderTree size={14} />
          Files
        </div>
        <button
          onClick={toggleRightPanel}
          className="text-text-muted hover:text-text-secondary"
          title="Hide Files"
        >
          <PanelRightClose size={14} />
        </button>
      </div>
      <div className="flex-1 p-3 text-text-muted text-xs">
        File tree will be rendered here.
      </div>
    </div>
  );
}
