import { useEffect } from "react";
import { Activity, Cpu, Zap } from "lucide-react";
import { useNavigationStore, type ViewId } from "../../stores/navigation-store";
import { useHeadquartersStore } from "../../stores/headquarters-store";

const QUICK_ACTIONS: { label: string; view: ViewId }[] = [
  { label: "New Blueprint", view: "blueprint" },
  { label: "Open Patchboard", view: "patchboard" },
  { label: "Open Editor", view: "editor" },
  { label: "Open Git", view: "git" },
  { label: "Open Terminal", view: "terminal" },
  { label: "Configure AI", view: "settings" },
];

export function AuxiliaryInfo() {
  const setActiveView = useNavigationStore((s) => s.setActiveView);
  const activity = useHeadquartersStore((s) => s.activity);
  const loadAiSummary = useHeadquartersStore((s) => s.loadAiSummary);

  useEffect(() => {
    void loadAiSummary();
  }, [loadAiSummary]);

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Recent Activity — session-scoped, fed by Sync Bus events */}
      <div className="glass-panel p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={14} className="text-text-muted" />
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Recent Activity
          </h3>
        </div>
        {activity.length === 0 ? (
          <p className="text-xs text-text-muted">
            No activity yet this session.
          </p>
        ) : (
          <div className="flex flex-col gap-1 max-h-28 overflow-auto">
            {activity.map((a) => (
              <div key={a.id} className="flex items-baseline gap-2 text-xs">
                <span className="text-[10px] text-text-muted shrink-0 tabular-nums">
                  {formatTime(a.timestamp)}
                </span>
                <span className="text-text-secondary truncate" title={a.text}>
                  {a.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Config */}
      <div className="glass-panel p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <Cpu size={14} className="text-text-muted" />
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            AI Config
          </h3>
        </div>
        <AiConfigSummary onConfigure={() => setActiveView("settings")} />
      </div>

      {/* Quick Actions */}
      <div className="glass-panel p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={14} className="text-text-muted" />
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Quick Actions
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.view + a.label}
              onClick={() => setActiveView(a.view)}
              className="text-xs text-accent hover:text-accent-hover text-left"
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AiConfigSummary({ onConfigure }: { onConfigure: () => void }) {
  const aiSummary = useHeadquartersStore((s) => s.aiSummary);

  if (!aiSummary || aiSummary.profileCount === 0) {
    return (
      <div className="text-xs text-text-muted">
        No AI provider configured.{" "}
        <button
          onClick={onConfigure}
          className="text-accent hover:text-accent-hover"
        >
          Configure
        </button>
      </div>
    );
  }

  if (!aiSummary.enabled) {
    return (
      <div className="text-xs text-text-muted">
        AI is globally disabled.{" "}
        <button
          onClick={onConfigure}
          className="text-accent hover:text-accent-hover"
        >
          Enable
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-text-secondary">
        {aiSummary.profileCount}{" "}
        {aiSummary.profileCount === 1 ? "provider" : "providers"} configured
      </p>
      <div className="flex flex-col gap-0.5 max-h-20 overflow-auto">
        {aiSummary.routes.slice(0, 4).map((r) => (
          <div
            key={r.taskId}
            className="flex items-baseline gap-1 text-[10px] text-text-muted"
          >
            <span className="truncate">{r.taskId}</span>
            <span className="shrink-0">→</span>
            <span className="truncate text-text-secondary" title={r.model}>
              {r.model || "default"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
