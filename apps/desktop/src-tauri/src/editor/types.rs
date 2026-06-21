use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_at: u64,
}

/// Who a code artifact came from (v1.5 S1 provenance). The `Ai` variant exists
/// in the model but is NOT produced by file-level inference today — AI
/// completions don't stamp provenance yet, so anything not tool-generated is
/// attributed to `Human`. Distinguishing AI-written regions is block-level
/// provenance, deferred to v1.5.x. Internally tagged for ergonomic TS consumption.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProvenanceSource {
    Human,
    Ai { model: String },
    Derived { generator: String },
}

/// File-level provenance: where the file came from + a best-effort "when".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileProvenance {
    pub source: ProvenanceSource,
    /// Best-effort "when": file mtime in ms (0 if not yet on disk). Precise
    /// per-region timing is block-level provenance, deferred to v1.5.x.
    pub last_modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIdentity {
    pub path: String,
    pub is_generated: bool,
    pub adapter_id: Option<String>,
    pub file_blueprint_id: Option<String>,
    pub feature_blueprint_ids: Vec<String>,
    pub readonly: bool,
    /// S1: where this file came from (source + when). Coarser than the
    /// block-level "any region traceable" goal — adapter files are really
    /// collaborative (patchboard skeleton + human method bodies), but
    /// file-level can only stamp the skeleton's origin.
    pub provenance: FileProvenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub identity: FileIdentity,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub path: String,
    pub line: u32,
    pub column: u32,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub total_matches: u32,
    pub total_files: u32,
    pub matches: Vec<SearchMatch>,
    pub truncated: bool,
}

/// Per-file grouped search result. Used by the newer `search_advanced`
/// command. Each `FileMatches` groups all matches within a single file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMatches {
    pub path: String,
    pub matches: Vec<SearchMatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub use_regex: bool,
    /// Glob-style include patterns (e.g. ["*.ts", "src/**/*.tsx"]). Empty = include all.
    #[serde(default)]
    pub include_globs: Vec<String>,
    /// Glob-style exclude patterns — applied after built-in SKIP_DIRS.
    #[serde(default)]
    pub exclude_globs: Vec<String>,
    /// Optional unique id so the frontend can correlate progress events and
    /// cancellation requests.
    #[serde(default)]
    pub search_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchProgressPayload {
    pub search_id: String,
    pub scanned_files: u32,
    pub matched_files: u32,
    pub total_matches: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSearchResult {
    pub total_matches: u32,
    pub total_files: u32,
    pub scanned_files: u32,
    pub files: Vec<FileMatches>,
    pub truncated: bool,
    pub cancelled: bool,
}

pub const MAX_SEARCH_FILES: u32 = 50000;
pub const MAX_SEARCH_MATCHES: u32 = 500;
pub const MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024; // 10MB hard cap
pub const LARGE_FILE_THRESHOLD: u64 = 1 * 1024 * 1024; // 1MB large-file mode
