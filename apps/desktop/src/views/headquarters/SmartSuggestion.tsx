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
    <div className="glass-panel flex items-center gap-3 px-5 py-3.5">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: "rgba(255, 255, 255, 0.06)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <Icon size={16} className={iconColor} />
      </div>
      <div className="flex-1">
        <p className="text-sm text-text-primary">{suggestion.message}</p>
        <p className="text-[10px] text-text-muted mt-0.5">
          Level {suggestion.level} suggestion
        </p>
      </div>
      <button
        onClick={handleAction}
        className="glass-button-primary px-3.5 py-1.5 text-xs rounded-lg font-medium transition-all"
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
