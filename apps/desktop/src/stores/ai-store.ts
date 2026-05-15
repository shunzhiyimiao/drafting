import { create } from "zustand";
import type {
  AiConfig,
  HealthCheckResult,
  Profile,
  TaskRoute,
} from "../types/ai-types";
import * as api from "../lib/ai-api";

interface AiState {
  projectRoot: string | null;
  config: AiConfig | null;
  loading: boolean;

  initialize: (projectRoot: string) => Promise<void>;
  refresh: () => Promise<void>;

  // Profile CRUD
  createProfile: (profile: Profile) => Promise<Profile>;
  updateProfile: (profile: Profile) => Promise<Profile>;
  deleteProfile: (profileId: string) => Promise<void>;
  cloneProfile: (sourceProfileId: string) => Promise<Profile>;
  setProfileApiKey: (profileId: string, apiKey: string) => Promise<void>;
  clearProfileApiKey: (profileId: string) => Promise<void>;
  importFromClaudeCode: () => Promise<{
    imported: Profile[];
    notes: string[];
  }>;

  // Routes / global
  toggleGlobal: (enabled: boolean) => Promise<void>;
  updateRoute: (route: TaskRoute) => Promise<void>;
  saveConfig: (config: AiConfig) => Promise<void>;

  // Health
  checkProfileHealth: (profileId: string) => Promise<HealthCheckResult>;
  checkDraftHealth: (
    draft: Profile,
    apiKey: string | null,
  ) => Promise<HealthCheckResult>;
}

export const useAiStore = create<AiState>((set, get) => ({
  projectRoot: null,
  config: null,
  loading: false,

  initialize: async (projectRoot) => {
    set({ projectRoot, loading: true });
    try {
      const config = await api.getConfig(projectRoot);
      set({ config });
    } finally {
      set({ loading: false });
    }
  },

  refresh: async () => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    const config = await api.getConfig(projectRoot);
    set({ config });
  },

  createProfile: async (profile) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("not initialized");
    const created = await api.createProfile(projectRoot, profile);
    await get().refresh();
    return created;
  },

  updateProfile: async (profile) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("not initialized");
    const saved = await api.updateProfile(projectRoot, profile);
    await get().refresh();
    return saved;
  },

  deleteProfile: async (profileId) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    await api.deleteProfile(projectRoot, profileId);
    await get().refresh();
  },

  cloneProfile: async (sourceProfileId) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("not initialized");
    const copy = await api.cloneProfile(projectRoot, sourceProfileId);
    await get().refresh();
    return copy;
  },

  setProfileApiKey: async (profileId, apiKey) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    await api.setProfileApiKey(projectRoot, profileId, apiKey);
    await get().refresh();
  },

  clearProfileApiKey: async (profileId) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    await api.clearProfileApiKey(projectRoot, profileId);
    await get().refresh();
  },

  importFromClaudeCode: async () => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("not initialized");
    const result = await api.importFromClaudeCode(projectRoot);
    await get().refresh();
    return result;
  },

  toggleGlobal: async (enabled) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    await api.toggleGlobal(projectRoot, enabled);
    await get().refresh();
  },

  updateRoute: async (route) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    await api.setTaskRoute(projectRoot, route);
    await get().refresh();
  },

  saveConfig: async (config) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    await api.saveConfig(projectRoot, config);
    set({ config });
  },

  checkProfileHealth: async (profileId) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("not initialized");
    return api.checkProfileHealth(projectRoot, profileId);
  },

  checkDraftHealth: async (draft, apiKey) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("not initialized");
    return api.checkDraftHealth(projectRoot, draft, apiKey);
  },
}));
