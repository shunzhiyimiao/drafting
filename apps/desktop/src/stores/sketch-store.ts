import { create } from "zustand";
import type {
  ButtonP,
  Container,
  ImageP,
  InputP,
  Sketch,
  SketchNode,
  TextP,
} from "@drafting/sketch-core";
import * as api from "../lib/sketch-api";
import { ulid } from "../lib/ulid";

/** Autosave delay. Saves publish FileSaved → the backend regenerates React
 *  (debounced again server-side) and drifts bound criteria — the editor is
 *  just another producer on the v1.5 loop (spec §7). */
const AUTOSAVE_MS = 800;

export type NodeKind = SketchNode["kind"];

interface SketchState {
  projectRoot: string | null;
  sketches: Sketch[];
  active: Sketch | null;
  selectedNodeId: string | null;
  dirty: boolean;
  saving: boolean;
  lastError: string | null;

  initialize: (projectRoot: string) => Promise<void>;
  refresh: () => Promise<void>;
  createSketch: (name: string, blueprintRef: string | null) => Promise<void>;
  openSketch: (sketchId: string) => Promise<void>;
  deleteSketchById: (sketchId: string) => Promise<void>;
  /** Back to the list/create screen. Flushes a pending autosave first so
   *  closing never loses an edit. */
  closeSketch: () => Promise<void>;
  selectNode: (nodeId: string | null) => void;

  /** Tree edits — all clone-mutate-set + schedule autosave. */
  addNode: (parentId: string, kind: NodeKind) => void;
  updateNode: (nodeId: string, mutate: (node: SketchNode) => void) => void;
  deleteNode: (nodeId: string) => void;
  moveNode: (nodeId: string, direction: "up" | "down") => void;
  updateSketchMeta: (patch: { name?: string; blueprintRef?: string | null }) => void;

  saveNow: () => Promise<void>;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Find a node and its parent container in the tree. */
export function findNode(
  root: SketchNode,
  nodeId: string,
  parent: Container | null = null,
): { node: SketchNode; parent: Container | null } | null {
  if (root.id === nodeId) return { node: root, parent };
  if (root.kind === "stack") {
    for (const child of root.children) {
      const hit = findNode(child, nodeId, root);
      if (hit) return hit;
    }
  }
  return null;
}

export function allNodeIds(root: SketchNode, out: string[] = []): string[] {
  out.push(root.id);
  if (root.kind === "stack") {
    for (const child of root.children) allNodeIds(child, out);
  }
  return out;
}

function defaultNode(kind: NodeKind): SketchNode {
  const id = ulid();
  const hug = { mode: "hug" } as const;
  const fill = { mode: "fill" } as const;
  switch (kind) {
    case "stack":
      return {
        kind: "stack",
        id,
        layout: {
          direction: "col",
          gap: 2,
          padding: { top: 2, right: 2, bottom: 2, left: 2 },
          mainAxis: "start",
          crossAxis: "stretch",
        },
        sizing: { width: fill, height: hug },
        children: [],
      } satisfies Container;
    case "text":
      return {
        kind: "text",
        id,
        role: "body",
        content: "Text",
        sizing: { width: hug, height: hug },
      } satisfies TextP;
    case "button":
      return {
        kind: "button",
        id,
        label: "Button",
        variant: "primary",
        intent: { kind: "none" },
        sizing: { width: hug, height: hug },
      } satisfies ButtonP;
    case "input":
      return {
        kind: "input",
        id,
        label: "Label",
        type: "text",
        sizing: { width: fill, height: hug },
      } satisfies InputP;
    case "image":
      return {
        kind: "image",
        id,
        src: "/image.png",
        alt: "image",
        sizing: { width: { mode: "fixed", px: 96 }, height: { mode: "fixed", px: 96 } },
      } satisfies ImageP;
  }
}

export const useSketchStore = create<SketchState>((set, get) => {
  const scheduleAutosave = () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      void get().saveNow();
    }, AUTOSAVE_MS);
  };

  /** Clone the active sketch, apply `edit`, mark dirty, schedule autosave. */
  const editActive = (edit: (draft: Sketch) => void) => {
    const { active } = get();
    if (!active) return;
    const draft = structuredClone(active) as Sketch;
    edit(draft);
    set({ active: draft, dirty: true });
    scheduleAutosave();
  };

  return {
    projectRoot: null,
    sketches: [],
    active: null,
    selectedNodeId: null,
    dirty: false,
    saving: false,
    lastError: null,

    initialize: async (projectRoot) => {
      set({ projectRoot });
      await get().refresh();
    },

    refresh: async () => {
      const { projectRoot } = get();
      if (!projectRoot) return;
      try {
        const sketches = await api.listSketches(projectRoot);
        set({ sketches, lastError: null });
      } catch (e) {
        set({ lastError: String(e) });
      }
    },

    createSketch: async (name, blueprintRef) => {
      const { projectRoot } = get();
      if (!projectRoot) return;
      try {
        const sketch = await api.createSketch(projectRoot, name, blueprintRef);
        set({ lastError: null });
        await get().refresh();
        set({ active: sketch, selectedNodeId: sketch.root.id, dirty: false });
      } catch (e) {
        set({ lastError: String(e) });
      }
    },

    openSketch: async (sketchId) => {
      const { projectRoot } = get();
      if (!projectRoot) return;
      try {
        const sketch = await api.getSketch(projectRoot, sketchId);
        set({ active: sketch, selectedNodeId: sketch.root.id, dirty: false, lastError: null });
      } catch (e) {
        set({ lastError: String(e) });
      }
    },

    deleteSketchById: async (sketchId) => {
      const { projectRoot, active } = get();
      if (!projectRoot) return;
      try {
        await api.deleteSketch(projectRoot, sketchId);
        if (active?.id === sketchId) {
          if (autosaveTimer) {
            clearTimeout(autosaveTimer);
            autosaveTimer = null;
          }
          set({ active: null, selectedNodeId: null, dirty: false });
        }
        set({ lastError: null });
        await get().refresh();
      } catch (e) {
        set({ lastError: String(e) });
      }
    },

    closeSketch: async () => {
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      if (get().dirty) {
        await get().saveNow();
      }
      set({ active: null, selectedNodeId: null });
    },

    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

    addNode: (parentId, kind) => {
      const child = defaultNode(kind);
      editActive((draft) => {
        const hit = findNode(draft.root, parentId);
        // Adding lands in the selected container, or its parent when a
        // primitive is selected (structured add — the tree stays the truth).
        const target =
          hit?.node.kind === "stack" ? hit.node : hit?.parent ?? null;
        if (target) target.children.push(child);
      });
      set({ selectedNodeId: child.id });
    },

    updateNode: (nodeId, mutate) => {
      editActive((draft) => {
        const hit = findNode(draft.root, nodeId);
        if (hit) mutate(hit.node);
      });
    },

    deleteNode: (nodeId) => {
      const { active, selectedNodeId } = get();
      if (!active || active.root.id === nodeId) return; // never delete the root
      editActive((draft) => {
        const hit = findNode(draft.root, nodeId);
        if (hit?.parent) {
          hit.parent.children = hit.parent.children.filter((c) => c.id !== nodeId);
        }
      });
      if (selectedNodeId === nodeId) set({ selectedNodeId: get().active?.root.id ?? null });
    },

    moveNode: (nodeId, direction) => {
      editActive((draft) => {
        const hit = findNode(draft.root, nodeId);
        if (!hit?.parent) return;
        const siblings = hit.parent.children;
        const index = siblings.findIndex((c) => c.id === nodeId);
        const target = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= siblings.length) return;
        [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
      });
    },

    updateSketchMeta: (patch) => {
      editActive((draft) => {
        if (patch.name !== undefined) draft.name = patch.name;
        if (patch.blueprintRef !== undefined) draft.blueprintRef = patch.blueprintRef;
      });
    },

    saveNow: async () => {
      const { projectRoot, active, saving } = get();
      if (!projectRoot || !active || saving) return;
      set({ saving: true });
      try {
        await api.saveSketch(projectRoot, active);
        set({ dirty: false, lastError: null });
        // Keep the list's names/refs in sync (cheap; list is small).
        await get().refresh();
      } catch (e) {
        set({ lastError: String(e) });
      } finally {
        set({ saving: false });
      }
    },
  };
});
