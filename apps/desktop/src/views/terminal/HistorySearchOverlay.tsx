import { useEffect, useRef, useState } from "react";
import { historyList, historySearch } from "../../lib/terminal-api";
import type { HistoryEntry } from "../../lib/terminal-api";
import { useT } from "../../lib/i18n";

interface Props {
  projectRoot: string;
  onPick: (command: string) => void;
  onClose: () => void;
}

export function HistorySearchOverlay({ projectRoot, onPick, onClose }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fetch when query changes (debounced).
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const result =
          query.trim().length === 0
            ? await historyList(projectRoot, 30)
            : await historySearch(projectRoot, query, 30);
        setItems(result);
        setSelected(0);
      } catch (err) {
        console.warn("history search failed", err);
        setItems([]);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [projectRoot, query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = items[selected];
      if (pick) onPick(pick.command);
    }
  };

  return (
    <div
      className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex items-start justify-center pt-16"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[90%] bg-bg-secondary border border-white/10 rounded-md shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-white/5">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t("terminal.history.placeholder")}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-4 text-xs text-text-muted text-center">
              {t("terminal.history.empty")}
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => onPick(item.command)}
                onMouseEnter={() => setSelected(idx)}
                className={`px-3 py-1.5 text-xs font-mono cursor-pointer ${
                  idx === selected
                    ? "bg-accent/20 text-text-primary"
                    : "text-text-secondary hover:bg-white/3"
                }`}
              >
                {item.command}
              </div>
            ))
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-text-muted flex justify-between">
          <span>{t("terminal.history.help")}</span>
          <span>{items.length} {t("common.matches")}</span>
        </div>
      </div>
    </div>
  );
}
