use std::path::Path;

use crate::atlas::parser;
use crate::atlas::types::*;
use crate::editor::identity;

#[tauri::command]
pub fn atlas_parse_file(
    project_root: String,
    rel_path: String,
) -> Result<FileMap, String> {
    let root = Path::new(&project_root);
    let full = root.join(&rel_path);
    let content = std::fs::read_to_string(&full).map_err(|e| e.to_string())?;
    let mut map = parser::parse_file(&rel_path, &content);

    // Enrich with FileIdentity information for cross-system navigation
    let identity = identity::compute_identity(root, &rel_path, &content);
    map.adapter_id = identity.adapter_id;
    map.file_blueprint_id = identity.file_blueprint_id;
    map.is_generated = identity.is_generated;

    Ok(map)
}

// ---------------------------------------------------------------------------
// Atlas 测绘 (B-spade): survey cache + report-card data commands.
// ---------------------------------------------------------------------------

use serde::Serialize;
use tauri::State;

use crate::atlas::survey::{self, AtlasMap, TsSurvey, ATLAS_MAP_VERSION};
use crate::blueprint::language_provider as lp;
use crate::blueprint::{bindings, storage};
use crate::codegen_proxy::CodegenProxy;

fn map_path(root: &Path) -> std::path::PathBuf {
    root.join(".atlas").join("map.json")
}

/// `.atlas/` is a purely derived cache — same doctrine as `.drafting/`:
/// never committed, appended to .gitignore idempotently.
fn ensure_atlas_gitignored(project_root: &Path) {
    if !project_root.join(".git").exists() {
        return;
    }
    let gitignore = project_root.join(".gitignore");
    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();
    if existing
        .lines()
        .map(str::trim)
        .any(|l| l == ".atlas/" || l == ".atlas")
    {
        return;
    }
    let mut content = existing;
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(".atlas/\n");
    let _ = std::fs::write(&gitignore, content);
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Rebuild the survey: run both legs, persist `.atlas/map.json`, return it.
/// A failed leg degrades into `warnings` — the map never lies by omission
/// without saying so.
#[tauri::command]
pub async fn atlas_survey_rebuild(
    project_root: String,
    proxy: State<'_, CodegenProxy>,
) -> Result<AtlasMap, String> {
    let root = Path::new(&project_root);
    let mut warnings = Vec::new();

    let rust = survey::survey_rust(root, &mut warnings).await;

    let ts = match proxy
        .call("atlasScanTs", serde_json::json!({ "projectRoot": project_root }))
        .await
    {
        Ok(v) => match serde_json::from_value::<TsSurvey>(v) {
            Ok(t) => Some(t),
            Err(e) => {
                warnings.push(format!("TS 腿降级: 响应解析失败 {e}"));
                None
            }
        },
        Err(e) => {
            warnings.push(format!("TS 腿降级: {e}"));
            None
        }
    };

    let map = AtlasMap {
        version: ATLAS_MAP_VERSION,
        generated_at_ms: now_ms(),
        rust,
        ts,
        warnings,
    };

    std::fs::create_dir_all(root.join(".atlas")).map_err(|e| e.to_string())?;
    std::fs::write(
        map_path(root),
        serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    ensure_atlas_gitignored(root);
    Ok(map)
}

/// Read the cached survey (None = never built; the card offers 重建).
#[tauri::command]
pub fn atlas_survey_read(project_root: String) -> Option<AtlasMap> {
    let text = std::fs::read_to_string(map_path(Path::new(&project_root))).ok()?;
    serde_json::from_str(&text).ok()
}

// ------------------------------------------------------------ health panel --

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasHealth {
    /// "passed" | "failed" | "unavailable" — the compile gate, provider-picked
    /// (cargo check / tsc), same sensor the Blueprint check fuses.
    pub gate: String,
    pub gate_diagnostics: Vec<String>,
    /// None = tests unavailable (not Rust / cargo missing) — honest, not zero.
    pub tests: Option<AtlasTests>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasTests {
    pub tested_modules: usize,
    pub failed_modules: Vec<String>,
}

/// On-demand health run — REUSES the language_provider sensors (B3 mandate),
/// including their honest degradation (unavailable ≠ failed).
#[tauri::command]
pub async fn atlas_health(project_root: String) -> Result<AtlasHealth, String> {
    let root = Path::new(&project_root);
    let gate_report = lp::run_gate(root).await;
    let gate = match gate_report.outcome {
        lp::GateOutcome::Passed => "passed",
        lp::GateOutcome::Failed => "failed",
        lp::GateOutcome::Unavailable => "unavailable",
    }
    .to_string();
    let tests = lp::run_rust_tests(root).await.map(|t| AtlasTests {
        tested_modules: t.tested_count(),
        failed_modules: t.failed_module_names(),
    });
    Ok(AtlasHealth {
        gate,
        gate_diagnostics: gate_report.diagnostics,
        tests,
    })
}

// ---------------------------------------------------- observability panel --

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasObservability {
    pub total_criteria: usize,
    pub bound_criteria: usize,
    pub checked_criteria: usize,
    /// 1.0 = nothing ever checked. The Drafting-native KPI.
    pub never_checked_ratio: f64,
}

/// Coverage facts from the EXISTING bindings/check-results data — no new
/// bookkeeping, just aggregation.
#[tauri::command]
pub fn atlas_observability(project_root: String) -> Result<AtlasObservability, String> {
    let root = Path::new(&project_root);
    let index = storage::load_index(root).map_err(|e| e.to_string())?;

    let mut blueprints = Vec::new();
    for entry in &index.blueprints {
        if let Ok(bp) = storage::load_blueprint(root, &entry.blueprint_id) {
            blueprints.push(bp);
        }
    }

    let mut total = 0usize;
    let mut checked = std::collections::BTreeSet::new();
    for bp in &blueprints {
        for section in &bp.sections {
            total += section.criteria.len();
        }
        if let Ok(results) = storage::load_check_results(root, &bp.front_matter.blueprint_id) {
            for r in results {
                checked.insert(r.criterion_id);
            }
        }
    }

    let refs: Vec<&crate::blueprint::types::Blueprint> = blueprints.iter().collect();
    let bindings_index = bindings::build_bindings(&refs, root);
    let bound: std::collections::BTreeSet<&str> = bindings_index
        .bindings
        .iter()
        .map(|b| b.criterion_id.as_str())
        .collect();

    Ok(AtlasObservability {
        total_criteria: total,
        bound_criteria: bound.len(),
        checked_criteria: checked.len(),
        never_checked_ratio: if total == 0 {
            0.0
        } else {
            1.0 - (checked.len() as f64 / total as f64)
        },
    })
}
