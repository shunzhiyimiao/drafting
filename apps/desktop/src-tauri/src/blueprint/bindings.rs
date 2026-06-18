//! S0 bindings — resolving which code artifacts a criterion is checked against.
//!
//! S0.2 (this file) is the forward direction: [`artifacts_for`]. Later stages
//! build on it: S0.3 adds the reverse index (`criteria_for_file`, persisted to
//! `.blueprint/bindings.json` — derived, not committed); S0.4 rewires
//! `check.rs` to address `CheckResult`s by `criterion_id` through this resolver
//! instead of reading `front_matter.related_files` directly.

// build_bindings is wired into storage::rebuild_index (S0.3); criteria_for_file
// is the S5 drift-detection consumer, not called yet — hence the module allow.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

use crate::blueprint::types::{AcceptanceCriterion, Blueprint};

/// The code artifacts a criterion is verified against.
///
/// S0.2: every criterion inherits the blueprint-level artifact set —
/// `target_file` (if present) unioned with `related_files`, de-duplicated and
/// order-stable (target first, then `related_files` in declared order).
///
/// `criterion` is taken now as the seam for a future per-criterion override
/// (e.g. a `criterion.artifacts` field): when that lands, resolve it here and
/// fall back to the blueprint-level set. Until then the criterion does not
/// affect the result — passing any criterion yields the same artifacts.
pub fn artifacts_for(_criterion: &AcceptanceCriterion, bp: &Blueprint) -> Vec<String> {
    blueprint_artifacts(bp)
}

/// Blueprint-level artifact set: `target_file ∪ related_files`, de-duplicated,
/// order-stable. Empty paths are skipped.
fn blueprint_artifacts(bp: &Blueprint) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let candidates = bp
        .front_matter
        .target_file
        .iter()
        .map(String::as_str)
        .chain(bp.front_matter.related_files.iter().map(String::as_str));
    for c in candidates {
        if !c.is_empty() && !out.iter().any(|x| x == c) {
            out.push(c.to_string());
        }
    }
    out
}

/// One reverse-index entry: a file, and a criterion (with its owning blueprint)
/// that is checked against it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub file: String,
    pub criterion_id: String,
    pub blueprint_id: String,
}

/// The reverse index: file → criteria, stored flat. Persisted to
/// `.blueprint/bindings.json` — derived from the blueprint `.md` files, not
/// committed to Git, fully rebuildable by [`build_bindings`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BindingsIndex {
    pub version: u32,
    pub bindings: Vec<Binding>,
}

/// Build the reverse index from the parsed blueprints: for every acceptance
/// criterion, emit one [`Binding`] per artifact it resolves to (via
/// [`artifacts_for`]). Order-stable (by file, then criterion id).
pub fn build_bindings(blueprints: &[&Blueprint]) -> BindingsIndex {
    let mut bindings = Vec::new();
    for bp in blueprints {
        let blueprint_id = &bp.front_matter.blueprint_id;
        for section in &bp.sections {
            if !section.kind.is_acceptance_criteria() {
                continue;
            }
            for crit in &section.criteria {
                for file in artifacts_for(crit, bp) {
                    bindings.push(Binding {
                        file,
                        criterion_id: crit.id.clone(),
                        blueprint_id: blueprint_id.clone(),
                    });
                }
            }
        }
    }
    bindings.sort_by(|a, b| {
        a.file
            .cmp(&b.file)
            .then_with(|| a.criterion_id.cmp(&b.criterion_id))
    });
    BindingsIndex {
        version: 1,
        bindings,
    }
}

/// Reverse lookup: which criteria are checked against `file`. Consumed by S5
/// drift detection ("file X changed → these criteria / blueprints are affected").
pub fn criteria_for_file<'a>(index: &'a BindingsIndex, file: &str) -> Vec<&'a Binding> {
    index.bindings.iter().filter(|b| b.file == file).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blueprint::types::*;

    fn crit(text: &str) -> AcceptanceCriterion {
        AcceptanceCriterion {
            id: new_ulid(),
            text: text.to_string(),
            checked: false,
        }
    }

    fn bp(target: Option<&str>, related: &[&str]) -> Blueprint {
        Blueprint {
            front_matter: BlueprintFrontMatter {
                target_file: target.map(String::from),
                related_files: related.iter().map(|s| s.to_string()).collect(),
                ..Default::default()
            },
            sections: vec![],
            raw_md: String::new(),
        }
    }

    #[test]
    fn related_files_only() {
        let b = bp(None, &["a.ts", "b.ts"]);
        assert_eq!(artifacts_for(&crit("x"), &b), vec!["a.ts", "b.ts"]);
    }

    #[test]
    fn target_file_comes_first() {
        let b = bp(Some("t.ts"), &["a.ts"]);
        assert_eq!(artifacts_for(&crit("x"), &b), vec!["t.ts", "a.ts"]);
    }

    #[test]
    fn union_is_deduplicated() {
        // target also listed in related_files must not appear twice.
        let b = bp(Some("a.ts"), &["a.ts", "b.ts"]);
        assert_eq!(artifacts_for(&crit("x"), &b), vec!["a.ts", "b.ts"]);
    }

    #[test]
    fn empty_when_no_artifacts() {
        let b = bp(None, &[]);
        assert!(artifacts_for(&crit("x"), &b).is_empty());
    }

    #[test]
    fn result_independent_of_criterion() {
        // Seam check: until a per-criterion override exists, any criterion
        // resolves to the same blueprint-level set.
        let b = bp(Some("t.ts"), &["a.ts"]);
        assert_eq!(
            artifacts_for(&crit("first"), &b),
            artifacts_for(&crit("second"), &b)
        );
    }

    // ----- S0.3: reverse index -----

    fn bp_with_criteria(bp_id: &str, related: &[&str], crit_ids: &[&str]) -> Blueprint {
        Blueprint {
            front_matter: BlueprintFrontMatter {
                blueprint_id: bp_id.to_string(),
                related_files: related.iter().map(|s| s.to_string()).collect(),
                ..Default::default()
            },
            sections: vec![BlueprintSection {
                kind: SectionKind::AcceptanceCriteria,
                heading_text: "Acceptance Criteria".to_string(),
                content: String::new(),
                criteria: crit_ids
                    .iter()
                    .map(|id| AcceptanceCriterion {
                        id: id.to_string(),
                        text: "c".to_string(),
                        checked: false,
                    })
                    .collect(),
            }],
            raw_md: String::new(),
        }
    }

    #[test]
    fn build_bindings_emits_flat_criterion_file_pairs() {
        let b = bp_with_criteria("BP1", &["a.ts", "b.ts"], &["C1", "C2"]);
        let idx = build_bindings(&[&b]);
        // 2 criteria × 2 files
        assert_eq!(idx.bindings.len(), 4);
        assert!(idx.bindings.iter().all(|x| x.blueprint_id == "BP1"));
        let c1_files: Vec<_> = idx
            .bindings
            .iter()
            .filter(|x| x.criterion_id == "C1")
            .map(|x| x.file.as_str())
            .collect();
        assert_eq!(c1_files, vec!["a.ts", "b.ts"]);
    }

    #[test]
    fn criteria_for_file_filters_by_file() {
        let b = bp_with_criteria("BP1", &["a.ts", "b.ts"], &["C1", "C2"]);
        let idx = build_bindings(&[&b]);
        let on_a = criteria_for_file(&idx, "a.ts");
        assert_eq!(on_a.len(), 2);
        assert!(on_a.iter().all(|x| x.file == "a.ts"));
        assert!(criteria_for_file(&idx, "missing.ts").is_empty());
    }

    #[test]
    fn build_bindings_spans_multiple_blueprints() {
        let b1 = bp_with_criteria("BP1", &["a.ts"], &["C1"]);
        let b2 = bp_with_criteria("BP2", &["a.ts"], &["C2"]);
        let idx = build_bindings(&[&b1, &b2]);
        let on_a = criteria_for_file(&idx, "a.ts");
        assert_eq!(on_a.len(), 2);
        let owners: std::collections::HashSet<_> =
            on_a.iter().map(|x| x.blueprint_id.as_str()).collect();
        assert!(owners.contains("BP1") && owners.contains("BP2"));
    }
}
