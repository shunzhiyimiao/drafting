import { create } from "zustand";
import type {
  RegistryIndex,
  SocketDefinition,
  CreateSocketInput,
  UpdateSocketInput,
  Canvas,
  CanvasSummary,
  ValidationResult,
  CodeGenResult,
} from "../types/patchboard-types";
import * as api from "../lib/patchboard-api";

interface PatchboardState {
  // Data
  projectRoot: string | null;
  initialized: boolean;
  registry: RegistryIndex | null;
  canvasList: CanvasSummary[];
  activeCanvasId: string | null;
  activeCanvas: Canvas | null;
  selectedNodeId: string | null;

  // Loading
  registryLoading: boolean;
  canvasLoading: boolean;

  // Actions
  initialize: (projectRoot: string) => Promise<void>;
  refreshRegistry: () => Promise<void>;
  refreshCanvasList: () => Promise<void>;

  // Socket CRUD
  createSocket: (input: CreateSocketInput) => Promise<SocketDefinition>;
  updateSocket: (input: UpdateSocketInput) => Promise<SocketDefinition>;
  deleteSocket: (socketId: string) => Promise<void>;
  getSocket: (socketId: string) => Promise<SocketDefinition>;

  // Canvas CRUD
  createCanvas: (name: string) => Promise<Canvas>;
  loadCanvas: (canvasId: string) => Promise<void>;
  saveActiveCanvas: () => Promise<void>;
  deleteCanvas: (canvasId: string) => Promise<void>;

  // Canvas mutations (update local state + save)
  updateActiveCanvas: (updater: (canvas: Canvas) => Canvas) => void;
  setSelectedNode: (nodeId: string | null) => void;

  // Validation & Code Generation
  validateActiveCanvas: () => Promise<ValidationResult | null>;
  generateCode: () => Promise<CodeGenResult | null>;
}

export const usePatchboardStore = create<PatchboardState>((set, get) => ({
  projectRoot: null,
  initialized: false,
  registry: null,
  canvasList: [],
  activeCanvasId: null,
  activeCanvas: null,
  selectedNodeId: null,
  registryLoading: false,
  canvasLoading: false,

  initialize: async (projectRoot) => {
    await api.patchboardInit(projectRoot);
    set({ projectRoot, initialized: true });
    await get().refreshRegistry();
    await get().refreshCanvasList();
  },

  refreshRegistry: async () => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    set({ registryLoading: true });
    try {
      const registry = await api.listSockets(projectRoot);
      set({ registry });
    } finally {
      set({ registryLoading: false });
    }
  },

  refreshCanvasList: async () => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    const canvasList = await api.listCanvases(projectRoot);
    set({ canvasList });
  },

  createSocket: async (input) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("Not initialized");
    const socket = await api.createSocket(projectRoot, input);
    await get().refreshRegistry();
    return socket;
  },

  updateSocket: async (input) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("Not initialized");
    const socket = await api.updateSocket(projectRoot, input);
    await get().refreshRegistry();
    return socket;
  },

  deleteSocket: async (socketId) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("Not initialized");
    await api.deleteSocket(projectRoot, socketId);
    await get().refreshRegistry();
  },

  getSocket: async (socketId) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("Not initialized");
    return api.getSocket(projectRoot, socketId);
  },

  createCanvas: async (name) => {
    const { projectRoot } = get();
    if (!projectRoot) throw new Error("Not initialized");
    const canvas = await api.createCanvas(projectRoot, name);
    await get().refreshCanvasList();
    set({ activeCanvasId: canvas.id, activeCanvas: canvas });
    return canvas;
  },

  loadCanvas: async (canvasId) => {
    const { projectRoot } = get();
    if (!projectRoot) return;
    set({ canvasLoading: true });
    try {
      const canvas = await api.getCanvas(projectRoot, canvasId);
      set({ activeCanvasId: canvasId, activeCanvas: canvas, selectedNodeId: null });
    } finally {
      set({ canvasLoading: false });
    }
  },

  saveActiveCanvas: async () => {
    const { projectRoot, activeCanvas } = get();
    if (!projectRoot || !activeCanvas) return;
    await api.saveCanvas(projectRoot, activeCanvas);
    await get().refreshCanvasList();
  },

  deleteCanvas: async (canvasId) => {
    const { projectRoot, activeCanvasId } = get();
    if (!projectRoot) throw new Error("Not initialized");
    await api.deleteCanvas(projectRoot, canvasId);
    if (activeCanvasId === canvasId) {
      set({ activeCanvasId: null, activeCanvas: null, selectedNodeId: null });
    }
    await get().refreshCanvasList();
  },

  updateActiveCanvas: (updater) => {
    const { activeCanvas } = get();
    if (!activeCanvas) return;
    const updated = updater(activeCanvas);
    set({ activeCanvas: { ...updated, updatedAt: Date.now() } });
  },

  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  validateActiveCanvas: async () => {
    const { projectRoot, activeCanvasId, activeCanvas } = get();
    if (!projectRoot || !activeCanvasId || !activeCanvas) return null;
    // Save first to ensure backend has latest
    await api.saveCanvas(projectRoot, activeCanvas);
    return api.validateCanvas(projectRoot, activeCanvasId);
  },

  generateCode: async () => {
    const { projectRoot, activeCanvasId, activeCanvas } = get();
    if (!projectRoot || !activeCanvasId || !activeCanvas) return null;
    await api.saveCanvas(projectRoot, activeCanvas);
    return api.generateCode(projectRoot, activeCanvasId);
  },
}));
