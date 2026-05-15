export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
}

export interface FileIdentity {
  path: string;
  isGenerated: boolean;
  adapterId: string | null;
  fileBlueprintId: string | null;
  featureBlueprintIds: string[];
  readonly: boolean;
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
