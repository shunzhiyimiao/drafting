import { AlertTriangle, Link2, Link2Off } from "lucide-react";
import { useBlueprintStore } from "../../../stores/blueprint-store";
import { allNodeIds, useSketchStore } from "../../../stores/sketch-store";
import { setCriterionBinding, useBoundFeature } from "../../sketch/binding";

/** 预览页签的绑定面板 — 核心思想的接线处:蓝图定标准,草图生界面,
 *  这里把两端连起来。选中预览里的节点,把 criterion 绑上去;绑定一落,
 *  criterion 的 artifacts 立即包含 .sketch 文件与生成的 React,Checklist/
 *  估计器/漂移检测全部自动跟上(同一套 bindings,零新机制)。
 *
 *  §6 纪律原样保留:sk:id 先落盘(persistNodeIdForBinding),criterion
 *  标记后写;删除节点 → 绑定悬垂(dangling),给信号,不级联。 */
export function LiteBindingPanel() {
  const active = useSketchStore((s) => s.active);
  const projectRoot = useSketchStore((s) => s.projectRoot);
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const updateSketchMeta = useSketchStore((s) => s.updateSketchMeta);
  const persistNodeIdForBinding = useSketchStore((s) => s.persistNodeIdForBinding);
  const index = useBlueprintStore((s) => s.index);
  const [feature, reload] = useBoundFeature();

  if (!active) return null;
  const features = (index?.blueprints ?? []).filter((b) => b.type === "feature");
  const criteria =
    feature?.sections
      .filter((s) => s.kind.kind === "acceptanceCriteria")
      .flatMap((s) => s.criteria) ?? [];
  const nodeIds = new Set(allNodeIds(active.root));
  const dangling = criteria.filter(
    (c) => c.sketchNode?.sketchId === active.id && !nodeIds.has(c.sketchNode.nodeId),
  );

  return (
    <div data-lite-binding className="glass-panel w-72 shrink-0 p-3 overflow-auto flex flex-col gap-3">
      <div>
        <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
          关联 Blueprint
        </h3>
        <select
          data-lite-blueprint-ref
          className="w-full text-xs px-2 py-1.5 rounded-md"
          value={active.blueprintRef ?? "__none__"}
          onChange={(e) =>
            updateSketchMeta({
              blueprintRef: e.target.value === "__none__" ? null : e.target.value,
            })
          }
        >
          <option value="__none__">— 未关联</option>
          {features.map((f) => (
            <option key={f.blueprintId} value={f.blueprintId}>
              {f.displayName}
            </option>
          ))}
        </select>
        {!active.blueprintRef && (
          <p className="text-[10px] text-text-muted mt-1.5 leading-snug">
            关联一个特性蓝图后,这里能把验收标准绑到界面节点上 —— Checklist、AI 检查、漂移检测
            都吃这份绑定。
          </p>
        )}
      </div>

      {feature && (
        <div>
          <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
            验收标准 ↔ 节点
          </h3>
          {!selectedNodeId || selectedNodeId === active.root.id ? (
            <p className="text-[10px] text-text-muted">在预览里点选一个节点,然后绑定。</p>
          ) : null}
          {criteria.length === 0 && (
            <p className="text-[10px] text-text-muted">这个蓝图还没有验收标准 — 去 Blueprint 里写。</p>
          )}
          <div className="flex flex-col gap-1.5">
            {criteria.map((c) => {
              const boundHere =
                !!selectedNodeId &&
                c.sketchNode?.sketchId === active.id &&
                c.sketchNode.nodeId === selectedNodeId;
              const boundElsewhere = !boundHere && c.sketchNode !== undefined;
              const canBind = !!selectedNodeId && selectedNodeId !== active.root.id;
              return (
                <div key={c.id ?? c.text} className="flex items-start gap-1.5">
                  <button
                    data-lite-bind={c.id}
                    title={
                      boundHere
                        ? "解绑此节点"
                        : canBind
                          ? "绑定到选中节点"
                          : "先在预览里选中一个节点"
                    }
                    disabled={!canBind && !boundHere}
                    onClick={async () => {
                      if (!projectRoot || !c.id || !feature) return;
                      if (boundHere) {
                        await setCriterionBinding(projectRoot, feature, c.id, undefined);
                      } else if (selectedNodeId) {
                        // §6 write order: sk:id persists + flushes FIRST.
                        const persisted = await persistNodeIdForBinding(selectedNodeId);
                        if (!persisted) return;
                        await setCriterionBinding(projectRoot, feature, c.id, {
                          sketchId: active.id,
                          nodeId: persisted,
                        });
                      }
                      await reload();
                    }}
                    className={`mt-0.5 shrink-0 disabled:opacity-30 ${
                      boundHere ? "text-accent" : "text-text-muted hover:text-accent"
                    }`}
                  >
                    {boundHere ? <Link2 size={11} /> : <Link2Off size={11} />}
                  </button>
                  <span
                    className={`text-[10px] leading-snug ${
                      boundHere
                        ? "text-text-primary"
                        : boundElsewhere
                          ? "text-text-muted"
                          : "text-text-secondary"
                    }`}
                  >
                    {c.text}
                    {boundElsewhere && (
                      <span className="text-text-muted">
                        {" "}
                        · 已绑 {c.sketchNode!.nodeId.slice(0, 6)}…
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dangling.length > 0 && (
        <div>
          <h3 className="text-[11px] font-medium text-warning uppercase tracking-wide mb-1.5">
            悬垂绑定
          </h3>
          {dangling.map((c) => (
            <div key={c.id ?? c.text} className="flex items-start gap-1.5">
              <AlertTriangle size={11} className="text-warning shrink-0 mt-0.5" />
              <span className="text-[10px] text-text-secondary leading-snug">
                {c.text}
                <span className="text-text-muted"> — 它验证的节点已不存在,重绑或解绑</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
