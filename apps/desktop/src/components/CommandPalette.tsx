import { useEffect, useMemo, useState } from "react";
import { Search, ArrowRight } from "lucide-react";
import { useNavigationStore } from "../stores/navigation-store";
import { useLayoutStore } from "../stores/layout-store";
import { useEditorStore } from "../stores/editor-store";

export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const setActiveView = useNavigationStore((s) => s.setActiveView);
  const toggleZenMode = useLayoutStore((s) => s.toggleZenMode);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toggleRightPanel = useLayoutStore((s) => s.toggleRightPanel);
  const toggleBottomPanel = useLayoutStore((s) => s.toggleBottomPanel);
  const saveAll = useEditorStore((s) => s.saveAll);

  const commands: Command[] = useMemo(
    () => [
      {
        id: "go-headquarters",
        label: "Go to Headquarters",
        category: "Navigation",
        shortcut: "g d",
        run: () => setActiveView("headquarters"),
      },
      {
        id: "go-blueprint",
        label: "Go to Blueprint",
        category: "Navigation",
        shortcut: "g b",
        run: () => setActiveView("blueprint"),
      },
      {
        id: "go-patchboard",
        label: "Go to Patchboard",
        category: "Navigation",
        shortcut: "g p",
        run: () => setActiveView("patchboard"),
      },
      {
        id: "go-editor",
        label: "Go to Editor",
        category: "Navigation",
        shortcut: "g e",
        run: () => setActiveView("editor"),
      },
      {
        id: "go-atlas",
        label: "Go to Atlas",
        category: "Navigation",
        shortcut: "g a",
        run: () => setActiveView("atlas"),
      },
      {
        id: "go-git",
        label: "Go to Git",
        category: "Navigation",
        shortcut: "g g",
        run: () => setActiveView("git"),
      },
      {
        id: "go-terminal",
        label: "Go to Terminal",
        category: "Navigation",
        shortcut: "g t",
        run: () => setActiveView("terminal"),
      },
      {
        id: "toggle-zen",
        label: "Toggle Zen Mode",
        category: "View",
        shortcut: "Cmd+K Z",
        run: () => toggleZenMode(),
      },
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        category: "View",
        run: () => toggleSidebar(),
      },
      {
        id: "toggle-right-panel",
        label: "Toggle Right Panel",
        category: "View",
        run: () => toggleRightPanel(),
      },
      {
        id: "toggle-bottom-panel",
        label: "Toggle Bottom Panel",
        category: "View",
        run: () => toggleBottomPanel(),
      },
      {
        id: "save-all",
        label: "Save All Files",
        category: "File",
        shortcut: "Cmd+Alt+S",
        run: () => saveAll(),
      },
    ],
    [setActiveView, toggleZenMode, toggleSidebar, toggleRightPanel, toggleBottomPanel, saveAll],
  );

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [query, commands]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIdx(0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[selectedIdx];
      if (cmd) {
        cmd.run();
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-24 z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl w-[560px] max-h-[60vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search size={14} className="text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            autoFocus
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <p className="p-4 text-xs text-text-muted text-center">
              No commands found
            </p>
          ) : (
            filtered.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.run();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                  idx === selectedIdx
                    ? "bg-bg-hover text-text-primary"
                    : "text-text-secondary hover:bg-bg-hover/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <ArrowRight
                    size={11}
                    className={idx === selectedIdx ? "text-accent" : "text-text-muted"}
                  />
                  <span>{cmd.label}</span>
                  <span className="text-[10px] text-text-muted">
                    {cmd.category}
                  </span>
                </div>
                {cmd.shortcut && (
                  <span className="text-[10px] text-text-muted font-mono">
                    {cmd.shortcut}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
