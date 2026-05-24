use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BlueprintType {
    Feature,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BlueprintStatus {
    Draft,
    InProgress,
    Completed,
    Deprecated,
}

impl Default for BlueprintStatus {
    fn default() -> Self {
        Self::Draft
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BlueprintPriority {
    Low,
    Medium,
    High,
    Critical,
}

impl Default for BlueprintPriority {
    fn default() -> Self {
        Self::Medium
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BlueprintOwner {
    Human,
    Ai,
    Collaborative,
}

impl Default for BlueprintOwner {
    fn default() -> Self {
        Self::Human
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CheckVerdict {
    Pass,
    Fail,
    Unclear,
}

// ---------------------------------------------------------------------------
// Acceptance Criterion
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptanceCriterion {
    pub text: String,
    pub checked: bool,
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SectionKind {
    Goal,
    Context,
    AcceptanceCriteria,
    Constraints,
    OutOfScope,
    Notes,
    Purpose,
    Responsibilities,
    #[serde(rename_all = "camelCase")]
    Unknown {
        original: String,
    },
}

impl SectionKind {
    pub fn from_heading(heading: &str) -> Self {
        let normalized = heading.trim().to_lowercase().replace(' ', "-");
        match normalized.as_str() {
            "goal" => Self::Goal,
            "context" => Self::Context,
            "acceptance-criteria" => Self::AcceptanceCriteria,
            "constraints" => Self::Constraints,
            "out-of-scope" => Self::OutOfScope,
            "notes" => Self::Notes,
            "purpose" => Self::Purpose,
            "responsibilities" => Self::Responsibilities,
            _ => Self::Unknown {
                original: heading.to_string(),
            },
        }
    }

    pub fn is_acceptance_criteria(&self) -> bool {
        matches!(self, Self::AcceptanceCriteria)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintSection {
    pub kind: SectionKind,
    pub heading_text: String,
    pub content: String,
    #[serde(default)]
    pub criteria: Vec<AcceptanceCriterion>,
}

// ---------------------------------------------------------------------------
// Related Blueprint reference
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelatedBlueprint {
    pub id: String,
    pub relation: String,
}

// ---------------------------------------------------------------------------
// Front Matter
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintFrontMatter {
    // Both blueprintId and displayName are made optional at deserialization
    // time so the AI Draft flow can omit them — blueprint_create assigns a
    // ULID for the former, and the frontend injects a name from user input
    // for the latter. Without these defaults, YAML parse fails before the
    // command-level repair has a chance to run.
    #[serde(default)]
    pub blueprint_id: String,
    #[serde(rename = "type", default)]
    pub blueprint_type: BlueprintType,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub status: BlueprintStatus,
    #[serde(default)]
    pub priority: BlueprintPriority,
    #[serde(default)]
    pub owner: BlueprintOwner,
    #[serde(default)]
    pub related_sockets: Vec<String>,
    #[serde(default)]
    pub related_adapters: Vec<String>,
    #[serde(default)]
    pub related_files: Vec<String>,
    #[serde(default)]
    pub related_blueprints: Vec<RelatedBlueprint>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub last_checked_at: Option<u64>,
    #[serde(default)]
    pub last_checked_by: Option<String>,
    #[serde(default)]
    pub check_version: Option<u32>,
    // File-level only
    #[serde(default)]
    pub target_file: Option<String>,
    #[serde(default)]
    pub parent_blueprints: Vec<String>,
    // Unknown fields preserved for round-trip safety
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub extras: HashMap<String, serde_json::Value>,
}

impl Default for BlueprintType {
    fn default() -> Self {
        Self::Feature
    }
}

// ---------------------------------------------------------------------------
// Blueprint (full parsed)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Blueprint {
    pub front_matter: BlueprintFrontMatter,
    pub sections: Vec<BlueprintSection>,
    pub raw_md: String,
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintIndexEntry {
    pub blueprint_id: String,
    #[serde(rename = "type")]
    pub blueprint_type: BlueprintType,
    pub display_name: String,
    pub status: BlueprintStatus,
    pub priority: BlueprintPriority,
    pub file_path: String,
    pub criteria_total: usize,
    pub criteria_done: usize,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlueprintIndex {
    pub version: u32,
    pub blueprints: Vec<BlueprintIndexEntry>,
}

impl Default for BlueprintIndex {
    fn default() -> Self {
        Self {
            version: 1,
            blueprints: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Check result
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub blueprint_id: String,
    pub criterion_index: usize,
    pub verdict: CheckVerdict,
    pub explanation: String,
    #[serde(default)]
    pub suggestion: Option<String>,
    #[serde(default)]
    pub references: Vec<String>,
    pub checked_at: u64,
    #[serde(default)]
    pub stale: bool,
    pub blueprint_hash: String,
    pub code_hash: String,
    pub model_id: String,
}

// ---------------------------------------------------------------------------
// Template info
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub name: String,
    pub display_name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub template_type: BlueprintType,
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn new_ulid() -> String {
    ulid::Ulid::new().to_string()
}

pub fn hash_content(content: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}
