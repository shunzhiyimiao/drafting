import { useEffect, useState, useCallback } from "react";
import { Search, FileText, X } from "lucide-react";
import { searchFiles } from "../lib/editor-api";
import { useEditorStore } from "../stores/editor-store";
import { useNavigationStore } from "../stores/navigation-store";
import type { SearchMatch } from "../types/editor-types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SearchDialog({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);

  const openFile = useEditorStore((s) => s.openFile);
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  const doSearch = useCallback(async () => {
    if (!query.trim()) {
      setMatches([]);
      setTotalMatches(0);
      setTotalFiles(0);
      return;
    }
    setSearching(true);
    try {
      const result = await searchFiles(".", query, caseSensitive);
      setMatches(result.matches);
      setTotalMatches(result.totalMatches);
      setTotalFiles(result.totalFiles);
      setTruncated(result.truncated);
    } catch {
      setMatches([]);
    } finally {
      setSearching(false);
    }
  }, [query, caseSensitive]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [query, caseSensitive, open, doSearch]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setMatches([]);
    }
  }, [open]);

  if (!open) return null;

  const handleSelect = async (match: SearchMatch) => {
    await openFile(match.path);
    setActiveView("editor");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50"
      onClick={onClose}
    >
      <div
        className="glass-thick rounded-2xl w-[640px] max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
          <Search size={14} className="text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in files..."
            autoFocus
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          <label className="flex items-center gap-1 text-[10px] text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="w-3 h-3 accent-accent"
            />
            Aa
          </label>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary">
            <X size={14} />
          </button>
        </div>

        {query.trim() && (
          <div className="px-4 py-1.5 text-[10px] text-text-muted border-b border-white/5">
            {searching
              ? "Searching..."
              : `${totalMatches} results in ${totalFiles} files${truncated ? " (truncated)" : ""}`}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {matches.length === 0 && query.trim() && !searching ? (
            <p className="p-4 text-xs text-text-muted text-center">
              No results found
            </p>
          ) : (
            matches.map((m, idx) => (
              <button
                key={`${m.path}-${m.line}-${idx}`}
                onClick={() => handleSelect(m)}
                className="w-full flex items-start gap-2 px-4 py-2 text-left hover:bg-white/5 transition-colors border-b border-white/3"
              >
                <FileText size={11} className="text-text-muted mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-accent truncate">
                      {m.path}
                    </span>
                    <span className="text-[10px] text-text-muted tabular-nums">
                      L{m.line}:{m.column}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary truncate font-mono">
                    {m.preview}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
