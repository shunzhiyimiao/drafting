import { create } from "zustand";
import type { SessionInfo } from "../types/terminal-types";
import * as api from "../lib/terminal-api";
import { getProjectRoot } from "../lib/app-bootstrap";

export interface TerminalTab {
  id: string;
  title: string;
  info: SessionInfo;
  exited: boolean;
}

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;

  createTab: (opts?: {
    command?: string;
    title?: string;
    cwd?: string;
  }) => Promise<string>;
  closeTab: (id: string) => Promise<void>;
  setActiveTab: (id: string) => void;
  markExited: (id: string, exitCode: number) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  tabs: [],
  activeTabId: null,

  createTab: async (opts) => {
    // Terminals open in the active workspace root (design Part 11), falling
    // back to $HOME on the backend only when no workspace is resolvable.
    const cwd = opts?.cwd ?? (await getProjectRoot().catch(() => null));
    const info = await api.createSession({
      cwd,
      shell: null,
      cols: 80,
      rows: 24,
      command: opts?.command ?? null,
    });
    const tab: TerminalTab = {
      id: info.id,
      title: opts?.title ?? info.shell.split("/").pop() ?? "shell",
      info,
      exited: false,
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
    }));
    return tab.id;
  },

  closeTab: async (id) => {
    try {
      await api.closeSession(id);
    } catch {
      // ignore — session may already be closed
    }
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId =
        s.activeTabId === id ? tabs[tabs.length - 1]?.id ?? null : s.activeTabId;
      return { tabs, activeTabId };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  markExited: (id, exitCode) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              exited: true,
              info: { ...t.info, exitCode },
              title: `${t.title} (exited ${exitCode})`,
            }
          : t,
      ),
    }));
  },
}));

// Global output subscription: dispatch chunks to whoever is listening.
// Each XtermInstance component registers a callback keyed by session id.
type OutputCallback = (data: string) => void;
const outputListeners = new Map<string, Set<OutputCallback>>();

export function subscribeOutput(
  sessionId: string,
  callback: OutputCallback,
): () => void {
  if (!outputListeners.has(sessionId)) {
    outputListeners.set(sessionId, new Set());
  }
  outputListeners.get(sessionId)!.add(callback);
  return () => {
    outputListeners.get(sessionId)?.delete(callback);
  };
}

// Mount the global Tauri listener exactly once
let mounted = false;
export async function mountTerminalListeners(): Promise<void> {
  if (mounted) return;
  mounted = true;
  await api.onSessionOutput(({ sessionId, data }) => {
    const listeners = outputListeners.get(sessionId);
    if (listeners) {
      for (const cb of listeners) cb(data);
    }
  });
  await api.onSessionExit(({ sessionId, exitCode }) => {
    useTerminalStore.getState().markExited(sessionId, exitCode);
  });
}
