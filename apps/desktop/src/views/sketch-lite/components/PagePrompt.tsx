import { useSketchLiteStore } from "../store";

/** Page-level natural language: global semantics + style, distinct from
 *  per-shape annotations. */
export function PagePrompt() {
  const pagePrompt = useSketchLiteStore((s) => s.doc.pagePrompt);
  const setPagePrompt = useSketchLiteStore((s) => s.setPagePrompt);
  return (
    <div className="glass-panel p-2.5 shrink-0">
      <label className="flex flex-col gap-1.5 text-[10px] text-text-muted">
        页面描述(整页的语义与风格)
        <textarea
          data-lite-prompt
          className="w-full text-xs px-2.5 py-2 rounded-md bg-bg-primary/40 border border-border/50 text-text-primary resize-none h-14"
          placeholder="例:一个现代 CRM dashboard,浅色主题 / 一个极简的桌面后台,参考 Linear 和 Notion"
          value={pagePrompt}
          onChange={(e) => setPagePrompt(e.target.value)}
        />
      </label>
    </div>
  );
}
