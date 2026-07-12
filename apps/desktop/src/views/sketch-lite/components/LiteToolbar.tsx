import { MousePointer2, Square, Trash2 } from "lucide-react";
import { useSketchLiteStore } from "../store";

/** Left rail: Select / Rectangle / Delete. Tiny by design — the sketch is
 *  an input napkin, not Figma. */
export function LiteToolbar() {
  const tool = useSketchLiteStore((s) => s.tool);
  const setTool = useSketchLiteStore((s) => s.setTool);
  const selectedShapeId = useSketchLiteStore((s) => s.selectedShapeId);
  const deleteShape = useSketchLiteStore((s) => s.deleteShape);

  const btn = (active: boolean) =>
    `flex flex-col items-center gap-1 px-2 py-2 rounded-md text-[10px] transition-colors ${
      active
        ? "bg-accent/20 text-accent"
        : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
    }`;

  return (
    <div className="glass-panel flex flex-col items-stretch gap-1 p-1.5 w-16 shrink-0">
      <button data-lite-tool="select" className={btn(tool === "select")} onClick={() => setTool("select")}>
        <MousePointer2 size={14} />
        选择
      </button>
      <button
        data-lite-tool="rectangle"
        className={btn(tool === "rectangle")}
        onClick={() => setTool("rectangle")}
      >
        <Square size={14} />
        矩形
      </button>
      <div className="flex-1" />
      <button
        data-lite-tool="delete"
        className={`${btn(false)} disabled:opacity-30`}
        disabled={!selectedShapeId}
        onClick={() => selectedShapeId && deleteShape(selectedShapeId)}
        title="删除选中 (Delete)"
      >
        <Trash2 size={14} />
        删除
      </button>
    </div>
  );
}
