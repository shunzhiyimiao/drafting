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

interface SidebarButtonProps {
  id: ViewId;
  Icon: typeof Home;
  label: string;
  active: boolean;
  onClick: () => void;
}

function SidebarButton({ Icon, label, active, onClick }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 ${
        active
          ? "text-accent"
          : "text-text-muted hover:text-text-secondary"
      }`}
    >
      {active && (
        <>
          <span
            className="absolute inset-0 rounded-xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(168, 198, 255, 0.25), rgba(168, 198, 255, 0.08))",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 20px rgba(168, 198, 255, 0.25)",
              border: "1px solid rgba(168, 198, 255, 0.35)",
            }}
          />
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-accent" />
        </>
      )}
      {!active && (
        <span className="absolute inset-0 rounded-xl opacity-0 hover:opacity-100 bg-white/5 transition-opacity" />
      )}
      <Icon size={18} className="relative z-10" />
    </button>
  );
}

export function Sidebar() {
  const { activeView, setActiveView } = useNavigationStore();

  return (
    <div className="glass-sidebar flex flex-col items-center w-14 py-3 shrink-0 gap-1">
      <div className="flex flex-col items-center gap-2 flex-1">
        {topItems.map(({ id, icon: Icon, label }) => (
          <SidebarButton
            key={id}
            id={id}
            Icon={Icon}
            label={label}
            active={activeView === id}
            onClick={() => setActiveView(id)}
          />
        ))}
      </div>
      <SidebarButton
        id="settings"
        Icon={Settings}
        label="Settings"
        active={activeView === "settings"}
        onClick={() => setActiveView("settings")}
      />
    </div>
  );
}
