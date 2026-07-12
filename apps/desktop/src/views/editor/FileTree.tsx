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
import { createDir, createFile, deletePath, renamePath } from "../../lib/editor-api";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "../../components/ContextMenu";
import type { DirEntry } from "../../types/editor-types";
import { useT } from "../../lib/i18n";

interface TreeNodeProps {
  entry: DirEntry;
  depth: number;
  onFileOpen?: (path: string) => void;
  onCtx?: (e: React.MouseEvent, entry: DirEntry) => void;
}

function TreeNode({ entry, depth, onFileOpen, onCtx }: TreeNodeProps) {
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
      onFileOpen?.(entry.path);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={(e) => onCtx?.(e, entry)}
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
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onFileOpen={onFileOpen}
              onCtx={onCtx}
            />
          ))}
        </>
      )}
    </>
  );
}

/** The file-tree dialog (WKWebView has no prompt/confirm): name input for
 *  create/rename, danger confirm for delete. */
interface TreeDialog {
  kind: "create-file" | "create-dir" | "rename" | "delete";
  /** Directory the create lands in, or the full path being renamed/deleted. */
  path: string;
  initial: string;
}

const parentOf = (p: string) => p.split("/").slice(0, -1).join("/");

/** Reusable tree body (no outer header). Shared by the Editor view's
 *  FileTree and the right-side FILES panel. */
export function FileTreeBody({
  onFileOpen,
}: {
  onFileOpen?: (path: string) => void;
}) {
  const t = useT();
  const initialize = useEditorStore((s) => s.initialize);
  const loadDir = useEditorStore((s) => s.loadDir);
  const closeTab = useEditorStore((s) => s.closeTab);
  const tabs = useEditorStore((s) => s.tabs);
  const tree = useEditorStore((s) => s.tree);
  const projectRoot = useEditorStore((s) => s.projectRoot);
  const { menu, open, close } = useContextMenu<DirEntry | null>();
  const [dialog, setDialog] = useState<TreeDialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  useEffect(() => {
    // Always re-init on mount so the store picks up the current workspace.
    getProjectRoot().then((root) => initialize(root));
  }, [initialize]);

  const rootEntries = tree[""] ?? [];

  const openDialog = (d: TreeDialog) => {
    setDialog(d);
    setDialogValue(d.initial);
    setDialogError(null);
  };

  /** Reload the affected directory listing (and the root, cheaply). */
  const refreshDirs = async (...dirs: string[]) => {
    for (const d of new Set(dirs)) await loadDir(d);
  };

  const runDialog = async () => {
    if (!projectRoot || !dialog) return;
    const name = dialogValue.trim();
    try {
      if (dialog.kind === "create-file" || dialog.kind === "create-dir") {
        if (!name) return;
        const rel = dialog.path ? `${dialog.path}/${name}` : name;
        if (dialog.kind === "create-file") await createFile(projectRoot, rel);
        else await createDir(projectRoot, rel);
        await refreshDirs(dialog.path);
      } else if (dialog.kind === "rename") {
        if (!name || name === dialog.initial) {
          setDialog(null);
          return;
        }
        const toRel = parentOf(dialog.path)
          ? `${parentOf(dialog.path)}/${name}`
          : name;
        await renamePath(projectRoot, dialog.path, toRel);
        // Open tabs on the old path (or under it) close — reopen by hand.
        for (const tab of tabs) {
          if (tab.path === dialog.path || tab.path.startsWith(dialog.path + "/")) {
            closeTab(tab.path);
          }
        }
        await refreshDirs(parentOf(dialog.path));
      } else {
        await deletePath(projectRoot, dialog.path);
        for (const tab of tabs) {
          if (tab.path === dialog.path || tab.path.startsWith(dialog.path + "/")) {
            closeTab(tab.path);
          }
        }
        await refreshDirs(parentOf(dialog.path));
      }
      setDialog(null);
    } catch (e) {
      setDialogError(String(e));
    }
  };

  const menuItems = (subject: DirEntry | null): ContextMenuItem[] => {
    // The directory a create targets: the dir itself, a file's parent, or root.
    const baseDir = subject ? (subject.isDir ? subject.path : parentOf(subject.path)) : "";
    const items: ContextMenuItem[] = [
      {
        label: "新建文件…",
        onSelect: () => openDialog({ kind: "create-file", path: baseDir, initial: "" }),
      },
      {
        label: "新建文件夹…",
        onSelect: () => openDialog({ kind: "create-dir", path: baseDir, initial: "" }),
      },
    ];
    if (subject) {
      items.push(
        { separator: true, label: "" },
        {
          label: "重命名…",
          onSelect: () =>
            openDialog({ kind: "rename", path: subject.path, initial: subject.name }),
        },
        {
          label: "复制路径",
          onSelect: () => void navigator.clipboard.writeText(subject.path),
        },
        { separator: true, label: "" },
        {
          label: subject.isDir ? "删除文件夹…" : "删除文件…",
          danger: true,
          onSelect: () =>
            openDialog({ kind: "delete", path: subject.path, initial: subject.name }),
        },
      );
    }
    return items;
  };

  return (
    <div
      className="flex-1 overflow-auto py-1"
      onContextMenu={(e) => {
        // Empty-area right-click → root-level create menu.
        if ((e.target as HTMLElement).closest("button") === null) open(e, null);
      }}
    >
      {rootEntries.length === 0 ? (
        <p className="p-3 text-xs text-text-muted">{t("editor.loading")}</p>
      ) : (
        rootEntries.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            onFileOpen={onFileOpen}
            onCtx={open}
          />
        ))
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.subject)} onClose={close} />
      )}
      {dialog && (
        <div className="fixed inset-0 z-[998] flex items-center justify-center bg-black/30" onClick={() => setDialog(null)}>
          <div
            data-tree-dialog
            className="glass-panel p-4 w-80 flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xs font-medium text-text-primary">
              {dialog.kind === "create-file" && `新建文件于 ${dialog.path || "根目录"}`}
              {dialog.kind === "create-dir" && `新建文件夹于 ${dialog.path || "根目录"}`}
              {dialog.kind === "rename" && `重命名 ${dialog.path}`}
              {dialog.kind === "delete" && `删除 ${dialog.path}?`}
            </h3>
            {dialog.kind === "delete" ? (
              <p className="text-[11px] text-text-muted">
                不可撤销;打开中的相关 tab 会被关闭。绑定它的 criteria 走"悬垂"信号,不会被级联删除。
              </p>
            ) : (
              <input
                autoFocus
                className="text-xs px-2 py-1.5 rounded-md"
                placeholder={dialog.kind === "rename" ? undefined : "名称"}
                value={dialogValue}
                onChange={(e) => setDialogValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runDialog();
                  if (e.key === "Escape") setDialog(null);
                }}
              />
            )}
            {dialogError && <p className="text-[10px] text-error">{dialogError}</p>}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setDialog(null)}
                className="text-xs text-text-muted hover:text-text-primary px-2 py-1"
              >
                取消
              </button>
              <button
                onClick={() => void runDialog()}
                className={`text-xs px-3 py-1 rounded-md ${
                  dialog.kind === "delete"
                    ? "bg-error/15 text-error hover:bg-error/25"
                    : "glass-button-primary"
                }`}
              >
                {dialog.kind === "delete" ? "删除" : "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  const t = useT();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          {t("editor.explorer")}
        </span>
      </div>
      <FileTreeBody />
    </div>
  );
}
