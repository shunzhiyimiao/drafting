/**
 * P3.3 staged fragment card — the transcribed module awaiting placement.
 * UI-temporary by ruling: not in the document, not in undo; Esc / ✕
 * discards and NOTHING happened. The chip is the drag handle: pressing it
 * arms the fourth DragSource (the canvas session machine consumes the arm
 * on first move — same contract as palette). The sole upgrade action is
 * 「整页 → 新 tab」: the SAME transcription product becomes a new document
 * (zero extra AI calls, never touching the current doc).
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { printSketchMarkup } from "@drafting/sketch-core";
import { useSketchStore } from "../../../stores/sketch-store";
import { fragmentToPageSketch } from "../pipeline/ai-transcribe";

export function LiteStagedFragment() {
  const staged = useSketchStore((s) => s.stagedFragment);
  const setStagedFragment = useSketchStore((s) => s.setStagedFragment);
  const setStagedDrag = useSketchStore((s) => s.setStagedDrag);
  const [err, setErr] = useState<string | null>(null);
  /** True from pressing the handle until the global pointerup: while a
   *  placement drag may be live, Esc belongs to the CANVAS (cancel the
   *  drag, keep the item staged for another try) — not to discard. */
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!staged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || draggingRef.current) return;
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      setStagedFragment(null);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerup", onUp);
    };
  }, [staged, setStagedFragment]);

  if (!staged) return null;

  const upgrade = async () => {
    setErr(null);
    try {
      const page = fragmentToPageSketch(staged.node, staged.label);
      await useSketchStore
        .getState()
        .generateFromLite(staged.label, (id) => printSketchMarkup({ ...page, id }), "new-doc");
      setStagedFragment(null);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div
      data-staged-fragment
      className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] bg-accent/10 text-accent border border-accent/30"
    >
      <button
        data-staged-handle
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          draggingRef.current = true;
          setStagedDrag({ pointerId: e.pointerId });
        }}
        className="cursor-grab active:cursor-grabbing select-none px-2 py-0.5 rounded bg-accent/20 font-medium"
        title="按住拖到画布放置"
      >
        📦 {staged.label}
      </button>
      <span className="text-text-muted">拖到画布放置 · Esc 丢弃</span>
      <div className="flex-1" />
      {err && <span className="text-error max-w-64 truncate">{err}</span>}
      <button
        data-staged-upgrade
        onClick={() => void upgrade()}
        className="px-2 py-0.5 rounded hover:bg-accent/20"
        title="其实是一整页?同一转写产物落成新 sketch,当前文档不动"
      >
        整页 → 新 tab
      </button>
      <button
        data-staged-discard
        onClick={() => setStagedFragment(null)}
        title="丢弃(无事发生)"
        className="hover:bg-accent/20 rounded p-0.5"
      >
        <X size={12} />
      </button>
    </div>
  );
}
