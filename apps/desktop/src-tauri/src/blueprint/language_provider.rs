//! S4 — multi-sensor verdict fusion + the `LanguageProvider` seam.
//!
//! First leg (this file): the **compile gate**. The fusion core reads a
//! language's capability profile + a gate outcome; it never reads a specific
//! language. Per the design (§2): compile/LSP is a GATE, not a vote — a hard
//! build error means an LLM "pass" can't be trusted.
//!
//! Scope of the first leg (agreed): Rust `cargo check` only; tests
//! (`run_tests`), rust-analyzer diagnostics, the TS provider, and graceful
//! toolchain degradation come in later S4 sub-steps. Subprocesses use
//! `tokio::process` (same precedent as lsp/client.rs + codegen_proxy).

// Part of the seam is built ahead of its consumers: `capability()` /
// CapabilityProfile.has_tests feed S4.6 (toolchain degradation), and
// BuildResult.diagnostics feeds the S4.5/S6 evidence trail. Allow until then.
#![allow(dead_code)]

use std::path::Path;

use async_trait::async_trait;

use crate::blueprint::types::CheckVerdict;

/// What a language can be observed with (its intrinsic sensor surface).
#[derive(Debug, Clone)]
pub struct CapabilityProfile {
    pub has_compile_gate: bool,
    pub has_tests: bool,
}

/// Result of the compile gate.
#[derive(Debug, Clone)]
pub struct BuildResult {
    /// Was the toolchain actually available to run? (false → sensor invalid)
    pub available: bool,
    /// Did the project compile? (only meaningful when `available`)
    pub ok: bool,
    /// Short diagnostic lines on failure (for evidence/UX later).
    pub diagnostics: Vec<String>,
}

/// The compile gate's contribution to fusion. `Unavailable` = not this
/// language, or the toolchain isn't installed — the gate is silent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateOutcome {
    Passed,
    Failed,
    Unavailable,
}

/// A per-language sensor backend. The fusion core only sees this trait, never a
/// concrete language. (Only `build_check` + `capability` exist in the first
/// leg; `run_tests` / `diagnostics` / `toolchain` join in later S4 sub-steps.)
#[async_trait]
pub trait LanguageProvider: Send + Sync {
    async fn build_check(&self, project_root: &Path) -> BuildResult;
    fn capability(&self) -> CapabilityProfile;
}

pub struct RustProvider;

#[async_trait]
impl LanguageProvider for RustProvider {
    async fn build_check(&self, project_root: &Path) -> BuildResult {
        // Non-interactive background subprocess (same class as LSP/codegen).
        match tokio::process::Command::new("cargo")
            .arg("check")
            .arg("--quiet")
            .current_dir(project_root)
            .output()
            .await
        {
            Ok(out) => BuildResult {
                available: true,
                ok: out.status.success(),
                diagnostics: if out.status.success() {
                    Vec::new()
                } else {
                    String::from_utf8_lossy(&out.stderr)
                        .lines()
                        .take(50)
                        .map(String::from)
                        .collect()
                },
            },
            // cargo not on PATH → sensor unavailable (graceful: gate stays silent)
            Err(_) => BuildResult {
                available: false,
                ok: false,
                diagnostics: Vec::new(),
            },
        }
    }

    fn capability(&self) -> CapabilityProfile {
        CapabilityProfile {
            has_compile_gate: true,
            has_tests: true,
        }
    }
}

/// Pick a provider for the project. First leg: Rust only (Cargo.toml present).
/// No match → the compile gate is simply unavailable for this project.
pub fn select_provider(project_root: &Path) -> Option<Box<dyn LanguageProvider>> {
    if project_root.join("Cargo.toml").exists() {
        return Some(Box::new(RustProvider));
    }
    None
}

/// Run the compile gate for a project, collapsing to a `GateOutcome`.
pub async fn run_gate(project_root: &Path) -> GateOutcome {
    match select_provider(project_root) {
        Some(provider) => {
            let r = provider.build_check(project_root).await;
            if !r.available {
                GateOutcome::Unavailable
            } else if r.ok {
                GateOutcome::Passed
            } else {
                GateOutcome::Failed
            }
        }
        None => GateOutcome::Unavailable,
    }
}

/// Fuse the LLM verdict with the compile gate (design §2/§3).
///
/// A failing gate means the project doesn't build, so an LLM "pass" can't be
/// trusted → downgrade to `Unclear`. The gate is project-level here, so we
/// conservatively downgrade rather than assert `Fail` on a specific criterion
/// (precise compile-error→criterion attribution is a later refinement). When
/// the gate passes or is unavailable, the LLM verdict stands.
pub fn fuse_verdict(llm: CheckVerdict, gate: GateOutcome) -> CheckVerdict {
    match gate {
        GateOutcome::Failed => match llm {
            CheckVerdict::Pass => CheckVerdict::Unclear,
            other => other,
        },
        GateOutcome::Passed | GateOutcome::Unavailable => llm,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn failing_gate_downgrades_llm_pass_to_unclear() {
        assert!(matches!(
            fuse_verdict(CheckVerdict::Pass, GateOutcome::Failed),
            CheckVerdict::Unclear
        ));
        // Fail / Unclear are kept — the gate only invalidates a claimed pass.
        assert!(matches!(
            fuse_verdict(CheckVerdict::Fail, GateOutcome::Failed),
            CheckVerdict::Fail
        ));
        assert!(matches!(
            fuse_verdict(CheckVerdict::Unclear, GateOutcome::Failed),
            CheckVerdict::Unclear
        ));
    }

    #[test]
    fn passing_or_absent_gate_trusts_llm() {
        for gate in [GateOutcome::Passed, GateOutcome::Unavailable] {
            assert!(matches!(
                fuse_verdict(CheckVerdict::Pass, gate),
                CheckVerdict::Pass
            ));
            assert!(matches!(
                fuse_verdict(CheckVerdict::Fail, gate),
                CheckVerdict::Fail
            ));
        }
    }

    #[test]
    fn select_provider_picks_rust_on_cargo_toml() {
        let with_cargo = TempDir::new().unwrap();
        std::fs::write(with_cargo.path().join("Cargo.toml"), "[package]\n").unwrap();
        assert!(select_provider(with_cargo.path()).is_some());

        let without = TempDir::new().unwrap();
        assert!(select_provider(without.path()).is_none());
    }

    #[test]
    fn rust_provider_advertises_compile_and_tests() {
        let cap = RustProvider.capability();
        assert!(cap.has_compile_gate);
        assert!(cap.has_tests);
    }

    // Real `cargo check` is environment-dependent and slow — excluded from the
    // default suite / CI. Run with `cargo test -- --ignored` on a Rust project.
    #[ignore]
    #[tokio::test]
    async fn rust_build_check_runs_against_a_real_project() {
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join("Cargo.toml"),
            "[package]\nname = \"t\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
        )
        .unwrap();
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(dir.path().join("src/main.rs"), "fn main() {}\n").unwrap();
        let r = RustProvider.build_check(dir.path()).await;
        assert!(r.available && r.ok, "clean project should pass the gate");
    }
}
