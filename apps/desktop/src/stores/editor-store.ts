import { create } from "zustand";
import type { DirEntry, FileIdentity } from "../types/editor-types";
import * as api from "../lib/editor-api";

export interface EditorTab {
  path: string;
  content: string;
  originalContent: string;
  identity: FileIdentity;
  dirty: boolean;
}

interface EditorState {
  projectRoot: string | null;
  initialized: boolean;
  tabs: EditorTab[];
  activeTabPath: string | null;
  tree: Record<string, DirEntry[]>; // path -> entries
  loadingPaths: Set<string>;
  expandedDirs: Set<string>;

  initialize: (projectRoot: string) => Promise<void>;
  loadDir: (relPath: string) => Promise<void>;
  toggleDir: (relPath: string) => Promise<void>;
  openFile: (relPath: string) => Promise<void>;
  closeTab: (relPath: string) => void;
  setActiveTab: (relPath: string) => void;
  updateTabContent: (relPath: string, content: string) => void;
  saveTab: (relPath: string) => Promise<void>;
  saveAll: () => Promise<void>;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectRoot: null,
  initialized: false,
  tabs: [],
  activeTabPath: null,
  tree: {},
  loadingPaths: new Set(),
  expandedDirs: new Set([""]),

  initialize: async (projectRoot) => {
    set({ projectRoot, initialized: true });
    await get().loadDir("");
  },

  loadDir: async (relPath) => {
    const { projectRoot, loadingPaths } = get();
    if (!projectRoot) return;
    const newLoading = new Set(loadingPaths);
    newLoading.add(relPath);
    set({ loadingPaths: newLoading });
    try {
      const entries = await api.listDir(projectRoot, relPath);
      set((s) => ({
        tree: { ...s.tree, [relPath]: entries },
      }));
    } catch (err) {
      console.error("Failed to load dir", relPath, err);
    } finally {
      const done = new Set(get().loadingPaths);
      done.delete(relPath);
      set({ loadingPaths: done });
    }
  },

  toggleDir: async (relPath) => {
    const { expandedDirs, tree } = get();
    const next = new Set(expandedDirs);
    if (next.has(relPath)) {
      next.delete(relPath);
    } else {
      next.add(relPath);
      if (!tree[relPath]) {
        await get().loadDir(relPath);
      }
    }
    set({ expandedDirs: next });
  },

  openFile: async (relPath) => {
    const { projectRoot, tabs } = get();
    if (!projectRoot) return;

    // Already open?
    const existing = tabs.find((t) => t.path === relPath);
    if (existing) {
      set({ activeTabPath: relPath });
      return;
    }

    try {
      const file = await api.readFile(projectRoot, relPath);
      const newTab: EditorTab = {
        path: relPath,
        content: file.content,
        originalContent: file.content,
        identity: file.identity,
        dirty: false,
      };
      set({ tabs: [...tabs, newTab], activeTabPath: relPath });
    } catch (err) {
      console.error("Failed to open file", relPath, err);
    }
  },

  closeTab: (relPath) => {
    const { tabs, activeTabPath } = get();
    const tab = tabs.find((t) => t.path === relPath);
    if (tab?.dirty) {
      if (!confirm(`"${relPath}" has unsaved changes. Close anyway?`)) {
        return;
      }
    }
    const newTabs = tabs.filter((t) => t.path !== relPath);
    const newActive =
      activeTabPath === relPath
        ? newTabs[newTabs.length - 1]?.path ?? null
        : activeTabPath;
    set({ tabs: newTabs, activeTabPath: newActive });
  },

  setActiveTab: (relPath) => {
    set({ activeTabPath: relPath });
  },

  updateTabContent: (relPath, content) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === relPath
          ? { ...t, content, dirty: content !== t.originalContent }
          : t,
      ),
    }));
  },

  saveTab: async (relPath) => {
    const { projectRoot, tabs } = get();
    if (!projectRoot) return;
    const tab = tabs.find((t) => t.path === relPath);
    if (!tab || !tab.dirty) return;
    if (tab.identity.readonly) {
      alert(`Cannot save read-only file "${relPath}".`);
      return;
    }
    try {
      await api.writeFile(projectRoot, relPath, tab.content);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === relPath
            ? { ...t, originalContent: t.content, dirty: false }
            : t,
        ),
      }));
    } catch (err) {
      alert(`Save failed: ${err}`);
    }
  },

  saveAll: async () => {
    const { tabs, saveTab } = get();
    for (const tab of tabs) {
      if (tab.dirty) {
        await saveTab(tab.path);
      }
    }
  },
}));
