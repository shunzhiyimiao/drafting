import { useEffect } from "react";
import { Plus, X, Terminal as TerminalIcon } from "lucide-react";
import {
  useTerminalStore,
  mountTerminalListeners,
} from "../../stores/terminal-store";
import { XtermInstance } from "./XtermInstance";
import { useT } from "../../lib/i18n";

export function TerminalView() {
  const t = useT();
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const createTab = useTerminalStore((s) => s.createTab);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const setActiveTab = useTerminalStore((s) => s.setActiveTab);

  // Mount global listeners once + open first tab if none
  useEffect(() => {
    mountTerminalListeners().then(() => {
      if (useTerminalStore.getState().tabs.length === 0) {
        createTab().catch((e) => console.error("Failed to create terminal", e));
      }
    });
  }, [createTab]);

  // Keyboard shortcuts: Cmd+T new tab, Cmd+W close tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        createTab();
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "w" &&
        activeTabId
      ) {
        e.preventDefault();
        closeTab(activeTabId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTabId, createTab, closeTab]);

  const handleQuickLaunch = (command: string, title: string) => {
    createTab({ command, title });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center bg-bg-secondary border-b border-white/5 shrink-0 px-2">
        <div className="flex-1 flex items-center overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer border-r border-white/5 shrink-0 ${
                  isActive
                    ? "bg-white/6 text-text-primary"
                    : "text-text-muted hover:text-text-secondary hover:bg-white/3"
                } ${tab.exited ? "opacity-60" : ""}`}
              >
                <TerminalIcon size={11} />
                <span className="text-xs">{tab.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-1 pl-2">
          <button
            onClick={() => createTab()}
            className="p-1 text-text-muted hover:text-text-secondary"
            title={t("terminal.newTab")}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => handleQuickLaunch("claude", "Claude Code")}
            className="px-2 py-0.5 text-[10px] rounded bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors"
            title={t("terminal.launchClaude")}
          >
            Claude
          </button>
          <button
            onClick={() => handleQuickLaunch("codex", "Codex")}
            className="px-2 py-0.5 text-[10px] rounded bg-success/15 border border-success/30 text-success hover:bg-success/25 transition-colors"
            title={t("terminal.launchCodex")}
          >
            Codex
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div className="flex-1 relative bg-bg-primary">
        {tabs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            {t("terminal.starting")}
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.id}
              className="absolute inset-0 p-2"
              style={{ display: tab.id === activeTabId ? "block" : "none" }}
            >
              <XtermInstance
                sessionId={tab.id}
                cwd={tab.info.cwd}
                visible={tab.id === activeTabId}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
