import { Settings } from "lucide-react";

export function SettingsView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <Settings size={48} className="text-text-muted mb-4" />
      <h2 className="text-lg font-medium text-text-primary mb-2">Settings</h2>
      <p className="text-sm text-text-muted max-w-md">
        AI provider configuration, editor preferences, theme, and font settings.
      </p>
      <span className="mt-4 px-3 py-1 text-xs rounded-full bg-bg-hover text-text-muted">
        Coming in Phase 3
      </span>
    </div>
  );
}
