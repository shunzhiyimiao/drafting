import { useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { printSketchMarkup } from "@drafting/sketch-core";
import { ulid } from "../../../lib/ulid";
import { useSketchStore } from "../../../stores/sketch-store";
import { useSketchLiteStore } from "../store";
import { generateUiFromSketch } from "../pipeline/pipeline";
import { LiteToolbar } from "./LiteToolbar";
import { LiteCanvas } from "./LiteCanvas";
import { LiteInspector } from "./LiteInspector";
import { PagePrompt } from "./PagePrompt";

/** Sketch Lite — 画个大概,AI 补全设计。
 *
 *  Generate UI 跑完整管线(几何→解释→Intent→确定性编译),产物是一份
 *  合法的 `.sketch` 文档,落进现有设计器(有工程时新建文件,harness 里
 *  替换活动文档)。草图本身不是真相 —— 它只是 AI 的输入格式。 */
export function SketchLitePage({
  onExit,
  landing = "new-doc",
}: {
  onExit: () => void;
  /** Where Generate lands: a fresh doc (app) or the active doc (harness). */
  landing?: "new-doc" | "replace-active";
}) {
  const doc = useSketchLiteStore((s) => s.doc);
  const setTitle = useSketchLiteStore((s) => s.setTitle);
  const generateFromLite = useSketchStore((s) => s.generateFromLite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGenerate = async () => {
    if (doc.shapes.length === 0) {
      setError("先画至少一个矩形 — 大概就行");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await generateUiFromSketch(doc, { sketchId: "sk_pending", mint: ulid });
      if (result.validationErrors.length > 0) {
        // 编译器合同被打破 — 响亮失败,绝不落一份非法文档。
        throw new Error(
          `编译产物未过校验: ${result.validationErrors.map((e) => e.message).join("; ")}`,
        );
      }
      await generateFromLite(
        doc.title,
        (sketchId) => printSketchMarkup({ ...result.sketch, id: sketchId }),
        landing,
      );
      onExit();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-2 p-2">
      {/* Header: identity + the prominent Generate button. */}
      <div className="glass-panel flex items-center gap-3 px-3 py-2 shrink-0">
        <button
          onClick={onExit}
          title="回到设计器"
          className="text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="text-xs font-medium text-text-primary">Sketch Lite</span>
        <input
          data-lite-title
          className="text-xs px-2 py-1 rounded-md bg-bg-primary/40 border border-border/50 text-text-secondary w-48"
          value={doc.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <span className="text-[10px] text-text-muted">画个大概 · 写几句话 · 让 AI 起稿</span>
        <div className="flex-1" />
        {error && <span className="text-[10px] text-error max-w-72 truncate">{error}</span>}
        <button
          data-lite-generate
          onClick={() => void onGenerate()}
          disabled={busy}
          className="glass-button-primary flex items-center gap-1.5 px-4 py-1.5 text-xs disabled:opacity-50"
        >
          <Sparkles size={13} />
          {busy ? "生成中…" : "Generate UI"}
        </button>
      </div>

      {/* Body: toolbar | canvas | inspector. */}
      <div className="flex-1 flex gap-2 min-h-0">
        <LiteToolbar />
        <LiteCanvas />
        <LiteInspector />
      </div>

      <PagePrompt />
    </div>
  );
}
