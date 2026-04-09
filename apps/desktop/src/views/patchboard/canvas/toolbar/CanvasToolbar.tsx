import { Plus, CheckCircle, Play, Trash2 } from "lucide-react";

interface CanvasToolbarProps {
  onAddAdapter: () => void;
  onValidate: () => void;
  onGenerate: () => void;
  onDeleteCanvas: () => void;
  canvasName: string;
}

export function CanvasToolbar({
  onAddAdapter,
  onValidate,
  onGenerate,
  onDeleteCanvas,
  canvasName,
}: CanvasToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-secondary">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-text-primary">
          {canvasName}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onAddAdapter}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
          title="Add Adapter"
        >
          <Plus size={14} />
          Adapter
        </button>
        <button
          onClick={onValidate}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
          title="Validate Canvas"
        >
          <CheckCircle size={14} />
          Validate
        </button>
        <button
          onClick={onGenerate}
          className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:text-accent-hover hover:bg-bg-hover rounded transition-colors"
          title="Generate Code"
        >
          <Play size={14} />
          Generate
        </button>
        <button
          onClick={onDeleteCanvas}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-error hover:bg-bg-hover rounded transition-colors"
          title="Delete Canvas"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
