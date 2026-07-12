import { useEffect, useRef, useState } from "react";
import { normalizeBounds, type Bounds } from "../model/types";
import { MIN_SHAPE_SIZE, useSketchLiteStore } from "../store";
import { LiteShapeView } from "./LiteShapeView";

/** The napkin. Pointer-capture based gestures, one at a time:
 *  - rectangle tool: press-drag-release draws (any direction, normalized)
 *  - select tool: press a shape = select + move; press a corner = resize;
 *    press empty canvas = clear selection
 *  - Escape cancels the in-flight gesture and restores bounds
 *  - Delete/Backspace removes the selection (unless typing in a field) */
export function LiteCanvas() {
  const doc = useSketchLiteStore((s) => s.doc);
  const tool = useSketchLiteStore((s) => s.tool);
  const selectedShapeId = useSketchLiteStore((s) => s.selectedShapeId);
  const gesture = useSketchLiteStore((s) => s.gesture);
  const select = useSketchLiteStore((s) => s.select);
  const setGesture = useSketchLiteStore((s) => s.setGesture);
  const addShape = useSketchLiteStore((s) => s.addShape);
  const updateShapeBounds = useSketchLiteStore((s) => s.updateShapeBounds);
  const deleteShape = useSketchLiteStore((s) => s.deleteShape);
  const setAnnotation = useSketchLiteStore((s) => s.setAnnotation);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  /** In-place comment editing (L2): double-click a shape → a floating
   *  textarea right on the canvas. Enter/blur saves, Escape discards. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftComment, setDraftComment] = useState("");

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = surfaceRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.x, y: e.clientY - r.y };
  };

  // Keyboard: delete selection, Escape cancels the gesture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing =
        el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
      if (e.key === "Escape") {
        const g = useSketchLiteStore.getState().gesture;
        if (g && (g.kind === "move" || g.kind === "resize")) {
          updateShapeBounds(g.shapeId, g.startBounds);
        }
        setGesture(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
        const sel = useSketchLiteStore.getState().selectedShapeId;
        if (sel) {
          e.preventDefault();
          deleteShape(sel);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteShape, setGesture, updateShapeBounds]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || gesture) return;
    surfaceRef.current?.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    const target = e.target as HTMLElement;

    if (tool === "rectangle") {
      setGesture({
        kind: "draw",
        pointerId: e.pointerId,
        start: p,
        draft: { x: p.x, y: p.y, width: 0, height: 0 },
      });
      return;
    }

    // Select tool. Corner handle first (it sits on top of the shape).
    const handleEl = target.closest<HTMLElement>("[data-lite-handle]");
    const shapeEl = target.closest<HTMLElement>("[data-lite-shape]");
    if (handleEl && selectedShapeId) {
      const [hx, hy] = handleEl.getAttribute("data-lite-handle")!.split(",").map(Number) as [
        0 | 1,
        0 | 1,
      ];
      const shape = doc.shapes.find((s) => s.id === selectedShapeId);
      if (!shape) return;
      setGesture({
        kind: "resize",
        pointerId: e.pointerId,
        shapeId: selectedShapeId,
        hx,
        hy,
        startBounds: shape.bounds,
      });
      return;
    }
    if (shapeEl) {
      const id = shapeEl.getAttribute("data-lite-shape")!;
      select(id);
      const shape = doc.shapes.find((s) => s.id === id);
      if (!shape) return;
      setGesture({
        kind: "move",
        pointerId: e.pointerId,
        shapeId: id,
        start: p,
        startBounds: shape.bounds,
        moved: false,
      });
      return;
    }
    select(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = useSketchLiteStore.getState().gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    const p = localPoint(e);

    if (g.kind === "draw") {
      setGesture({ ...g, draft: normalizeBounds(g.start, p) });
      return;
    }
    if (g.kind === "move") {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < 3) return;
      if (!g.moved) setGesture({ ...g, moved: true });
      updateShapeBounds(g.shapeId, {
        ...g.startBounds,
        x: g.startBounds.x + dx,
        y: g.startBounds.y + dy,
      });
      return;
    }
    // resize: dragged corner follows the pointer, opposite corner anchors.
    const b = g.startBounds;
    const anchor = {
      x: g.hx === 1 ? b.x : b.x + b.width,
      y: g.hy === 1 ? b.y : b.y + b.height,
    };
    const next: Bounds = normalizeBounds(anchor, p);
    updateShapeBounds(g.shapeId, {
      x: next.x,
      y: next.y,
      width: Math.max(MIN_SHAPE_SIZE, next.width),
      height: Math.max(MIN_SHAPE_SIZE, next.height),
    });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // Hit-test by COORDINATES, not e.target: the first click's pointer
    // capture retargets the compat click/dblclick events to the surface,
    // so the target is useless here (a real-user bug the e2e caught).
    const p = localPoint(e);
    const shape = [...useSketchLiteStore.getState().doc.shapes]
      .reverse() // painted last = on top
      .find(
        (s) =>
          p.x >= s.bounds.x &&
          p.x <= s.bounds.x + s.bounds.width &&
          p.y >= s.bounds.y &&
          p.y <= s.bounds.y + s.bounds.height,
      );
    if (!shape) return;
    select(shape.id);
    setDraftComment(shape.annotation ?? "");
    setEditingId(shape.id);
  };

  const commitComment = () => {
    if (editingId) setAnnotation(editingId, draftComment.trim());
    setEditingId(null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = useSketchLiteStore.getState().gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    setGesture(null);
    if (g.kind === "draw") {
      if (g.draft.width >= MIN_SHAPE_SIZE && g.draft.height >= MIN_SHAPE_SIZE) {
        addShape(g.draft);
      }
    }
  };

  return (
    <div className="flex-1 glass-panel overflow-auto p-6 min-h-0 canvas-scroll">
      <div
        ref={surfaceRef}
        data-lite-canvas
        className={`relative mx-auto bg-white rounded-lg shadow-lg overflow-hidden ${
          tool === "rectangle" ? "cursor-crosshair" : "cursor-default"
        }`}
        style={{ width: doc.canvas.width, height: doc.canvas.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {doc.shapes.map((s) => (
          <LiteShapeView key={s.id} shape={s} selected={s.id === selectedShapeId} />
        ))}
        {gesture?.kind === "draw" && gesture.draft.width > 0 && (
          <div
            className="absolute border-2 border-dashed border-blue-400 bg-blue-400/5 rounded-sm pointer-events-none"
            style={{
              left: gesture.draft.x,
              top: gesture.draft.y,
              width: gesture.draft.width,
              height: gesture.draft.height,
            }}
          />
        )}
        {editingId &&
          (() => {
            const shape = doc.shapes.find((s) => s.id === editingId);
            if (!shape) return null;
            const b = shape.bounds;
            return (
              <textarea
                data-lite-comment-editor
                autoFocus
                value={draftComment}
                onChange={(e) => setDraftComment(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={commitComment}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitComment();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation(); // don't cancel gestures/selection
                    setEditingId(null);
                  }
                }}
                placeholder="这个区域是什么?要什么内容?"
                className="absolute z-20 text-[11px] leading-snug p-1.5 rounded-md border-2 border-amber-400 bg-amber-50 text-slate-800 shadow-lg resize-none placeholder:text-slate-400"
                style={{
                  left: b.x,
                  top: b.y,
                  width: Math.max(b.width, 180),
                  height: Math.max(52, Math.min(b.height, 96)),
                }}
              />
            );
          })()}
        {doc.shapes.length === 0 && !gesture && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-slate-300">用矩形工具画几个大概的区域 — 不用画得准</p>
          </div>
        )}
      </div>
    </div>
  );
}
