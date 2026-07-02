use std::path::{Path, PathBuf};

use crate::blueprint::error::{BlueprintError, Result};
use crate::blueprint::parser;
use crate::blueprint::types::*;

const BLUEPRINTS_DIR: &str = "blueprints";
const FEATURES_DIR: &str = "blueprints/features";
const FILES_DIR: &str = "blueprints/files";
const INDEX_FILE: &str = "blueprints/index.json";
// Derived reverse index (file → criteria). Lives in the gitignored cache dir,
// NOT in committed blueprints/ — it is fully rebuildable from the .md files.
const BINDINGS_FILE: &str = ".blueprint/bindings.json";
const CHECK_RESULTS_DIR: &str = ".blueprint/check-results";
const CHECK_CACHE_DIR: &str = ".blueprint/check-cache";

pub fn init_blueprint_dirs(project_root: &Path) -> Result<()> {
    std::fs::create_dir_all(project_root.join(FEATURES_DIR))?;
    std::fs::create_dir_all(project_root.join(FILES_DIR))?;
    std::fs::create_dir_all(project_root.join(CHECK_RESULTS_DIR))?;
    std::fs::create_dir_all(project_root.join(CHECK_CACHE_DIR))?;

    let index_path = project_root.join(INDEX_FILE);
    if !index_path.exists() {
        let index = BlueprintIndex::default();
        let json = serde_json::to_string_pretty(&index)?;
        std::fs::write(&index_path, json)?;
    }
    Ok(())
}

fn blueprint_file_path(project_root: &Path, bp: &Blueprint) -> PathBuf {
    match bp.front_matter.blueprint_type {
        BlueprintType::Feature => project_root
            .join(FEATURES_DIR)
            .join(format!("{}.blueprint.md", bp.front_matter.blueprint_id)),
        BlueprintType::File => {
            let target = bp
                .front_matter
                .target_file
                .as_deref()
                .unwrap_or(&bp.front_matter.blueprint_id);
            project_root
                .join(FILES_DIR)
                .join(format!("{}.blueprint.md", target))
        }
    }
}

pub fn save_blueprint(project_root: &Path, bp: &Blueprint) -> Result<()> {
    let serialized = parser::serialize(bp)?;
    let path = blueprint_file_path(project_root, bp);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, serialized)?;
    rebuild_index(project_root)?;
    Ok(())
}

pub fn load_blueprint(project_root: &Path, blueprint_id: &str) -> Result<Blueprint> {
    // Search index to find path
    let index = load_index(project_root)?;
    let entry = index
        .blueprints
        .iter()
        .find(|e| e.blueprint_id == blueprint_id)
        .ok_or_else(|| BlueprintError::BlueprintNotFound(blueprint_id.to_string()))?;

    let path = project_root.join(&entry.file_path);
    let raw = std::fs::read_to_string(&path)?;
    let bp = parser::parse(&raw)?;

    // S0.1 self-heal: if the criteria had no `<!-- #ULID -->` markers, parse
    // just minted them — persist now so the ids are STABLE across future loads
    // (otherwise every parse mints fresh ids and check-results / the S6
    // feedback surface can't match a criterion). Round-trip safe: once markers
    // exist, re-serialization reproduces the file and we skip the write.
    if let Ok(reserialized) = parser::serialize(&bp) {
        if reserialized != raw {
            let _ = std::fs::write(&path, &reserialized);
        }
    }
    Ok(bp)
}

pub fn load_blueprint_raw(project_root: &Path, blueprint_id: &str) -> Result<String> {
    let index = load_index(project_root)?;
    let entry = index
        .blueprints
        .iter()
        .find(|e| e.blueprint_id == blueprint_id)
        .ok_or_else(|| BlueprintError::BlueprintNotFound(blueprint_id.to_string()))?;
    let path = project_root.join(&entry.file_path);
    Ok(std::fs::read_to_string(&path)?)
}

pub fn delete_blueprint(project_root: &Path, blueprint_id: &str) -> Result<()> {
    let index = load_index(project_root)?;
    let entry = index
        .blueprints
        .iter()
        .find(|e| e.blueprint_id == blueprint_id)
        .ok_or_else(|| BlueprintError::BlueprintNotFound(blueprint_id.to_string()))?;
    let path = project_root.join(&entry.file_path);
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    rebuild_index(project_root)?;
    Ok(())
}

pub fn load_index(project_root: &Path) -> Result<BlueprintIndex> {
    let path = project_root.join(INDEX_FILE);
    if !path.exists() {
        return Ok(BlueprintIndex::default());
    }
    let data = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}

pub fn rebuild_index(project_root: &Path) -> Result<BlueprintIndex> {
    // Collect each parsed blueprint with its project-relative path; both the
    // index (index.json) and the reverse binding index (.blueprint/bindings.json)
    // are derived from this single parse pass.
    let mut parsed: Vec<(Blueprint, String)> = Vec::new();

    let features_dir = project_root.join(FEATURES_DIR);
    if features_dir.exists() {
        scan_blueprint_dir(&features_dir, project_root, &mut parsed)?;
    }

    let files_dir = project_root.join(FILES_DIR);
    if files_dir.exists() {
        scan_blueprint_dir_recursive(&files_dir, project_root, &mut parsed)?;
    }

    // index.json (committed)
    let mut entries: Vec<BlueprintIndexEntry> = parsed
        .iter()
        .map(|(bp, rel)| to_index_entry(bp, rel.clone()))
        .collect();
    entries.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    let index = BlueprintIndex {
        version: 1,
        blueprints: entries,
    };
    std::fs::write(
        project_root.join(INDEX_FILE),
        serde_json::to_string_pretty(&index)?,
    )?;

    // .blueprint/bindings.json (derived reverse index, NOT committed — fully
    // rebuildable from the .md files; lives in the gitignored cache dir).
    let bps: Vec<&Blueprint> = parsed.iter().map(|(bp, _)| bp).collect();
    let bindings = crate::blueprint::bindings::build_bindings(&bps, project_root);
    let bindings_path = project_root.join(BINDINGS_FILE);
    if let Some(dir) = bindings_path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&bindings_path, serde_json::to_string_pretty(&bindings)?)?;

    Ok(index)
}

fn scan_blueprint_dir(
    dir: &Path,
    project_root: &Path,
    parsed: &mut Vec<(Blueprint, String)>,
) -> Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path
            .file_name()
            .map_or(false, |n| n.to_string_lossy().ends_with(".blueprint.md"))
        {
            if let Ok(raw) = std::fs::read_to_string(&path) {
                if let Ok(bp) = parser::parse(&raw) {
                    if let Ok(rel_path) = path.strip_prefix(project_root) {
                        parsed.push((bp, rel_path.to_string_lossy().to_string()));
                    }
                }
            }
        }
    }
    Ok(())
}

fn scan_blueprint_dir_recursive(
    dir: &Path,
    project_root: &Path,
    parsed: &mut Vec<(Blueprint, String)>,
) -> Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            scan_blueprint_dir_recursive(&path, project_root, parsed)?;
        } else if path
            .file_name()
            .map_or(false, |n| n.to_string_lossy().ends_with(".blueprint.md"))
        {
            if let Ok(raw) = std::fs::read_to_string(&path) {
                if let Ok(bp) = parser::parse(&raw) {
                    if let Ok(rel_path) = path.strip_prefix(project_root) {
                        parsed.push((bp, rel_path.to_string_lossy().to_string()));
                    }
                }
            }
        }
    }
    Ok(())
}

fn to_index_entry(bp: &Blueprint, file_path: String) -> BlueprintIndexEntry {
    let ac_section = bp
        .sections
        .iter()
        .find(|s| s.kind.is_acceptance_criteria());
    let (total, done) = if let Some(sec) = ac_section {
        let total = sec.criteria.len();
        let done = sec.criteria.iter().filter(|c| c.checked).count();
        (total, done)
    } else {
        (0, 0)
    };

    BlueprintIndexEntry {
        blueprint_id: bp.front_matter.blueprint_id.clone(),
        blueprint_type: bp.front_matter.blueprint_type.clone(),
        display_name: bp.front_matter.display_name.clone(),
        status: bp.front_matter.status.clone(),
        priority: bp.front_matter.priority.clone(),
        file_path,
        criteria_total: total,
        criteria_done: done,
        updated_at: now_ms(),
    }
}

// Check results
pub fn save_check_result(project_root: &Path, result: &CheckResult) -> Result<()> {
    let dir = project_root.join(CHECK_RESULTS_DIR);
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!(
        "{}-{}.json",
        result.blueprint_id, result.criterion_id
    ));
    let json = serde_json::to_string_pretty(result)?;
    std::fs::write(&path, json)?;
    Ok(())
}

/// Load the derived reverse binding index (S0.3). Returns an empty index if the
/// file is missing or unreadable — it is a rebuildable cache, never fatal.
pub fn load_bindings(project_root: &Path) -> crate::blueprint::bindings::BindingsIndex {
    let path = project_root.join(BINDINGS_FILE);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|d| serde_json::from_str(&d).ok())
        .unwrap_or(crate::blueprint::bindings::BindingsIndex {
            version: 1,
            bindings: Vec::new(),
        })
}

pub fn load_check_results(project_root: &Path, blueprint_id: &str) -> Result<Vec<CheckResult>> {
    let dir = project_root.join(CHECK_RESULTS_DIR);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path
            .file_name()
            .map_or(false, |n| n.to_string_lossy().starts_with(blueprint_id))
        {
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(result) = serde_json::from_str::<CheckResult>(&data) {
                    results.push(result);
                }
            }
        }
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_bp() -> Blueprint {
        Blueprint {
            front_matter: BlueprintFrontMatter {
                blueprint_id: new_ulid(),
                blueprint_type: BlueprintType::Feature,
                display_name: "Test Feature".to_string(),
                status: BlueprintStatus::Draft,
                priority: BlueprintPriority::High,
                ..Default::default()
            },
            sections: vec![
                BlueprintSection {
                    kind: SectionKind::Goal,
                    heading_text: "Goal".to_string(),
                    content: "Build a thing.\n".to_string(),
                    criteria: vec![],
                },
                BlueprintSection {
                    kind: SectionKind::AcceptanceCriteria,
                    heading_text: "Acceptance Criteria".to_string(),
                    content: "- [ ] First\n- [x] Second\n".to_string(),
                    criteria: vec![
                        AcceptanceCriterion {
                            text: "First".to_string(),
                            checked: false,
                            ..Default::default()
                        },
                        AcceptanceCriterion {
                            text: "Second".to_string(),
                            checked: true,
                            ..Default::default()
                        },
                    ],
                },
            ],
            raw_md: String::new(),
        }
    }

    #[test]
    fn init_creates_directories() {
        let tmp = TempDir::new().unwrap();
        init_blueprint_dirs(tmp.path()).unwrap();
        assert!(tmp.path().join(FEATURES_DIR).exists());
        assert!(tmp.path().join(FILES_DIR).exists());
        assert!(tmp.path().join(INDEX_FILE).exists());
    }

    #[test]
    fn save_load_blueprint() {
        let tmp = TempDir::new().unwrap();
        init_blueprint_dirs(tmp.path()).unwrap();

        let bp = create_test_bp();
        let id = bp.front_matter.blueprint_id.clone();
        save_blueprint(tmp.path(), &bp).unwrap();

        let loaded = load_blueprint(tmp.path(), &id).unwrap();
        assert_eq!(loaded.front_matter.display_name, "Test Feature");
        assert_eq!(loaded.sections.len(), 2);
        assert_eq!(loaded.sections[1].criteria.len(), 2);
    }

    #[test]
    fn index_reflects_criteria_progress() {
        let tmp = TempDir::new().unwrap();
        init_blueprint_dirs(tmp.path()).unwrap();

        let bp = create_test_bp();
        save_blueprint(tmp.path(), &bp).unwrap();

        let index = load_index(tmp.path()).unwrap();
        assert_eq!(index.blueprints.len(), 1);
        assert_eq!(index.blueprints[0].criteria_total, 2);
        assert_eq!(index.blueprints[0].criteria_done, 1);
    }

    #[test]
    fn delete_removes_file_and_updates_index() {
        let tmp = TempDir::new().unwrap();
        init_blueprint_dirs(tmp.path()).unwrap();

        let bp = create_test_bp();
        let id = bp.front_matter.blueprint_id.clone();
        save_blueprint(tmp.path(), &bp).unwrap();
        assert_eq!(load_index(tmp.path()).unwrap().blueprints.len(), 1);

        delete_blueprint(tmp.path(), &id).unwrap();
        assert_eq!(load_index(tmp.path()).unwrap().blueprints.len(), 0);
    }

    /// The loop-closure proof (docs/sketch-design.md §8): a criterion bound
    /// to a sketch node — persisted as the `sk:` marker field — lands in
    /// `.blueprint/bindings.json` under BOTH the sketch file and its
    /// generated React, so `FileSaved(sketches/…)` drives the existing
    /// S3/S5 stale/drift machinery with zero changes on that side.
    #[test]
    fn rebuild_binds_sketch_bound_criteria_to_sketch_files() {
        let tmp = TempDir::new().unwrap();
        init_blueprint_dirs(tmp.path()).unwrap();
        std::fs::create_dir_all(tmp.path().join("sketches")).unwrap();
        std::fs::write(
            tmp.path().join("sketches/login-screen.sketch.json"),
            r#"{"id":"sk_login","name":"Login"}"#,
        )
        .unwrap();

        let mut bp = create_test_bp();
        bp.sections[1].criteria[0].sketch_node =
            Some(crate::blueprint::types::SketchNodeRef {
                sketch_id: "sk_login".to_string(),
                node_id: "btn_submit".to_string(),
            });
        let crit_id = bp.sections[1].criteria[0].id.clone();
        save_blueprint(tmp.path(), &bp).unwrap();
        rebuild_index(tmp.path()).unwrap();

        let bindings = load_bindings(tmp.path());
        let sketch_hits = crate::blueprint::bindings::criteria_for_file(
            &bindings,
            "sketches/login-screen.sketch.json",
        );
        assert_eq!(sketch_hits.len(), 1);
        assert_eq!(sketch_hits[0].criterion_id, crit_id);

        let generated_hits = crate::blueprint::bindings::criteria_for_file(
            &bindings,
            "packages/ui/src/generated/login-screen.generated.tsx",
        );
        assert_eq!(generated_hits.len(), 1);
        assert_eq!(generated_hits[0].criterion_id, crit_id);

        // And the binding itself survives the .md round-trip.
        let loaded = load_blueprint(tmp.path(), &bp.front_matter.blueprint_id).unwrap();
        assert_eq!(
            loaded.sections[1].criteria[0]
                .sketch_node
                .as_ref()
                .map(|s| s.node_id.as_str()),
            Some("btn_submit")
        );
    }

    #[test]
    fn load_blueprint_self_heals_missing_criterion_markers() {
        let tmp = TempDir::new().unwrap();
        init_blueprint_dirs(tmp.path()).unwrap();

        // A blueprint .md with NO criterion id markers (e.g. created before
        // S0.1 / never saved since).
        let md = "---\nblueprintId: bp-selfheal-1\ntype: feature\n\
                  displayName: T\nstatus: draft\npriority: high\n---\n\n\
                  ## Acceptance Criteria\n\n- [ ] First item\n- [x] Second item\n";
        assert!(!md.contains("<!-- #"));
        let path = tmp.path().join("blueprints/features/t.blueprint.md");
        std::fs::write(&path, md).unwrap();
        rebuild_index(tmp.path()).unwrap();

        let bp1 = load_blueprint(tmp.path(), "bp-selfheal-1").unwrap();
        let ids1: Vec<_> = bp1
            .sections
            .iter()
            .find(|s| s.kind.is_acceptance_criteria())
            .unwrap()
            .criteria
            .iter()
            .map(|c| c.id.clone())
            .collect();

        // Markers are now persisted to disk…
        let after = std::fs::read_to_string(&path).unwrap();
        assert!(after.contains("<!-- #"), "self-heal should write markers back");

        // …so a second load yields the SAME ids (stable across loads — the
        // property S6's badge matching depends on).
        let bp2 = load_blueprint(tmp.path(), "bp-selfheal-1").unwrap();
        let ids2: Vec<_> = bp2
            .sections
            .iter()
            .find(|s| s.kind.is_acceptance_criteria())
            .unwrap()
            .criteria
            .iter()
            .map(|c| c.id.clone())
            .collect();
        assert_eq!(ids1, ids2, "criterion ids must be stable after self-heal");
    }
}
