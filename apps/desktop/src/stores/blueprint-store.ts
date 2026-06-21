import { create } from "zustand";
import type {
  Blueprint,
  BlueprintFrontMatter,
  BlueprintIndex,
  BlueprintSection,
  CheckResult,
  Estimate,
  TemplateInfo,
  ValidationResult,
} from "../types/blueprint-types";
import * as api from "../lib/blueprint-api";

export type ViewMode = "structured" | "raw";

interface BlueprintState {
  projectRoot: string | null;
  initialized: boolean;
  index: BlueprintIndex | null;
  activeBlueprint: Blueprint | null;
  activeBlueprintId: string | null;
  viewMode: ViewMode;
  viewPreferences: Record<string, ViewMode>;
  loading: boolean;
  templates: TemplateInfo[];
  checkResults: Record<string, CheckResult[]>;
  /** S6 feedback surface: per-blueprint criterion estimates (verdict + why +
   *  stale/drift), keyed by blueprintId. */
  estimates: Record<string, Estimate[]>;

  // Actions
  initialize: (projectRoot: string) => Promise<void>;
  refreshIndex: () => Promise<void>;
  loadBlueprint: (blueprintId: string) => Promise<void>;
  createFromTemplate: (
    templateName: string,
    variables: Record<string, unknown>,
  ) => Promise<Blueprint>;
  updateRaw: (blueprintId: string, rawMd: string) => Promise<void>;
  updateStructured: (
    blueprintId: string,
    frontMatter: BlueprintFrontMatter,
    sections: BlueprintSection[],
  ) => Promise<void>;
  deleteBlueprint: (blueprintId: string) => Promise<void>;
  toggleCriterion: (
    blueprintId: string,
    criterionIndex: number,
    checked: boolean,
  ) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  loadTemplates: () => Promise<void>;
  requestCheck: (blueprintId: string) => Promise<void>;
  loadCheckResults: (blueprintId: string) => Promise<void>;
  loadEstimates: (blueprintId: string) => Promise<void>;
  lightweightCheck: (blueprintId: string) => Promise<ValidationResult>;
}

export const useBlueprintStore = create<BlueprintState>((set, get) => ({
  projectRoot: null,
  initialized: false,
  index: null,
  activeBlueprint: null,
  activeBlueprintId: null,
  viewMode: "structured",
  viewPreferences: {},
  loading: false,
  templates: [],
  checkResults: {},
  estimates: {},

  initialize: async (projectRoot) => {
    await api.blueprintInit(projectRoot);
    set({ projectRoot, initialized: true });
    await get().refreshIndex();
    await get().loadTemplates();
  },

  refreshIndex: async () => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    const index = await api.listBlueprints(projectRoot);
    set({ index });
  },

  loadBlueprint: async (blueprintId) => {
    const { projectRoot, viewPreferences } = get();
    if (!projectRoot) return;
    set({ loading: true });
    try {
      const blueprint = await api.getBlueprint(projectRoot, blueprintId);
      const mode = viewPreferences[blueprintId] ?? "structured";
      set({
        activeBlueprint: blueprint,
        activeBlueprintId: blueprintId,
        viewMode: mode,
      });
      // Load the feedback-surface estimates for this blueprint (best-effort).
      void get().loadEstimates(blueprintId);
    } finally {
      set({ loading: false });
    }
  },

  createFromTemplate: async (templateName, variables) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("Not initialized");
    const bp = await api.createFromTemplate(
      projectRoot,
      templateName,
      variables,
    );
    await get().refreshIndex();
    set({
      activeBlueprint: bp,
      activeBlueprintId: bp.frontMatter.blueprintId,
    });
    return bp;
  },

  updateRaw: async (blueprintId, rawMd) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    const bp = await api.updateBlueprint(projectRoot, blueprintId, rawMd);
    set({ activeBlueprint: bp });
    await get().refreshIndex();
  },

  updateStructured: async (blueprintId, frontMatter, sections) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    const bp = await api.updateBlueprintStructured(
      projectRoot,
      blueprintId,
      frontMatter,
      sections,
    );
    set({ activeBlueprint: bp });
    await get().refreshIndex();
  },

  deleteBlueprint: async (blueprintId) => {
    const { projectRoot, activeBlueprintId } = get();
    if (!projectRoot) return;
    await api.deleteBlueprint(projectRoot, blueprintId);
    if (activeBlueprintId === blueprintId) {
      set({ activeBlueprint: null, activeBlueprintId: null });
    }
    await get().refreshIndex();
  },

  toggleCriterion: async (blueprintId, criterionIndex, checked) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    const bp = await api.toggleCriterion(
      projectRoot,
      blueprintId,
      criterionIndex,
      checked,
    );
    set({ activeBlueprint: bp });
    await get().refreshIndex();
  },

  setViewMode: (mode) => {
    const { activeBlueprintId, viewPreferences } = get();
    set({ viewMode: mode });
    if (activeBlueprintId) {
      set({
        viewPreferences: { ...viewPreferences, [activeBlueprintId]: mode },
      });
    }
  },

  loadTemplates: async () => {
    const templates = await api.listTemplates();
    set({ templates });
  },

  requestCheck: async (blueprintId) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    await api.requestCheck(projectRoot, blueprintId);
    await get().loadCheckResults(blueprintId);
    await get().loadEstimates(blueprintId);
  },

  loadCheckResults: async (blueprintId) => {
    const { projectRoot, checkResults } = get();
    if (!projectRoot) return;
    const results = await api.getCheckResults(projectRoot, blueprintId);
    set({ checkResults: { ...checkResults, [blueprintId]: results } });
  },

  loadEstimates: async (blueprintId) => {
    const { projectRoot, estimates } = get();
    if (!projectRoot) return;
    try {
      const next = await api.getEstimates(projectRoot, blueprintId);
      set({ estimates: { ...estimates, [blueprintId]: next } });
    } catch {
      // best-effort: the feedback surface degrades to "no estimate yet"
    }
  },

  lightweightCheck: async (blueprintId) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("Not initialized");
    return api.lightweightCheck(projectRoot, blueprintId);
  },
}));
