//! `.sketch-index.json` — a pure, rebuildable cache, NOT in git (§6).
//! All reverse lookups come from here, never stored as a second truth.
//!
//! Since text-as-truth (Rev 4, A4) the entities live in `.sketch` markup and
//! their only parser is sketch-core, so the index is rebuilt FROM the
//! codegen-server's `scanSketches` entries: `rebuild_from_entries` is the
//! pure, RPC-free core (tested here); the RPC round-trip lives in the
//! command layer. A stale-or-missing index degrades reads (dangling
//! signals), it never blocks — rebuilding late is legal for a cache.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::types::SketchMeta;

pub const INDEX_FILE: &str = ".sketch-index.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SketchIndex {
    /// feature → sketch ids (reverse of `Sketch.blueprintRef`).
    pub by_feature: BTreeMap<String, Vec<String>>,
    /// sketch id → project-relative `.sketch` file. The bindings resolver
    /// (blueprint domain) reads THIS instead of parsing sketch files — the
    /// file-level cross-domain read now goes through the cache.
    pub id_to_file: BTreeMap<String, String>,
    /// "sketchId:nodeId" → criteria (reverse of `criterion.sketch_node`).
    /// Shape-stable placeholder — the blueprint bindings index remains the
    /// authority for node-level reverse lookups.
    pub criteria_by_node: BTreeMap<String, Vec<String>>,
    /// Criteria pointing at a deleted node (a signal, not an error).
    pub dangling: Vec<String>,
}

/// Build + persist the index from scanned entities. Deterministic
/// (BTreeMaps + sorted vecs → byte-stable for identical entities).
pub fn rebuild_from_entries(root: &Path, entries: &[SketchMeta]) -> Result<SketchIndex, String> {
    let mut index = SketchIndex::default();
    for meta in entries {
        if !meta.id.is_empty() {
            index.id_to_file.insert(meta.id.clone(), meta.file.clone());
        }
        if let Some(feature) = &meta.blueprint_ref {
            index
                .by_feature
                .entry(feature.clone())
                .or_default()
                .push(meta.id.clone());
        }
    }
    for ids in index.by_feature.values_mut() {
        ids.sort();
    }

    let json = serde_json::to_string_pretty(&index)
        .map_err(|e| format!("serialize sketch index: {e}"))?;
    std::fs::write(root.join(INDEX_FILE), json + "\n")
        .map_err(|e| format!("write {INDEX_FILE}: {e}"))?;
    ensure_gitignored(root);
    Ok(index)
}

/// Read the persisted index (a cache: absence is not an error — None).
pub fn read(root: &Path) -> Option<SketchIndex> {
    let raw = std::fs::read_to_string(root.join(INDEX_FILE)).ok()?;
    serde_json::from_str(&raw).ok()
}

/// The index is a derived cache — keep it out of git (§6). Appends the entry
/// to an existing .gitignore once; projects without one are left alone.
fn ensure_gitignored(root: &Path) {
    let gitignore = root.join(".gitignore");
    let Ok(current) = std::fs::read_to_string(&gitignore) else {
        return;
    };
    if current.lines().any(|l| l.trim() == INDEX_FILE) {
        return;
    }
    let sep = if current.ends_with('\n') || current.is_empty() { "" } else { "\n" };
    let _ = std::fs::write(
        &gitignore,
        format!("{current}{sep}\n# Drafting sketch index (derived cache)\n{INDEX_FILE}\n"),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn meta(file: &str, id: &str, feature: Option<&str>) -> SketchMeta {
        SketchMeta {
            file: file.to_string(),
            id: id.to_string(),
            name: id.to_string(),
            blueprint_ref: feature.map(String::from),
        }
    }

    #[test]
    fn rebuild_maps_features_and_files_and_stays_deterministic() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();

        let entries = vec![
            meta("sketches/b.sketch", "sk_b", Some("feat_x")),
            meta("sketches/a.sketch", "sk_a", Some("feat_x")),
            meta("sketches/c.sketch", "sk_c", None),
        ];
        let index = rebuild_from_entries(root, &entries).unwrap();
        assert_eq!(
            index.by_feature.get("feat_x"),
            Some(&vec!["sk_a".to_string(), "sk_b".to_string()])
        );
        assert_eq!(index.id_to_file.get("sk_c").map(String::as_str), Some("sketches/c.sketch"));
        assert!(index.criteria_by_node.is_empty());

        // Persisted, readable, and byte-stable across rebuilds.
        let first = std::fs::read_to_string(root.join(INDEX_FILE)).unwrap();
        rebuild_from_entries(root, &entries).unwrap();
        let second = std::fs::read_to_string(root.join(INDEX_FILE)).unwrap();
        assert_eq!(first, second);
        assert_eq!(read(root).unwrap().id_to_file.len(), 3);
    }

    #[test]
    fn read_returns_none_for_missing_or_corrupt_cache() {
        let dir = TempDir::new().unwrap();
        assert!(read(dir.path()).is_none());
        std::fs::write(dir.path().join(INDEX_FILE), "not json").unwrap();
        assert!(read(dir.path()).is_none(), "corrupt cache degrades, never errors");
    }

    #[test]
    fn rebuild_appends_to_an_existing_gitignore_once() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join(".gitignore"), "node_modules\n").unwrap();

        rebuild_from_entries(root, &[]).unwrap();
        rebuild_from_entries(root, &[]).unwrap();
        let gi = std::fs::read_to_string(root.join(".gitignore")).unwrap();
        assert_eq!(gi.matches(INDEX_FILE).count(), 1);
        assert!(gi.starts_with("node_modules\n"), "existing content preserved");
    }
}
