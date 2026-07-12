import type { SketchShape } from "../model/types";

/** One rough rectangle: annotation inside, hint chip, selection chrome +
 *  four corner handles. Handles carry data-lite-handle so the canvas's
 *  pointer routing can tell them from the shape body. */
export function LiteShapeView({
  shape,
  selected,
}: {
  shape: SketchShape;
  selected: boolean;
}) {
  const b = shape.bounds;
  const corners: { hx: 0 | 1; hy: 0 | 1; cursor: string }[] = [
    { hx: 0, hy: 0, cursor: "nwse-resize" },
    { hx: 1, hy: 0, cursor: "nesw-resize" },
    { hx: 0, hy: 1, cursor: "nesw-resize" },
    { hx: 1, hy: 1, cursor: "nwse-resize" },
  ];
  return (
    <div
      data-lite-shape={shape.id}
      className={`absolute rounded-sm border-2 ${
        selected
          ? "border-blue-500 bg-blue-500/10"
          : "border-slate-400/80 bg-slate-400/5 hover:border-slate-500"
      }`}
      style={{ left: b.x, top: b.y, width: b.width, height: b.height }}
    >
      {shape.annotation && (
        <div className="absolute inset-0 flex items-center justify-center p-1 pointer-events-none">
          <span className="text-[11px] leading-tight text-slate-600 text-center break-all">
            {shape.annotation}
          </span>
        </div>
      )}
      {shape.semanticHint && (
        <span className="absolute -top-4 left-0 text-[9px] px-1 rounded bg-slate-600 text-white pointer-events-none">
          {shape.semanticHint}
        </span>
      )}
      {selected &&
        corners.map((c) => (
          <div
            key={`${c.hx}${c.hy}`}
            data-lite-handle={`${c.hx},${c.hy}`}
            className="absolute w-2 h-2 bg-white border border-blue-500 rounded-[2px]"
            style={{
              left: `calc(${c.hx * 100}% - 4px)`,
              top: `calc(${c.hy * 100}% - 4px)`,
              cursor: c.cursor,
            }}
          />
        ))}
    </div>
  );
}
