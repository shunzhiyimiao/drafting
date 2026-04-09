import {
  Home,
  FileText,
  CircuitBoard,
  Map,
  Code,
  GitBranch,
  Terminal,
  Settings,
} from "lucide-react";
import {
  useNavigationStore,
  type ViewId,
} from "../stores/navigation-store";

const topItems: { id: ViewId; icon: typeof Home; label: string }[] = [
  { id: "headquarters", icon: Home, label: "Headquarters" },
  { id: "blueprint", icon: FileText, label: "Blueprint" },
  { id: "patchboard", icon: CircuitBoard, label: "Patchboard" },
  { id: "atlas", icon: Map, label: "Atlas" },
  { id: "editor", icon: Code, label: "Editor" },
  { id: "git", icon: GitBranch, label: "Git" },
  { id: "terminal", icon: Terminal, label: "Terminal" },
];

export function Sidebar() {
  const { activeView, setActiveView } = useNavigationStore();

  return (
    <div className="flex flex-col items-center w-12 bg-bg-sidebar border-r border-border py-2 shrink-0">
      <div className="flex flex-col items-center gap-1 flex-1">
        {topItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            title={label}
            className={`w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
              activeView === id
                ? "bg-bg-active text-accent"
                : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
            }`}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      <button
        onClick={() => setActiveView("settings")}
        title="Settings"
        className={`w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
          activeView === "settings"
            ? "bg-bg-active text-accent"
            : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
        }`}
      >
        <Settings size={18} />
      </button>
    </div>
  );
}
