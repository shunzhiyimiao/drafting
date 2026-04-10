import { Activity, Cpu, Zap } from "lucide-react";
import { useNavigationStore } from "../../stores/navigation-store";

export function AuxiliaryInfo() {
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Recent Activity */}
      <div className="glass-panel p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={14} className="text-text-muted" />
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Recent Activity
          </h3>
        </div>
        <p className="text-xs text-text-muted">No recent activity.</p>
      </div>

      {/* AI Config */}
      <div className="glass-panel p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <Cpu size={14} className="text-text-muted" />
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            AI Config
          </h3>
        </div>
        <p className="text-xs text-text-muted">No AI provider configured.</p>
      </div>

      {/* Quick Actions */}
      <div className="glass-panel p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={14} className="text-text-muted" />
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Quick Actions
          </h3>
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setActiveView("blueprint")}
            className="text-xs text-accent hover:text-accent-hover text-left"
          >
            New Blueprint
          </button>
          <button
            onClick={() => setActiveView("patchboard")}
            className="text-xs text-accent hover:text-accent-hover text-left"
          >
            Open Patchboard
          </button>
          <button
            onClick={() => setActiveView("settings")}
            className="text-xs text-accent hover:text-accent-hover text-left"
          >
            Configure AI
          </button>
        </div>
      </div>
    </div>
  );
}
