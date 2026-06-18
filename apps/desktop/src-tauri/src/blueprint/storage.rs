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
    parser::parse(&raw)
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
    let bindings = crate::blueprint::bindings::build_bindings(&bps);
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
                            id: new_ulid(),
                            text: "First".to_string(),
                            checked: false,
                        },
                        AcceptanceCriterion {
                            id: new_ulid(),
                            text: "Second".to_string(),
                            checked: true,
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
}
