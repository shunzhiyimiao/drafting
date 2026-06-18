import { useEffect, useState } from "react";
import {
  GitBranch,
  RefreshCw,
  Plus,
  Minus,
  FileText,
  ArrowDown,
  ArrowUp,
  DownloadCloud,
} from "lucide-react";
import { useGitStore } from "../../stores/git-store";
import type { FileStatus } from "../../types/git-types";
import { CommitBox } from "./CommitBox";
import { getProjectRoot } from "../../lib/app-bootstrap";
import { useT } from "../../lib/i18n";

export function GitView() {
  const t = useT();
  const status = useGitStore((s) => s.status);
  const branches = useGitStore((s) => s.branches);
  const log = useGitStore((s) => s.log);
  const selectedPath = useGitStore((s) => s.selectedPath);
  const activeDiff = useGitStore((s) => s.activeDiff);
  const loading = useGitStore((s) => s.loading);
  const initialize = useGitStore((s) => s.initialize);
  const refresh = useGitStore((s) => s.refresh);
  const selectFile = useGitStore((s) => s.selectFile);
  const stage = useGitStore((s) => s.stage);
  const stageAll = useGitStore((s) => s.stageAll);
  const unstage = useGitStore((s) => s.unstage);
  const commit = useGitStore((s) => s.commit);
  const checkout = useGitStore((s) => s.checkout);
  const remoteBusy = useGitStore((s) => s.remoteBusy);
  const fetch = useGitStore((s) => s.fetch);
  const pull = useGitStore((s) => s.pull);
  const push = useGitStore((s) => s.push);

  useEffect(() => {
    getProjectRoot().then((root) => initialize(root));
  }, [initialize]);

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        {t("git.loadingStatus")}
      </div>
    );
  }

  if (!status?.isRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <GitBranch size={48} className="text-text-muted mb-4" />
        <h2 className="text-lg font-medium text-text-primary mb-2">
          {t("git.notARepo")}
        </h2>
        <p className="text-sm text-text-muted max-w-md">
          {t("git.notARepoDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-2 p-2">
      {/* Left: Changes + Commit */}
      <div className="w-72 flex flex-col gap-2 shrink-0">
        {/* Branch header */}
        <div className="glass-panel px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch size={12} className="text-accent" />
              <BranchSelector
                current={status.branch}
                branches={branches}
                onSelect={checkout}
              />
            </div>
            <button
              onClick={refresh}
              className="text-text-muted hover:text-text-secondary"
              title={t("git.refresh")}
            >
              <RefreshCw size={12} />
            </button>
          </div>
          {(status.ahead > 0 || status.behind > 0) && (
            <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted">
              {status.ahead > 0 && <span>↑{status.ahead}</span>}
              {status.behind > 0 && <span>↓{status.behind}</span>}
            </div>
          )}
          <div className="flex items-center gap-1 mt-2">
            <button
              onClick={pull}
              disabled={remoteBusy}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-bg-hover text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-wait transition-colors"
              title={t("git.pull")}
            >
              <ArrowDown size={11} />
              {t("git.pull")}
              {status.behind > 0 && (
                <span className="text-accent">{status.behind}</span>
              )}
            </button>
            <button
              onClick={push}
              disabled={remoteBusy}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-bg-hover text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-wait transition-colors"
              title={t("git.push")}
            >
              <ArrowUp size={11} />
              {t("git.push")}
              {status.ahead > 0 && (
                <span className="text-accent">{status.ahead}</span>
              )}
            </button>
            <button
              onClick={fetch}
              disabled={remoteBusy}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded text-text-muted hover:text-text-secondary disabled:opacity-40 disabled:cursor-wait transition-colors"
              title={t("git.fetch")}
            >
              <DownloadCloud size={11} />
            </button>
          </div>
        </div>

        {/* Staged */}
        {status.staged.length > 0 && (
          <FileSection
            title={t("git.staged")}
            files={status.staged}
            selectedPath={selectedPath}
            onSelect={selectFile}
            action="unstage"
            onAction={unstage}
          />
        )}

        {/* Changes */}
        <FileSection
          title={t("git.changes")}
          files={[...status.modified, ...status.untracked]}
          selectedPath={selectedPath}
          onSelect={selectFile}
          action="stage"
          onAction={stage}
          onActionAll={() =>
            stageAll(
              [...status.modified, ...status.untracked].map((f) => f.path),
            )
          }
          actionAllLabel={t("git.stageAll")}
        />

        <CommitBox
          stagedCount={status.staged.length}
          onCommit={async (msg) => {
            await commit(msg);
          }}
        />
      </div>

      {/* Center: Diff */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="glass-panel flex-1 flex flex-col overflow-hidden">
          {selectedPath ? (
            <DiffView diff={activeDiff} path={selectedPath} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
              {t("git.selectForDiff")}
            </div>
          )}
        </div>
      </div>

      {/* Right: History */}
      <div className="w-72 shrink-0">
        <div className="glass-panel h-full flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5">
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              {t("git.history")}
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            {log.length === 0 ? (
              <p className="p-3 text-xs text-text-muted">{t("git.noCommits")}</p>
            ) : (
              log.map((c) => (
                <div
                  key={c.hash}
                  className="px-3 py-2 border-b border-white/5 hover:bg-white/5"
                >
                  <div className="text-xs text-text-primary truncate">
                    {c.message.split("\n")[0]}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-muted">
                    <span className="font-mono">{c.shortHash}</span>
                    <span>{c.author}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BranchSelector({
  current,
  branches,
  onSelect,
}: {
  current: string;
  branches: { name: string; isCurrent: boolean; isRemote: boolean }[];
  onSelect: (name: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const locals = branches.filter((b) => !b.isRemote);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs font-medium text-text-primary hover:text-accent"
      >
        {current || t("git.detached")}
      </button>
      {open && locals.length > 0 && (
        <div className="glass-thick absolute top-full left-0 mt-1 rounded-lg p-1 z-20 min-w-[160px]">
          {locals.map((b) => (
            <button
              key={b.name}
              onClick={() => {
                onSelect(b.name);
                setOpen(false);
              }}
              className={`block w-full text-left px-2 py-1 text-xs rounded hover:bg-white/5 ${
                b.isCurrent ? "text-accent" : "text-text-secondary"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FileSection({
  title,
  files,
  selectedPath,
  onSelect,
  action,
  onAction,
  onActionAll,
  actionAllLabel,
}: {
  title: string;
  files: FileStatus[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  action: "stage" | "unstage";
  onAction: (path: string) => void;
  onActionAll?: () => void;
  actionAllLabel?: string;
}) {
  if (files.length === 0) return null;

  return (
    <div className="glass-panel overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {title}
        </span>
        <span className="flex items-center gap-2">
          {onActionAll && (
            <button
              onClick={onActionAll}
              className="text-[10px] text-text-muted hover:text-accent transition-colors"
              title={actionAllLabel}
            >
              {actionAllLabel}
            </button>
          )}
          <span className="text-[10px] text-text-muted">{files.length}</span>
        </span>
      </div>
      <div className="max-h-52 overflow-auto">
        {files.map((f) => (
          <div
            key={f.path}
            onClick={() => onSelect(f.path)}
            className={`group flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-white/5 ${
              selectedPath === f.path ? "bg-white/8" : ""
            }`}
          >
            <StatusGlyph status={f.status} />
            <span
              className="text-xs truncate flex-1"
              title={f.path}
            >
              <span className="text-text-primary">
                {f.path.split("/").pop()}
              </span>
              {f.path.includes("/") && (
                <span className="text-text-muted ml-1.5 text-[10px]">
                  {f.path.split("/").slice(0, -1).join("/")}
                </span>
              )}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAction(f.path);
              }}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent transition-opacity"
              title={action}
            >
              {action === "stage" ? <Plus size={11} /> : <Minus size={11} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusGlyph({ status }: { status: string }) {
  const colors: Record<string, string> = {
    modified: "text-warning",
    added: "text-success",
    deleted: "text-error",
    renamed: "text-info",
    untracked: "text-text-muted",
    conflicted: "text-error",
  };
  const letters: Record<string, string> = {
    modified: "M",
    added: "A",
    deleted: "D",
    renamed: "R",
    untracked: "U",
    conflicted: "C",
  };
  return (
    <span
      className={`font-mono text-[10px] font-bold shrink-0 ${colors[status] ?? "text-text-muted"}`}
    >
      {letters[status] ?? "?"}
    </span>
  );
}

function DiffView({
  diff,
  path,
}: {
  diff: import("../../types/git-types").FileDiff | null;
  path: string;
}) {
  const t = useT();
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5">
        <FileText size={12} className="text-text-muted" />
        <span className="text-xs text-text-primary">{path}</span>
      </div>
      <div className="flex-1 overflow-auto font-mono text-[11px]">
        {!diff || diff.hunks.length === 0 ? (
          <p className="p-3 text-text-muted">{t("git.binaryOrUntracked")}</p>
        ) : (
          diff.hunks.map((h, hi) => (
            <div key={hi} className="border-b border-white/5">
              <div className="px-3 py-1 bg-white/3 text-text-muted text-[10px]">
                {h.header.trim()}
              </div>
              {h.lines.map((line, li) => (
                <div
                  key={li}
                  className={`px-3 py-0.5 whitespace-pre ${lineClass(line.origin)}`}
                >
                  <span className="inline-block w-6 text-text-muted select-none">
                    {line.newLineno ?? line.oldLineno ?? ""}
                  </span>
                  <span>{line.origin}</span>
                  <span>{line.content}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function lineClass(origin: string): string {
  if (origin === "+") return "bg-success/10 text-success";
  if (origin === "-") return "bg-error/10 text-error";
  return "text-text-secondary";
}
