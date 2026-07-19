/**
 * P3.2 拓印 — pasted screenshot → `.sketch` dialect document.
 *
 * The five-ruling frame (2026-07-15, docs §12):
 *   1. NO reconcile here — an initial paste is all-new nodes; identity
 *      continuity belongs to regeneration (O3), a different stage.
 *   2. The AI never mints identity: any sk:id it fabricates is stripped
 *      post-parse (replaced with session-temp ids; persist-on-need mints
 *      real ULIDs later where the tree genuinely requires them).
 *   4. Explicit gesture only (⌘V), never clipboard polling; pixels live in
 *      memory and on the wire only — no disk, no logs. Re-encoding through a
 *      canvas also strips EXIF/metadata before anything leaves the machine.
 *   5. Entry = the webview paste event — verified live 2026-07-17 (P3.0
 *      probe positive); no Rust clipboard plugin.
 *
 * Product route: AI Provider Manager task `sketchTranscribe` (vision model).
 * Harness seam: `window.__liteTranscribeMock`.
 */
import {
  isTempId,
  printSketchMarkup,
  type Sketch,
  type SketchNode,
} from "@drafting/sketch-core";
import { aiAttempt, DIALECT_RULES } from "./ai-generate";

/** Vision payload: raw base64, no data: URL prefix. */
export interface PastedImage {
  mediaType: string;
  dataBase64: string;
}

/** The vision seam: (system, user, image) → assistant text. Repair rounds
 *  re-send the image — the model must look again, not recall. */
export type RunAiVision = (
  system: string,
  user: string,
  image: PastedImage,
) => Promise<string>;

const TRANSCRIBE_SYSTEM = `你是界面拓印师。用户粘贴一张界面截图,你把它转写成 Drafting 的 .sketch 方言文档 —— 忠实转写你看到的结构与文字,不做再设计。

${DIALECT_RULES}

范围判定(对上面"只输出文档本身"的唯一例外):在文档之前先单独输出一行判定,然后换行输出文档:
scope: page      —— 截图是完整界面/整屏(有页面级结构:导航、多区块、整页布局)
scope: fragment  —— 截图只是局部模块:单个卡片、一条列表项、一个表单块、一组按钮等
fragment 时根 <Stack> 就是这个模块自身的容器(它的布局属性=模块布局),不要加页面级外壳:不要 h="fill",不要居中壳,不要页面背景。

拓印要求:
- 忠实优先:布局层级(谁包含谁/谁在谁旁边/横排竖排)和可见文字(标题、按钮标签、输入框 label 与 placeholder)照实转写;文字逐字保留,不翻译、不改写、不发明。
- 视觉分组转写为嵌套 Stack;并排元素用 dir="row";间距和尺寸选最接近的档位,不追求像素级还原。
- 方言表达不了的元素(图表、视频、地图、日历、复杂控件):用 <Image> 占位,alt 如实描述(例 alt="折线图:月度收入走势");不要硬造方言里不存在的元素。
- 图标按钮转写为 <Button variant="ghost">按功能命名</Button>;纯装饰元素可省略。
- 配色用最接近的 token 近似:主色实心块→primary,浅色卡片→raised,警示→danger。`;

/** The model's verdict on what the screenshot IS — a whole page (replace
 *  the document) or a lone module (insert into the current tree). */
export type TranscribeScope = "page" | "fragment";

export interface TranscribeResult {
  sketch: Sketch;
  markup: string;
  scope: TranscribeScope;
  /** AI calls actually made (1..3 across repair rounds). */
  attempts: number;
  /** Fabricated sk:id occurrences stripped from the model's output. */
  strippedIds: number;
}

/** Read the `scope: page|fragment` line the prompt asks for AHEAD of the
 *  document (extractDocument ignores everything before `<Sketch`, so the
 *  protocol is backward-compatible). Absent → null (caller defaults to
 *  "page" — the pre-scope behavior). */
export function extractScope(raw: string): TranscribeScope | null {
  const at = raw.indexOf("<Sketch");
  const head = at === -1 ? raw : raw.slice(0, at);
  const m = head.match(/scope:\s*(page|fragment)/i);
  return m ? (m[1].toLowerCase() as TranscribeScope) : null;
}

/** Replace every persistent (non-temp) node id with a fresh session-temp
 *  id — the AI never mints identity (ruling 2). Nothing can reference these
 *  nodes yet, so a blanket remint is total and safe. Pure. */
export function stripFabricatedIds(sketch: Sketch): {
  sketch: Sketch;
  stripped: number;
} {
  let stripped = 0;
  let counter = 0;
  const remint = (id: string): string => {
    if (isTempId(id) || id === "") return id;
    stripped += 1;
    return `~x${++counter}`;
  };
  const walk = (n: SketchNode): SketchNode => {
    const id = remint(n.id);
    if (n.kind === "stack" || n.kind === "frame") {
      return { ...n, id, children: n.children.map(walk) };
    }
    if (n.kind === "list") {
      return { ...n, id, template: walk(n.template) as typeof n.template };
    }
    return { ...n, id };
  };
  const root = walk(sketch.root) as Sketch["root"];
  // The document's own sk:id too — the landing rewrites it, but a fabricated
  // one must not survive even transiently.
  const docId = remint(sketch.id);
  return { sketch: { ...sketch, id: docId, root }, stripped };
}

/**
 * Transcribe a pasted screenshot. Same gatekeeper contract as Generate:
 * parse (one repair round) → validate (one repair round) → defeat throws.
 * No offline fallback — transcription without vision is meaningless, so
 * failure surfaces loudly instead of degrading silently.
 */
export async function transcribeImage(
  image: PastedImage,
  opts: { runAi: RunAiVision; title: string },
): Promise<TranscribeResult> {
  const counter = { attempts: 0 };
  const user = [
    `页面「${opts.title}」`,
    `这是要拓印的界面截图。先判定 scope,再转写成完整的 .sketch 文档。`,
  ].join("\n");
  // The scope verdict is a property of the IMAGE, not of a repair round —
  // capture it from the first response that declares one (repair prompts
  // ask for "just the document", so later rounds may legally omit it).
  let scope: TranscribeScope | null = null;
  const runAi = async (system: string, message: string) => {
    const raw = await opts.runAi(system, message, image);
    if (scope === null) scope = extractScope(raw);
    return raw;
  };
  const parsed = await aiAttempt(runAi, TRANSCRIBE_SYSTEM, user, counter);
  const { sketch, stripped } = stripFabricatedIds(parsed);
  const named: Sketch = { ...sketch, name: opts.title, blueprintRef: null };
  return {
    sketch: named,
    markup: printSketchMarkup(named),
    scope: scope ?? "page",
    attempts: counter.attempts,
    strippedIds: stripped,
  };
}

// ---------------------------------------------------------------- fragment --

/** The subtree a fragment transcription contributes: the root Stack itself
 *  when it groups several pieces (its layout IS the module layout), unwrapped
 *  to its single child when it holds exactly one (no wrapper noise around a
 *  lone Button). */
export function fragmentSubtree(sketch: Sketch): SketchNode {
  return sketch.root.children.length === 1 ? sketch.root.children[0] : sketch.root;
}

function findIn(
  root: SketchNode,
  id: string,
): { node: SketchNode; parent: (SketchNode & { children: SketchNode[] }) | null } | null {
  const walk = (
    n: SketchNode,
    parent: (SketchNode & { children: SketchNode[] }) | null,
  ): ReturnType<typeof findIn> => {
    if (n.id === id) return { node: n, parent };
    if (n.kind === "stack" || n.kind === "frame") {
      for (const c of n.children) {
        const hit = walk(c, n);
        if (hit) return hit;
      }
    }
    if (n.kind === "list") return walk(n.template, null); // template root is locked — matches read-only
    return null;
  };
  return walk(root, null);
}

/** Entering a frame mirrors the store's placeInFrame law: a position (frames
 *  have no flow) and no fill sizing (meaningless at a point; validate rejects). */
function coerceIntoFrame(node: SketchNode) {
  node.pos = { x: 8, y: 8 };
  if (node.sizing.width.mode === "fill") node.sizing.width = { mode: "hug" };
  if (node.sizing.height.mode === "fill") node.sizing.height = { mode: "hug" };
}

/**
 * Insert a transcribed fragment into a document draft (pure mutation — run
 * it inside the store's applyTreeEdit so it rides the single undo unit).
 * Anchor rules, most-specific first:
 *  - anchor is a container → append as its last child;
 *  - anchor is a leaf with a parent → insert right after it among siblings;
 *  - no/unknown anchor → append to the document root.
 */
export function insertSubtree(draft: Sketch, node: SketchNode, anchorId: string | null): void {
  const hit = anchorId ? findIn(draft.root, anchorId) : null;
  if (hit && (hit.node.kind === "stack" || hit.node.kind === "frame")) {
    if (hit.node.kind === "frame") coerceIntoFrame(node);
    hit.node.children.push(node);
    return;
  }
  if (hit?.parent) {
    if (hit.parent.kind === "frame") coerceIntoFrame(node);
    const i = hit.parent.children.findIndex((c) => c.id === hit.node.id);
    hit.parent.children.splice(i + 1, 0, node);
    return;
  }
  draft.root.children.push(node);
}

/** Encode a pasted image file for the vision request: downscale to a sane
 *  long edge (cost + consistent model input) and re-encode as PNG through a
 *  canvas — which also strips any EXIF/metadata (privacy). */
export async function encodePastedImage(
  file: Blob,
  maxEdge = 1568,
): Promise<PastedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("图片解码失败"));
      el.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const cx = canvas.getContext("2d");
    if (!cx) throw new Error("canvas 2d 上下文不可用");
    cx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/png");
    const prefix = "data:image/png;base64,";
    if (!dataUrl.startsWith(prefix)) throw new Error("PNG 编码失败");
    return { mediaType: "image/png", dataBase64: dataUrl.slice(prefix.length) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
