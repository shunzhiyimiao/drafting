import { useEffect, useState } from "react";
import { ArrowLeft, Eye, PenTool, Sparkles } from "lucide-react";
import { printSketchMarkup } from "@drafting/sketch-core";
import { ulid } from "../../../lib/ulid";
import { useSketchStore } from "../../../stores/sketch-store";
import { useBoundFeature } from "../../sketch/binding";
import { runTaskCollect } from "../../../lib/ai-api";
import { SketchCanvas } from "../../sketch/Canvas";
import { useSketchLiteStore } from "../store";
import { generateUiSmart, type RunAi } from "../pipeline/ai-generate";
import { LiteBindingPanel } from "./LiteBindingPanel";
import { LiteToolbar } from "./LiteToolbar";
import { LiteCanvas } from "./LiteCanvas";
import { LiteInspector } from "./LiteInspector";
import { PagePrompt } from "./PagePrompt";

/** Sketch Lite — THE sketch surface(画个大概,AI 补全设计)。
 *
 *  每个 sketch 文档一张草稿(会话内按文件暂存)。Generate UI 跑完整管线
 *  (几何→解释→Intent→确定性编译),把产物写进**当前打开的** `.sketch`
 *  文档(一步撤销、自动保存、照常 codegen),然后切到"预览"页签 —— 用
 *  现有画布渲染生成结果。草图不是真相;真相始终是 `.sketch` 文本。 */
export function SketchLitePage({ onExit }: { onExit: () => void }) {
  const doc = useSketchLiteStore((s) => s.doc);
  const setTitle = useSketchLiteStore((s) => s.setTitle);
  const bindTo = useSketchLiteStore((s) => s.bindTo);
  const generateFromLite = useSketchStore((s) => s.generateFromLite);
  const activeFile = useSketchStore((s) => s.activeFile);
  const activeName = useSketchStore((s) => s.active?.name ?? null);
  const projectRoot = useSketchStore((s) => s.projectRoot);
  const [mode, setMode] = useState<"sketch" | "preview">("sketch");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ mode: "ai" | "fallback"; reason?: string } | null>(
    null,
  );
  // 蓝图闭环:sketch 绑了特性蓝图时,验收标准喂进 Generate 的 prompt ——
  // 生成的界面直接朝标准去。
  const [boundFeature] = useBoundFeature();

  // One napkin per document: (re)bind whenever the active sketch changes.
  useEffect(() => {
    if (activeFile) bindTo(activeFile, activeName ?? "Untitled sketch");
  }, [activeFile, activeName, bindTo]);

  /** The AI seam: the harness injects __liteAiMock; the app routes the
   *  `sketchGenerate` task through the AI Provider Manager; neither →
   *  null → offline skeleton (loudly labeled). */
  const resolveRunAi = (): RunAi | null => {
    const mock = (window as unknown as { __liteAiMock?: RunAi }).__liteAiMock;
    if (mock) return mock;
    if (!projectRoot || projectRoot === "/dev/null") return null;
    return (system, user) =>
      runTaskCollect(projectRoot, "sketchGenerate", {
        model: "", // the task route decides
        system,
        messages: [{ role: "user", content: user }],
        temperature: 0.4,
        maxTokens: 4096,
      });
  };

  const onGenerate = async () => {
    if (doc.shapes.length === 0) {
      setError("先画至少一个矩形 — 大概就行");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const criteria = (boundFeature?.sections ?? [])
        .filter((s) => s.kind.kind === "acceptanceCriteria")
        .flatMap((s) => s.criteria.map((c) => c.text));
      const result = await generateUiSmart(doc, { mint: ulid, runAi: resolveRunAi(), criteria });
      await generateFromLite(
        doc.title,
        (sketchId) => printSketchMarkup({ ...result.sketch, id: sketchId }),
        "replace-active",
      );
      setOutcome({ mode: result.mode, reason: result.reason });
      setMode("preview");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const tab = (active: boolean) =>
    `flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors ${
      active
        ? "bg-accent/20 text-accent"
        : "text-text-muted hover:text-text-primary hover:bg-bg-hover"
    }`;

  return (
    <div className="h-full flex flex-col gap-2 p-2">
      {/* Header: identity · sketch/preview tabs · the prominent Generate. */}
      <div className="glass-panel flex items-center gap-3 px-3 py-2 shrink-0">
        <button
          onClick={onExit}
          title="回到 sketch 列表"
          className="text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="text-xs font-medium text-text-primary">Sketch Lite</span>
        <input
          data-lite-title
          className="text-xs px-2 py-1 rounded-md bg-bg-primary/40 border border-border/50 text-text-secondary w-44"
          value={doc.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <span className="mx-1 h-4 w-px bg-border/60" />
        <button data-lite-mode="sketch" className={tab(mode === "sketch")} onClick={() => setMode("sketch")}>
          <PenTool size={12} />
          草图
        </button>
        <button
          data-lite-mode="preview"
          className={tab(mode === "preview")}
          onClick={() => setMode("preview")}
        >
          <Eye size={12} />
          预览
        </button>
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

      {mode === "sketch" ? (
        <>
          {/* Body: toolbar | napkin | inspector. */}
          <div className="flex-1 flex gap-2 min-h-0">
            <LiteToolbar />
            <LiteCanvas />
            <LiteInspector />
          </div>
          <PagePrompt />
        </>
      ) : (
        /* Preview: the EXISTING runtime rendering the current document —
           what Generate wrote (or whatever the doc already holds). */
        <div data-lite-preview className="flex-1 flex flex-col gap-1.5 min-h-0">
          {outcome && (
            <div
              data-lite-outcome={outcome.mode}
              className={`shrink-0 px-3 py-1.5 rounded-md text-[11px] ${
                outcome.mode === "ai"
                  ? "bg-accent/10 text-accent"
                  : "bg-warning/10 text-warning"
              }`}
            >
              {outcome.mode === "ai"
                ? "✨ AI 生成 — 按草图注释与页面描述设计"
                : `⚠ 已用离线骨架(AI 未生效):${outcome.reason ?? ""}`}
            </div>
          )}
          <div className="flex-1 flex gap-2 min-h-0">
            <SketchCanvas />
            <LiteBindingPanel />
          </div>
        </div>
      )}
    </div>
  );
}
