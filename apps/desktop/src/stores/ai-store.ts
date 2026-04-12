import { create } from "zustand";
import type { AiConfig, ProviderId, TaskRoute } from "../types/ai-types";
import * as api from "../lib/ai-api";

interface AiState {
  projectRoot: string | null;
  config: AiConfig | null;
  loading: boolean;

  initialize: (projectRoot: string) => Promise<void>;
  refresh: () => Promise<void>;
  setApiKey: (providerId: ProviderId, key: string) => Promise<void>;
  toggleGlobal: (enabled: boolean) => Promise<void>;
  updateRoute: (route: TaskRoute) => Promise<void>;
  saveConfig: (config: AiConfig) => Promise<void>;
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

  setApiKey: async (providerId, key) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    await api.setApiKey(projectRoot, providerId, key);
    await get().refresh();
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
}));
