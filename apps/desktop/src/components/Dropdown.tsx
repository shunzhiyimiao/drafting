import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional sub-label rendered in muted color */
  hint?: string;
  /** Mark this option visually (e.g. for "deleted" placeholders) */
  marker?: "error" | "muted";
}

interface Props {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Tailwind classes applied to the trigger button */
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Tauri/WebKit-safe replacement for native <select>. Native selects break
 * inside any ancestor with backdrop-filter — the OS popup is rendered in
 * a separate compositor layer and gets clipped by the backdrop-filter
 * stacking context. This dropdown renders the menu via React Portal so
 * it escapes all parent stacking contexts.
 */
export function Dropdown({
  value,
  options,
  onChange,
  className = "",
  placeholder = "—",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;

    const recalc = () => {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      setPos({
        top: r.bottom + 4,
        left: r.left,
        width: Math.max(r.width, 160),
      });
    };
    recalc();

    const handleAway = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("mousedown", handleAway);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("mousedown", handleAway);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-between gap-1.5 bg-bg-primary border border-border rounded text-text-primary hover:border-accent/50 focus:border-accent focus:outline-none disabled:opacity-50 ${className}`}
      >
        <span className="truncate text-left">
          {selected?.label ?? <span className="text-text-muted">{placeholder}</span>}
        </span>
        <ChevronDown size={10} className="shrink-0 opacity-60" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
            className="glass-thick rounded-lg overflow-hidden max-h-64 overflow-y-auto py-1"
          >
            {options.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-text-muted">No options</div>
            )}
            {options.map((opt) => {
              const isSelected = opt.value === value;
              const markerCls =
                opt.marker === "error"
                  ? "text-error"
                  : opt.marker === "muted"
                    ? "text-text-muted"
                    : "text-text-primary";
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-white/10 ${markerCls}`}
                >
                  <span className="w-3 shrink-0">
                    {isSelected && <Check size={10} />}
                  </span>
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="text-[10px] text-text-muted truncate">
                      {opt.hint}
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
