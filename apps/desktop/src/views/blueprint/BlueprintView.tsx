import { FileText } from "lucide-react";

export function BlueprintView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <FileText size={48} className="text-text-muted mb-4" />
      <h2 className="text-lg font-medium text-text-primary mb-2">Blueprint</h2>
      <p className="text-sm text-text-muted max-w-md">
        MD-driven specification system. Define features and file-level specs,
        then let AI generate and check code against them.
      </p>
      <span className="mt-4 px-3 py-1 text-xs rounded-full bg-bg-hover text-text-muted">
        Coming in Phase 2
      </span>
    </div>
  );
}
