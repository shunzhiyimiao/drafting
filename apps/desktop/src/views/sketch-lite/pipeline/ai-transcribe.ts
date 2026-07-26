/**
 * P3.2 拓印 — pasted screenshot → `.sketch` dialect document.
 *
 * 零开关裁决 (2026-07-21, docs §12): mode is a PURE FUNCTION OF CANVAS
 * STATE — never a user-visible switch, never a model verdict. Empty
 * document → whole-page transcription lands replace-active (same landing
 * as Generate UI); non-empty document → fragment enters the placement
 * flow (P3.3: staged fragment + the fourth DragSource — NOT built yet, so
 * a non-empty paste refuses loudly and points at the first-class gesture:
 * whole-page redo = new tab). THERE IS NO PASTE PATH THAT OVERWRITES A
 * NON-EMPTY DOCUMENT. Loss asymmetry is the ruling's ground: an auto
 * rule's failure mode is mild annoyance; a switch's failure mode is a
 * destroyed canvas.
 *
 * Standing rules (2026-07-15 five-ruling frame, docs §12):
 *   1. NO reconcile here — EVERY paste mints all-new nodes; bindings never
 *      migrate; O3's bijectivity belongs to regeneration only.
 *   2. The AI never mints identity: any sk:id it fabricates is stripped
 *      post-parse (replaced with session-temp ids; persist-on-need mints
 *      real ULIDs later where the tree genuinely requires them).
 *   4. Explicit gesture only (⌘V), never clipboard polling; pixels live in
 *      memory and on the wire only — no disk, no logs. Re-encoding through a
 *      canvas also strips EXIF/metadata before anything leaves the machine.
 *   5. Entry = the webview paste event — verified live 2026-07-17 (P3.0
 *      probe positive); no Rust clipboard plugin.
 *
 * 拓印是像素空间到有限字母表的投影,不是复印: out-of-alphabet elements
 * degrade to the nearest letter, honestly labeled (Image alt) — the P3.1
 * harness judges alphabet coverage + degradation behavior, never pixel
 * fidelity.
 *
 * Product route: AI Provider Manager task `sketchTranscribe` (vision model).
 * Harness seam: `window.__liteTranscribeMock`.
 */
import {
  isTempId,
  printSketchMarkup,
  SCHEMA_VERSION,
  type Container,
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

拓印要求:
- 忠实优先:布局层级(谁包含谁/谁在谁旁边/横排竖排)和可见文字(标题、按钮标签、输入框 label 与 placeholder)照实转写;文字逐字保留,不翻译、不改写、不发明。
- 视觉分组转写为嵌套 Stack;并排元素用 dir="row";间距和尺寸选最接近的档位,不追求像素级还原。
- 方言表达不了的元素(图表、视频、地图、日历、复杂控件):用 <Image> 占位,alt 如实描述(例 alt="折线图:月度收入走势");不要硬造方言里不存在的元素。
- 图标按钮转写为 <Button variant="ghost">按功能命名</Button>;纯装饰元素可省略。
- 配色用最接近的 token 近似:主色实心块→primary,浅色卡片→raised,警示→danger。`;

export interface TranscribeResult {
  sketch: Sketch;
  markup: string;
  /** AI calls actually made (1..3 across repair rounds). */
  attempts: number;
  /** Fabricated sk:id occurrences stripped from the model's output. */
  strippedIds: number;
}

/** The zero-switch derivation (2026-07-21 ruling): a document is an empty
 *  landing target iff its root holds nothing — then and only then does a
 *  paste mean "whole page". Everything else is P3.3 placement territory. */
export function isEmptyDocument(sketch: Sketch): boolean {
  return sketch.root.children.length === 0;
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
async function transcribeAttempt(
  image: PastedImage,
  system: string,
  user: string,
  opts: { runAi: RunAiVision; title: string },
): Promise<{ sketch: Sketch; attempts: number; strippedIds: number }> {
  const counter = { attempts: 0 };
  const runAi = (sys: string, message: string) => opts.runAi(sys, message, image);
  const parsed = await aiAttempt(runAi, system, user, counter);
  const { sketch, stripped } = stripFabricatedIds(parsed);
  const named: Sketch = { ...sketch, name: opts.title, blueprintRef: null };
  return { sketch: named, attempts: counter.attempts, strippedIds: stripped };
}

export async function transcribeImage(
  image: PastedImage,
  opts: { runAi: RunAiVision; title: string },
): Promise<TranscribeResult> {
  const user = [
    `页面「${opts.title}」`,
    `这是要拓印的界面截图。请把它转写成完整的 .sketch 文档。`,
  ].join("\n");
  const { sketch, attempts, strippedIds } = await transcribeAttempt(
    image,
    TRANSCRIBE_SYSTEM,
    user,
    opts,
  );
  return { sketch, markup: printSketchMarkup(sketch), attempts, strippedIds };
}

// ---------------------------------------------------------------- fragment --

const TRANSCRIBE_FRAGMENT_SYSTEM = `你是界面拓印师。用户粘贴一张**局部模块**的截图(一张卡片、一条列表项、一个表单块、一组按钮等),你把它转写成一个可放置的模块 —— 忠实转写你看到的结构与文字,不做再设计。

${DIALECT_RULES}

模块约定:根 <Stack> 就是这个模块自身的容器(它的布局属性=模块布局)。不要页面级外壳:不要 h="fill",不要居中壳,不要页面背景;截图里模块之外的环境一概不转写。

拓印要求:
- 忠实优先:布局层级和可见文字照实转写;文字逐字保留,不翻译、不改写、不发明。
- 视觉分组转写为嵌套 Stack;并排元素用 dir="row";间距和尺寸选最接近的档位。
- 方言表达不了的元素(图表、视频、地图、复杂控件):用 <Image> 占位,alt 如实描述;不要硬造方言里不存在的元素。
- 配色用最接近的 token 近似:主色实心块→primary,浅色卡片→raised,警示→danger。`;

export interface FragmentResult {
  /** The placeable subtree: the transcription's root Stack, unwrapped to
   *  its single child when it holds exactly one (no wrapper noise around a
   *  lone Button). */
  node: SketchNode;
  /** Human-readable handle for the staged card and the drag ghost. */
  label: string;
  attempts: number;
  strippedIds: number;
}

export function fragmentSubtree(sketch: Sketch): SketchNode {
  return sketch.root.children.length === 1 ? sketch.root.children[0] : sketch.root;
}

/** First visible text in document order (heading before body by position),
 *  falling back to the node's kind. */
export function fragmentLabel(node: SketchNode): string {
  const firstText = (n: SketchNode): string | null => {
    if (n.kind === "text" && typeof n.content === "string" && n.content.trim()) {
      return n.content.trim();
    }
    if (n.kind === "button" && n.label.trim()) return n.label.trim();
    if (n.kind === "input" && n.label.trim()) return n.label.trim();
    if (n.kind === "stack" || n.kind === "frame") {
      for (const c of n.children) {
        const hit = firstText(c);
        if (hit) return hit;
      }
    }
    return null;
  };
  const text = firstText(node);
  const name = text ? (text.length > 18 ? `${text.slice(0, 18)}…` : text) : node.kind;
  return name;
}

/** Non-empty-canvas paste (裁决: fragment 进放置流程): transcribe the
 *  screenshot as a MODULE — the staged palette item from the outside world. */
export async function transcribeFragment(
  image: PastedImage,
  opts: { runAi: RunAiVision; title: string },
): Promise<FragmentResult> {
  const user = `这是要拓印的模块截图。请把它转写成一个模块(.sketch 文档,根 Stack 即模块容器)。`;
  const { sketch, attempts, strippedIds } = await transcribeAttempt(
    image,
    TRANSCRIBE_FRAGMENT_SYSTEM,
    user,
    opts,
  );
  const node = fragmentSubtree(sketch);
  return { node, label: fragmentLabel(node), attempts, strippedIds };
}

/** The staged card's SOLE upgrade action (裁决:「整页 → 新 tab」一步解决):
 *  the same transcription product becomes a page document — zero extra AI
 *  calls. A stack fragment roots the page directly; a lone primitive gets
 *  a default page shell. */
export function fragmentToPageSketch(node: SketchNode, title: string): Sketch {
  const root: Container =
    node.kind === "stack"
      ? { ...node, pos: undefined }
      : {
          kind: "stack",
          id: "~xpage",
          layout: {
            direction: "col",
            gap: 4,
            padding: { top: 4, right: 4, bottom: 4, left: 4 },
            mainAxis: "start",
            crossAxis: "stretch",
          },
          sizing: { width: { mode: "fill" }, height: { mode: "fill" } },
          children: [node],
        };
  return {
    id: "sk_pending",
    name: title,
    blueprintRef: null,
    schemaVersion: SCHEMA_VERSION,
    root,
  };
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
