//! Persisted AI configuration. Profiles, routes, budget, etc.
//!
//! Schema migration: an older config (v0) used a fixed `providers: [Anthropic,
//! OpenAI, Ollama]` shape with `provider_id` enum routes. Migration is
//! lossless — built-in profiles preserve their stable ULIDs, custom-named
//! providers become new profiles with fresh ULIDs.

use std::path::Path;

use serde_json::Value;

use crate::ai_provider::types::*;

const CONFIG_PATH: &str = ".drafting/ai-config.json";
const KEYRING_SERVICE: &str = "drafting-ai";

// ---------------------------------------------------------------------------
// Load + migrate
// ---------------------------------------------------------------------------

pub fn load_config(project_root: &Path) -> AiConfig {
    let path = project_root.join(CONFIG_PATH);
    let Ok(data) = std::fs::read_to_string(&path) else {
        return AiConfig::default();
    };

    // Attempt v1 (current) first.
    if let Ok(mut cfg) = serde_json::from_str::<AiConfig>(&data) {
        refresh_key_flags(project_root, &mut cfg);
        ensure_builtins(&mut cfg);
        return cfg;
    }

    // Try the legacy schema. Wrap parse errors in a fall-back so a corrupt
    // config can never bring the app down — we just hand back defaults.
    if let Ok(legacy) = serde_json::from_str::<legacy::LegacyAiConfig>(&data) {
        let mut migrated = migrate_from_legacy(project_root, legacy);
        refresh_key_flags(project_root, &mut migrated);
        ensure_builtins(&mut migrated);
        // Persist the migrated version so we don't keep doing this work.
        let _ = save_config(project_root, &migrated);
        return migrated;
    }

    // Last resort: try to read it as a generic JSON object so we can at least
    // keep `monthlyBudgetUsd`. On total failure, fall through to default.
    if let Ok(generic) = serde_json::from_str::<Value>(&data) {
        let mut cfg = AiConfig::default();
        if let Some(b) = generic.get("monthlyBudgetUsd").and_then(|v| v.as_f64()) {
            cfg.monthly_budget_usd = Some(b);
        }
        return cfg;
    }

    AiConfig::default()
}

pub fn save_config(project_root: &Path, config: &AiConfig) -> Result<(), String> {
    let path = project_root.join(CONFIG_PATH);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Update each profile's `api_key_set` flag to reflect the actual presence
/// of a stored key. Done on every load so the UI never shows stale state.
fn refresh_key_flags(project_root: &Path, cfg: &mut AiConfig) {
    for p in cfg.profiles.iter_mut() {
        if !p.auth_scheme.requires_key() {
            p.api_key_set = true;
            continue;
        }
        // Determine key presence WITHOUT touching the keychain. A keychain
        // read fires a macOS auth prompt for every fresh dev build signature,
        // and load_config runs on nearly every AI interaction — probing the
        // keychain here produced a storm of prompts (one per key-requiring
        // profile, per load). Env var and the plaintext fallback are cheap to
        // check; for a key held in the keychain we trust the persisted flag
        // (ai_set/clear_profile_api_key keep it accurate) instead of
        // re-deriving it by reading the secret.
        p.api_key_set = env_override_for_profile(project_root, &p.id).is_some()
            || plaintext_key_exists(project_root, &p.id)
            || p.api_key_set;
    }
}

/// Cheap, non-prompting check for the plaintext key fallback file.
fn plaintext_key_exists(project_root: &Path, profile_id: &str) -> bool {
    project_root
        .join(".drafting/keys")
        .join(key_filename(profile_id))
        .exists()
}

/// Make sure the three built-in profiles exist (so the user can never delete
/// themselves out of a working setup).
fn ensure_builtins(cfg: &mut AiConfig) {
    let defaults = AiConfig::default();
    for builtin in &defaults.profiles {
        if !cfg.profiles.iter().any(|p| p.id == builtin.id) {
            cfg.profiles.push(builtin.clone());
        }
    }
}

fn migrate_from_legacy(_project_root: &Path, legacy: legacy::LegacyAiConfig) -> AiConfig {
    use legacy::LegacyProviderId as L;

    let mut profiles: Vec<Profile> = Vec::new();
    let mut id_for: std::collections::HashMap<String, String> =
        std::collections::HashMap::new(); // provider key (anthropic/openai/ollama/<custom>) -> ULID

    for lp in legacy.providers {
        let (profile_id, protocol, auth_scheme, builtin) = match &lp.id {
            L::Anthropic => (
                BUILTIN_ANTHROPIC_ID.to_string(),
                Protocol::Anthropic,
                AuthScheme::AnthropicKey,
                true,
            ),
            L::OpenAi => (
                BUILTIN_OPENAI_ID.to_string(),
                Protocol::OpenaiCompatible,
                AuthScheme::Bearer,
                true,
            ),
            L::Ollama => (
                BUILTIN_OLLAMA_ID.to_string(),
                Protocol::Ollama,
                AuthScheme::None,
                true,
            ),
            L::Custom(_) => (
                ulid::Ulid::new().to_string(),
                Protocol::OpenaiCompatible,
                AuthScheme::Bearer,
                false,
            ),
        };

        let key = match &lp.id {
            L::Anthropic => "anthropic".to_string(),
            L::OpenAi => "openai".to_string(),
            L::Ollama => "ollama".to_string(),
            L::Custom(name) => format!("custom:{name}"),
        };
        id_for.insert(key, profile_id.clone());

        profiles.push(Profile {
            id: profile_id,
            name: lp.display_name,
            protocol,
            base_url: lp.api_base,
            endpoint_path: String::new(),
            auth_scheme,
            api_key_set: lp.api_key_set,
            enabled: lp.enabled,
            models: lp.models,
            extra_headers: std::collections::BTreeMap::new(),
            builtin,
        });
    }

    let routes = legacy
        .routes
        .into_iter()
        .map(|r| {
            let key = match &r.provider_id {
                L::Anthropic => "anthropic".to_string(),
                L::OpenAi => "openai".to_string(),
                L::Ollama => "ollama".to_string(),
                L::Custom(name) => format!("custom:{name}"),
            };
            let profile_id = id_for
                .get(&key)
                .cloned()
                .unwrap_or_else(|| BUILTIN_ANTHROPIC_ID.to_string());
            TaskRoute {
                task_id: r.task_id,
                profile_id,
                model: r.model,
            }
        })
        .collect();

    AiConfig {
        global_enabled: legacy.global_enabled,
        profiles,
        routes,
        monthly_budget_usd: legacy.monthly_budget_usd,
        current_month_usage_usd: legacy.current_month_usage_usd,
    }
}

// ---------------------------------------------------------------------------
// API key storage (system keychain, with file fallback)
// ---------------------------------------------------------------------------

fn keyring_account(profile_id: &str) -> String {
    format!("profile:{profile_id}")
}

/// Read just `base_url` for a profile from the config file on disk, without
/// going through `load_config` (which triggers `refresh_key_flags` and would
/// recurse into the API key lookup we're being called from).
fn read_profile_base_url(project_root: &Path, profile_id: &str) -> Option<String> {
    let path = project_root.join(CONFIG_PATH);
    let data = std::fs::read_to_string(&path).ok()?;
    let v: Value = serde_json::from_str(&data).ok()?;
    let profiles = v.get("profiles")?.as_array()?;
    for p in profiles {
        if p.get("id").and_then(|x| x.as_str()) == Some(profile_id) {
            return p.get("baseUrl").and_then(|x| x.as_str()).map(String::from);
        }
    }
    None
}

fn key_filename(profile_id: &str) -> String {
    // Profile id is a ULID — safe characters only.
    format!("{profile_id}.key")
}

/// Where an API key ended up when saving. The frontend warns loudly on
/// `PlaintextFile` — plaintext on disk is a last resort, never silent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum KeyStorage {
    Keychain,
    PlaintextFile,
}

pub fn set_api_key_for_profile(
    project_root: &Path,
    profile_id: &str,
    key: &str,
) -> Result<KeyStorage, String> {
    let account = keyring_account(profile_id);
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, &account) {
        if entry.set_password(key).is_ok() {
            // Wipe any stale file fallback so we don't keep a plaintext copy.
            let _ = std::fs::remove_file(
                project_root
                    .join(".drafting/keys")
                    .join(key_filename(profile_id)),
            );
            return Ok(KeyStorage::Keychain);
        }
    }

    // Keychain unavailable — plaintext file fallback. Restrict permissions
    // to the owner and make sure `.drafting/` can never reach Git.
    let key_dir = project_root.join(".drafting/keys");
    std::fs::create_dir_all(&key_dir).map_err(|e| e.to_string())?;
    let key_path = key_dir.join(key_filename(profile_id));
    std::fs::write(&key_path, key).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&key_dir, std::fs::Permissions::from_mode(0o700));
        let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
    }
    ensure_drafting_gitignored(project_root);
    log::warn!(
        "keychain unavailable — API key for profile {profile_id} stored as plaintext file \
         under .drafting/keys/ (owner-only permissions)"
    );
    Ok(KeyStorage::PlaintextFile)
}

/// If the project is a Git repo, make sure `.drafting/` is ignored so the
/// plaintext key fallback (and other local tool state) can never be
/// committed. Appends to .gitignore without touching existing content.
fn ensure_drafting_gitignored(project_root: &Path) {
    if !project_root.join(".git").exists() {
        return;
    }
    let gitignore = project_root.join(".gitignore");
    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();
    let already = existing
        .lines()
        .map(str::trim)
        .any(|l| l == ".drafting/" || l == ".drafting");
    if already {
        return;
    }
    let mut content = existing;
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(".drafting/\n");
    if let Err(e) = std::fs::write(&gitignore, content) {
        log::warn!("failed to update .gitignore: {e}");
    }
}

pub fn get_api_key_for_profile(project_root: &Path, profile_id: &str) -> Option<String> {
    // 1. Env var lookups (dev-friendly; avoids the macOS Keychain auth
    //    prompt that fires on every fresh build signature). Tried first
    //    so a developer can just `export <NAME>=...` without futzing with
    //    Keychain. Two layers:
    //      a) Per-profile override: DRAFTING_KEY_<profile_id>
    //      b) Convention vars derived from the profile's base URL:
    //         MOONSHOT_API_KEY / DASHSCOPE_API_KEY / ANTHROPIC_API_KEY /
    //         OPENAI_API_KEY (matching what most SDKs already use).
    if let Some(v) = env_override_for_profile(project_root, profile_id) {
        return Some(v);
    }

    // 2. Keychain (canonical production storage path)
    let account = keyring_account(profile_id);
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, &account) {
        if let Ok(secret) = entry.get_password() {
            let trimmed = secret.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }

    // 3. Plaintext file fallback (only used when Keychain not available)
    let path = project_root
        .join(".drafting/keys")
        .join(key_filename(profile_id));
    std::fs::read_to_string(&path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Look up an API key from environment variables. Returns None if no
/// matching var is set. See get_api_key_for_profile for the scheme.
fn env_override_for_profile(project_root: &Path, profile_id: &str) -> Option<String> {
    // Per-profile override (uppercase ULID with dashes stripped).
    let pid_upper = profile_id.to_uppercase().replace('-', "");
    if let Ok(v) = std::env::var(format!("DRAFTING_KEY_{pid_upper}")) {
        let t = v.trim().to_string();
        if !t.is_empty() {
            return Some(t);
        }
    }

    // Convention vars derived from base_url. Read the raw config JSON
    // directly to avoid recursing into load_config → refresh_key_flags
    // → get_api_key_for_profile → here → load_config → ... (stack overflow).
    let base_url = read_profile_base_url(project_root, profile_id)?;
    let url = base_url.to_ascii_lowercase();

    let candidate_vars: &[&str] = if url.contains("moonshot") {
        &["MOONSHOT_API_KEY", "KIMI_API_KEY"]
    } else if url.contains("dashscope") {
        &["DASHSCOPE_API_KEY", "QWEN_API_KEY", "TONGYI_API_KEY"]
    } else if url.contains("anthropic.com") {
        &["ANTHROPIC_API_KEY"]
    } else if url.contains("api.openai.com") {
        &["OPENAI_API_KEY"]
    } else if url.contains("deepseek") {
        &["DEEPSEEK_API_KEY"]
    } else if url.contains("openrouter") {
        &["OPENROUTER_API_KEY"]
    } else if url.contains("groq") {
        &["GROQ_API_KEY"]
    } else if url.contains("together") {
        &["TOGETHER_API_KEY"]
    } else {
        &[]
    };

    for name in candidate_vars {
        if let Ok(v) = std::env::var(name) {
            let t = v.trim().to_string();
            if !t.is_empty() {
                return Some(t);
            }
        }
    }
    None
}

pub fn delete_api_key_for_profile(project_root: &Path, profile_id: &str) {
    let account = keyring_account(profile_id);
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, &account) {
        let _ = entry.delete_credential();
    }
    let _ = std::fs::remove_file(
        project_root
            .join(".drafting/keys")
            .join(key_filename(profile_id)),
    );
}

// ---------------------------------------------------------------------------
// Mutators (atomic load → mutate → save)
// ---------------------------------------------------------------------------

pub fn add_profile(project_root: &Path, mut profile: Profile) -> Result<Profile, String> {
    if profile.id.is_empty() {
        profile.id = ulid::Ulid::new().to_string();
    }
    profile.builtin = false; // Never let the API mark new profiles as builtin.
    let mut cfg = load_config(project_root);
    if cfg.profiles.iter().any(|p| p.id == profile.id) {
        return Err(format!("profile id {} already exists", profile.id));
    }
    cfg.profiles.push(profile.clone());
    save_config(project_root, &cfg)?;
    Ok(profile)
}

pub fn update_profile(project_root: &Path, profile: Profile) -> Result<Profile, String> {
    let mut cfg = load_config(project_root);
    let idx = cfg
        .profiles
        .iter()
        .position(|p| p.id == profile.id)
        .ok_or_else(|| format!("profile {} not found", profile.id))?;

    let was_builtin = cfg.profiles[idx].builtin;
    let mut next = profile;
    next.builtin = was_builtin; // Never lose the builtin flag.
    cfg.profiles[idx] = next.clone();
    save_config(project_root, &cfg)?;
    Ok(next)
}

pub fn delete_profile(project_root: &Path, profile_id: &str) -> Result<(), String> {
    let mut cfg = load_config(project_root);
    let idx = cfg
        .profiles
        .iter()
        .position(|p| p.id == profile_id)
        .ok_or_else(|| format!("profile {profile_id} not found"))?;
    if cfg.profiles[idx].builtin {
        return Err("built-in profiles cannot be deleted (only disabled)".into());
    }

    cfg.profiles.remove(idx);

    // Re-route any task that pointed at this profile back to the first
    // enabled profile, or the Anthropic builtin as a last resort.
    let fallback = cfg
        .profiles
        .iter()
        .find(|p| p.enabled)
        .map(|p| p.id.clone())
        .or_else(|| {
            cfg.profiles
                .iter()
                .find(|p| p.id == BUILTIN_ANTHROPIC_ID)
                .map(|p| p.id.clone())
        })
        .unwrap_or_else(|| BUILTIN_ANTHROPIC_ID.to_string());
    for r in cfg.routes.iter_mut() {
        if r.profile_id == profile_id {
            r.profile_id = fallback.clone();
        }
    }

    save_config(project_root, &cfg)?;
    delete_api_key_for_profile(project_root, profile_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn migrate_legacy_keeps_builtin_ids_and_routes() {
        let dir = TempDir::new().unwrap();
        // Hand-craft a v0 config blob.
        let legacy = serde_json::json!({
            "globalEnabled": true,
            "providers": [
                {
                    "id": "anthropic",
                    "displayName": "Anthropic",
                    "apiBase": "https://api.anthropic.com",
                    "apiKeySet": true,
                    "enabled": true,
                    "models": ["claude-sonnet-4-6"]
                },
                {
                    "id": "openAi",
                    "displayName": "OpenAI",
                    "apiBase": "https://api.openai.com",
                    "apiKeySet": false,
                    "enabled": false,
                    "models": ["gpt-4o"]
                }
            ],
            "routes": [
                {"taskId":"editorChat","providerId":"anthropic","model":"claude-sonnet-4-6"},
                {"taskId":"gitCommitMessage","providerId":"openAi","model":"gpt-4o"}
            ],
            "monthlyBudgetUsd": null,
            "currentMonthUsageUsd": 0.0
        });
        std::fs::create_dir_all(dir.path().join(".drafting")).unwrap();
        std::fs::write(
            dir.path().join(".drafting/ai-config.json"),
            serde_json::to_string_pretty(&legacy).unwrap(),
        )
        .unwrap();

        let cfg = load_config(dir.path());
        // Built-in profiles preserved with stable ids.
        let anth = cfg.profiles.iter().find(|p| p.id == BUILTIN_ANTHROPIC_ID);
        let oai = cfg.profiles.iter().find(|p| p.id == BUILTIN_OPENAI_ID);
        assert!(anth.is_some(), "anthropic builtin id must survive migration");
        assert!(oai.is_some(), "openai builtin id must survive migration");
        assert_eq!(anth.unwrap().protocol, Protocol::Anthropic);
        assert_eq!(oai.unwrap().protocol, Protocol::OpenaiCompatible);

        // Routes pointed at provider enums now point at the right ULIDs.
        let chat = cfg
            .routes
            .iter()
            .find(|r| matches!(r.task_id, TaskId::EditorChat))
            .unwrap();
        assert_eq!(chat.profile_id, BUILTIN_ANTHROPIC_ID);
        let commit = cfg
            .routes
            .iter()
            .find(|r| matches!(r.task_id, TaskId::GitCommitMessage))
            .unwrap();
        assert_eq!(commit.profile_id, BUILTIN_OPENAI_ID);
    }

    #[test]
    fn delete_profile_reroutes_dependent_tasks() {
        let dir = TempDir::new().unwrap();
        // Start from defaults, add a custom profile, route one task at it.
        let mut cfg = AiConfig::default();
        cfg.profiles[0].enabled = true; // Anthropic builtin
        let custom_id = ulid::Ulid::new().to_string();
        cfg.profiles.push(Profile {
            id: custom_id.clone(),
            name: "Custom Proxy".into(),
            protocol: Protocol::Anthropic,
            base_url: "https://proxy.example.com".into(),
            endpoint_path: String::new(),
            auth_scheme: AuthScheme::AnthropicKey,
            api_key_set: false,
            enabled: true,
            models: vec!["claude-sonnet-4-6".into()],
            extra_headers: Default::default(),
            builtin: false,
        });
        if let Some(r) = cfg
            .routes
            .iter_mut()
            .find(|r| matches!(r.task_id, TaskId::EditorChat))
        {
            r.profile_id = custom_id.clone();
        }
        save_config(dir.path(), &cfg).unwrap();

        delete_profile(dir.path(), &custom_id).unwrap();

        let after = load_config(dir.path());
        let chat = after
            .routes
            .iter()
            .find(|r| matches!(r.task_id, TaskId::EditorChat))
            .unwrap();
        assert_ne!(chat.profile_id, custom_id, "route must be reassigned");
        assert!(after.profiles.iter().all(|p| p.id != custom_id));
    }

    #[test]
    fn cannot_delete_builtin_profile() {
        let dir = TempDir::new().unwrap();
        save_config(dir.path(), &AiConfig::default()).unwrap();
        let err = delete_profile(dir.path(), BUILTIN_ANTHROPIC_ID).unwrap_err();
        assert!(err.contains("built-in"), "got: {err}");
    }

    #[test]
    fn clone_creates_new_id_and_clears_key() {
        let dir = TempDir::new().unwrap();
        save_config(dir.path(), &AiConfig::default()).unwrap();
        let copy = clone_profile(dir.path(), BUILTIN_ANTHROPIC_ID).unwrap();
        assert_ne!(copy.id, BUILTIN_ANTHROPIC_ID);
        assert!(!copy.builtin);
        assert!(!copy.api_key_set);
        assert!(copy.name.contains("copy"));
    }

    #[test]
    fn add_profile_assigns_ulid_and_strips_builtin() {
        let dir = TempDir::new().unwrap();
        save_config(dir.path(), &AiConfig::default()).unwrap();
        let p = Profile {
            id: String::new(),
            name: "MyProxy".into(),
            protocol: Protocol::OpenaiCompatible,
            base_url: "https://proxy.example.com".into(),
            endpoint_path: String::new(),
            auth_scheme: AuthScheme::Bearer,
            api_key_set: false,
            enabled: false,
            models: vec![],
            extra_headers: Default::default(),
            builtin: true, // user trying to mark it builtin — should be stripped
        };
        let saved = add_profile(dir.path(), p).unwrap();
        assert!(!saved.id.is_empty());
        assert!(!saved.builtin);
    }
}

pub fn clone_profile(project_root: &Path, source_id: &str) -> Result<Profile, String> {
    let cfg = load_config(project_root);
    let source = cfg
        .profiles
        .iter()
        .find(|p| p.id == source_id)
        .ok_or_else(|| format!("profile {source_id} not found"))?;
    let mut copy = source.clone();
    copy.id = ulid::Ulid::new().to_string();
    copy.name = format!("{} (copy)", source.name);
    copy.builtin = false;
    copy.enabled = false;
    copy.api_key_set = false;
    add_profile(project_root, copy)
}
