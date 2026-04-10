import { AlertTriangle, CheckSquare, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  useHeadquartersStore,
  type Alert,
  type AlertSeverity,
  type AlertDisplayMode,
} from "../../stores/headquarters-store";
import { useNavigationStore, type ViewId } from "../../stores/navigation-store";

const severityConfig: Record<
  AlertSeverity,
  { color: string; label: string; order: number }
> = {
  critical: { color: "text-error", label: "Critical", order: 0 },
  error: { color: "text-error", label: "Error", order: 1 },
  warning: { color: "text-warning", label: "Warning", order: 2 },
  info: { color: "text-info", label: "Info", order: 3 },
};

export function AlertsTodos() {
  const alerts = useHeadquartersStore((s) => s.alerts);
  const todos = useHeadquartersStore((s) => s.todos);
  const alertDisplayMode = useHeadquartersStore((s) => s.alertDisplayMode);
  const setAlertDisplayMode = useHeadquartersStore((s) => s.setAlertDisplayMode);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-bg-secondary rounded-lg border border-border flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Alerts
          </h2>
          <div className="flex items-center gap-2">
            <AlertModeSelector
              mode={alertDisplayMode}
              onChange={setAlertDisplayMode}
            />
            <span className="text-xs text-text-muted">{alerts.length}</span>
          </div>
        </div>
        <AlertsBody alerts={alerts} mode={alertDisplayMode} />
      </div>

      <div className="bg-bg-secondary rounded-lg border border-border flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Todo
          </h2>
          <span className="text-xs text-text-muted">{todos.length}</span>
        </div>
        <TodosBody todos={todos} />
      </div>
    </div>
  );
}

function AlertsBody({
  alerts,
  mode,
}: {
  alerts: Alert[];
  mode: AlertDisplayMode;
}) {
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  if (alerts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle size={24} className="text-text-muted mx-auto mb-2" />
          <p className="text-xs text-text-muted">No alerts</p>
        </div>
      </div>
    );
  }

  if (mode === "badge") {
    return (
      <div className="p-3 flex items-center gap-2 text-xs text-text-secondary">
        <AlertTriangle size={14} className="text-warning" />
        {alerts.length} active {alerts.length === 1 ? "alert" : "alerts"}
      </div>
    );
  }

  if (mode === "collapsed") {
    return <AlertsCollapsed alerts={alerts} />;
  }

  // expanded
  return (
    <div className="flex-1 overflow-auto p-2 flex flex-col gap-1">
      {alerts.map((a) => (
        <AlertItem
          key={a.id}
          alert={a}
          onAction={() =>
            a.actionTarget && setActiveView(a.actionTarget as ViewId)
          }
        />
      ))}
    </div>
  );
}

function AlertItem({
  alert,
  onAction,
}: {
  alert: Alert;
  onAction: () => void;
}) {
  const cfg = severityConfig[alert.severity];
  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-bg-hover">
      <div className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${cfg.color.replace("text-", "bg-")}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary truncate">{alert.title}</p>
        {alert.detail && (
          <p className="text-[10px] text-text-muted truncate">{alert.detail}</p>
        )}
      </div>
      {alert.actionLabel && (
        <button
          onClick={onAction}
          className="text-[10px] text-accent hover:text-accent-hover shrink-0"
        >
          {alert.actionLabel}
        </button>
      )}
    </div>
  );
}

function AlertsCollapsed({ alerts }: { alerts: Alert[] }) {
  const grouped = alerts.reduce<Record<AlertSeverity, Alert[]>>(
    (acc, a) => {
      if (!acc[a.severity]) acc[a.severity] = [];
      acc[a.severity].push(a);
      return acc;
    },
    { critical: [], error: [], warning: [], info: [] },
  );

  const [expanded, setExpanded] = useState<Set<AlertSeverity>>(
    new Set(["critical", "error"] as AlertSeverity[]),
  );

  const toggle = (sev: AlertSeverity) => {
    const next = new Set(expanded);
    if (next.has(sev)) next.delete(sev);
    else next.add(sev);
    setExpanded(next);
  };

  return (
    <div className="flex-1 overflow-auto">
      {(Object.entries(grouped) as [AlertSeverity, Alert[]][])
        .filter(([, items]) => items.length > 0)
        .sort(
          ([a], [b]) => severityConfig[a].order - severityConfig[b].order,
        )
        .map(([sev, items]) => {
          const open = expanded.has(sev);
          return (
            <div key={sev} className="border-b border-border last:border-b-0">
              <button
                onClick={() => toggle(sev)}
                className="w-full flex items-center gap-1 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className={severityConfig[sev].color}>
                  {severityConfig[sev].label}
                </span>
                <span className="text-text-muted">({items.length})</span>
              </button>
              {open && (
                <div className="pl-2 pb-1">
                  {items.map((a) => (
                    <AlertItem key={a.id} alert={a} onAction={() => {}} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function AlertModeSelector({
  mode,
  onChange,
}: {
  mode: AlertDisplayMode;
  onChange: (m: AlertDisplayMode) => void;
}) {
  return (
    <select
      value={mode}
      onChange={(e) => onChange(e.target.value as AlertDisplayMode)}
      className="text-[10px] bg-bg-primary border border-border rounded px-1 py-0.5 text-text-muted hover:text-text-secondary focus:outline-none"
    >
      <option value="expanded">Expanded</option>
      <option value="collapsed">Collapsed</option>
      <option value="badge">Badge</option>
    </select>
  );
}

function TodosBody({ todos }: { todos: { id: string; text: string; blueprintName: string }[] }) {
  if (todos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <CheckSquare size={24} className="text-text-muted mx-auto mb-2" />
          <p className="text-xs text-text-muted">No pending criteria</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-2 flex flex-col gap-1">
      {todos.map((t) => (
        <div
          key={t.id}
          className="px-2 py-1.5 rounded hover:bg-bg-hover"
        >
          <p className="text-[10px] text-text-muted">{t.blueprintName}</p>
          <p className="text-xs text-text-primary">{t.text}</p>
        </div>
      ))}
    </div>
  );
}
