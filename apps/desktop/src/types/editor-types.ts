export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
}

/** v1.5 S1 provenance source. `ai` exists in the model but file-level
 *  inference never produces it yet (no AI-stamping convention) — block-level
 *  attribution is deferred to v1.5.x. */
export type ProvenanceSource =
  | { kind: "human" }
  | { kind: "ai"; model: string }
  | { kind: "derived"; generator: string };

export interface FileProvenance {
  source: ProvenanceSource;
  /** Best-effort mtime in ms (0 if not on disk). */
  lastModifiedMs: number;
}

export interface FileIdentity {
  path: string;
  isGenerated: boolean;
  adapterId: string | null;
  fileBlueprintId: string | null;
  featureBlueprintIds: string[];
  readonly: boolean;
  provenance: FileProvenance;
}

export interface FileContent {
  path: string;
  content: string;
  identity: FileIdentity;
  size: number;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface SearchResult {
  totalMatches: number;
  totalFiles: number;
  matches: SearchMatch[];
  truncated: boolean;
}

export interface FileMatches {
  path: string;
  matches: SearchMatch[];
}

export interface SearchOptions {
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  searchId?: string | null;
}

export interface SearchProgressPayload {
  searchId: string;
  scannedFiles: number;
  matchedFiles: number;
  totalMatches: number;
}

export interface AdvancedSearchResult {
  totalMatches: number;
  totalFiles: number;
  scannedFiles: number;
  files: FileMatches[];
  truncated: boolean;
  cancelled: boolean;
}
