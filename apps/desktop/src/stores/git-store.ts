import { create } from "zustand";
import type {
  BranchInfo,
  CommitInfo,
  FileDiff,
  GitStatus,
} from "../types/git-types";
import * as api from "../lib/git-api";

interface GitState {
  projectRoot: string | null;
  status: GitStatus | null;
  branches: BranchInfo[];
  log: CommitInfo[];
  selectedPath: string | null;
  activeDiff: FileDiff | null;
  loading: boolean;
  error: string | null;

  initialize: (projectRoot: string) => Promise<void>;
  refresh: () => Promise<void>;
  selectFile: (path: string) => Promise<void>;
  stage: (path: string) => Promise<void>;
  unstage: (path: string) => Promise<void>;
  commit: (message: string) => Promise<void>;
  checkout: (name: string) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
}

export const useGitStore = create<GitState>((set, get) => ({
  projectRoot: null,
  status: null,
  branches: [],
  log: [],
  selectedPath: null,
  activeDiff: null,
  loading: false,
  error: null,

  initialize: async (projectRoot) => {
    set({ projectRoot });
    await get().refresh();
  },

  refresh: async () => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    set({ loading: true, error: null });
    try {
      const [status, branches, log] = await Promise.all([
        api.getStatus(projectRoot),
        api.getBranches(projectRoot).catch(() => []),
        api.getLog(projectRoot, 30).catch(() => []),
      ]);
      set({ status, branches, log });
    } catch (err: any) {
      set({ error: String(err) });
    } finally {
      set({ loading: false });
    }
  },

  selectFile: async (path) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    set({ selectedPath: path, activeDiff: null });
    try {
      const diff = await api.getDiff(projectRoot, path);
      set({ activeDiff: diff });
    } catch (err: any) {
      set({ error: String(err) });
    }
  },

  stage: async (path) => {
    const { projectRoot, refresh } = get();
    if (!projectRoot) return;
    await api.stageFile(projectRoot, path);
    await refresh();
  },

  unstage: async (path) => {
    const { projectRoot, refresh } = get();
    if (!projectRoot) return;
    await api.unstageFile(projectRoot, path);
    await refresh();
  },

  commit: async (message) => {
    const { projectRoot, refresh } = get();
    if (!projectRoot) return;
    await api.commit(projectRoot, message);
    await refresh();
  },

  checkout: async (name) => {
    const { projectRoot, refresh } = get();
    if (!projectRoot) return;
    await api.checkoutBranch(projectRoot, name);
    await refresh();
  },

  createBranch: async (name) => {
    const { projectRoot, refresh } = get();
    if (!projectRoot) return;
    await api.createBranch(projectRoot, name);
    await refresh();
  },
}));
