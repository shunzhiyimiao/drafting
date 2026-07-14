import { create } from "zustand";
import {
  ensurePersistentIds,
  parseSketchMarkup,
  printSketchMarkup,
  MarkupError,
  type Container,
  type FrameP,
  type ListP,
  type ParsedSketch,
  type Pos,
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

/** The Monaco surface the text panel registers (S2a widens the old
 *  writer/revealer pair): undo/redo let the designer toolbar drive the ONE
 *  shared stack without owning the editor. */
export interface BufferHandle {
  write: BufferWriter;
  reveal: BufferRevealer;
  undo: () => void;
  redo: () => void;
}

export interface ParseIssue {
  message: string;
  line: number;
  col: number;
}

/** One open document's stashed state (S2b multi-tab). The store's top-level
 *  fields always mirror the ACTIVE document — every consumer keeps reading
 *  them unchanged; switching tabs = flush → stash → restore. Monaco keeps a
 *  model (and its own undo stack) per file via the `path` prop. */
export interface OpenDoc {
  file: string;
  sketchId: string;
  name: string;
  text: string;
  parsed: ParsedSketch | null;
  parseError: ParseIssue | null;
  canonical: boolean;
  dirty: boolean;
  selectedNodeId: string | null;
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
  /** All open documents (the active one's entry is refreshed on stash). */
  openDocs: OpenDoc[];
  selectedNodeId: string | null;
  /** Where the selection came from — guards the sync loop. */
  selectionSource: "canvas" | "text" | null;
  dirty: boolean;
  saving: boolean;
  lastError: string | null;
  /** Transient one-shot ARM: a palette press that may become a drag. The
   *  canvas's session controller consumes it on that pointer's first move
   *  (S1) — carrying the pointerId is what makes stale arms impossible to
   *  misattribute to a later gesture. Interaction state proper (the drag
   *  session) lives in the interaction controller, not here. */
  paletteDrag: { kind: NodeKind; pointerId: number } | null;
  setPaletteDrag: (arm: { kind: NodeKind; pointerId: number } | null) => void;

  initialize: (projectRoot: string) => Promise<void>;
  refresh: () => Promise<void>;
  createSketch: (name: string, blueprintRef: string | null) => Promise<void>;
  /** Sketch Lite 的落点。`build` 拿到最终文档的 sk:id — 生成器据此重印,
   *  保证文本身份与索引一致。mode "new-doc"(默认)新建 sketch 文件并写入;
   *  创建失败时抛错,绝不覆盖当前文档。"replace-active"(harness/无 Tauri)
   *  直接替换活动文档(一步撤销)。 */
  generateFromLite: (
    name: string,
    build: (sketchId: string) => string,
    mode?: "new-doc" | "replace-active",
  ) => Promise<void>;
  openSketch: (sketchId: string) => Promise<void>;
  deleteSketchById: (sketchId: string) => Promise<void>;
  /** Back to the list screen — open tabs stay alive (S2b). */
  closeSketch: () => Promise<void>;
  /** Close one tab (flushes if dirty); active falls to a neighbor. */
  closeDoc: (file: string) => Promise<void>;
  /** Switch to an already-open tab (flush → stash → restore). */
  switchDoc: (file: string) => Promise<void>;
  selectNode: (nodeId: string | null, source?: "canvas" | "text") => void;
  /** Text panel wiring: Monaco registers its buffer surface. */
  registerBuffer: (handle: BufferHandle) => () => void;
  /** Designer toolbar → the shared Monaco undo stack. */
  undoBuffer: () => void;
  redoBuffer: () => void;
  /** Designer viewport (visual only — K1 untouched): sheet width preset and
   *  canvas zoom. Geometry divides by zoom, so drop math is zoom-proof. */
  canvasWidth: number;
  zoom: number;
  setCanvasWidth: (px: number) => void;
  setZoom: (z: number) => void;
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
  /** `pos` (Rev 5): the drop point in the target FRAME's local coords —
   *  ignored for stack targets. Frame inserts append (z-top). */
  insertNodeAt: (containerId: string, index: number, kind: NodeKind, pos?: Pos) => void;
  moveNodeTo: (nodeId: string, containerId: string, index: number, pos?: Pos) => void;
  /** Wrap ops return the new wrapper's id (the post-wrap hint anchors to
   *  it), or null when the op was refused. `spread` = §7.1 amendment:
   *  wrapper gets main="between" + main-axis fill instead of hugging. */
  insertNodeBeside: (
    targetId: string,
    side: "before" | "after",
    direction: "row" | "col",
    kind: NodeKind,
    spread?: boolean,
  ) => string | null;
  moveNodeBeside: (
    nodeId: string,
    targetId: string,
    side: "before" | "after",
    direction: "row" | "col",
    spread?: boolean,
  ) => string | null;
  wrapInStack: (nodeId: string) => void;
  /** Magic Frame (Phase 2): wrap SEVERAL nodes in ONE new panel under their
   *  nearest common ancestor, at the first member's slot, document order
   *  preserved — one applyTreeEdit = one undo unit. Returns the wrapper id
   *  (selection lands on it), or null when the set is refused. */
  wrapNodesInPanel: (nodeIds: string[]) => string | null;
  updateSketchMeta: (patch: { name?: string; blueprintRef?: string | null }) => void;
  /** persist-on-need case (a): give a node a durable sk:id and FLUSH the
   *  save, so the criterion marker (blueprint domain) never references an
   *  id the sketch file doesn't hold yet (§6 write order). */
  persistNodeIdForBinding: (nodeId: string) => Promise<string | null>;

  saveNow: () => Promise<void>;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let buffer: BufferHandle | null = null;

/** Find a node and its parent container in the tree. A list's template
 *  reports a null parent — it is the list's required single root. */
export function findNode(
  root: SketchNode,
  nodeId: string,
  parent: Container | FrameP | null = null,
): { node: SketchNode; parent: Container | FrameP | null } | null {
  if (root.id === nodeId) return { node: root, parent };
  if (root.kind === "stack" || root.kind === "frame") {
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
  if (root.kind === "stack" || root.kind === "frame") {
    for (const child of root.children) allNodeIds(child, out);
  }
  if (root.kind === "list") allNodeIds(root.template, out);
  return out;
}

/** Every node id INSIDE a list template (the template root and below) —
 *  the Magic Frame never reaches into these; the list wraps as a whole. */
export function templateInteriorIds(root: SketchNode, out = new Set<string>()): Set<string> {
  if (root.kind === "stack" || root.kind === "frame") {
    for (const child of root.children) templateInteriorIds(child, out);
  }
  if (root.kind === "list") {
    for (const id of allNodeIds(root.template)) out.add(id);
  }
  return out;
}

/** The list whose template subtree contains `nodeId`. */
export function findEnclosingList(root: SketchNode, nodeId: string): ListP | null {
  if (root.kind === "stack" || root.kind === "frame") {
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
  if (root.kind === "stack" || root.kind === "frame") {
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
      if ((cur.kind !== "stack" && cur.kind !== "frame") || step >= cur.children.length) return null;
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

/** The palette's default node per kind — exported since S3 so the drag
 *  preview can render the exact node a palette drop would insert. */
export function defaultNode(kind: NodeKind): SketchNode {
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
    case "frame":
      // The positioned region (Rev 5): fill × fixed-200 — hug is illegal
      // (absolute children give a frame no intrinsic size).
      return {
        kind: "frame",
        id,
        sizing: { width: fill, height: { mode: "fixed", px: 200 } },
        children: [],
        style: { bg: "raised", radius: "md" },
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

/** Entering a frame: a node takes a position (rounded) and sheds fill
 *  sizing (fill has no meaning at a point — validate would reject it).
 *  Leaving a frame is the mirror: the position is deleted. */
function placeInFrame(node: SketchNode, pos: Pos | undefined) {
  node.pos = pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : { x: 8, y: 8 };
  if (node.sizing.width.mode === "fill") node.sizing.width = { mode: "hug" };
  if (node.sizing.height.mode === "fill") node.sizing.height = { mode: "hug" };
}

/** A wrapper stack for wrap ops (side-drop + explicit Wrap in Stack).
 *
 *  `spread` (§7.1 amendment): a flank-strip drop means "apart, over there" —
 *  the wrapper fills its main axis and distributes `between`, so the dragged
 *  node lands at the far side the pointer named. Snuggle wraps (pointing at
 *  the leaf itself) keep the target's own sizing and hug together. */
function makeWrapper(
  direction: "row" | "col",
  sizing: SketchNode["sizing"],
  spread = false,
): Container {
  const inherited = structuredClone(sizing);
  return {
    kind: "stack",
    id: ulid(),
    layout: {
      direction,
      gap: 2,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      mainAxis: spread ? "between" : "start",
      crossAxis: direction === "row" ? "center" : "stretch",
    },
    sizing: spread
      ? direction === "row"
        ? { width: { mode: "fill" }, height: inherited.height }
        : { width: inherited.width, height: { mode: "fill" } }
      : inherited,
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
    if (buffer) {
      buffer.write(text); // Monaco onChange → setTextFromBuffer → ingest
    } else {
      ingestText(text, true);
    }
  };

  /** Upsert the active document's snapshot into openDocs (tab order kept). */
  const stashActive = () => {
    const s = get();
    if (!s.activeFile) return;
    const doc: OpenDoc = {
      file: s.activeFile,
      sketchId: s.active?.id ?? "",
      name: s.active?.name ?? s.activeFile,
      text: s.text,
      parsed: s.parsed,
      parseError: s.parseError,
      canonical: s.canonical,
      dirty: s.dirty,
      selectedNodeId: s.selectedNodeId,
    };
    const exists = s.openDocs.some((d) => d.file === doc.file);
    set({
      openDocs: exists
        ? s.openDocs.map((d) => (d.file === doc.file ? doc : d))
        : [...s.openDocs, doc],
    });
  };

  const restoreDoc = (doc: OpenDoc) => {
    set({
      activeFile: doc.file,
      text: doc.text,
      parsed: doc.parsed,
      parseError: doc.parseError,
      canonical: doc.canonical,
      dirty: doc.dirty,
      active: doc.parsed?.sketch ?? null,
      selectedNodeId: doc.selectedNodeId,
      selectionSource: null,
    });
  };

  /** Flush the active document (pending autosave included) before any tab
   *  transition — stashed documents are therefore never dirty. */
  const flushActive = async () => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    if (get().dirty) {
      await get().saveNow();
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
    openDocs: [],
    selectedNodeId: null,
    selectionSource: null,
    dirty: false,
    saving: false,
    lastError: null,
    paletteDrag: null,
    setPaletteDrag: (arm) => set({ paletteDrag: arm }),

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

    generateFromLite: async (name, build, mode = "new-doc") => {
      if (mode === "new-doc") {
        const prevFile = get().activeFile;
        await get().createSketch(name, null); // creates + opens the new doc
        const created = get().activeFile !== prevFile && get().active;
        if (!created) {
          // Never clobber the current doc on a failed creation — loudly.
          throw new Error(get().lastError ?? "创建 sketch 失败");
        }
      }
      const id = get().active?.id;
      if (!id) throw new Error("没有可写入的活动文档");
      writeText(build(id)); // one undo unit; autosave takes it from here
      const root = get().parsed?.sketch.root;
      if (root) set({ selectedNodeId: root.id });
    },

    openSketch: async (sketchId) => {
      const { projectRoot, sketches, openDocs, activeFile } = get();
      if (!projectRoot) return;
      const meta = sketches.find((m) => m.id === sketchId);
      if (!meta) {
        set({ lastError: `sketch ${sketchId} not in the list — refresh?` });
        return;
      }
      if (meta.file === activeFile) return;
      // Already open in a background tab → just switch.
      if (openDocs.some((d) => d.file === meta.file)) {
        await get().switchDoc(meta.file);
        return;
      }
      try {
        // The current tab survives: flush + stash before loading the new one.
        await flushActive();
        stashActive();
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
        stashActive(); // register the new tab
      } catch (e) {
        set({ lastError: String(e) });
      }
    },

    switchDoc: async (file) => {
      const s = get();
      if (file === s.activeFile) return;
      const target = s.openDocs.find((d) => d.file === file);
      if (!target) return;
      await flushActive();
      stashActive();
      // Re-read the target from openDocs (stashActive may have rewritten it).
      const doc = get().openDocs.find((d) => d.file === file);
      if (doc) restoreDoc(doc);
    },

    closeDoc: async (file) => {
      const s = get();
      const isActive = s.activeFile === file;
      if (isActive) {
        await flushActive();
      }
      const remaining = get().openDocs.filter((d) => d.file !== file);
      set({ openDocs: remaining });
      if (!isActive) return;
      const neighbor = remaining[remaining.length - 1] ?? null;
      if (neighbor) {
        restoreDoc(neighbor);
      } else {
        set({
          active: null,
          activeFile: null,
          parsed: null,
          text: "",
          parseError: null,
          canonical: false,
          selectedNodeId: null,
          selectionSource: null,
          dirty: false,
        });
      }
    },

    deleteSketchById: async (sketchId) => {
      const { projectRoot, active } = get();
      if (!projectRoot) return;
      try {
        await api.deleteSketch(projectRoot, sketchId);
        // Drop any tab holding it (active or background).
        const doomed = get().openDocs.find((d) => d.sketchId === sketchId);
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
            canonical: false,
            selectedNodeId: null,
            dirty: false,
          });
        }
        if (doomed) {
          set({ openDocs: get().openDocs.filter((d) => d.file !== doomed.file) });
        }
        set({ lastError: null });
        await get().refresh();
      } catch (e) {
        set({ lastError: String(e) });
      }
    },

    closeSketch: async () => {
      // Back to the list screen; open tabs stay alive (S2b).
      await flushActive();
      stashActive();
      set({
        active: null,
        activeFile: null,
        parsed: null,
        text: "",
        parseError: null,
        canonical: false,
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
        if (range && buffer) buffer.reveal(range);
      }
    },

    registerBuffer: (handle) => {
      buffer = handle;
      return () => {
        if (buffer === handle) buffer = null;
      };
    },

    undoBuffer: () => buffer?.undo(),
    redoBuffer: () => buffer?.redo(),

    canvasWidth: 768,
    zoom: 1,
    setCanvasWidth: (px) => set({ canvasWidth: px }),
    setZoom: (z) => set({ zoom: Math.min(2, Math.max(0.25, z)) }),

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
        const target =
          hit?.node.kind === "stack" || hit?.node.kind === "frame"
            ? hit.node
            : (hit?.parent ?? null);
        if (!target) return;
        if (target.kind === "frame") placeInFrame(child, undefined);
        target.children.push(child);
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

    insertNodeAt: (containerId, index, kind, pos) => {
      const child = defaultNode(kind);
      get().applyTreeEdit((draft) => {
        const hit = findNode(draft.root, containerId);
        if (hit?.node.kind === "frame") {
          // Positioned insert: order is z-order — new arrivals paint on top.
          placeInFrame(child, pos);
          hit.node.children.push(child);
          return;
        }
        if (hit?.node.kind !== "stack") return;
        const at = Math.max(0, Math.min(index, hit.node.children.length));
        hit.node.children.splice(at, 0, child);
      }, child.id);
    },

    moveNodeTo: (nodeId, containerId, index, pos) => {
      const { active } = get();
      if (!active) return;
      const dragged = findNode(active.root, nodeId);
      if (!dragged?.parent) return; // root and template roots are locked
      if (allNodeIds(dragged.node).includes(containerId)) return; // no self-nesting
      const target = findNode(active.root, containerId);
      if (target?.node.kind === "frame") {
        get().applyTreeEdit((draft) => {
          const d = findNode(draft.root, nodeId);
          const t = findNode(draft.root, containerId);
          if (!d?.parent || t?.node.kind !== "frame") return;
          d.parent.children = d.parent.children.filter((c) => c.id !== nodeId);
          placeInFrame(d.node, pos);
          t.node.children.push(d.node); // append = paint on top
        }, nodeId);
        return;
      }
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
        delete d.node.pos; // leaving a frame: flow children carry no position
        t.node.children.splice(adjusted, 0, d.node);
      }, nodeId);
    },

    insertNodeBeside: (targetId, side, direction, kind, spread = false) => {
      const child = defaultNode(kind);
      const wrapper = makeWrapper(direction, { width: { mode: "hug" }, height: { mode: "hug" } }, spread);
      get().applyTreeEdit((draft) => {
        const hit = findNode(draft.root, targetId);
        if (!hit?.parent) return;
        const i = hit.parent.children.findIndex((c) => c.id === targetId);
        if (!spread) wrapper.sizing = structuredClone(hit.node.sizing);
        wrapper.children = side === "before" ? [child, hit.node] : [hit.node, child];
        hit.parent.children[i] = wrapper;
      }, child.id);
      return wrapper.id;
    },

    moveNodeBeside: (nodeId, targetId, side, direction, spread = false) => {
      const { active } = get();
      if (!active || nodeId === targetId) return null;
      const dragged = findNode(active.root, nodeId);
      if (!dragged?.parent) return null;
      if (allNodeIds(dragged.node).includes(targetId)) return null;
      const target = findNode(active.root, targetId);
      if (!target?.parent) return null;

      const wrapper = makeWrapper(direction, structuredClone(target.node.sizing), spread);
      get().applyTreeEdit((draft) => {
        const d = findNode(draft.root, nodeId);
        if (!d?.parent) return;
        d.parent.children = d.parent.children.filter((c) => c.id !== nodeId);
        const t = findNode(draft.root, targetId);
        if (!t?.parent) return;
        const i = t.parent.children.findIndex((c) => c.id === targetId);
        wrapper.children = side === "before" ? [d.node, t.node] : [t.node, d.node];
        t.parent.children[i] = wrapper;
      }, nodeId);
      return wrapper.id;
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
        if (hit.node.pos) {
          // A frame child hands its position to the wrapper it enters.
          wrapper.pos = hit.node.pos;
          delete hit.node.pos;
        }
        hit.parent.children[i] = wrapper;
      }, wrapper.id);
    },

    wrapNodesInPanel: (nodeIds) => {
      const { active } = get();
      if (!active || nodeIds.length === 0) return null;

      // Paths up front: reject the root, template interiors, and missing
      // nodes; drop members that sit INSIDE another member (outermost wins).
      const paths = new Map<string, number[]>();
      for (const id of nodeIds) {
        const p = pathOfNode(active.root, id);
        if (!p || p.length === 0 || p.includes(-1)) return null;
        paths.set(id, p);
      }
      const isPrefix = (a: number[], b: number[]) =>
        a.length < b.length && a.every((v, i) => b[i] === v);
      const members = nodeIds.filter((id) => {
        const p = paths.get(id)!;
        return !nodeIds.some((other) => other !== id && isPrefix(paths.get(other)!, p));
      });
      if (members.length === 0) return null;

      // Document order + the nearest common ancestor of the member set.
      members.sort((a, b) => {
        const pa = paths.get(a)!;
        const pb = paths.get(b)!;
        for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
          if (pa[i] !== pb[i]) return pa[i] - pb[i];
        }
        return pa.length - pb.length;
      });
      let prefix = paths.get(members[0])!.slice(0, -1);
      for (const id of members.slice(1)) {
        const p = paths.get(id)!;
        let i = 0;
        while (i < prefix.length && i < p.length - 1 && prefix[i] === p[i]) i++;
        prefix = prefix.slice(0, i);
      }
      const anchorIndex = paths.get(members[0])![prefix.length];

      const wrapper = makeWrapper("col", { width: { mode: "fill" }, height: { mode: "hug" } });
      wrapper.layout.gap = 2;
      wrapper.layout.padding = { top: 2, right: 2, bottom: 2, left: 2 };

      get().applyTreeEdit((draft) => {
        const nca = nodeAtPath(draft.root, prefix);
        if (!nca || (nca.kind !== "stack" && nca.kind !== "frame")) return;
        const picked: SketchNode[] = [];
        for (const id of members) {
          const hit = findNode(draft.root, id);
          if (!hit?.parent) return; // vanished mid-gesture — refuse whole wrap
          picked.push(hit.node);
        }
        // Entering a frame? The wrapper takes the first member's position.
        if (nca.kind === "frame") {
          placeInFrame(wrapper, picked[0].pos);
        }
        for (const id of members) {
          const hit = findNode(draft.root, id)!;
          hit.parent!.children = hit.parent!.children.filter((c) => c.id !== id);
        }
        for (const n of picked) {
          delete n.pos; // members are flow children of the panel now
        }
        wrapper.children = picked;
        const at = Math.max(0, Math.min(anchorIndex, nca.children.length));
        nca.children.splice(at, 0, wrapper);
      }, wrapper.id);
      return wrapper.id;
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
