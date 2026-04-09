import { AlertTriangle, CheckSquare } from "lucide-react";

export function AlertsTodos() {
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Alerts */}
      <div className="bg-bg-secondary rounded-lg border border-border flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Alerts
          </h2>
          <span className="text-xs text-text-muted">0</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertTriangle size={24} className="text-text-muted mx-auto mb-2" />
            <p className="text-xs text-text-muted">No alerts</p>
          </div>
        </div>
      </div>

      {/* Todos */}
      <div className="bg-bg-secondary rounded-lg border border-border flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Todo
          </h2>
          <span className="text-xs text-text-muted">0</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <CheckSquare size={24} className="text-text-muted mx-auto mb-2" />
            <p className="text-xs text-text-muted">No pending criteria</p>
          </div>
        </div>
      </div>
    </div>
  );
}
