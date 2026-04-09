import { GitBranch } from "lucide-react";

export function ProjectIdentityBar() {
  return (
    <div className="flex items-center justify-between bg-bg-secondary rounded-lg px-4 py-3 border border-border">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-text-primary">Drafting</h1>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-hover text-success text-xs">
            Healthy
          </span>
          <span>0 features</span>
          <span>0 criteria</span>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <GitBranch size={12} />
          main
        </span>
        <span>No AI checks yet</span>
      </div>
    </div>
  );
}
