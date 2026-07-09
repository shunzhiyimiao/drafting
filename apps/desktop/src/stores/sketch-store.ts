import { create } from "zustand";
import {
  ensurePersistentIds,
  parseSketchMarkup,
  printSketchMarkup,
  type ButtonP,
  type Container,
  type ImageP,
  type InputP,
  type ListP,
  type Sizing,
  type Sketch,
  type SketchNode,
  type TextP,
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
  sketches: api.SketchMeta[];
  active: Sketch | null;
  /** The open sketch's project-relative `.sketch` file — the document the
   *  tree edits print back into (text-as-truth). */
  activeFile: string | null;
  selectedNodeId: string | null;
  dirty: boolean;
  saving: boolean;
  lastError: string | null;
  /** Transient: a palette item being dragged toward the canvas (never
   *  persisted). The palette arms it on pointerdown; the canvas's drag
   *  controller consumes it. */
  paletteDrag: NodeKind | null;
  setPaletteDrag: (kind: NodeKind | null) => void;

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
  /** Drag ops (§7.1) — drags only EXPRESS these; nothing is inferred. */
  insertNodeAt: (containerId: string, index: number, kind: NodeKind) => void;
  moveNodeTo: (nodeId: string, containerId: string, index: number) => void;
  /** Side-drop (§7.1 amendment): wrap a leaf and the dropped node in ONE
   *  perpendicular stack — the bounded, pointer-decided structure creation. */
  insertNodeBeside: (targetId: string, side: "before" | "after", direction: "row" | "col", kind: NodeKind) => void;
  moveNodeBeside: (nodeId: string, targetId: string, side: "before" | "after", direction: "row" | "col") => void;
  /** The explicit wrap command — the deliberate cousin of the side-drop. */
  wrapInStack: (nodeId: string) => void;
  updateSketchMeta: (patch: { name?: string; blueprintRef?: string | null }) => void;

  saveNow: () => Promise<void>;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Find a node and its parent container in the tree. A list's template
 *  subtree is traversed too; the template itself reports a null parent —
 *  it is the list's required single root, so it can't be moved or deleted
 *  (its children behave like any container's). */
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
  if (root.kind === "list") {
    return findNode(root.template, nodeId, null);
  }
  return null;
}

export function allNodeIds(root: SketchNode, out: string[] = []): string[] {
  out.push(root.id);
  if (root.kind === "stack") {
    for (const child of root.children) allNodeIds(child, out);
  }
  if (root.kind === "list") allNodeIds(root.template, out);
  return out;
}

/** The list whose template subtree contains `nodeId` (the list node itself
 *  doesn't count) — the Inspector's "can this bind?" question. */
export function findEnclosingList(root: SketchNode, nodeId: string): ListP | null {
  if (root.kind === "stack") {
    for (const child of root.children) {
      const hit = findEnclosingList(child, nodeId);
      if (hit) return hit;
    }
    return null;
  }
  if (root.kind === "list") {
    // Innermost list wins (nested lists are a validate() error, but the
    // Inspector should still point at the nearest shape while it's red).
    const inner = findEnclosingList(root.template, nodeId);
    if (inner) return inner;
    return findNode(root.template, nodeId) ? root : null;
  }
  return null;
}

/** A wrapper stack for wrap ops. It adopts the wrapped slot's sizing so the
 *  layout stays put; lean per-direction defaults: a row centers its unequal
 *  children, a col stretches them (matching every other col default). */
function makeWrapper(direction: "row" | "col", sizing: Sizing): Container {
  return {
    kind: "stack",
    id: ulid(),
    layout: {
      direction,
      gap: 2,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      mainAxis: "start",
      crossAxis: direction === "row" ? "center" : "stretch",
    },
    sizing: structuredClone(sizing),
    children: [],
  };
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
    case "list":
      // A ready-to-run list: keyed shape, one bound text in the template,
      // sample rows so the canvas shows something immediately.
      return {
        kind: "list",
        id,
        dataKey: "items",
        itemShape: [
          { name: "id", type: "string", isKey: true },
          { name: "title", type: "string" },
        ],
        sampleRows: [
          { id: "1", title: "First item" },
          { id: "2", title: "Second item" },
          { id: "3", title: "Third item" },
        ],
        template: {
          kind: "stack",
          id: ulid(),
          layout: {
            direction: "row",
            gap: 2,
            padding: { top: 2, right: 2, bottom: 2, left: 2 },
            mainAxis: "start",
            crossAxis: "center",
          },
          sizing: { width: fill, height: hug },
          children: [
            {
              kind: "text",
              id: ulid(),
              role: "body",
              content: { bind: "title" },
              sizing: { width: fill, height: hug },
            },
          ],
        },
        sizing: { width: fill, height: hug },
      } satisfies ListP;
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
    activeFile: null,
    selectedNodeId: null,
    dirty: false,
    saving: false,
    lastError: null,
    paletteDrag: null,
    setPaletteDrag: (kind) => set({ paletteDrag: kind }),

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
        const meta = await api.createSketch(projectRoot, name, blueprintRef);
        set({ lastError: null });
        await get().refresh();
        await get().openSketch(meta.id);
      } catch (e) {
        set({ lastError: String(e) });
      }
    },

    openSketch: async (sketchId) => {
      const { projectRoot, sketches } = get();
      if (!projectRoot) return;
      const meta = sketches.find((m) => m.id === sketchId);
      if (!meta) {
        set({ lastError: `sketch ${sketchId} not in the list — refresh?` });
        return;
      }
      try {
        // Text-as-truth: read the document, parse locally (sketch-core is
        // the frontend's own dependency — no Spec tree crosses Tauri).
        const text = await api.readSketchText(projectRoot, meta.file);
        const { sketch } = parseSketchMarkup(text);
        // Entity heal moved editor-side: a hand-written file without sk:id
        // gets one on open and the autosave writes it back.
        if (sketch.id === "") {
          sketch.id = ulid();
          set({
            active: sketch,
            activeFile: meta.file,
            selectedNodeId: sketch.root.id,
            dirty: true,
            lastError: null,
          });
          scheduleAutosave();
          return;
        }
        set({
          active: sketch,
          activeFile: meta.file,
          selectedNodeId: sketch.root.id,
          dirty: false,
          lastError: null,
        });
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
          set({ active: null, activeFile: null, selectedNodeId: null, dirty: false });
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
      set({ active: null, activeFile: null, selectedNodeId: null });
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

    insertNodeAt: (containerId, index, kind) => {
      const child = defaultNode(kind);
      let inserted = false;
      editActive((draft) => {
        const hit = findNode(draft.root, containerId);
        if (hit?.node.kind !== "stack") return;
        const at = Math.max(0, Math.min(index, hit.node.children.length));
        hit.node.children.splice(at, 0, child);
        inserted = true;
      });
      if (inserted) set({ selectedNodeId: child.id });
    },

    moveNodeTo: (nodeId, containerId, index) => {
      const { active } = get();
      if (!active) return;
      // Pre-checks on current state so a same-place drop never dirties.
      const hit = findNode(active.root, nodeId);
      if (!hit?.parent) return; // root and template roots are locked
      if (allNodeIds(hit.node).includes(containerId)) return; // no self-nesting
      const target = findNode(active.root, containerId);
      if (target?.node.kind !== "stack") return;
      const from = hit.parent.children.findIndex((c) => c.id === nodeId);
      const sameParent = hit.parent.id === containerId;
      const clamped = Math.max(0, Math.min(index, target.node.children.length));
      const adjusted = sameParent && from < clamped ? clamped - 1 : clamped;
      if (sameParent && adjusted === from) return;

      editActive((draft) => {
        const dHit = findNode(draft.root, nodeId);
        const dTarget = findNode(draft.root, containerId);
        if (!dHit?.parent || dTarget?.node.kind !== "stack") return;
        const i = dHit.parent.children.findIndex((c) => c.id === nodeId);
        dHit.parent.children.splice(i, 1);
        dTarget.node.children.splice(adjusted, 0, dHit.node);
      });
    },

    insertNodeBeside: (targetId, side, direction, kind) => {
      const child = defaultNode(kind);
      let wrapped = false;
      editActive((draft) => {
        const hit = findNode(draft.root, targetId);
        if (!hit?.parent) return; // roots and template roots don't wrap
        const i = hit.parent.children.findIndex((c) => c.id === targetId);
        const wrapper = makeWrapper(direction, hit.node.sizing);
        wrapper.children = side === "before" ? [child, hit.node] : [hit.node, child];
        hit.parent.children[i] = wrapper;
        wrapped = true;
      });
      if (wrapped) set({ selectedNodeId: child.id });
    },

    moveNodeBeside: (nodeId, targetId, side, direction) => {
      const { active } = get();
      if (!active || nodeId === targetId) return;
      const dragged = findNode(active.root, nodeId);
      if (!dragged?.parent) return; // root and template roots don't drag
      if (allNodeIds(dragged.node).includes(targetId)) return; // no self-wrap
      const target = findNode(active.root, targetId);
      if (!target?.parent) return;

      editActive((draft) => {
        const d = findNode(draft.root, nodeId);
        if (!d?.parent) return;
        d.parent.children = d.parent.children.filter((c) => c.id !== nodeId);
        const t = findNode(draft.root, targetId);
        if (!t?.parent) return;
        const i = t.parent.children.findIndex((c) => c.id === targetId);
        const wrapper = makeWrapper(direction, t.node.sizing);
        wrapper.children = side === "before" ? [d.node, t.node] : [t.node, d.node];
        t.parent.children[i] = wrapper;
      });
    },

    wrapInStack: (nodeId) => {
      const { active } = get();
      if (!active) return;
      const check = findNode(active.root, nodeId);
      if (!check?.parent) return; // can't wrap the root or a template root
      let wrapperId: string | null = null;
      editActive((draft) => {
        const hit = findNode(draft.root, nodeId);
        if (!hit?.parent) return;
        const i = hit.parent.children.findIndex((c) => c.id === nodeId);
        // The wrapper adopts the child's sizing so the layout stays put; the
        // child keeps its own (a fill child fills the wrapper).
        const wrapper = makeWrapper("col", hit.node.sizing);
        wrapper.children = [hit.node];
        hit.parent.children[i] = wrapper;
        wrapperId = wrapper.id;
      });
      if (wrapperId) set({ selectedNodeId: wrapperId });
    },

    updateSketchMeta: (patch) => {
      editActive((draft) => {
        if (patch.name !== undefined) draft.name = patch.name;
        if (patch.blueprintRef !== undefined) draft.blueprintRef = patch.blueprintRef;
      });
    },

    saveNow: async () => {
      const { projectRoot, active, activeFile, saving } = get();
      if (!projectRoot || !active || !activeFile || saving) return;
      set({ saving: true });
      try {
        // persist-on-need (Rev 4 §6): the save chokepoint mints sk:id for
        // every node the tree says needs one (intent≠none, template binds).
        // Case (a) — criterion binding — mints at the bind action instead.
        const ensured = ensurePersistentIds(active, ulid);
        if (ensured.minted.length > 0) {
          set({ active: ensured.sketch });
        }
        // Text-as-truth: the document IS the canonical print of the tree.
        const text = printSketchMarkup(ensured.sketch);
        await api.saveSketchText(projectRoot, activeFile, text);
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
