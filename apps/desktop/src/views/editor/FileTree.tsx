import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileText,
  Zap,
  Lock,
} from "lucide-react";
import { useEditorStore } from "../../stores/editor-store";
import { getProjectRoot } from "../../lib/app-bootstrap";
import type { DirEntry } from "../../types/editor-types";
import { useT } from "../../lib/i18n";

interface TreeNodeProps {
  entry: DirEntry;
  depth: number;
}

function TreeNode({ entry, depth }: TreeNodeProps) {
  const expandedDirs = useEditorStore((s) => s.expandedDirs);
  const tree = useEditorStore((s) => s.tree);
  const toggleDir = useEditorStore((s) => s.toggleDir);
  const openFile = useEditorStore((s) => s.openFile);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);

  const [identity, setIdentity] = useState<{
    generated: boolean;
    adapter: boolean;
    blueprint: boolean;
  } | null>(null);

  // Simple heuristic badges without hitting backend per-file
  useEffect(() => {
    if (!entry.isDir) {
      const isGenerated =
        entry.path.startsWith("packages/sockets/") ||
        entry.path.startsWith("packages/wiring/");
      setIdentity({
        generated: isGenerated,
        adapter: entry.path.startsWith("packages/adapters/"),
        blueprint: entry.path.endsWith(".blueprint.md"),
      });
    }
  }, [entry]);

  const isOpen = expandedDirs.has(entry.path);
  const isActive = activeTabPath === entry.path;

  const handleClick = async () => {
    if (entry.isDir) {
      await toggleDir(entry.path);
    } else {
      await openFile(entry.path);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-1 px-2 py-0.5 text-[11px] text-left hover:bg-bg-hover transition-colors ${
          isActive ? "bg-bg-active text-text-primary" : "text-text-secondary"
        }`}
        style={{ paddingLeft: depth * 10 + 6 }}
      >
        {entry.isDir ? (
          <>
            {isOpen ? (
              <ChevronDown size={10} className="shrink-0" />
            ) : (
              <ChevronRight size={10} className="shrink-0" />
            )}
            {isOpen ? (
              <FolderOpen size={11} className="text-accent shrink-0" />
            ) : (
              <Folder size={11} className="text-accent shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-[10px] shrink-0" />
            {identity?.adapter ? (
              <Zap size={11} className="text-accent shrink-0" />
            ) : identity?.blueprint ? (
              <FileText size={11} className="text-success shrink-0" />
            ) : identity?.generated ? (
              <Lock size={11} className="text-warning shrink-0" />
            ) : (
              <File size={11} className="text-text-muted shrink-0" />
            )}
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {entry.isDir && isOpen && tree[entry.path] && (
        <>
          {tree[entry.path].map((child) => (
            <TreeNode key={child.path} entry={child} depth={depth + 1} />
          ))}
        </>
      )}
    </>
  );
}

export function FileTree() {
  const t = useT();
  const initialize = useEditorStore((s) => s.initialize);
  const tree = useEditorStore((s) => s.tree);

  useEffect(() => {
    // Always re-init on mount so the store picks up the current workspace.
    getProjectRoot().then((root) => initialize(root));
  }, [initialize]);

  const rootEntries = tree[""] ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t("editor.explorer")}
        </span>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {rootEntries.length === 0 ? (
          <p className="p-3 text-xs text-text-muted">{t("editor.loading")}</p>
        ) : (
          rootEntries.map((entry) => (
            <TreeNode key={entry.path} entry={entry} depth={0} />
          ))
        )}
      </div>
    </div>
  );
}
