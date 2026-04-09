import { FileText } from "lucide-react";

export function FeatureList() {
  return (
    <div className="bg-bg-secondary rounded-lg border border-border h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Features
        </h2>
        <span className="text-xs text-text-muted">0 features</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <FileText size={32} className="text-text-muted mb-3" />
        <p className="text-sm text-text-secondary mb-1">No features yet</p>
        <p className="text-xs text-text-muted">
          Create a Blueprint to define your first feature.
        </p>
      </div>
    </div>
  );
}
