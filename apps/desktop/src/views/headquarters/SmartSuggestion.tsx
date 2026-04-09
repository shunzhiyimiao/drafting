import { Lightbulb } from "lucide-react";

export function SmartSuggestion() {
  return (
    <div className="flex items-center gap-3 bg-bg-secondary rounded-lg px-4 py-3 border border-border">
      <Lightbulb size={16} className="text-warning shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-text-primary">
          Welcome to Drafting. Create your first Blueprint to get started.
        </p>
      </div>
      <button className="px-3 py-1 text-xs rounded-md bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors">
        New Blueprint
      </button>
    </div>
  );
}
