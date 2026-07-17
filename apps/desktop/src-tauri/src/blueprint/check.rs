//! Blueprint AI check orchestration.
//!
//! Given a Blueprint, this module:
//!   1. Builds a prompt from the Goal/Constraints/Acceptance Criteria + related files
//!   2. Runs the `BlueprintCheck` task via the AI Provider Manager
//!   3. Parses the JSON verdict array
//!   4. Persists one CheckResult per criterion to `.blueprint/check-results/`
//!   5. Publishes a `CheckCompleted` event with the overall pass/fail
//!
//! No caching yet — every invocation hits the AI. Caching keyed by
//! blueprintHash + codeHash + modelId is a future iteration.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use sha2::{Digest, Sha256};
use tokio::sync::oneshot;

use crate::ai_provider::types::{ChatMessage, ChatRequest, Role, StreamEvent, TaskId};
use crate::ai_provider::AiRunner;
use crate::blueprint::storage;
use crate::blueprint::types::{
    AcceptanceCriterion, Blueprint, CheckResult, CheckVerdict, SectionKind,
};
use crate::sync_bus::events::{BlueprintEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;

const SYSTEM_PROMPT: &str = r#"You are a senior software engineer reviewing a feature specification against its current implementation.

Your job: evaluate each Acceptance Criterion in the Blueprint below and decide whether the linked code satisfies it.

For each criterion, output one of three verdicts:
- "pass": the linked code clearly satisfies this criterion
- "fail": the linked code clearly violates or omits this criterion
- "unclear": cannot determine from the provided context

You MUST respond with a JSON array only. No prose, no markdown code fences, just JSON.
Each element is an object with these fields:
{
  "index": <integer, 0-based criterion position>,
  "verdict": "pass" | "fail" | "unclear",
  "explanation": "<one short sentence on why>",
  "suggestion": null | "<one sentence on what to change if verdict is fail>"
}

Cover every criterion index. Do not invent extra criteria. Do not add a top-level wrapper object."#;

const MAX_FILE_BYTES: usize = 50_000;
const MAX_TOTAL_CODE_BYTES: usize = 200_000;
const ORIGIN_BLUEPRINT: &str = "blueprint";

#[derive(serde::Deserialize)]
struct VerdictItem {
    index: usize,
    verdict: String,
    #[serde(default)]
    explanation: String,
    #[serde(default)]
    suggestion: Option<String>,
}

/// Entry point invoked by the Tauri command.
pub async fn run_check(
    project_root: PathBuf,
    blueprint_id: String,
    runner: Arc<AiRunner>,
    bus: SyncBus,
) -> Result<(), String> {
    let bp = storage::load_blueprint(&project_root, &blueprint_id).map_err(|e| e.to_string())?;

    let criteria = collect_criteria(&bp);
    if criteria.is_empty() {
        // Nothing to check — emit success-ish event, skip the AI call.
        bus.publish(
            Origin::new(ORIGIN_BLUEPRINT),
            SyncBusEvent::Blueprint(BlueprintEvent::CheckCompleted {
                feature_id: blueprint_id,
                passed: true,
            }),
        );
        return Ok(());
    }

    // S0.4: resolve the code artifacts through the binding resolver (union over
    // all criteria) instead of reading front_matter.related_files directly.
    let mut artifact_set: Vec<String> = Vec::new();
    for c in &criteria {
        for f in crate::blueprint::bindings::artifacts_for_with_root(c, &bp, &project_root) {
            if !artifact_set.contains(&f) {
                artifact_set.push(f);
            }
        }
    }
    let bundle = load_related_code(&project_root, &artifact_set);
    let blueprint_hash = hash_str(&bp.raw_md);

    // Surface privacy-filtered files on the bus (UI toast + audit trail).
    for (file, reason) in &bundle.blocked {
        bus.publish(
            Origin::new(ORIGIN_BLUEPRINT),
            SyncBusEvent::AiProvider(crate::sync_bus::events::AiProviderEvent::PrivacyViolationBlocked {
                task: "BlueprintCheck".to_string(),
                reason: reason.clone(),
                file: file.clone(),
            }),
        );
    }

    let criterion_texts: Vec<String> = criteria.iter().map(|c| c.text.clone()).collect();
    let prompt = build_user_prompt(&bp, &criterion_texts, &bundle.text);

    let request = ChatRequest {
        model: String::new(),
        system: Some(SYSTEM_PROMPT.to_string()),
        messages: vec![ChatMessage {
            role: Role::User,
            content: prompt,
        }],
        temperature: Some(0.1),
        max_tokens: Some(4000),
        included_files: bundle.included.clone(),
        images: vec![],
    };

    // Collect streamed deltas into a buffer; signal completion via oneshot.
    let buffer = Arc::new(Mutex::new(String::new()));
    let model_used = Arc::new(Mutex::new(String::new()));
    let (done_tx, done_rx) = oneshot::channel::<Result<(), String>>();
    let done_tx_slot: Arc<Mutex<Option<oneshot::Sender<Result<(), String>>>>> =
        Arc::new(Mutex::new(Some(done_tx)));

    let buffer_cb = buffer.clone();
    let model_cb = model_used.clone();
    let done_cb = done_tx_slot.clone();
    let on_event = move |ev: StreamEvent| match ev {
        StreamEvent::Started { model, .. } => {
            if let Ok(mut m) = model_cb.lock() {
                *m = model;
            }
        }
        StreamEvent::Delta { text, .. } => {
            if let Ok(mut b) = buffer_cb.lock() {
                b.push_str(&text);
            }
        }
        StreamEvent::Completed { .. } => {
            if let Ok(mut slot) = done_cb.lock() {
                if let Some(tx) = slot.take() {
                    let _ = tx.send(Ok(()));
                }
            }
        }
        StreamEvent::Failed { error, .. } => {
            if let Ok(mut slot) = done_cb.lock() {
                if let Some(tx) = slot.take() {
                    let _ = tx.send(Err(error));
                }
            }
        }
        StreamEvent::Cancelled { .. } => {
            if let Ok(mut slot) = done_cb.lock() {
                if let Some(tx) = slot.take() {
                    let _ = tx.send(Err("cancelled".into()));
                }
            }
        }
    };

    runner
        .run_task(
            &project_root,
            TaskId::BlueprintCheck,
            request,
            bus.clone(),
            on_event,
        )
        .await?;

    done_rx.await.map_err(|_| "stream channel dropped".to_string())??;

    let response = buffer
        .lock()
        .map_err(|_| "buffer poisoned".to_string())?
        .clone();
    let model_id = model_used
        .lock()
        .map(|m| m.clone())
        .unwrap_or_default();

    let items = parse_verdicts(&response)
        .map_err(|e| format!("Failed to parse AI response: {e}\n---\n{response}"))?;

    // S4: run the deterministic sensors once for the project, then fuse them
    // per criterion below (gate → tests → LLM residual).
    //   - compile gate (cargo check): a failing gate means the code doesn't
    //     build, so an LLM "pass" is downgraded to Unclear.
    //   - test sensor (cargo test, module granularity): a failing mapped module
    //     forces Fail; module-green is a weak signal that falls back to the LLM.
    // Both are project-level and may be slow / unavailable (degrade gracefully).
    use crate::blueprint::language_provider as lp;
    let capability = lp::select_provider(&project_root).map(|p| p.capability());
    let gate_report = lp::run_gate(&project_root).await;
    let gate = gate_report.outcome;
    let test_report = lp::run_rust_tests(&project_root).await;
    // "Effective sensor = capability ∩ toolchain" — feeds the honest
    // degradation annotation per criterion below (§2 graceful degradation).
    let sensor_ctx = lp::SensorContext {
        capability,
        gate,
        tests_ran: test_report.is_some(),
    };

    let mut all_pass = true;
    let now = current_millis();
    for item in &items {
        if item.index >= criteria.len() {
            continue;
        }
        let llm_verdict = match item.verdict.to_lowercase().as_str() {
            "pass" => CheckVerdict::Pass,
            "fail" => CheckVerdict::Fail,
            _ => CheckVerdict::Unclear,
        };
        let llm_said_pass = matches!(llm_verdict, CheckVerdict::Pass);
        // Route this criterion to its module's test outcome (None if no Rust
        // binding / no test report), then fuse all three sensors.
        let module = lp::module_of_criterion(&criteria[item.index], &bp);
        let test = test_report
            .as_ref()
            .map_or(lp::TestOutcome::Unavailable, |r| {
                r.outcome_for_module(module.as_deref())
            });
        let verdict = lp::fuse_verdict(llm_verdict, gate, test);
        let gate_downgraded = llm_said_pass && matches!(verdict, CheckVerdict::Unclear);
        let test_failed = matches!(test, lp::TestOutcome::Failed);
        if !matches!(verdict, CheckVerdict::Pass) {
            all_pass = false;
        }
        // Keep the verdict and its explanation consistent: name the sensor that
        // moved the verdict so the UI doesn't show the LLM's rationale next to a
        // gate/test-driven result.
        let explanation = if gate_downgraded {
            // "The diagnostic IS the reason" (§3): surface the first compiler
            // lines right where the downgrade is announced.
            let head = gate_report
                .diagnostics
                .iter()
                .take(3)
                .map(|l| l.trim())
                .collect::<Vec<_>>()
                .join(" | ");
            if head.is_empty() {
                format!(
                    "[compile gate] project does not build — LLM pass downgraded to unclear. {}",
                    item.explanation
                )
            } else {
                format!(
                    "[compile gate] project does not build ({head}) — LLM pass downgraded to unclear. {}",
                    item.explanation
                )
            }
        } else if test_failed {
            format!(
                "[tests] mapped module has failing tests — verdict is Fail. {}",
                item.explanation
            )
        } else {
            item.explanation.clone()
        };
        // Honest degradation (§2/§7): if a deterministic sensor was silent for
        // this criterion, say so — the UI must never present an AI-only
        // verdict as if the gates had backed it.
        let explanation = match lp::degradation_note(&sensor_ctx, test) {
            Some(note) if explanation.trim().is_empty() => format!("[sensors] {note}"),
            Some(note) => format!("{explanation} [sensors] {note}"),
            None => explanation,
        };
        // S4.5 evidence trail: gate diagnostics (project-level, shared by all
        // criteria) + the provenance of this criterion's own bound artifacts.
        let artifact_provenance: Vec<(String, String)> =
            crate::blueprint::bindings::artifacts_for_with_root(
                &criteria[item.index],
                &bp,
                &project_root,
            )
            .into_iter()
                .filter_map(|f| {
                    bundle
                        .provenance
                        .iter()
                        .find(|(p, _)| *p == f)
                        .map(|(_, label)| (f, label.clone()))
                })
                .collect();
        let references = build_references(&gate_report.diagnostics, &artifact_provenance);

        let result = CheckResult {
            blueprint_id: blueprint_id.clone(),
            criterion_id: criteria[item.index].id.clone(),
            verdict,
            explanation,
            suggestion: item.suggestion.clone(),
            references,
            checked_at: now,
            stale: false,
            blueprint_hash: blueprint_hash.clone(),
            code_hash: bundle.hash.clone(),
            model_id: model_id.clone(),
        };
        storage::save_check_result(&project_root, &result).map_err(|e| e.to_string())?;
    }

    bus.publish(
        Origin::new(ORIGIN_BLUEPRINT),
        SyncBusEvent::Blueprint(BlueprintEvent::CheckCompleted {
            feature_id: blueprint_id,
            passed: all_pass,
        }),
    );

    Ok(())
}

fn collect_criteria(bp: &Blueprint) -> Vec<AcceptanceCriterion> {
    let mut out = Vec::new();
    for section in &bp.sections {
        if matches!(section.kind, SectionKind::AcceptanceCriteria) {
            for c in &section.criteria {
                out.push(c.clone());
            }
        }
    }
    out
}

/// Result of assembling related-file content for the prompt.
struct CodeBundle {
    text: String,
    hash: String,
    /// Files whose content actually entered the prompt (for the audit log).
    included: Vec<String>,
    /// Files excluded by the privacy filter: (path, reason).
    blocked: Vec<(String, String)>,
    /// S1 provenance of each included file, as (path, label) with label one
    /// of "human" / "ai(model)" / "derived(generator)" — the S4.5 evidence
    /// trail records whether checked code is user-written or generated.
    provenance: Vec<(String, String)>,
}

fn provenance_label(source: &crate::editor::types::ProvenanceSource) -> String {
    use crate::editor::types::ProvenanceSource;
    match source {
        ProvenanceSource::Human => "human".to_string(),
        ProvenanceSource::Ai { model } => format!("ai({model})"),
        ProvenanceSource::Derived { generator } => format!("derived({generator})"),
    }
}

/// Compose a criterion's evidence references: gate diagnostics (capped so N
/// criteria don't multiply 50 lines each into the check-results files) then
/// the provenance of the criterion's bound artifacts.
fn build_references(
    gate_diagnostics: &[String],
    artifact_provenance: &[(String, String)],
) -> Vec<String> {
    let mut refs: Vec<String> = gate_diagnostics
        .iter()
        .take(10)
        .map(|d| format!("gate: {}", d.trim()))
        .collect();
    for (path, label) in artifact_provenance {
        refs.push(format!("provenance: {path} = {label}"));
    }
    refs
}

fn load_related_code(project_root: &Path, files: &[String]) -> CodeBundle {
    if files.is_empty() {
        return CodeBundle {
            text: String::new(),
            hash: hash_str(""),
            included: Vec::new(),
            blocked: Vec::new(),
            provenance: Vec::new(),
        };
    }
    let mut out = String::new();
    let mut hasher = Sha256::new();
    let mut total = 0usize;
    let mut included = Vec::new();
    let mut blocked = Vec::new();
    let mut provenance = Vec::new();
    for rel in files {
        if total >= MAX_TOTAL_CODE_BYTES {
            out.push_str(&format!(
                "\n... ({} more files omitted: total budget exceeded)\n",
                files.len()
            ));
            break;
        }
        // Privacy filter: blacklisted paths never enter the prompt.
        if let Some(reason) = crate::ai_provider::privacy::check_path(rel) {
            out.push_str(&format!(
                "\n### File: {rel}\n(excluded by privacy filter: {reason})\n"
            ));
            hasher.update(rel.as_bytes());
            hasher.update(b":privacy-blocked\n");
            blocked.push((rel.clone(), reason));
            continue;
        }
        let path = project_root.join(rel);
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                let truncated = if content.len() > MAX_FILE_BYTES {
                    format!(
                        "{}\n... (truncated, {} more bytes)",
                        &content[..MAX_FILE_BYTES],
                        content.len() - MAX_FILE_BYTES
                    )
                } else {
                    content.clone()
                };
                out.push_str(&format!("\n### File: {rel}\n```\n{truncated}\n```\n"));
                hasher.update(rel.as_bytes());
                hasher.update(b"\n");
                hasher.update(content.as_bytes());
                total += truncated.len();
                provenance.push((
                    rel.clone(),
                    provenance_label(
                        &crate::editor::identity::provenance_of(project_root, rel, &content)
                            .source,
                    ),
                ));
                included.push(rel.clone());
            }
            Err(_) => {
                out.push_str(&format!("\n### File: {rel}\n(file missing or unreadable)\n"));
                hasher.update(rel.as_bytes());
                hasher.update(b":missing\n");
            }
        }
    }
    let code_hash = format!("{:x}", hasher.finalize());
    CodeBundle {
        text: out,
        hash: code_hash,
        included,
        blocked,
        provenance,
    }
}

fn build_user_prompt(bp: &Blueprint, criteria: &[String], code_bundle: &str) -> String {
    let mut goal = String::new();
    let mut constraints = String::new();
    let mut context = String::new();
    for s in &bp.sections {
        match s.kind {
            SectionKind::Goal => goal = s.content.clone(),
            SectionKind::Constraints => constraints = s.content.clone(),
            SectionKind::Context => context = s.content.clone(),
            _ => {}
        }
    }

    let mut criterion_list = String::new();
    for (i, text) in criteria.iter().enumerate() {
        criterion_list.push_str(&format!("{i}. {text}\n"));
    }

    let code_section = if code_bundle.is_empty() {
        "\n## Related Code\n(no related files declared in Blueprint front matter)\n".to_string()
    } else {
        format!("\n## Related Code\n{code_bundle}\n")
    };

    format!(
        "# Blueprint: {name}\n\
         \n## Goal\n{goal}\n\
         \n## Context\n{context}\n\
         \n## Constraints\n{constraints}\n\
         \n## Acceptance Criteria\n{crits}\n\
         {code}\n\
         Output the JSON array now. Cover indices 0..{last}.",
        name = bp.front_matter.display_name,
        goal = nonempty(&goal),
        context = nonempty(&context),
        constraints = nonempty(&constraints),
        crits = criterion_list,
        code = code_section,
        last = criteria.len().saturating_sub(1),
    )
}

fn nonempty(s: &str) -> &str {
    if s.trim().is_empty() {
        "(not provided)"
    } else {
        s
    }
}

fn parse_verdicts(raw: &str) -> Result<Vec<VerdictItem>, String> {
    let trimmed = strip_code_fences(raw.trim());
    // Some models wrap the array in {"verdicts": [...]} — try both shapes.
    if let Ok(arr) = serde_json::from_str::<Vec<VerdictItem>>(trimmed) {
        return Ok(arr);
    }
    if let Ok(wrapped) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(arr) = wrapped.get("verdicts").and_then(|v| v.as_array()) {
            let items: Vec<VerdictItem> = serde_json::from_value(serde_json::Value::Array(arr.clone()))
                .map_err(|e| e.to_string())?;
            return Ok(items);
        }
    }
    Err("response did not contain a JSON array of verdicts".to_string())
}

fn strip_code_fences(s: &str) -> &str {
    let s = s.trim();
    if let Some(rest) = s.strip_prefix("```json").or_else(|| s.strip_prefix("```")) {
        if let Some(end) = rest.rfind("```") {
            return rest[..end].trim();
        }
    }
    s
}

fn hash_str(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    format!("{:x}", h.finalize())
}

fn current_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn references_cap_gate_lines_and_carry_provenance() {
        let diags: Vec<String> = (0..20).map(|i| format!("error {i}")).collect();
        let prov = vec![("src/a.ts".to_string(), "human".to_string())];
        let refs = build_references(&diags, &prov);
        // 10 capped gate lines (not all 20) + the artifact's provenance.
        assert_eq!(refs.len(), 11);
        assert_eq!(refs[0], "gate: error 0");
        assert_eq!(refs[9], "gate: error 9");
        assert_eq!(refs[10], "provenance: src/a.ts = human");

        // A green gate contributes nothing; provenance still recorded.
        let refs = build_references(&[], &prov);
        assert_eq!(refs, vec!["provenance: src/a.ts = human".to_string()]);
    }

    #[test]
    fn load_related_code_captures_provenance_labels() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(dir.path().join("src/human.ts"), "export const x = 1;\n").unwrap();
        std::fs::write(dir.path().join("src/gen.ts"), "// AUTO-GENERATED\nexport {};\n")
            .unwrap();

        let bundle = load_related_code(
            dir.path(),
            &["src/human.ts".to_string(), "src/gen.ts".to_string()],
        );

        assert_eq!(
            bundle.provenance,
            vec![
                ("src/human.ts".to_string(), "human".to_string()),
                ("src/gen.ts".to_string(), "derived(codegen)".to_string()),
            ]
        );
        // Missing files are recorded in neither included nor provenance.
        let bundle = load_related_code(dir.path(), &["src/nope.ts".to_string()]);
        assert!(bundle.provenance.is_empty());
        assert!(bundle.included.is_empty());
    }
}
