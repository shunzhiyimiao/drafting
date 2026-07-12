import { useMemo } from "react";
import { useSketchLiteStore } from "../store";
import { analyzeGeometry } from "../geometry/analyze";
import { interpretSketch, type SketchInterpretation } from "../pipeline/interpret";
import { useEffect, useState } from "react";

const inputCls =
  "w-full text-xs px-2 py-1.5 rounded-md bg-bg-primary/40 border border-border/50 text-text-primary";

/** Right panel: selected shape's facts (annotation is natural language;
 *  the hint is a WEAK prior, never the final type) + a live read-back of
 *  what the deterministic interpreter currently sees — the pipeline's
 *  first stage made inspectable. */
export function LiteInspector() {
  const doc = useSketchLiteStore((s) => s.doc);
  const selectedShapeId = useSketchLiteStore((s) => s.selectedShapeId);
  const setAnnotation = useSketchLiteStore((s) => s.setAnnotation);
  const setSemanticHint = useSketchLiteStore((s) => s.setSemanticHint);
  const updateShapeBounds = useSketchLiteStore((s) => s.updateShapeBounds);

  const shape = doc.shapes.find((s) => s.id === selectedShapeId) ?? null;

  // Live interpretation preview — deterministic and cheap, so it can run
  // on every document change without an AI in the loop.
  const analysis = useMemo(() => analyzeGeometry(doc), [doc]);
  const [interp, setInterp] = useState<SketchInterpretation | null>(null);
  useEffect(() => {
    let alive = true;
    void interpretSketch(doc, analysis).then((r) => {
      if (alive) setInterp(r);
    });
    return () => {
      alive = false;
    };
  }, [doc, analysis]);

  const num = (v: number, apply: (n: number) => void) => (
    <input
      type="number"
      className={inputCls}
      value={v}
      onChange={(e) => apply(Math.round(Number(e.target.value) || 0))}
    />
  );

  return (
    <div className="glass-panel w-72 shrink-0 p-3 overflow-auto flex flex-col gap-4">
      <div>
        <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-2">
          Inspector
        </h3>
        {!shape ? (
          <p className="text-xs text-text-muted">选中一个形状来编辑它的属性。</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="text-xs text-text-secondary">类型:{shape.type}</div>
            <label className="flex flex-col gap-1 text-[10px] text-text-muted">
              注释(自然语言,给 AI 看)
              <textarea
                data-lite-annotation
                className={`${inputCls} min-h-[52px] resize-y`}
                placeholder="例:左侧导航栏,放主要菜单"
                value={shape.annotation ?? ""}
                onChange={(e) => setAnnotation(shape.id, e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-text-muted">
              语义提示(可选的弱提示,不决定最终组件)
              <input
                data-lite-hint
                className={inputCls}
                placeholder="例:sidebar / header / card / form"
                value={shape.semanticHint ?? ""}
                onChange={(e) => setSemanticHint(shape.id, e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex flex-col gap-1 text-[10px] text-text-muted">
                x
                {num(shape.bounds.x, (n) => updateShapeBounds(shape.id, { ...shape.bounds, x: n }))}
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-text-muted">
                y
                {num(shape.bounds.y, (n) => updateShapeBounds(shape.id, { ...shape.bounds, y: n }))}
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-text-muted">
                width
                {num(shape.bounds.width, (n) =>
                  updateShapeBounds(shape.id, { ...shape.bounds, width: Math.max(8, n) }),
                )}
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-text-muted">
                height
                {num(shape.bounds.height, (n) =>
                  updateShapeBounds(shape.id, { ...shape.bounds, height: Math.max(8, n) }),
                )}
              </label>
            </div>
          </div>
        )}
      </div>

      {interp && doc.shapes.length > 0 && (
        <div className="border-t border-border/40 pt-3">
          <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-2">
            解读预览(确定性)
          </h3>
          <div className="flex flex-col gap-1">
            {interp.regions.map((r) => (
              <div key={r.id} data-lite-region className="text-[11px] text-text-secondary">
                <span className="text-accent">{r.role}</span>
                {r.title ? ` · ${r.title}` : ""}
                <span className="text-text-muted"> ({r.confidence})</span>
                {r.children && r.children.length > 0 && (
                  <span className="text-text-muted"> +{r.children.length}</span>
                )}
              </div>
            ))}
          </div>
          {interp.ambiguities.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {interp.ambiguities.map((a, i) => (
                <p key={i} className="text-[10px] text-warning">
                  ⚠ {a.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
