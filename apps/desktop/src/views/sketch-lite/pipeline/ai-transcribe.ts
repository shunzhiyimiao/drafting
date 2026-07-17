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
    `这是要拓印的界面截图。请把它转写成完整的 .sketch 文档。`,
  ].join("\n");
  const runAi = (system: string, message: string) =>
    opts.runAi(system, message, image);
  const parsed = await aiAttempt(runAi, TRANSCRIBE_SYSTEM, user, counter);
  const { sketch, stripped } = stripFabricatedIds(parsed);
  const named: Sketch = { ...sketch, name: opts.title, blueprintRef: null };
  return {
    sketch: named,
    markup: printSketchMarkup(named),
    attempts: counter.attempts,
    strippedIds: stripped,
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
