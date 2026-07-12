use std::path::Path;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::ai_provider::config;
use crate::ai_provider::runner::AiRunner;
use crate::ai_provider::types::*;
use crate::sync_bus::events::{AiProviderEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;

fn ai_origin() -> Origin {
    Origin::new("ai_provider")
}

#[tauri::command]
pub fn ai_get_config(project_root: String) -> Result<AiConfig, String> {
    Ok(config::load_config(Path::new(&project_root)))
}

#[tauri::command]
pub fn ai_save_config(
    project_root: String,
    config_data: AiConfig,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    config::save_config(Path::new(&project_root), &config_data)?;
    sync_bus.publish(
        ai_origin(),
        SyncBusEvent::AiProvider(AiProviderEvent::TaskRouteChanged {
            task_id: "all".to_string(),
            new_provider: "config".to_string(),
            new_model: "updated".to_string(),
        }),
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// Profile CRUD
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn ai_create_profile(
    project_root: String,
    profile: Profile,
    sync_bus: State<'_, SyncBus>,
) -> Result<Profile, String> {
    let saved = config::add_profile(Path::new(&project_root), profile)?;
    sync_bus.publish(
        ai_origin(),
        SyncBusEvent::AiProvider(AiProviderEvent::ProviderAdded {
            provider_id: saved.id.clone(),
        }),
    );
    Ok(saved)
}

#[tauri::command]
pub fn ai_update_profile(
    project_root: String,
    profile: Profile,
) -> Result<Profile, String> {
    config::update_profile(Path::new(&project_root), profile)
}

#[tauri::command]
pub fn ai_delete_profile(
    project_root: String,
    profile_id: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    config::delete_profile(Path::new(&project_root), &profile_id)?;
    sync_bus.publish(
        ai_origin(),
        SyncBusEvent::AiProvider(AiProviderEvent::ProviderRemoved {
            provider_id: profile_id,
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn ai_clone_profile(
    project_root: String,
    source_profile_id: String,
) -> Result<Profile, String> {
    config::clone_profile(Path::new(&project_root), &source_profile_id)
}

#[tauri::command]
pub fn ai_set_profile_api_key(
    project_root: String,
    profile_id: String,
    api_key: String,
) -> Result<config::KeyStorage, String> {
    let storage =
        config::set_api_key_for_profile(Path::new(&project_root), &profile_id, &api_key)?;

    // Mark the profile as having a key + auto-enable on first key set.
    let mut cfg = config::load_config(Path::new(&project_root));
    if let Some(p) = cfg.profiles.iter_mut().find(|p| p.id == profile_id) {
        p.api_key_set = true;
        if !p.enabled {
            p.enabled = true;
        }
    }
    config::save_config(Path::new(&project_root), &cfg)?;
    Ok(storage)
}

#[tauri::command]
pub fn ai_clear_profile_api_key(
    project_root: String,
    profile_id: String,
) -> Result<(), String> {
    config::delete_api_key_for_profile(Path::new(&project_root), &profile_id);
    let mut cfg = config::load_config(Path::new(&project_root));
    if let Some(p) = cfg.profiles.iter_mut().find(|p| p.id == profile_id) {
        if p.auth_scheme.requires_key() {
            p.api_key_set = false;
        }
    }
    config::save_config(Path::new(&project_root), &cfg)?;
    Ok(())
}

#[tauri::command]
pub fn ai_list_presets() -> Result<Vec<ProfilePreset>, String> {
    Ok(builtin_presets())
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn ai_get_task_route(
    project_root: String,
    task_id: TaskId,
) -> Result<TaskRoute, String> {
    let cfg = config::load_config(Path::new(&project_root));
    cfg.routes
        .iter()
        .find(|r| r.task_id == task_id)
        .cloned()
        .ok_or_else(|| format!("No route for task {:?}", task_id))
}

#[tauri::command]
pub fn ai_set_task_route(
    project_root: String,
    route: TaskRoute,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    let mut cfg = config::load_config(Path::new(&project_root));
    if let Some(existing) = cfg.routes.iter_mut().find(|r| r.task_id == route.task_id) {
        *existing = route.clone();
    } else {
        cfg.routes.push(route.clone());
    }
    config::save_config(Path::new(&project_root), &cfg)?;

    sync_bus.publish(
        ai_origin(),
        SyncBusEvent::AiProvider(AiProviderEvent::TaskRouteChanged {
            task_id: format!("{:?}", route.task_id),
            new_provider: route.profile_id,
            new_model: route.model,
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn ai_toggle_global(project_root: String, enabled: bool) -> Result<(), String> {
    let mut cfg = config::load_config(Path::new(&project_root));
    cfg.global_enabled = enabled;
    config::save_config(Path::new(&project_root), &cfg)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn ai_check_profile_health(
    project_root: String,
    profile_id: String,
    runner: State<'_, Arc<AiRunner>>,
) -> Result<HealthCheckResult, String> {
    match runner
        .health_check_profile(Path::new(&project_root), &profile_id)
        .await
    {
        Ok(()) => Ok(HealthCheckResult { ok: true, error: None }),
        Err(e) => Ok(HealthCheckResult {
            ok: false,
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn ai_check_draft_health(
    project_root: String,
    draft: Profile,
    api_key: Option<String>,
    runner: State<'_, Arc<AiRunner>>,
) -> Result<HealthCheckResult, String> {
    match runner
        .health_check_draft(Path::new(&project_root), draft, api_key)
        .await
    {
        Ok(()) => Ok(HealthCheckResult { ok: true, error: None }),
        Err(e) => Ok(HealthCheckResult {
            ok: false,
            error: Some(e),
        }),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckResult {
    pub ok: bool,
    pub error: Option<String>,
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn ai_stream_chat(
    app: AppHandle,
    project_root: String,
    task_id: TaskId,
    request: ChatRequest,
    runner: State<'_, Arc<AiRunner>>,
    sync_bus: State<'_, SyncBus>,
) -> Result<String, String> {
    let bus = sync_bus.inner().clone();
    let app_for_cb = app.clone();
    let stream_id = runner
        .run_task(
            Path::new(&project_root),
            task_id,
            request,
            bus,
            move |ev| {
                let _ = app_for_cb.emit("ai-stream-event", &ev);
            },
        )
        .await?;
    Ok(stream_id)
}

/// One-shot task run: stream server-side, return the collected text.
/// Sketch Lite's Generate (and future one-shot features) use this — the
/// full route/privacy/audit/cost chain applies exactly as for streams.
#[tauri::command]
pub async fn ai_run_task_collect(
    project_root: String,
    task_id: TaskId,
    request: ChatRequest,
    runner: State<'_, Arc<AiRunner>>,
    sync_bus: State<'_, SyncBus>,
) -> Result<String, String> {
    let bus = sync_bus.inner().clone();
    runner
        .run_task_collect(Path::new(&project_root), task_id, request, bus)
        .await
}

#[tauri::command]
pub async fn ai_cancel_stream(
    stream_id: String,
    runner: State<'_, Arc<AiRunner>>,
) -> Result<bool, String> {
    Ok(runner.cancel(&stream_id).await)
}

// ---------------------------------------------------------------------------
// Claude Code config import
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeImportResult {
    pub imported: Vec<Profile>,
    pub notes: Vec<String>,
}

/// Best-effort import of Anthropic-compatible config from Claude Code or
/// from environment variables. We look for ANTHROPIC_BASE_URL +
/// ANTHROPIC_API_KEY in the env and in `~/.claude/settings.json` /
/// `~/.claude.json`. Each distinct (base_url, key) tuple becomes a new profile.
#[tauri::command]
pub fn ai_import_from_claude_code(
    project_root: String,
) -> Result<ClaudeCodeImportResult, String> {
    let mut imported: Vec<Profile> = Vec::new();
    let mut notes: Vec<String> = Vec::new();

    let candidates = collect_claude_candidates();
    if candidates.is_empty() {
        notes.push("未找到任何 Claude Code 配置(检查了环境变量和 ~/.claude/* 配置文件)".into());
    }

    for cand in candidates {
        let name = cand.label.clone();
        let profile_id = ulid::Ulid::new().to_string();
        let profile = Profile {
            id: profile_id.clone(),
            name: name.clone(),
            protocol: Protocol::Anthropic,
            base_url: cand.base_url.clone(),
            endpoint_path: String::new(),
            auth_scheme: AuthScheme::AnthropicKey,
            api_key_set: cand.api_key.is_some(),
            enabled: true,
            models: vec!["claude-opus-4-7".into(), "claude-sonnet-4-6".into()],
            extra_headers: Default::default(),
            builtin: false,
        };
        let saved = config::add_profile(Path::new(&project_root), profile)?;
        if let Some(key) = cand.api_key {
            config::set_api_key_for_profile(Path::new(&project_root), &saved.id, &key)?;
        } else {
            notes.push(format!("'{name}' 已导入,但未发现 API key,请手动填写"));
        }
        imported.push(saved);
    }

    Ok(ClaudeCodeImportResult { imported, notes })
}

#[derive(Debug, Clone)]
struct ClaudeCandidate {
    label: String,
    base_url: String,
    api_key: Option<String>,
}

fn collect_claude_candidates() -> Vec<ClaudeCandidate> {
    let mut out: Vec<ClaudeCandidate> = Vec::new();

    // 1. Environment variables.
    let env_base = std::env::var("ANTHROPIC_BASE_URL").ok();
    let env_key = std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .or_else(|| std::env::var("ANTHROPIC_AUTH_TOKEN").ok());
    if env_base.is_some() || env_key.is_some() {
        out.push(ClaudeCandidate {
            label: "Claude Code (env)".into(),
            base_url: env_base.unwrap_or_else(|| "https://api.anthropic.com".into()),
            api_key: env_key,
        });
    }

    // 2. ~/.claude/settings.json (Claude Code's own config).
    let home = match dirs_home() {
        Some(h) => h,
        None => return out,
    };
    let settings_path = home.join(".claude").join("settings.json");
    if let Ok(text) = std::fs::read_to_string(&settings_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            // settings.json shape varies — look for env block under `env` or
            // top-level overrides.
            let env = v.get("env").and_then(|x| x.as_object());
            let base = env
                .and_then(|m| m.get("ANTHROPIC_BASE_URL"))
                .and_then(|x| x.as_str())
                .or_else(|| v.get("anthropicBaseUrl").and_then(|x| x.as_str()))
                .map(String::from);
            let key = env
                .and_then(|m| m.get("ANTHROPIC_API_KEY"))
                .and_then(|x| x.as_str())
                .or_else(|| {
                    env.and_then(|m| m.get("ANTHROPIC_AUTH_TOKEN"))
                        .and_then(|x| x.as_str())
                })
                .map(String::from);
            if base.is_some() || key.is_some() {
                out.push(ClaudeCandidate {
                    label: "Claude Code (~/.claude/settings.json)".into(),
                    base_url: base.unwrap_or_else(|| "https://api.anthropic.com".into()),
                    api_key: key,
                });
            }
        }
    }

    // 3. ~/.claude.json — older single-file config.
    let alt_path = home.join(".claude.json");
    if let Ok(text) = std::fs::read_to_string(&alt_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            let base = v
                .get("baseUrl")
                .and_then(|x| x.as_str())
                .or_else(|| v.get("base_url").and_then(|x| x.as_str()))
                .map(String::from);
            let key = v
                .get("apiKey")
                .and_then(|x| x.as_str())
                .or_else(|| v.get("api_key").and_then(|x| x.as_str()))
                .map(String::from);
            if base.is_some() || key.is_some() {
                out.push(ClaudeCandidate {
                    label: "Claude Code (~/.claude.json)".into(),
                    base_url: base.unwrap_or_else(|| "https://api.anthropic.com".into()),
                    api_key: key,
                });
            }
        }
    }

    // Dedupe by (base_url, api_key).
    out.sort_by(|a, b| (a.base_url.as_str(), a.api_key.as_deref()).cmp(&(b.base_url.as_str(), b.api_key.as_deref())));
    out.dedup_by(|a, b| a.base_url == b.base_url && a.api_key == b.api_key);
    out
}

fn dirs_home() -> Option<std::path::PathBuf> {
    if let Some(h) = std::env::var_os("HOME") {
        return Some(std::path::PathBuf::from(h));
    }
    if let Some(p) = std::env::var_os("USERPROFILE") {
        return Some(std::path::PathBuf::from(p));
    }
    None
}
