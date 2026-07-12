import { useCallback, useEffect, useState } from "react";
import { ExternalLink, ListPlus, RefreshCw } from "lucide-react";
import {
  checklistForFile,
  createBlueprint,
  toggleCriterion,
  type ChecklistEntry,
} from "../lib/blueprint-api";
import { getProjectRoot } from "../lib/app-bootstrap";
import { useEditorStore } from "../stores/editor-store";
import { useSketchStore } from "../stores/sketch-store";
import { useBlueprintStore } from "../stores/blueprint-store";
import { useNavigationStore } from "../stores/navigation-store";

/** The Checklist — Drafting 核心思想的落点:当前文件的验收标准就贴在
 *  编辑器脚下。勾选状态即真相(toggle 写回 Blueprint MD,走既有通道);
 *  verdict/过时/漂移徽章来自估计器(只读,反映检查现状,不装确定)。 */
export function ChecklistPanel() {
  const editorFile = useEditorStore((s) => s.activeTabPath);
  const sketchFile = useSketchStore((s) => s.activeFile);
  const activeView = useNavigationStore((s) => s.activeView);
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint);
  const setActiveView = useNavigationStore((s) => s.setActiveView);
  // 面板是全局的,"当前文件"随视图走:Sketch 视图跟踪当前草图文件
  // (绑定过 criterion 的 .sketch 自己就是绑定文件),其余跟编辑器 tab。
  const activeTabPath = activeView === "sketch" ? (sketchFile ?? editorFile) : editorFile;

  const [root, setRoot] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChecklistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 手动清单模式:就地新建一张特性蓝图(MD 即真相),relatedFiles 指向
  // 当前文件,标准一行一条 —— Checklist 立即点亮,勾选照常写回。
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newItems, setNewItems] = useState("");

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

  const saveNewChecklist = async () => {
    if (!root || !activeTabPath) return;
    const name = newName.trim() || `${activeTabPath.split("/").pop()} 检查单`;
    const items = newItems
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (items.length === 0) {
      setError("至少写一条标准(一行一条)");
      return;
    }
    const md = [
      "---",
      "type: feature",
      `displayName: ${JSON.stringify(name)}`,
      "status: draft",
      "priority: medium",
      "owner: human",
      "relatedFiles:",
      `  - ${JSON.stringify(activeTabPath)}`,
      "---",
      "",
      `# ${name}`,
      "",
      "## Goal",
      "",
      `手动检查单,盯住 \`${activeTabPath}\`。`,
      "",
      "## Acceptance Criteria",
      "",
      ...items.map((i) => `- [ ] ${i}`),
      "",
    ].join("\n");
    setError(null);
    try {
      await createBlueprint(root, md);
      setCreating(false);
      setNewName("");
      setNewItems("");
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const jump = (entry: ChecklistEntry) => {
    void loadBlueprint(entry.blueprintId);
    setActiveView("blueprint");
  };

  const creationForm = creating && (
    <div data-checklist-create className="flex flex-col gap-1.5 p-2 rounded-md border border-border/50 bg-bg-primary/30 max-w-xl">
      <input
        autoFocus
        className="text-xs px-2 py-1.5 rounded-md"
        placeholder={`清单名(默认:${activeTabPath?.split("/").pop() ?? ""} 检查单)`}
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
      />
      <textarea
        className="text-xs px-2 py-1.5 rounded-md min-h-[72px] resize-y font-mono"
        placeholder={"一行一条验收标准,例:\n列表页显示客户总数\n支持按名称搜索"}
        value={newItems}
        onChange={(e) => setNewItems(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button onClick={() => void saveNewChecklist()} className="glass-button-primary text-xs px-3 py-1">
          创建清单
        </button>
        <button
          onClick={() => setCreating(false)}
          className="text-xs text-text-muted hover:text-text-primary"
        >
          取消
        </button>
        <span className="text-[10px] text-text-muted">
          落盘为一张特性蓝图(relatedFiles = 当前文件),勾选即真相。
        </span>
      </div>
    </div>
  );

  if (!activeTabPath) {
    return (
      <p className="text-xs text-text-muted">
        在编辑器打开一个文件、或在 Sketch 里打开一个草图 — 这里会显示它承诺要满足的验收标准。
      </p>
    );
  }
  if (entries.length === 0 && !loading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-xs text-text-muted flex items-center gap-2">
          <span>此文件还没有验收标准。</span>
          <button
            data-checklist-new
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 text-accent hover:underline"
          >
            <ListPlus size={11} />
            新建检查单
          </button>
          <span>或在 Blueprint 的 relatedFiles 里关联、给 criterion 绑定 sketch 节点。</span>
          <button onClick={() => void refresh()} title="刷新" className="hover:text-text-primary">
            <RefreshCw size={11} />
          </button>
          {error && <span className="text-error">{error}</span>}
        </div>
        {creationForm}
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
        <button
          data-checklist-new
          onClick={() => setCreating((v) => !v)}
          title="为此文件新建一份检查单"
          className="text-text-muted hover:text-accent"
        >
          <ListPlus size={11} />
        </button>
        {error && <span className="text-[10px] text-error">{error}</span>}
      </div>
      {creationForm}
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
