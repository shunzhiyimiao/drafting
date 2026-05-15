import { useEffect, useRef, useState, useCallback } from "react";
import { Search, FileText, X, ChevronRight, ChevronDown } from "lucide-react";
import {
  searchAdvanced,
  cancelSearch,
  onSearchProgress,
} from "../lib/editor-api";
import { useEditorStore } from "../stores/editor-store";
import { useNavigationStore } from "../stores/navigation-store";
import { useT } from "../lib/i18n";
import type {
  FileMatches,
  SearchMatch,
  SearchProgressPayload,
} from "../types/editor-types";

interface Props {
  open: boolean;
  onClose: () => void;
}

function newSearchId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function SearchDialog({ open, onClose }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [includeGlob, setIncludeGlob] = useState("");
  const [excludeGlob, setExcludeGlob] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [files, setFiles] = useState<FileMatches[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [scannedFiles, setScannedFiles] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

  const projectRoot = useEditorStore((s) => s.projectRoot);
  const openFile = useEditorStore((s) => s.openFile);
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  const currentSearchIdRef = useRef<string | null>(null);

  // Subscribe to progress events once the dialog opens.
  useEffect(() => {
    if (!open) return;
    let unlisten: (() => void) | null = null;
    onSearchProgress((p: SearchProgressPayload) => {
      if (p.searchId === currentSearchIdRef.current) {
        setScannedFiles(p.scannedFiles);
        setTotalFiles(p.matchedFiles);
        setTotalMatches(p.totalMatches);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [open]);

  const doSearch = useCallback(async () => {
    if (!projectRoot) {
      setError("No project open");
      return;
    }
    if (!query.trim()) {
      setFiles([]);
      setTotalMatches(0);
      setTotalFiles(0);
      setScannedFiles(0);
      setTruncated(false);
      setCancelled(false);
      setError(null);
      return;
    }

    // Cancel any in-flight search.
    if (currentSearchIdRef.current) {
      void cancelSearch(currentSearchIdRef.current).catch(() => {});
    }

    const searchId = newSearchId();
    currentSearchIdRef.current = searchId;
    setSearching(true);
    setError(null);
    setScannedFiles(0);

    try {
      const result = await searchAdvanced(projectRoot, {
        query,
        caseSensitive,
        wholeWord,
        useRegex,
        includeGlobs: splitGlobs(includeGlob),
        excludeGlobs: splitGlobs(excludeGlob),
        searchId,
      });
      // Drop the result if a newer search has started.
      if (currentSearchIdRef.current !== searchId) return;
      setFiles(result.files);
      setTotalMatches(result.totalMatches);
      setTotalFiles(result.totalFiles);
      setScannedFiles(result.scannedFiles);
      setTruncated(result.truncated);
      setCancelled(result.cancelled);
    } catch (e: any) {
      if (currentSearchIdRef.current !== searchId) return;
      setError(typeof e === "string" ? e : e?.message ?? "search failed");
      setFiles([]);
    } finally {
      if (currentSearchIdRef.current === searchId) {
        setSearching(false);
        currentSearchIdRef.current = null;
      }
    }
  }, [
    projectRoot,
    query,
    caseSensitive,
    wholeWord,
    useRegex,
    includeGlob,
    excludeGlob,
  ]);

  // Debounced search — longer debounce than v1 since the query can be expensive.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [
    query,
    caseSensitive,
    wholeWord,
    useRegex,
    includeGlob,
    excludeGlob,
    open,
    doSearch,
  ]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setFiles([]);
      setCollapsedFiles(new Set());
      if (currentSearchIdRef.current) {
        void cancelSearch(currentSearchIdRef.current).catch(() => {});
        currentSearchIdRef.current = null;
      }
    }
  }, [open]);

  if (!open) return null;

  const handleSelect = async (match: SearchMatch) => {
    await openFile(match.path);
    setActiveView("editor");
    onClose();
  };

  const toggleFile = (path: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleCancel = () => {
    if (currentSearchIdRef.current) {
      void cancelSearch(currentSearchIdRef.current);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50"
      onClick={onClose}
    >
      <div
        className="glass-thick rounded-2xl w-[720px] max-h-[75vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
          <Search size={14} className="text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={useRegex ? t("search.regexPlaceholder") : t("search.placeholder")}
            autoFocus
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          <ToggleButton active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} title={t("search.matchCase")}>
            Aa
          </ToggleButton>
          <ToggleButton active={wholeWord} onClick={() => setWholeWord((v) => !v)} title={t("search.wholeWord")}>
            W
          </ToggleButton>
          <ToggleButton active={useRegex} onClick={() => setUseRegex((v) => !v)} title={t("search.regex")}>
            .*
          </ToggleButton>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`px-1.5 py-0.5 text-[10px] rounded ${
              showFilters || includeGlob || excludeGlob
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
            title={t("search.filters")}
          >
            …
          </button>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary">
            <X size={14} />
          </button>
        </div>

        {showFilters && (
          <div className="px-4 py-2 flex items-center gap-2 border-b border-white/5 text-[11px]">
            <input
              value={includeGlob}
              onChange={(e) => setIncludeGlob(e.target.value)}
              placeholder={t("search.includeGlob")}
              className="flex-1 bg-white/5 rounded px-2 py-1 text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <input
              value={excludeGlob}
              onChange={(e) => setExcludeGlob(e.target.value)}
              placeholder={t("search.excludeGlob")}
              className="flex-1 bg-white/5 rounded px-2 py-1 text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>
        )}

        {query.trim() && (
          <div className="px-4 py-1.5 text-[10px] text-text-muted border-b border-white/5 flex items-center justify-between">
            <span>
              {error
                ? t("search.error", { error })
                : searching
                  ? t("search.searching", {
                      scanned: scannedFiles,
                      matches: totalMatches,
                      files: totalFiles,
                    })
                  : cancelled
                    ? t("search.cancelled", {
                        matches: totalMatches,
                        files: totalFiles,
                      })
                    : t("search.results", {
                        matches: totalMatches,
                        files: totalFiles,
                        truncated: truncated ? t("search.truncated") : "",
                      })}
            </span>
            {searching && (
              <button
                onClick={handleCancel}
                className="text-text-muted hover:text-warning"
              >
                {t("common.cancel")}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {files.length === 0 && query.trim() && !searching && !error ? (
            <p className="p-4 text-xs text-text-muted text-center">
              {t("search.noResults")}
            </p>
          ) : (
            files.map((fm) => {
              const collapsed = collapsedFiles.has(fm.path);
              return (
                <div key={fm.path} className="border-b border-white/3">
                  <button
                    onClick={() => toggleFile(fm.path)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/3 transition-colors"
                  >
                    {collapsed ? (
                      <ChevronRight size={11} className="text-text-muted shrink-0" />
                    ) : (
                      <ChevronDown size={11} className="text-text-muted shrink-0" />
                    )}
                    <FileText size={11} className="text-text-muted shrink-0" />
                    <span className="text-[11px] text-accent truncate flex-1">
                      {fm.path}
                    </span>
                    <span className="text-[10px] text-text-muted tabular-nums">
                      {fm.matches.length}
                    </span>
                  </button>
                  {!collapsed &&
                    fm.matches.map((m, idx) => (
                      <button
                        key={`${m.line}-${m.column}-${idx}`}
                        onClick={() => handleSelect(m)}
                        className="w-full flex items-center gap-2 pl-8 pr-3 py-1 text-left hover:bg-white/5 transition-colors"
                      >
                        <span className="text-[10px] text-text-muted tabular-nums w-10 text-right shrink-0">
                          {m.line}:{m.column}
                        </span>
                        <span className="text-[11px] text-text-secondary truncate font-mono flex-1">
                          {m.preview}
                        </span>
                      </button>
                    ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
        active
          ? "bg-accent/20 text-accent"
          : "text-text-muted hover:text-text-secondary hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

function splitGlobs(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
