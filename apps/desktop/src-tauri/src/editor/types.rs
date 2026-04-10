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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIdentity {
    pub path: String,
    pub is_generated: bool,
    pub adapter_id: Option<String>,
    pub file_blueprint_id: Option<String>,
    pub feature_blueprint_ids: Vec<String>,
    pub readonly: bool,
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

pub const MAX_SEARCH_FILES: u32 = 50000;
pub const MAX_SEARCH_MATCHES: u32 = 500;
pub const MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024; // 10MB hard cap
pub const LARGE_FILE_THRESHOLD: u64 = 1 * 1024 * 1024; // 1MB large-file mode
