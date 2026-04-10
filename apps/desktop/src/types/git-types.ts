export interface FileStatus {
  path: string;
  status: string;
}

export interface GitStatus {
  branch: string;
  isDetached: boolean;
  ahead: number;
  behind: number;
  modified: FileStatus[];
  staged: FileStatus[];
  untracked: FileStatus[];
  conflicted: FileStatus[];
  isClean: boolean;
  isRepo: boolean;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  message: string;
  timestamp: number;
}

export interface DiffLine {
  origin: string;
  content: string;
  oldLineno: number | null;
  newLineno: number | null;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
}
