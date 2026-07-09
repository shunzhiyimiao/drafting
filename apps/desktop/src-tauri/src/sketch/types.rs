//! Sketch types on the Rust side — deliberately THIN since text-as-truth
//! (Rev 4, A4). The `.sketch` markup is the document and sketch-core owns
//! its only parser/printer; the frontend parses text itself (it imports
//! sketch-core directly), so full Spec trees no longer cross the Tauri
//! boundary and the old serde mirror retired with its round-trip suite.
//! What Rust still KNOWS about a sketch arrives as entity metadata from the
//! codegen-server's `scanSketches` RPC.

use serde::{Deserialize, Serialize};

/// One sketch's entity metadata — everything the index, bindings and the
/// list screen need; nothing the text doesn't already say.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SketchMeta {
    /// Project-relative file, e.g. `sketches/inbox.sketch`.
    pub file: String,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub blueprint_ref: Option<String>,
}

/// The `scanSketches` RPC's shape: parsed entities plus loudly-named
/// failures (an unparsable file is surfaced, never silently dropped).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SketchScanReport {
    pub entries: Vec<SketchMeta>,
    #[serde(default)]
    pub failed: Vec<SketchScanFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SketchScanFailure {
    pub file: String,
    pub reason: String,
}

/// The `migrateSketches` RPC's report — shown to the user at project open.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub migrated: Vec<String>,
    pub skipped: Vec<String>,
    pub failed: Vec<MigrationFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationFailure {
    pub file: String,
    pub reason: String,
}
