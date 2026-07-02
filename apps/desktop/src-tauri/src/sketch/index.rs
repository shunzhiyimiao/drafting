//! `.sketch-index.json` — a pure, rebuildable cache, NOT in git (§6).
//! All reverse lookups come from here, never stored as a second truth;
//! rebuild is a deterministic file scan (git recovery uses zero AI).

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::storage;

pub const INDEX_FILE: &str = ".sketch-index.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SketchIndex {
    /// feature → sketches (reverse of `Sketch.blueprintRef`).
    pub by_feature: BTreeMap<String, Vec<String>>,
    /// "sketchId:nodeId" → criteria (reverse of `criterion.sketch_node`).
    /// Empty until the blueprint marker field grammar lands — the shape is
    /// stable from day one so consumers don't churn when it fills in.
    pub criteria_by_node: BTreeMap<String, Vec<String>>,
    /// Criteria pointing at a deleted node (a signal, not an error).
    pub dangling: Vec<String>,
}

/// Rebuild the index from the entities and persist it. BTreeMaps + sorted
/// vecs keep the output deterministic (byte-stable for identical entities).
pub fn rebuild(root: &Path) -> Result<SketchIndex, String> {
    let mut index = SketchIndex::default();
    for (_, sketch) in storage::list(root) {
        if let Some(feature) = &sketch.blueprint_ref {
            index
                .by_feature
                .entry(feature.clone())
                .or_default()
                .push(sketch.id.clone());
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

/// The index is a derived cache — keep it out of git (§6). Appends the entry
/// to an existing .gitignore once; projects without git are left alone.
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

    #[test]
    fn rebuild_maps_features_and_stays_deterministic() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();

        let (_, s1) = storage::create(root, "b", Some("feat_x".into())).unwrap();
        let (_, s2) = storage::create(root, "a", Some("feat_x".into())).unwrap();
        storage::create(root, "unbound", None).unwrap();

        let index = rebuild(root).unwrap();
        let mut expected = vec![s1.id.clone(), s2.id.clone()];
        expected.sort();
        assert_eq!(index.by_feature.get("feat_x"), Some(&expected));
        assert!(index.criteria_by_node.is_empty());
        assert!(index.dangling.is_empty());

        // Persisted, and byte-stable across rebuilds of identical entities.
        let first = std::fs::read_to_string(root.join(INDEX_FILE)).unwrap();
        rebuild(root).unwrap();
        let second = std::fs::read_to_string(root.join(INDEX_FILE)).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn rebuild_appends_to_an_existing_gitignore_once() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join(".gitignore"), "node_modules\n").unwrap();
        storage::create(root, "s", None).unwrap();

        rebuild(root).unwrap();
        rebuild(root).unwrap();
        let gi = std::fs::read_to_string(root.join(".gitignore")).unwrap();
        assert_eq!(
            gi.matches(INDEX_FILE).count(),
            1,
            "gitignore entry must be appended exactly once"
        );
        assert!(gi.starts_with("node_modules\n"), "existing content preserved");
    }
}
