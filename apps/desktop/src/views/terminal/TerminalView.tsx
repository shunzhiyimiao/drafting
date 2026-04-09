import { Terminal } from "lucide-react";

export function TerminalView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <Terminal size={48} className="text-text-muted mb-4" />
      <h2 className="text-lg font-medium text-text-primary mb-2">Terminal</h2>
      <p className="text-sm text-text-muted max-w-md">
        Integrated terminal with multi-tab support, command history,
        and Claude Code / Codex quick launch.
      </p>
      <span className="mt-4 px-3 py-1 text-xs rounded-full bg-bg-hover text-text-muted">
        Coming in Phase 4
      </span>
    </div>
  );
}
