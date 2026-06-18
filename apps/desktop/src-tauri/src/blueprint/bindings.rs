//! S0 bindings — resolving which code artifacts a criterion is checked against.
//!
//! S0.2 (this file) is the forward direction: [`artifacts_for`]. Later stages
//! build on it: S0.3 adds the reverse index (`criteria_for_file`, persisted to
//! `blueprints/bindings.json`); S0.4 rewires `check.rs` to address
//! `CheckResult`s by `criterion_id` through this resolver instead of reading
//! `front_matter.related_files` directly.

// The resolver is built in S0.2 ahead of its caller (S0.4 wires it into
// check.rs). Until then it is exercised only by tests.
#![allow(dead_code)]

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
}
