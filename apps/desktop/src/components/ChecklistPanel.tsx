import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  checklistForFile,
  toggleCriterion,
  type ChecklistEntry,
} from "../lib/blueprint-api";
import { getProjectRoot } from "../lib/app-bootstrap";
import { useEditorStore } from "../stores/editor-store";
import { useBlueprintStore } from "../stores/blueprint-store";
import { useNavigationStore } from "../stores/navigation-store";

/** The Checklist — Drafting 核心思想的落点:当前文件的验收标准就贴在
 *  编辑器脚下。勾选状态即真相(toggle 写回 Blueprint MD,走既有通道);
 *  verdict/过时/漂移徽章来自估计器(只读,反映检查现状,不装确定)。 */
export function ChecklistPanel() {
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint);
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  const [root, setRoot] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChecklistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getProjectRoot().then(setRoot);
  }, []);

  const refresh = useCallback(async () => {
    if (!root || !activeTabPath) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setEntries(await checklistForFile(root, activeTabPath));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [root, activeTabPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onToggle = async (entry: ChecklistEntry, checked: boolean) => {
    if (!root) return;
    // Optimistic: the MD write is the truth; reconcile right after.
    setEntries((es) =>
      es.map((e) => (e.criterionId === entry.criterionId ? { ...e, checked } : e)),
    );
    try {
      await toggleCriterion(root, entry.blueprintId, entry.criterionIndex, checked);
    } catch (e) {
      setError(String(e));
    }
    void refresh();
  };

  const jump = (entry: ChecklistEntry) => {
    void loadBlueprint(entry.blueprintId);
    setActiveView("blueprint");
  };

  if (!activeTabPath) {
    return <p className="text-xs text-text-muted">打开一个文件,这里会显示它承诺要满足的验收标准。</p>;
  }
  if (entries.length === 0 && !loading) {
    return (
      <div className="text-xs text-text-muted flex items-center gap-2">
        <span>
          此文件没有关联的验收标准 — 在 Blueprint 的 relatedFiles 里关联它,或给 criterion 绑定
          sketch 节点。
        </span>
        <button onClick={() => void refresh()} title="刷新" className="hover:text-text-primary">
          <RefreshCw size={11} />
        </button>
        {error && <span className="text-error">{error}</span>}
      </div>
    );
  }

  // Group by blueprint, order preserved from the backend (blueprint order).
  const groups: { id: string; name: string; items: ChecklistEntry[] }[] = [];
  for (const e of entries) {
    const g = groups.find((g) => g.id === e.blueprintId);
    if (g) g.items.push(e);
    else groups.push({ id: e.blueprintId, name: e.blueprintName, items: [e] });
  }

  const badge = (e: ChecklistEntry) => {
    const chips: { text: string; cls: string; title?: string }[] = [];
    if (e.verdict === "pass") chips.push({ text: "✓ 通过", cls: "bg-success/15 text-success" });
    if (e.verdict === "fail") chips.push({ text: "✗ 未过", cls: "bg-error/15 text-error" });
    if (e.verdict === "unclear") chips.push({ text: "? 不明", cls: "bg-warning/15 text-warning" });
    if (e.verdict === null) chips.push({ text: "未检查", cls: "bg-bg-hover text-text-muted" });
    if (e.stale) chips.push({ text: "过时", cls: "bg-warning/15 text-warning", title: "绑定文件在上次检查后变过" });
    if (e.drifted) chips.push({ text: "漂移", cls: "bg-error/10 text-warning", title: "已有结论后代码又变了 — 结论存疑" });
    return chips;
  };

  return (
    <div data-checklist-panel className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-text-muted">
          {activeTabPath} 的验收标准
        </span>
        <button
          onClick={() => void refresh()}
          title="刷新"
          className="text-text-muted hover:text-text-primary"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
        {error && <span className="text-[10px] text-error">{error}</span>}
      </div>
      {groups.map((g) => (
        <div key={g.id}>
          <button
            onClick={() => jump({ blueprintId: g.id } as ChecklistEntry)}
            className="flex items-center gap-1 text-[11px] text-accent hover:underline mb-1"
            title="在 Blueprint 中打开"
          >
            {g.name}
            <ExternalLink size={10} />
          </button>
          <div className="flex flex-col gap-1">
            {g.items.map((e) => (
              <label
                key={e.criterionId}
                className="flex items-start gap-2 text-xs text-text-secondary hover:bg-bg-hover/50 rounded px-1.5 py-1 cursor-pointer"
                title={e.explanation ?? undefined}
              >
                <input
                  type="checkbox"
                  checked={e.checked}
                  onChange={(ev) => void onToggle(e, ev.target.checked)}
                  className="mt-0.5 accent-[var(--color-accent,#6b8afd)]"
                />
                <span className={`flex-1 ${e.checked ? "line-through text-text-muted" : ""}`}>
                  {e.text}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {badge(e).map((c, i) => (
                    <span
                      key={i}
                      title={c.title}
                      className={`text-[9px] px-1.5 py-0.5 rounded-full ${c.cls}`}
                    >
                      {c.text}
                    </span>
                  ))}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
