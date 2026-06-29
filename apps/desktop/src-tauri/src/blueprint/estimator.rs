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
    /// date.
    pub stale: bool,
    /// S5: this criterion had an established verdict and then bound code
    /// changed — the verdict is suspect (drift), not just any file touch.
    /// Cleared on the next check (refresh_from_checks).
    pub drifted: bool,
    /// S6: the verdict's rationale (carries the deciding sensor, e.g.
    /// "[compile gate] ..." / "[tests] ...", plus the LLM's reason) so the
    /// feedback surface can show *why* this is the verdict. None until checked.
    pub explanation: Option<String>,
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
                    drifted: false, // a fresh check resolves any prior drift
                    explanation: Some(r.explanation),
                    checked_at: Some(r.checked_at),
                },
            );
        }
    }

    /// A bound file changed → mark every criterion bound to it (via the S0.3
    /// reverse index) `stale`. Returns the criteria that **drifted** (S5): those
    /// that had an established verdict and weren't already stale — their verdict
    /// is now suspect. Newly-seen criteria (no prior verdict) are marked stale
    /// but are NOT drift.
    ///
    /// Read-only w.r.t. the world: updates in-memory state and returns the drift
    /// list; publishing the `DriftDetected` signal is the caller's job, keeping
    /// the estimator itself event-free (the S3 invariant).
    pub fn mark_stale_for_file(&self, root: &Path, file: &str) -> Vec<(String, String)> {
        let index = storage::load_bindings(root);
        let affected = bindings::criteria_for_file(&index, file);
        let mut drifted = Vec::new();
        if affected.is_empty() {
            return drifted;
        }
        let mut state = self.state.lock().unwrap();
        // Per-criterion diagnostic for drift debugging — off by default, surfaced
        // with RUST_LOG=debug. The user-facing "N criteria drifted" summary is
        // logged at info by the caller (lib.rs).
        log::debug!(
            "mark_stale file={file} affected={} state_size={}",
            affected.len(),
            state.len()
        );
        for b in &affected {
            log::debug!(
                "  crit={} in_state={} verdict_some={:?} stale={:?}",
                b.criterion_id,
                state.contains_key(&b.criterion_id),
                state.get(&b.criterion_id).map(|e| e.verdict.is_some()),
                state.get(&b.criterion_id).map(|e| e.stale)
            );
        }
        for b in affected {
            // Only an ESTABLISHED verdict can drift. A criterion with no
            // estimate yet (never checked) is SKIPPED — we must not insert a
            // verdict-less placeholder. Doing so polluted the state, and because
            // the lazy fill in blueprint_get_estimates keys on "estimates
            // empty", a placeholder permanently prevented the real verdict from
            // ever loading — which silently broke drift entirely.
            if let Some(e) = state.get_mut(&b.criterion_id) {
                if e.verdict.is_some() && !e.stale {
                    e.drifted = true;
                    drifted.push((e.criterion_id.clone(), e.blueprint_id.clone()));
                }
                e.stale = true;
            }
        }
        drifted
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
        let drifted = est.mark_stale_for_file(dir.path(), "a.ts");
        let estimates = est.estimates_for("BP1");

        // A never-checked criterion (no estimate) is NOT given a placeholder —
        // mark_stale only touches established estimates. So nothing is created
        // and nothing drifts. (A verdict-less placeholder here used to block the
        // lazy verdict load and silently break drift.)
        assert!(estimates.is_empty(), "no placeholder for an unchecked criterion");
        assert!(drifted.is_empty(), "a never-checked criterion does not drift");
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
        let drifted = est.mark_stale_for_file(dir.path(), "a.ts"); // a.ts changed → C1 drifts

        let estimates = est.estimates_for("BP1");
        assert!(matches!(estimates[0].verdict, Some(CheckVerdict::Pass)));
        assert!(estimates[0].stale, "verdict kept, but flagged stale");
        // S5: an established (Pass) verdict whose code changed is drift.
        assert!(estimates[0].drifted);
        assert_eq!(drifted, vec![("C1".to_string(), "BP1".to_string())]);

        // A second file change does not re-report drift (already stale).
        assert!(est.mark_stale_for_file(dir.path(), "a.ts").is_empty());

        // Re-checking resolves the drift.
        est.refresh_from_checks(dir.path(), "BP1");
        assert!(!est.estimates_for("BP1")[0].drifted);
        assert!(!est.estimates_for("BP1")[0].stale);
    }
}
