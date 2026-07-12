import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** 全应用共享的右键菜单原语(M1)。受控:调用方持有 {x, y} 与项目列表,
 *  本组件负责定位(视口内钳制)、Esc/点外/滚动关闭、键盘上下与回车。
 *  项目 danger 态红显;separator 画分隔线。 */
export interface ContextMenuItem {
  label: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x, y });
  const [hover, setHover] = useState<number>(-1);

  // Clamp inside the viewport once measured.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const actionable = items
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => !it.separator && !it.disabled);
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = actionable.findIndex(({ i }) => i === hover);
        const next =
          e.key === "ArrowDown"
            ? actionable[(idx + 1) % actionable.length]
            : actionable[(idx - 1 + actionable.length) % actionable.length];
        if (next) setHover(next.i);
      } else if (e.key === "Enter" && hover >= 0) {
        e.preventDefault();
        const it = items[hover];
        onClose();
        it.onSelect?.();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [items, hover, onClose]);

  return createPortal(
    <div
      ref={ref}
      data-context-menu
      className="fixed z-[999] min-w-44 py-1 rounded-lg border border-border/60 bg-bg-panel/95 backdrop-blur-md shadow-xl"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="my-1 h-px bg-border/50" />
        ) : (
          <button
            key={i}
            disabled={it.disabled}
            onMouseEnter={() => setHover(i)}
            onClick={() => {
              onClose();
              it.onSelect?.();
            }}
            className={`w-full text-left px-3 py-1.5 text-xs disabled:opacity-40 ${
              it.danger
                ? "text-error hover:bg-error/10"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            } ${hover === i && !it.disabled ? (it.danger ? "bg-error/10" : "bg-bg-hover text-text-primary") : ""}`}
          >
            {it.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** 便捷 hook:menu 状态 + onContextMenu 绑定器。 */
export function useContextMenu<T>() {
  const [menu, setMenu] = useState<{ x: number; y: number; subject: T } | null>(null);
  const open = (e: React.MouseEvent, subject: T) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, subject });
  };
  return { menu, open, close: () => setMenu(null) };
}
