//! S4 — multi-sensor verdict fusion + the `LanguageProvider` seam.
//!
//! First leg (this file): the **compile gate**. The fusion core reads a
//! language's capability profile + a gate outcome; it never reads a specific
//! language. Per the design (§2): compile/LSP is a GATE, not a vote — a hard
//! build error means an LLM "pass" can't be trusted.
//!
//! Wired sensors: Rust (`cargo check` gate + `cargo test` leg) and
//! TypeScript (`tsc --noEmit` gate; no test leg — the degradation note says
//! so). rust-analyzer diagnostics and richer evidence stay later S4
//! sub-steps. Subprocesses use `tokio::process` (same precedent as
//! lsp/client.rs + codegen_proxy).

use std::collections::HashSet;
use std::path::Path;
use std::time::Duration;

use async_trait::async_trait;

use crate::blueprint::bindings;
use crate::blueprint::types::{AcceptanceCriterion, Blueprint, CheckVerdict};

/// Max wall-clock for the test sensor before it's treated as unavailable, so a
/// hung/very-long `cargo test` degrades gracefully instead of blocking a check.
const TEST_TIMEOUT: Duration = Duration::from_secs(300);

/// What a language can be observed with (its intrinsic sensor surface).
#[derive(Debug, Clone)]
pub struct CapabilityProfile {
    /// Language name as shown in degradation notes ("Rust", "TypeScript").
    pub language: &'static str,
    pub has_compile_gate: bool,
    pub has_tests: bool,
    /// What installing would bring the missing toolchain online — quoted
    /// verbatim in the degradation note when the gate is unavailable.
    pub toolchain_hint: &'static str,
}

/// Result of the compile gate.
#[derive(Debug, Clone)]
pub struct BuildResult {
    /// Was the toolchain actually available to run? (false → sensor invalid)
    pub available: bool,
    /// Did the project compile? (only meaningful when `available`)
    pub ok: bool,
    /// Short diagnostic lines on failure. Feeds the S4.5/S6 evidence trail;
    /// unread until that lands.
    #[allow(dead_code)]
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
            language: "Rust",
            has_compile_gate: true,
            has_tests: true,
            toolchain_hint: "install cargo",
        }
    }
}

pub struct TsProvider;

#[async_trait]
impl LanguageProvider for TsProvider {
    async fn build_check(&self, project_root: &Path) -> BuildResult {
        // Prefer the project's own typescript package (same version the
        // editor diagnostics use) run through `node` — cross-platform, no
        // shell shims. Fall back to a PATH `tsc` for global installs (unix;
        // on Windows the global shim is tsc.cmd, which CreateProcess won't
        // resolve — that lands in the honest Unavailable path).
        let local_tsc = project_root.join("node_modules/typescript/bin/tsc");
        let mut cmd = if local_tsc.exists() {
            let mut c = tokio::process::Command::new("node");
            c.arg(local_tsc);
            c
        } else {
            tokio::process::Command::new("tsc")
        };
        match cmd
            .arg("--noEmit")
            .current_dir(project_root)
            .output()
            .await
        {
            Ok(out) => BuildResult {
                available: true,
                ok: out.status.success(),
                // tsc prints diagnostics to STDOUT, not stderr.
                diagnostics: if out.status.success() {
                    Vec::new()
                } else {
                    String::from_utf8_lossy(&out.stdout)
                        .lines()
                        .take(50)
                        .map(String::from)
                        .collect()
                },
            },
            // node/tsc not runnable → sensor unavailable (gate stays silent)
            Err(_) => BuildResult {
                available: false,
                ok: false,
                diagnostics: Vec::new(),
            },
        }
    }

    fn capability(&self) -> CapabilityProfile {
        CapabilityProfile {
            language: "TypeScript",
            has_compile_gate: true,
            // No TS test leg yet (vitest/jest mapping is future work) — the
            // degradation note discloses this on every TS criterion.
            has_tests: false,
            toolchain_hint: "install typescript (e.g. pnpm add -D typescript)",
        }
    }
}

/// Pick a provider for the project. Rust (Cargo.toml) and TypeScript (root
/// tsconfig.json — the same signal tsserver keys off, and the scaffolding
/// always writes one). Rust wins on mixed projects: fusion is single-gate
/// for now, multi-gate is future work. No match → the compile gate is
/// simply unavailable for this project.
pub fn select_provider(project_root: &Path) -> Option<Box<dyn LanguageProvider>> {
    if project_root.join("Cargo.toml").exists() {
        return Some(Box::new(RustProvider));
    }
    if project_root.join("tsconfig.json").exists() {
        return Some(Box::new(TsProvider));
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

/// The test sensor's contribution for one criterion (module-granularity, §6).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TestOutcome {
    /// Mapped module has tests and they pass.
    Passed,
    /// Mapped module has a failing test.
    Failed,
    /// Mapped module has no tests (or the criterion maps to no Rust module).
    NoCoverage,
    /// cargo missing / timed out / not a Rust project.
    Unavailable,
}

/// Outcome of `cargo test`, bucketed by module (the test path's first segment).
/// Module granularity is the agreed v1.5 coarse pass (§6); criterion↔single-test
/// is a v1.5.x refinement.
pub struct TestReport {
    tested_modules: HashSet<String>,
    failed_modules: HashSet<String>,
}

impl TestReport {
    /// Parse `cargo test` stdout lines: `test <path>::name ... ok|FAILED|ignored`.
    pub fn from_cargo_output(stdout: &str) -> Self {
        let mut tested_modules = HashSet::new();
        let mut failed_modules = HashSet::new();
        for line in stdout.lines() {
            let Some(rest) = line.strip_prefix("test ") else {
                continue;
            };
            // "test result: ..." summary lines have no " ... " — skipped here.
            let Some((path, result)) = rest.rsplit_once(" ... ") else {
                continue;
            };
            let module = path.split("::").next().unwrap_or("").to_string();
            if module.is_empty() {
                continue;
            }
            tested_modules.insert(module.clone());
            if result.starts_with("FAILED") {
                failed_modules.insert(module);
            }
        }
        Self {
            tested_modules,
            failed_modules,
        }
    }

    pub fn outcome_for_module(&self, module: Option<&str>) -> TestOutcome {
        let Some(m) = module else {
            return TestOutcome::NoCoverage;
        };
        if !self.tested_modules.contains(m) {
            return TestOutcome::NoCoverage;
        }
        if self.failed_modules.contains(m) {
            TestOutcome::Failed
        } else {
            TestOutcome::Passed
        }
    }
}

/// Run `cargo test` once for the project (with a timeout). `None` = cargo
/// unavailable, timed out, or not a Rust project — the sensor is then silent.
pub async fn run_rust_tests(project_root: &Path) -> Option<TestReport> {
    if !project_root.join("Cargo.toml").exists() {
        return None;
    }
    let cmd = tokio::process::Command::new("cargo")
        .arg("test")
        .arg("--no-fail-fast")
        .current_dir(project_root)
        .output();
    let out = tokio::time::timeout(TEST_TIMEOUT, cmd).await.ok()?.ok()?;
    // Test result lines are on stdout (the libtest harness).
    Some(TestReport::from_cargo_output(&String::from_utf8_lossy(
        &out.stdout,
    )))
}

/// The Rust module a criterion maps to (test path's first segment), derived
/// from its bound files. None → no Rust binding / no submodule.
pub fn module_of_criterion(criterion: &AcceptanceCriterion, bp: &Blueprint) -> Option<String> {
    for f in bindings::artifacts_for(criterion, bp) {
        if let Some(m) = rust_module_of_file(&f) {
            return Some(m);
        }
    }
    None
}

/// `.../src/blueprint/check.rs` → `blueprint`. `.../src/main.rs` (top level) or
/// a non-Rust file → None.
fn rust_module_of_file(file: &str) -> Option<String> {
    if !file.ends_with(".rs") {
        return None;
    }
    let norm = file.replace('\\', "/");
    let after_src = norm.split("/src/").nth(1)?;
    let first = after_src.split('/').next()?;
    if first.ends_with(".rs") {
        return None; // e.g. src/main.rs — no submodule
    }
    Some(first.to_string())
}

/// Which deterministic sensors were actually live for a check — the
/// "effective sensor = capability ∩ toolchain" input to the honest
/// degradation annotation (design §2 graceful degradation, §7 dogfood).
pub struct SensorContext {
    /// The matched provider's capability profile; None = no provider for
    /// this project's language (e.g. TS — only Rust is wired in v1.5).
    pub capability: Option<CapabilityProfile>,
    pub gate: GateOutcome,
    /// Did the test sensor produce a report?
    pub tests_ran: bool,
}

/// The honest degradation annotation for one criterion (design §2: when a
/// deterministic sensor is silent, say so, say the verdict is
/// lower-confidence, and say what upgrades it). `None` ⇔ both deterministic
/// sensors were live for this criterion — nothing to disclose.
pub fn degradation_note(ctx: &SensorContext, test: TestOutcome) -> Option<String> {
    let Some(cap) = &ctx.capability else {
        return Some(
            "no supported language detected (Rust: Cargo.toml / TypeScript: \
             root tsconfig.json) — compile & test sensors unavailable; \
             AI-only estimate, lower confidence"
                .to_string(),
        );
    };
    if cap.has_compile_gate && ctx.gate == GateOutcome::Unavailable {
        // With the toolchain missing, any test leg can't run either.
        let legs = if cap.has_tests {
            "compile gate and tests"
        } else {
            "compile gate"
        };
        return Some(format!(
            "{} toolchain not found — {legs} skipped; AI-only estimate, lower \
             confidence ({} to upgrade verdict quality)",
            cap.language, cap.toolchain_hint
        ));
    }
    let mut parts: Vec<&str> = Vec::new();
    if !cap.has_compile_gate {
        parts.push("no compile gate for this language");
    }
    if !cap.has_tests {
        parts.push("no test sensor for this language");
    } else if !ctx.tests_ran {
        parts.push("test sensor did not run (cargo test failed or timed out)");
    } else if test == TestOutcome::NoCoverage {
        parts.push("no tests map to this criterion's module (test leg silent)");
    }
    if parts.is_empty() {
        None
    } else {
        Some(format!("{} — lower confidence", parts.join("; ")))
    }
}

/// Fuse the LLM verdict with the compile gate + test sensor (design §2/§3),
/// priority order: gate → tests → LLM residual.
///
/// 1. Compile gate is a gate, not a vote: a hard build error means an LLM
///    "pass" can't be trusted → downgrade to `Unclear`. Project-level here, so
///    we downgrade conservatively rather than assert `Fail` on a criterion.
/// 2. Tests, at MODULE granularity: a failing mapped module is a high-precision
///    `Fail`. A *passing* module is NOT treated as a strong pass — module-green
///    doesn't prove this criterion's semantics are met — so green falls back to
///    the LLM rather than overriding it. (Precise criterion↔test mapping, which
///    would let green drive `Pass`, is a v1.5.x refinement.)
/// 3. Otherwise the (gated) LLM verdict stands.
pub fn fuse_verdict(llm: CheckVerdict, gate: GateOutcome, test: TestOutcome) -> CheckVerdict {
    if gate == GateOutcome::Failed {
        return match llm {
            CheckVerdict::Pass => CheckVerdict::Unclear,
            other => other,
        };
    }
    match test {
        TestOutcome::Failed => CheckVerdict::Fail,
        TestOutcome::Passed | TestOutcome::NoCoverage | TestOutcome::Unavailable => llm,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn failing_gate_downgrades_llm_pass_to_unclear() {
        let t = TestOutcome::NoCoverage;
        assert!(matches!(
            fuse_verdict(CheckVerdict::Pass, GateOutcome::Failed, t),
            CheckVerdict::Unclear
        ));
        // Fail / Unclear are kept — the gate only invalidates a claimed pass.
        assert!(matches!(
            fuse_verdict(CheckVerdict::Fail, GateOutcome::Failed, t),
            CheckVerdict::Fail
        ));
        assert!(matches!(
            fuse_verdict(CheckVerdict::Unclear, GateOutcome::Failed, t),
            CheckVerdict::Unclear
        ));
    }

    #[test]
    fn passing_or_absent_gate_no_tests_trusts_llm() {
        let t = TestOutcome::NoCoverage;
        for gate in [GateOutcome::Passed, GateOutcome::Unavailable] {
            assert!(matches!(
                fuse_verdict(CheckVerdict::Pass, gate, t),
                CheckVerdict::Pass
            ));
            assert!(matches!(
                fuse_verdict(CheckVerdict::Fail, gate, t),
                CheckVerdict::Fail
            ));
        }
    }

    #[test]
    fn failing_tests_force_fail_even_when_llm_says_pass() {
        // Gate not failed; mapped module has a red test → high-precision Fail.
        assert!(matches!(
            fuse_verdict(CheckVerdict::Pass, GateOutcome::Passed, TestOutcome::Failed),
            CheckVerdict::Fail
        ));
    }

    #[test]
    fn passing_tests_do_not_override_llm_at_module_granularity() {
        // module-green is a weak signal — it must not flip an LLM Fail to Pass.
        assert!(matches!(
            fuse_verdict(CheckVerdict::Fail, GateOutcome::Passed, TestOutcome::Passed),
            CheckVerdict::Fail
        ));
        assert!(matches!(
            fuse_verdict(CheckVerdict::Pass, GateOutcome::Passed, TestOutcome::Passed),
            CheckVerdict::Pass
        ));
    }

    #[test]
    fn parse_cargo_output_buckets_by_module() {
        let out = "\nrunning 3 tests\n\
            test blueprint::check::tests::a ... ok\n\
            test blueprint::bindings::tests::b ... FAILED\n\
            test git::ops::tests::c ... ok\n\
            test result: FAILED. 2 passed; 1 failed; 0 ignored\n";
        let r = TestReport::from_cargo_output(out);
        assert!(r.tested_modules.contains("blueprint"));
        assert!(r.tested_modules.contains("git"));
        assert!(r.failed_modules.contains("blueprint")); // bindings test failed
        assert!(!r.failed_modules.contains("git"));
        // summary line "test result: ..." must not be parsed as a test
        assert!(!r.tested_modules.contains("result:"));
        assert!(matches!(
            r.outcome_for_module(Some("blueprint")),
            TestOutcome::Failed
        ));
        assert!(matches!(
            r.outcome_for_module(Some("git")),
            TestOutcome::Passed
        ));
        assert!(matches!(
            r.outcome_for_module(Some("atlas")),
            TestOutcome::NoCoverage
        ));
        assert!(matches!(
            r.outcome_for_module(None),
            TestOutcome::NoCoverage
        ));
    }

    #[test]
    fn rust_module_of_file_extracts_submodule() {
        assert_eq!(
            rust_module_of_file("apps/desktop/src-tauri/src/blueprint/check.rs").as_deref(),
            Some("blueprint")
        );
        assert_eq!(rust_module_of_file("src/main.rs"), None); // top-level, no submodule
        assert_eq!(rust_module_of_file("apps/desktop/src/views/x.ts"), None); // not Rust
    }

    #[test]
    fn select_provider_picks_by_project_marker() {
        let with_cargo = TempDir::new().unwrap();
        std::fs::write(with_cargo.path().join("Cargo.toml"), "[package]\n").unwrap();
        assert_eq!(
            select_provider(with_cargo.path()).unwrap().capability().language,
            "Rust"
        );

        let with_tsconfig = TempDir::new().unwrap();
        std::fs::write(with_tsconfig.path().join("tsconfig.json"), "{}\n").unwrap();
        assert_eq!(
            select_provider(with_tsconfig.path()).unwrap().capability().language,
            "TypeScript"
        );

        // Mixed project: Rust wins (single-gate fusion for now).
        let mixed = TempDir::new().unwrap();
        std::fs::write(mixed.path().join("Cargo.toml"), "[package]\n").unwrap();
        std::fs::write(mixed.path().join("tsconfig.json"), "{}\n").unwrap();
        assert_eq!(
            select_provider(mixed.path()).unwrap().capability().language,
            "Rust"
        );

        let without = TempDir::new().unwrap();
        assert!(select_provider(without.path()).is_none());
    }

    #[test]
    fn rust_provider_advertises_compile_and_tests() {
        let cap = RustProvider.capability();
        assert!(cap.has_compile_gate);
        assert!(cap.has_tests);
    }

    #[test]
    fn ts_provider_advertises_compile_gate_without_test_leg() {
        let cap = TsProvider.capability();
        assert!(cap.has_compile_gate);
        assert!(!cap.has_tests, "no TS test leg yet — must be disclosed, not implied");
    }

    fn ctx(
        capability: Option<CapabilityProfile>,
        gate: GateOutcome,
        tests_ran: bool,
    ) -> SensorContext {
        SensorContext {
            capability,
            gate,
            tests_ran,
        }
    }

    #[test]
    fn degradation_note_no_provider_is_ai_only() {
        let n = degradation_note(
            &ctx(None, GateOutcome::Unavailable, false),
            TestOutcome::Unavailable,
        )
        .expect("must disclose");
        assert!(n.contains("AI-only"), "{n}");
        assert!(n.contains("lower confidence"), "{n}");
    }

    #[test]
    fn degradation_note_missing_cargo_says_install() {
        let n = degradation_note(
            &ctx(
                Some(RustProvider.capability()),
                GateOutcome::Unavailable,
                false,
            ),
            TestOutcome::Unavailable,
        )
        .expect("must disclose");
        assert!(n.contains("install cargo"), "{n}");
        assert!(n.contains("AI-only"), "{n}");
    }

    #[test]
    fn degradation_note_tests_did_not_run() {
        let n = degradation_note(
            &ctx(Some(RustProvider.capability()), GateOutcome::Passed, false),
            TestOutcome::Unavailable,
        )
        .expect("must disclose");
        assert!(n.contains("test sensor did not run"), "{n}");
    }

    #[test]
    fn degradation_note_no_coverage_flags_silent_test_leg() {
        let n = degradation_note(
            &ctx(Some(RustProvider.capability()), GateOutcome::Passed, true),
            TestOutcome::NoCoverage,
        )
        .expect("must disclose");
        assert!(n.contains("no tests map"), "{n}");
    }

    #[test]
    fn degradation_note_missing_tsc_says_install_typescript() {
        let n = degradation_note(
            &ctx(Some(TsProvider.capability()), GateOutcome::Unavailable, false),
            TestOutcome::Unavailable,
        )
        .expect("must disclose");
        assert!(n.contains("TypeScript toolchain not found"), "{n}");
        assert!(n.contains("install typescript"), "{n}");
        assert!(n.contains("AI-only"), "{n}");
        // TS has no test leg — the note must not claim tests were "skipped".
        assert!(!n.contains("and tests"), "{n}");
    }

    #[test]
    fn degradation_note_ts_gate_live_still_discloses_missing_test_leg() {
        // tsc ran fine — but TS has no test sensor, and that must be said
        // rather than letting a gate-green verdict read as fully sensed.
        let n = degradation_note(
            &ctx(Some(TsProvider.capability()), GateOutcome::Passed, false),
            TestOutcome::Unavailable,
        )
        .expect("must disclose");
        assert!(n.contains("no test sensor for this language"), "{n}");
        assert!(n.contains("lower confidence"), "{n}");
    }

    #[test]
    fn degradation_note_silent_when_all_sensors_live() {
        // Gate ran (either way) and the mapped module has real test signal —
        // nothing to disclose, the fusion result stands on live sensors.
        for gate in [GateOutcome::Passed, GateOutcome::Failed] {
            for test in [TestOutcome::Passed, TestOutcome::Failed] {
                assert!(
                    degradation_note(&ctx(Some(RustProvider.capability()), gate, true), test)
                        .is_none()
                );
            }
        }
    }

    // Real `tsc` is environment-dependent (needs node + a typescript install)
    // — excluded from the default suite / CI. Run with `cargo test -- --ignored`.
    #[cfg(unix)]
    #[ignore]
    #[tokio::test]
    async fn ts_build_check_flags_a_type_error() {
        let dir = TempDir::new().unwrap();
        std::fs::write(
            dir.path().join("tsconfig.json"),
            r#"{"compilerOptions":{"strict":true,"noEmit":true},"include":["src"]}"#,
        )
        .unwrap();
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(
            dir.path().join("src/bad.ts"),
            "const n: number = \"not a number\";\nexport default n;\n",
        )
        .unwrap();

        // Borrow the workspace's typescript install so the manual run doesn't
        // need a global tsc (apps/desktop has one as a devDependency).
        let repo_ts = Path::new(env!("CARGO_MANIFEST_DIR")).join("../node_modules/typescript");
        if repo_ts.exists() {
            std::fs::create_dir_all(dir.path().join("node_modules")).unwrap();
            std::os::unix::fs::symlink(
                repo_ts.canonicalize().unwrap(),
                dir.path().join("node_modules/typescript"),
            )
            .unwrap();
        }

        let r = TsProvider.build_check(dir.path()).await;
        assert!(r.available, "needs node + typescript (local or PATH)");
        assert!(!r.ok, "a type error must fail the gate");
        assert!(
            r.diagnostics.iter().any(|l| l.contains("TS2322")),
            "diagnostics should carry the tsc error: {:?}",
            r.diagnostics
        );

        // And a clean file passes the same gate.
        std::fs::write(
            dir.path().join("src/bad.ts"),
            "const n: number = 42;\nexport default n;\n",
        )
        .unwrap();
        let ok = TsProvider.build_check(dir.path()).await;
        assert!(ok.available && ok.ok, "clean project should pass the gate");
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
