import { create } from "zustand";
import type { FileMap } from "../types/atlas-types";
import * as api from "../lib/atlas-api";

interface AtlasState {
  projectRoot: string | null;
  activeFilePath: string | null;
  fileMap: FileMap | null;
  loading: boolean;
  error: string | null;

  initialize: (projectRoot: string) => void;
  loadFile: (relPath: string) => Promise<void>;
  clear: () => void;
}

export const useAtlasStore = create<AtlasState>((set, get) => ({
  projectRoot: null,
  activeFilePath: null,
  fileMap: null,
  loading: false,
  error: null,

  initialize: (projectRoot) => {
    set({ projectRoot });
  },

  loadFile: async (relPath) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    set({ loading: true, error: null, activeFilePath: relPath });
    try {
      const map = await api.parseFile(projectRoot, relPath);
      set({ fileMap: map });
    } catch (err: any) {
      set({ error: String(err), fileMap: null });
    } finally {
      set({ loading: false });
    }
  },

  clear: () => set({ fileMap: null, activeFilePath: null }),
}));
