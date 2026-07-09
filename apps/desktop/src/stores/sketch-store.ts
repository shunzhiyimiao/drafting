import { create } from "zustand";
import {
  ensurePersistentIds,
  parseSketchMarkup,
  printSketchMarkup,
  MarkupError,
  type Container,
  type ListP,
  type ParsedSketch,
  type Range,
  type Sketch,
  type SketchNode,
} from "@drafting/sketch-core";
import * as api from "../lib/sketch-api";
import { ulid } from "../lib/ulid";

/** Autosave delay. Saves publish FileSaved → the backend regenerates React
 *  (debounced again server-side) and drifts bound criteria — the editor is
 *  just another producer on the v1.5 loop (spec §7). */
const AUTOSAVE_MS = 800;

export type NodeKind = SketchNode["kind"];

/** The A5 write inversion (Rev 4 §7): the TEXT BUFFER is the document.
 *  Typing edits it directly; every structured edit (Inspector, tree ops,
 *  drag drops) routes parse → mutate → canonical print → write-back through
 *  the registered buffer writer, which uses Monaco executeEdits — so ⌘Z is
 *  ONE stack shared with typing. Without a registered buffer (harness,
 *  canvas-only), edits fall back to plain state (still correct, no undo). */
type BufferWriter = (text: string) => void;
type BufferRevealer = (range: Range) => void;

export interface ParseIssue {
  message: string;
  line: number;
  col: number;
}

interface SketchState {
  projectRoot: string | null;
  sketches: api.SketchMeta[];
  /** The open document's text — mirrored from the Monaco buffer. */
  text: string;
  /** Last GOOD parse of `text` (canvas renders this even mid-error). */
  parsed: ParsedSketch | null;
  /** Set while `text` is outside the dialect — structured edits disable. */
  parseError: ParseIssue | null;
  /** Is `text` exactly the canonical print of its own parse? */
  canonical: boolean;
  /** Convenience view of parsed.sketch — what canvas/outline/Inspector read. */
  active: Sketch | null;
  activeFile: string | null;
  selectedNodeId: string | null;
  /** Where the selection came from — guards the sync loop. */
  selectionSource: "canvas" | "text" | null;
  dirty: boolean;
  saving: boolean;
  lastError: string | null;
  /** Transient: a palette item being dragged toward the canvas. */
  paletteDrag: NodeKind | null;
  setPaletteDrag: (kind: NodeKind | null) => void;

  initialize: (projectRoot: string) => Promise<void>;
  refresh: () => Promise<void>;
  createSketch: (name: string, blueprintRef: string | null) => Promise<void>;
  openSketch: (sketchId: string) => Promise<void>;
  deleteSketchById: (sketchId: string) => Promise<void>;
  closeSketch: () => Promise<void>;
  selectNode: (nodeId: string | null, source?: "canvas" | "text") => void;
  /** Text panel wiring: Monaco registers its write/reveal surface. */
  registerBuffer: (writer: BufferWriter, revealer: BufferRevealer) => () => void;
  /** Monaco onChange → the document changed (typed or programmatic). */
  setTextFromBuffer: (text: string) => void;
  /** Format = canonical print (a no-op when already canonical). */
  format: () => void;

  /** Structured edits — ALL route through the text buffer (single undo). */
  applyTreeEdit: (mutate: (draft: Sketch) => void, keepSelection?: string | null) => void;
  addNode: (parentId: string, kind: NodeKind) => void;
  updateNode: (nodeId: string, mutate: (node: SketchNode) => void) => void;
  deleteNode: (nodeId: string) => void;
  moveNode: (nodeId: string, direction: "up" | "down") => void;
  insertNodeAt: (containerId: string, index: number, kind: NodeKind) => void;
  moveNodeTo: (nodeId: string, containerId: string, index: number) => void;
  insertNodeBeside: (targetId: string, side: "before" | "after", direction: "row" | "col", kind: NodeKind) => void;
  moveNodeBeside: (nodeId: string, targetId: string, side: "before" | "after", direction: "row" | "col") => void;
  wrapInStack: (nodeId: string) => void;
  updateSketchMeta: (patch: { name?: string; blueprintRef?: string | null }) => void;
  /** persist-on-need case (a): give a node a durable sk:id and FLUSH the
   *  save, so the criterion marker (blueprint domain) never references an
   *  id the sketch file doesn't hold yet (§6 write order). */
  persistNodeIdForBinding: (nodeId: string) => Promise<string | null>;

  saveNow: () => Promise<void>;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let bufferWriter: BufferWriter | null = null;
let bufferRevealer: BufferRevealer | null = null;

/** Find a node and its parent container in the tree. A list's template
 *  reports a null parent — it is the list's required single root. */
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

/** The list whose template subtree contains `nodeId`. */
export function findEnclosingList(root: SketchNode, nodeId: string): ListP | null {
  if (root.kind === "stack") {
    for (const child of root.children) {
      const hit = findEnclosingList(child, nodeId);
      if (hit) return hit;
    }
    return null;
  }
  if (root.kind === "list") {
    const inner = findEnclosingList(root.template, nodeId);
    if (inner) return inner;
    return findNode(root.template, nodeId) ? root : null;
  }
  return null;
}

/** Tree path (child indices; -1 = descend into a list template) — node
 *  identity across a reprint, where session-temp ids get reassigned. */
function pathOfNode(root: SketchNode, nodeId: string, path: number[] = []): number[] | null {
  if (root.id === nodeId) return path;
  if (root.kind === "stack") {
    for (let i = 0; i < root.children.length; i++) {
      const hit = pathOfNode(root.children[i], nodeId, [...path, i]);
      if (hit) return hit;
    }
  }
  if (root.kind === "list") {
    return pathOfNode(root.template, nodeId, [...path, -1]);
  }
  return null;
}

function nodeAtPath(root: SketchNode, path: number[]): SketchNode | null {
  let cur: SketchNode = root;
  for (const step of path) {
    if (step === -1) {
      if (cur.kind !== "list") return null;
      cur = cur.template;
    } else {
      if (cur.kind !== "stack" || step >= cur.children.length) return null;
      cur = cur.children[step];
    }
  }
  return cur;
}

/** Innermost node whose source range contains `offset` — cursor→canvas sync. */
export function nodeAtOffset(parsed: ParsedSketch, offset: number): string | null {
  let best: { id: string; size: number } | null = null;
  for (const [id, r] of Object.entries(parsed.ranges)) {
    if (offset >= r.start && offset <= r.end) {
      const size = r.end - r.start;
      if (!best || size < best.size) best = { id, size };
    }
  }
  return best?.id ?? null;
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
      };
    case "text":
      return { kind: "text", id, role: "body", content: "Text", sizing: { width: hug, height: hug } };
    case "button":
      return {
        kind: "button",
        id,
        label: "Button",
        variant: "primary",
        intent: { kind: "none" },
        sizing: { width: hug, height: hug },
      };
    case "input":
      return { kind: "input", id, label: "Label", type: "text", sizing: { width: fill, height: hug } };
    case "image":
      return {
        kind: "image",
        id,
        src: "/image.png",
        alt: "image",
        sizing: { width: { mode: "fixed", px: 96 }, height: { mode: "fixed", px: 96 } },
      };
    case "list":
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
            { kind: "text", id: ulid(), role: "body", content: { bind: "title" }, sizing: { width: fill, height: hug } },
          ],
        },
        sizing: { width: fill, height: hug },
      };
  }
}

/** A wrapper stack for wrap ops (side-drop + explicit Wrap in Stack). */
function makeWrapper(direction: "row" | "col", sizing: SketchNode["sizing"]): Container {
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

function issueOf(e: unknown): ParseIssue {
  if (e instanceof MarkupError) return { message: e.message, line: e.line, col: e.col };
  return { message: String(e), line: 1, col: 1 };
}

export const useSketchStore = create<SketchState>((set, get) => {
  const scheduleAutosave = () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      void get().saveNow();
    }, AUTOSAVE_MS);
  };

  /** Ingest new document text: reparse, derive views, schedule autosave. */
  const ingestText = (text: string, markDirty: boolean) => {
    try {
      const parsed = parseSketchMarkup(text);
      set({
        text,
        parsed,
        active: parsed.sketch,
        parseError: null,
        canonical: printSketchMarkup(parsed.sketch) === text,
        ...(markDirty ? { dirty: true } : {}),
      });
    } catch (e) {
      // Keep the last good tree on screen; name the error precisely.
      set({ text, parseError: issueOf(e), canonical: false, ...(markDirty ? { dirty: true } : {}) });
    }
    if (markDirty) scheduleAutosave();
  };

  /** Write new text into the document through the Monaco buffer when wired
   *  (single undo stack); fall back to plain state otherwise. */
  const writeText = (text: string) => {
    if (bufferWriter) {
      bufferWriter(text); // Monaco onChange → setTextFromBuffer → ingest
    } else {
      ingestText(text, true);
    }
  };

  return {
    projectRoot: null,
    sketches: [],
    text: "",
    parsed: null,
    parseError: null,
    canonical: false,
    active: null,
    activeFile: null,
    selectedNodeId: null,
    selectionSource: null,
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
        let text = await api.readSketchText(projectRoot, meta.file);
        let dirty = false;
        // Entity heal on open: a hand-written document without sk:id gets
        // its durable id here and the autosave writes it back.
        try {
          const probe = parseSketchMarkup(text);
          if (probe.sketch.id === "") {
            text = printSketchMarkup({ ...probe.sketch, id: ulid() });
            dirty = true;
          }
        } catch {
          // Unparsable on open: show the text, let the markers speak.
        }
        set({ activeFile: meta.file, selectedNodeId: null, selectionSource: null });
        ingestText(text, dirty);
        const root = get().parsed?.sketch.root;
        if (root) set({ selectedNodeId: root.id });
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
          set({
            active: null,
            activeFile: null,
            parsed: null,
            text: "",
            parseError: null,
            selectedNodeId: null,
            dirty: false,
          });
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
      set({
        active: null,
        activeFile: null,
        parsed: null,
        text: "",
        parseError: null,
        selectedNodeId: null,
        selectionSource: null,
      });
    },

    selectNode: (nodeId, source = "canvas") => {
      set({ selectedNodeId: nodeId, selectionSource: source });
      // Canvas/outline selections reveal the node's text — the other half
      // (text cursor → canvas) lives in the text panel. Source guards loops.
      if (source === "canvas" && nodeId) {
        const range = get().parsed?.ranges[nodeId];
        if (range && bufferRevealer) bufferRevealer(range);
      }
    },

    registerBuffer: (writer, revealer) => {
      bufferWriter = writer;
      bufferRevealer = revealer;
      return () => {
        if (bufferWriter === writer) bufferWriter = null;
        if (bufferRevealer === revealer) bufferRevealer = null;
      };
    },

    setTextFromBuffer: (text) => {
      if (text === get().text) return;
      ingestText(text, true);
    },

    format: () => {
      const { parsed, parseError } = get();
      if (!parsed || parseError) return;
      const canon = printSketchMarkup(parsed.sketch);
      if (canon !== get().text) writeText(canon);
    },

    applyTreeEdit: (mutate, keepSelection) => {
      const { parsed, parseError, selectedNodeId } = get();
      // Never edit a stale tree over live text: while the document is
      // outside the dialect, structured editing is disabled.
      if (!parsed || parseError) return;
      const draft = structuredClone(parsed.sketch);
      mutate(draft);
      const ensured = ensurePersistentIds(draft, ulid).sketch;

      // Selection identity across the reprint (temp ids reassign by doc
      // order): resolve the kept node's PATH in the mutated tree, then look
      // it up again after reparse.
      const keepId = keepSelection !== undefined ? keepSelection : selectedNodeId;
      const keepPath = keepId ? pathOfNode(ensured.root, keepId) : null;

      writeText(printSketchMarkup(ensured));

      const after = get().parsed;
      if (after && keepPath) {
        const node = nodeAtPath(after.sketch.root, keepPath);
        set({ selectedNodeId: node?.id ?? after.sketch.root.id, selectionSource: null });
      }
    },

    addNode: (parentId, kind) => {
      const child = defaultNode(kind);
      get().applyTreeEdit((draft) => {
        const hit = findNode(draft.root, parentId);
        const target = hit?.node.kind === "stack" ? hit.node : (hit?.parent ?? null);
        if (target) target.children.push(child);
      }, child.id);
    },

    updateNode: (nodeId, mutate) => {
      get().applyTreeEdit((draft) => {
        const hit = findNode(draft.root, nodeId);
        if (hit) mutate(hit.node);
      });
    },

    deleteNode: (nodeId) => {
      const { active } = get();
      if (!active || active.root.id === nodeId) return; // never delete the root
      get().applyTreeEdit((draft) => {
        const hit = findNode(draft.root, nodeId);
        if (hit?.parent) {
          hit.parent.children = hit.parent.children.filter((c) => c.id !== nodeId);
        }
      }, null);
    },

    moveNode: (nodeId, direction) => {
      get().applyTreeEdit((draft) => {
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
      get().applyTreeEdit((draft) => {
        const hit = findNode(draft.root, containerId);
        if (hit?.node.kind !== "stack") return;
        const at = Math.max(0, Math.min(index, hit.node.children.length));
        hit.node.children.splice(at, 0, child);
      }, child.id);
    },

    moveNodeTo: (nodeId, containerId, index) => {
      const { active } = get();
      if (!active) return;
      const dragged = findNode(active.root, nodeId);
      if (!dragged?.parent) return; // root and template roots are locked
      if (allNodeIds(dragged.node).includes(containerId)) return; // no self-nesting
      const target = findNode(active.root, containerId);
      if (target?.node.kind !== "stack") return;
      const from = dragged.parent.children.findIndex((c) => c.id === nodeId);
      const sameParent = dragged.parent.id === containerId;
      const clamped = Math.max(0, Math.min(index, target.node.children.length));
      const adjusted = sameParent && from < clamped ? clamped - 1 : clamped;
      if (sameParent && adjusted === from) return; // same-place drop: no churn

      get().applyTreeEdit((draft) => {
        const d = findNode(draft.root, nodeId);
        const t = findNode(draft.root, containerId);
        if (!d?.parent || t?.node.kind !== "stack") return;
        const i = d.parent.children.findIndex((c) => c.id === nodeId);
        d.parent.children.splice(i, 1);
        t.node.children.splice(adjusted, 0, d.node);
      }, nodeId);
    },

    insertNodeBeside: (targetId, side, direction, kind) => {
      const child = defaultNode(kind);
      get().applyTreeEdit((draft) => {
        const hit = findNode(draft.root, targetId);
        if (!hit?.parent) return;
        const i = hit.parent.children.findIndex((c) => c.id === targetId);
        const wrapper = makeWrapper(direction, hit.node.sizing);
        wrapper.children = side === "before" ? [child, hit.node] : [hit.node, child];
        hit.parent.children[i] = wrapper;
      }, child.id);
    },

    moveNodeBeside: (nodeId, targetId, side, direction) => {
      const { active } = get();
      if (!active || nodeId === targetId) return;
      const dragged = findNode(active.root, nodeId);
      if (!dragged?.parent) return;
      if (allNodeIds(dragged.node).includes(targetId)) return;
      const target = findNode(active.root, targetId);
      if (!target?.parent) return;

      get().applyTreeEdit((draft) => {
        const d = findNode(draft.root, nodeId);
        if (!d?.parent) return;
        d.parent.children = d.parent.children.filter((c) => c.id !== nodeId);
        const t = findNode(draft.root, targetId);
        if (!t?.parent) return;
        const i = t.parent.children.findIndex((c) => c.id === targetId);
        const wrapper = makeWrapper(direction, t.node.sizing);
        wrapper.children = side === "before" ? [d.node, t.node] : [t.node, d.node];
        t.parent.children[i] = wrapper;
      }, nodeId);
    },

    wrapInStack: (nodeId) => {
      const { active } = get();
      if (!active) return;
      const check = findNode(active.root, nodeId);
      if (!check?.parent) return;
      const wrapper = makeWrapper("col", check.node.sizing);
      get().applyTreeEdit((draft) => {
        const hit = findNode(draft.root, nodeId);
        if (!hit?.parent) return;
        const i = hit.parent.children.findIndex((c) => c.id === nodeId);
        wrapper.children = [hit.node];
        hit.parent.children[i] = wrapper;
      }, wrapper.id);
    },

    updateSketchMeta: (patch) => {
      get().applyTreeEdit((draft) => {
        if (patch.name !== undefined) draft.name = patch.name;
        if (patch.blueprintRef !== undefined) draft.blueprintRef = patch.blueprintRef;
      });
    },

    persistNodeIdForBinding: async (nodeId) => {
      const { parsed, parseError } = get();
      if (!parsed || parseError) return null;
      const hit = findNode(parsed.sketch.root, nodeId);
      if (!hit) return null;
      let id = hit.node.id;
      if (id.startsWith("~") || id === "") {
        id = ulid();
        get().applyTreeEdit((draft) => {
          const d = findNode(draft.root, nodeId);
          if (d) d.node.id = id;
        }, null);
        set({ selectedNodeId: id, selectionSource: null });
      }
      // Flush: the criterion marker must never point at an id the sketch
      // file doesn't hold yet (§6 — sketch domain persists first).
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      await get().saveNow();
      return id;
    },

    saveNow: async () => {
      const { projectRoot, activeFile, text, saving } = get();
      if (!projectRoot || !activeFile || saving) return;
      set({ saving: true });
      try {
        // The text IS the document — saved as typed, canonical or not.
        // (An out-of-dialect save degrades loudly downstream: scan names
        // the file, codegen logs it; nothing silently drops.)
        await api.saveSketchText(projectRoot, activeFile, text);
        set({ dirty: false, lastError: null });
        await get().refresh();
      } catch (e) {
        set({ lastError: String(e) });
      } finally {
        set({ saving: false });
      }
    },
  };
});
