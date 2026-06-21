//! S3 — read-only state estimator.
//!
//! Subscribes to the bus and maintains a per-criterion "current satisfaction
//! estimate". READ-ONLY: it never triggers an action (no re-check, no codegen,
//! no file write, no event publish) — it only reflects state.
//!
//! Single-source for now: the estimate's verdict comes from the persisted
//! check results (the existing AI check). S4 swaps the *production* of the
//! estimate for multi-sensor fusion (compile gate + tests + LLM) behind this
//! same query surface, without changing callers.
//!
//! Wiring (bus subscription + workspace-root resolution) lives in lib.rs; the
//! methods here are pure (take `root: &Path`) so they're unit-testable.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::blueprint::bindings;
use crate::blueprint::storage;
use crate::blueprint::types::CheckVerdict;

/// The current satisfaction estimate for one acceptance criterion.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Estimate {
    pub criterion_id: String,
    pub blueprint_id: String,
    /// None = no verdict yet (e.g. a bound file changed before any check ran).
    pub verdict: Option<CheckVerdict>,
    /// A bound file changed after the last check, so the verdict may be out of
    /// date. S3 only *marks* this; emitting a drift signal or re-checking is S5.
    pub stale: bool,
    pub checked_at: Option<u64>,
}

#[derive(Default)]
pub struct Estimator {
    /// key: criterion_id
    state: Mutex<HashMap<String, Estimate>>,
}

impl Estimator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Refresh a blueprint's estimates from its persisted check results (the
    /// single source for now). Refreshed criteria get the latest verdict and
    /// have `stale` cleared.
    pub fn refresh_from_checks(&self, root: &Path, blueprint_id: &str) {
        let results = storage::load_check_results(root, blueprint_id).unwrap_or_default();
        let mut state = self.state.lock().unwrap();
        for r in results {
            state.insert(
                r.criterion_id.clone(),
                Estimate {
                    criterion_id: r.criterion_id,
                    blueprint_id: r.blueprint_id,
                    verdict: Some(r.verdict),
                    stale: false,
                    checked_at: Some(r.checked_at),
                },
            );
        }
    }

    /// A bound file changed → mark every criterion bound to it (via the S0.3
    /// reverse index) `stale`. Read-only: marks state, triggers nothing. A
    /// criterion with no prior estimate gets one with `verdict: None`.
    pub fn mark_stale_for_file(&self, root: &Path, file: &str) {
        let index = storage::load_bindings(root);
        let affected = bindings::criteria_for_file(&index, file);
        if affected.is_empty() {
            return;
        }
        let mut state = self.state.lock().unwrap();
        for b in affected {
            let e = state
                .entry(b.criterion_id.clone())
                .or_insert_with(|| Estimate {
                    criterion_id: b.criterion_id.clone(),
                    blueprint_id: b.blueprint_id.clone(),
                    verdict: None,
                    stale: false,
                    checked_at: None,
                });
            e.stale = true;
        }
    }

    /// Query the current estimates for a blueprint (order-stable by criterion id).
    pub fn estimates_for(&self, blueprint_id: &str) -> Vec<Estimate> {
        let state = self.state.lock().unwrap();
        let mut out: Vec<Estimate> = state
            .values()
            .filter(|e| e.blueprint_id == blueprint_id)
            .cloned()
            .collect();
        out.sort_by(|a, b| a.criterion_id.cmp(&b.criterion_id));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blueprint::types::CheckResult;
    use tempfile::TempDir;

    fn check_result(bp: &str, cid: &str, verdict: CheckVerdict) -> CheckResult {
        CheckResult {
            blueprint_id: bp.to_string(),
            criterion_id: cid.to_string(),
            verdict,
            explanation: "e".to_string(),
            suggestion: None,
            references: vec![],
            checked_at: 123,
            stale: false,
            blueprint_hash: "h".to_string(),
            code_hash: "c".to_string(),
            model_id: "m".to_string(),
        }
    }

    #[test]
    fn refresh_pulls_verdicts_from_check_results() {
        let dir = TempDir::new().unwrap();
        storage::save_check_result(dir.path(), &check_result("BP1", "C1", CheckVerdict::Pass))
            .unwrap();
        storage::save_check_result(dir.path(), &check_result("BP1", "C2", CheckVerdict::Fail))
            .unwrap();

        let est = Estimator::new();
        est.refresh_from_checks(dir.path(), "BP1");
        let estimates = est.estimates_for("BP1");

        assert_eq!(estimates.len(), 2);
        assert_eq!(estimates[0].criterion_id, "C1");
        assert!(matches!(estimates[0].verdict, Some(CheckVerdict::Pass)));
        assert!(!estimates[0].stale);
        assert!(matches!(estimates[1].verdict, Some(CheckVerdict::Fail)));
    }

    #[test]
    fn mark_stale_uses_reverse_index() {
        let dir = TempDir::new().unwrap();
        // Persist a bindings.json mapping a.ts → C1 (BP1).
        let idx = bindings::BindingsIndex {
            version: 1,
            bindings: vec![bindings::Binding {
                file: "a.ts".to_string(),
                criterion_id: "C1".to_string(),
                blueprint_id: "BP1".to_string(),
            }],
        };
        std::fs::create_dir_all(dir.path().join(".blueprint")).unwrap();
        std::fs::write(
            dir.path().join(".blueprint/bindings.json"),
            serde_json::to_string(&idx).unwrap(),
        )
        .unwrap();

        let est = Estimator::new();
        est.mark_stale_for_file(dir.path(), "a.ts");
        let estimates = est.estimates_for("BP1");

        assert_eq!(estimates.len(), 1);
        assert_eq!(estimates[0].criterion_id, "C1");
        assert!(estimates[0].stale);
        assert!(estimates[0].verdict.is_none(), "no check yet → verdict None");
    }

    #[test]
    fn file_change_marks_existing_estimate_stale() {
        let dir = TempDir::new().unwrap();
        storage::save_check_result(dir.path(), &check_result("BP1", "C1", CheckVerdict::Pass))
            .unwrap();
        let idx = bindings::BindingsIndex {
            version: 1,
            bindings: vec![bindings::Binding {
                file: "a.ts".to_string(),
                criterion_id: "C1".to_string(),
                blueprint_id: "BP1".to_string(),
            }],
        };
        std::fs::create_dir_all(dir.path().join(".blueprint")).unwrap();
        std::fs::write(
            dir.path().join(".blueprint/bindings.json"),
            serde_json::to_string(&idx).unwrap(),
        )
        .unwrap();

        let est = Estimator::new();
        est.refresh_from_checks(dir.path(), "BP1"); // C1 = Pass, fresh
        est.mark_stale_for_file(dir.path(), "a.ts"); // a.ts changed → C1 stale

        let estimates = est.estimates_for("BP1");
        assert!(matches!(estimates[0].verdict, Some(CheckVerdict::Pass)));
        assert!(estimates[0].stale, "verdict kept, but flagged stale");
    }
}
