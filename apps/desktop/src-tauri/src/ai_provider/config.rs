use std::path::Path;

use crate::ai_provider::types::*;

const CONFIG_PATH: &str = ".drafting/ai-config.json";

pub fn load_config(project_root: &Path) -> AiConfig {
    let path = project_root.join(CONFIG_PATH);
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str::<AiConfig>(&data) {
                return config;
            }
        }
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

/// Store an API key. In v1, store in the config file alongside other settings.
/// In production, this should use the system keychain.
pub fn set_api_key(project_root: &Path, provider_id: &ProviderId, key: &str) -> Result<(), String> {
    let key_dir = project_root.join(".drafting/keys");
    std::fs::create_dir_all(&key_dir).map_err(|e| e.to_string())?;
    let filename = match provider_id {
        ProviderId::Anthropic => "anthropic.key",
        ProviderId::OpenAi => "openai.key",
        ProviderId::Ollama => "ollama.key",
        ProviderId::Custom(name) => return {
            let path = key_dir.join(format!("{}.key", name));
            std::fs::write(&path, key).map_err(|e| e.to_string())
        },
    };
    std::fs::write(key_dir.join(filename), key).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_api_key(project_root: &Path, provider_id: &ProviderId) -> Option<String> {
    let key_dir = project_root.join(".drafting/keys");
    let filename = match provider_id {
        ProviderId::Anthropic => "anthropic.key",
        ProviderId::OpenAi => "openai.key",
        ProviderId::Ollama => return Some(String::new()), // no key needed
        ProviderId::Custom(name) => {
            let path = key_dir.join(format!("{}.key", name));
            return std::fs::read_to_string(&path).ok().map(|s| s.trim().to_string());
        }
    };
    std::fs::read_to_string(key_dir.join(filename))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}
