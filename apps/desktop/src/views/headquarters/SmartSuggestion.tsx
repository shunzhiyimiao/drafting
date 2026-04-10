import { Lightbulb, AlertTriangle, AlertCircle, Clock } from "lucide-react";
import { useHeadquartersStore } from "../../stores/headquarters-store";
import { useNavigationStore, type ViewId } from "../../stores/navigation-store";

export function SmartSuggestion() {
  const suggestion = useHeadquartersStore((s) => s.suggestion);
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  const Icon = getIcon(suggestion.level);
  const iconColor = getIconColor(suggestion.level);

  const handleAction = () => {
    setActiveView(suggestion.actionTarget as ViewId);
  };

  return (
    <div className="flex items-center gap-3 bg-bg-secondary rounded-lg px-4 py-3 border border-border">
      <Icon size={16} className={`${iconColor} shrink-0`} />
      <div className="flex-1">
        <p className="text-sm text-text-primary">{suggestion.message}</p>
        <p className="text-[10px] text-text-muted mt-0.5">
          Level {suggestion.level} suggestion
        </p>
      </div>
      <button
        onClick={handleAction}
        className="px-3 py-1 text-xs rounded-md bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors"
      >
        {suggestion.actionLabel}
      </button>
    </div>
  );
}

function getIcon(level: number) {
  switch (level) {
    case 1:
    case 2:
      return AlertCircle;
    case 3:
      return Clock;
    case 4:
      return AlertTriangle;
    default:
      return Lightbulb;
  }
}

function getIconColor(level: number): string {
  switch (level) {
    case 1:
      return "text-error";
    case 2:
      return "text-warning";
    case 3:
      return "text-warning";
    case 4:
      return "text-accent";
    default:
      return "text-accent";
  }
}
