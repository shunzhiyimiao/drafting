import { CircuitBoard } from "lucide-react";

export function PatchboardView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <CircuitBoard size={48} className="text-text-muted mb-4" />
      <h2 className="text-lg font-medium text-text-primary mb-2">Patchboard</h2>
      <p className="text-sm text-text-muted max-w-md">
        Visual architecture editor. Define Sockets, wire Adapters, and generate
        type-safe static assembly code.
      </p>
      <span className="mt-4 px-3 py-1 text-xs rounded-full bg-bg-hover text-text-muted">
        Coming in Phase 1
      </span>
    </div>
  );
}
