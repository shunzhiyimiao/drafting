import { create } from "zustand";
import type {
  BranchInfo,
  CommitInfo,
  FileDiff,
  GitStatus,
} from "../types/git-types";
import * as api from "../lib/git-api";
import { t } from "../lib/i18n";
import { notify } from "./notification-store";

interface GitState {
  projectRoot: string | null;
  status: GitStatus | null;
  branches: BranchInfo[];
  log: CommitInfo[];
  selectedPath: string | null;
  activeDiff: FileDiff | null;
  loading: boolean;
  /** A network remote op (fetch/pull/push) is in flight. */
  remoteBusy: boolean;
  error: string | null;

  initialize: (projectRoot: string) => Promise<void>;
  refresh: () => Promise<void>;
  selectFile: (path: string) => Promise<void>;
  stage: (path: string) => Promise<void>;
  stageAll: (paths: string[]) => Promise<void>;
  unstage: (path: string) => Promise<void>;
  commit: (message: string) => Promise<void>;
  checkout: (name: string) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  fetch: () => Promise<void>;
  pull: () => Promise<void>;
  push: () => Promise<void>;
}

export const useGitStore = create<GitState>((set, get) => ({
  projectRoot: null,
  status: null,
  branches: [],
  log: [],
  selectedPath: null,
  activeDiff: null,
  loading: false,
  remoteBusy: false,
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

  stageAll: async (paths) => {
    const { projectRoot, refresh } = get();
    if (!projectRoot) return;
    // One refresh at the end — per-file refresh would rescan status N times.
    for (const path of paths) {
      await api.stageFile(projectRoot, path);
    }
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

  fetch: async () => {
    const { projectRoot, refresh, remoteBusy } = get();
    if (!projectRoot || remoteBusy) return;
    set({ remoteBusy: true });
    try {
      const r = await api.fetch(projectRoot);
      notify({
        severity: "info",
        title: t("git.fetch.done.title"),
        message:
          r.commitsReceived > 0
            ? t("git.behind.hint", { n: String(r.commitsReceived) })
            : t("git.upToDate"),
        dedupeKey: "git-fetch",
      });
      await refresh();
    } catch (e) {
      notify({
        severity: "error",
        title: t("git.fetch.failed.title"),
        message: String(e),
        dedupeKey: "git-fetch-failed",
      });
    } finally {
      set({ remoteBusy: false });
    }
  },

  pull: async () => {
    const { projectRoot, refresh, remoteBusy } = get();
    if (!projectRoot || remoteBusy) return;
    set({ remoteBusy: true });
    try {
      const r = await api.pull(projectRoot);
      notify({
        severity: "info",
        title: t("git.pull.done.title"),
        message:
          r.commitsReceived > 0
            ? t("git.pull.done.applied", { n: String(r.commitsReceived) })
            : t("git.upToDate"),
        dedupeKey: "git-pull",
      });
      await refresh();
    } catch (e) {
      notify({
        severity: "error",
        title: t("git.pull.failed.title"),
        message: String(e),
        dedupeKey: "git-pull-failed",
      });
    } finally {
      set({ remoteBusy: false });
    }
  },

  push: async () => {
    const { projectRoot, refresh, remoteBusy } = get();
    if (!projectRoot || remoteBusy) return;
    set({ remoteBusy: true });
    try {
      const r = await api.push(projectRoot);
      notify({
        severity: "info",
        title: t("git.push.done.title"),
        message: t("git.push.done.detail", {
          n: String(r.commitsPushed),
          remote: r.remote,
        }),
        dedupeKey: "git-push",
      });
      await refresh();
    } catch (e) {
      notify({
        severity: "error",
        title: t("git.push.failed.title"),
        message: String(e),
        dedupeKey: "git-push-failed",
      });
    } finally {
      set({ remoteBusy: false });
    }
  },
}));
