import { useState } from "react";
import {
  BoxSelect,
  Group,
  Image as ImageIcon,
  List as ListIcon,
  MousePointerClick,
  Search,
  TextCursorInput,
  Type,
  Frame as FrameIcon,
} from "lucide-react";
import { findNode, useSketchStore, type NodeKind } from "../../stores/sketch-store";

/** The designer palette (S2a, extracted from SketchView): OUR alphabet in
 *  categories, searchable. Click adds into the selection; pointerdown arms
 *  the one-shot drag (consumed by the canvas session controller — S1).
 *  Categories carry only what the dialect has — nothing invented. */
const CATEGORIES: { title: string; items: { kind: NodeKind; label: string; icon: typeof Type }[] }[] = [
  {
    title: "布局",
    items: [
      { kind: "stack", label: "Stack", icon: BoxSelect },
      { kind: "frame", label: "Frame", icon: FrameIcon },
      { kind: "list", label: "List", icon: ListIcon },
    ],
  },
  {
    title: "内容",
    items: [
      { kind: "text", label: "Text", icon: Type },
      { kind: "button", label: "Button", icon: MousePointerClick },
      { kind: "input", label: "Input", icon: TextCursorInput },
      { kind: "image", label: "Image", icon: ImageIcon },
    ],
  },
];

export function SketchPalette() {
  const active = useSketchStore((s) => s.active);
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const parseError = useSketchStore((s) => s.parseError);
  const addNode = useSketchStore((s) => s.addNode);
  const setPaletteDrag = useSketchStore((s) => s.setPaletteDrag);
  const wrapInStack = useSketchStore((s) => s.wrapInStack);
  const [query, setQuery] = useState("");

  const disabled = !selectedNodeId || !!parseError;
  const q = query.trim().toLowerCase();
  const categories = CATEGORIES.map((c) => ({
    ...c,
    items: c.items.filter((i) => !q || i.label.toLowerCase().includes(q) || i.kind.includes(q)),
  })).filter((c) => c.items.length > 0);

  return (
    <div className="glass-panel p-2 flex flex-col gap-2">
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索组件…"
          className="w-full text-[11px] pl-6 pr-2 py-1.5 rounded-md"
        />
      </div>
      {categories.map((c) => (
        <div key={c.title}>
          <h3 className="text-[9px] uppercase tracking-widest text-text-muted px-1 mb-1">
            {c.title}
          </h3>
          <div className="grid grid-cols-2 gap-1">
            {c.items.map(({ kind, label, icon: Icon }) => (
              <button
                key={kind}
                onClick={() => selectedNodeId && addNode(selectedNodeId, kind)}
                onPointerDown={(e) => setPaletteDrag({ kind, pointerId: e.pointerId })}
                disabled={disabled}
                title={`点击加入选中容器 · 或拖到画布`}
                className="flex flex-col items-center gap-1 px-1 py-2 rounded-md text-[10px] text-text-secondary border border-transparent hover:border-border hover:bg-bg-hover hover:text-text-primary disabled:opacity-40 transition-colors"
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {categories.length === 0 && (
        <p className="text-[10px] text-text-muted px-1">没有匹配 “{query}” 的组件</p>
      )}
      {/* The explicit structure command (§7.1): wrapping is asked for. */}
      <button
        onClick={() => selectedNodeId && wrapInStack(selectedNodeId)}
        disabled={
          disabled || !active || !findNode(active.root, selectedNodeId!)?.parent
        }
        title="把选中节点包进新 Stack"
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-text-secondary border border-border/50 hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
      >
        <Group size={12} />
        Wrap in Stack
      </button>
    </div>
  );
}
