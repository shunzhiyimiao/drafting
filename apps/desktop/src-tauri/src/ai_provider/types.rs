use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum ProviderId {
    Anthropic,
    OpenAi,
    Ollama,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub id: ProviderId,
    pub display_name: String,
    pub api_base: String,
    pub api_key_set: bool, // true if key is configured (key itself stored in keychain)
    pub enabled: bool,
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum TaskId {
    EditorCompletion,
    EditorChat,
    EditorExplain,
    EditorRefactor,
    BlueprintDraft,
    BlueprintCheck,
    BlueprintSuggestCriteria,
    PatchboardSuggestSocket,
    PatchboardSuggestAdapter,
    GitCommitMessage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRoute {
    pub task_id: TaskId,
    pub provider_id: ProviderId,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub global_enabled: bool,
    pub providers: Vec<ProviderConfig>,
    pub routes: Vec<TaskRoute>,
    pub monthly_budget_usd: Option<f64>,
    pub current_month_usage_usd: f64,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            global_enabled: true,
            providers: vec![
                ProviderConfig {
                    id: ProviderId::Anthropic,
                    display_name: "Anthropic".to_string(),
                    api_base: "https://api.anthropic.com".to_string(),
                    api_key_set: false,
                    enabled: false,
                    models: vec![
                        "claude-opus-4-6".to_string(),
                        "claude-sonnet-4-6".to_string(),
                        "claude-haiku-4-5-20251001".to_string(),
                    ],
                },
                ProviderConfig {
                    id: ProviderId::OpenAi,
                    display_name: "OpenAI".to_string(),
                    api_base: "https://api.openai.com".to_string(),
                    api_key_set: false,
                    enabled: false,
                    models: vec![
                        "gpt-4o".to_string(),
                        "gpt-4o-mini".to_string(),
                        "o3".to_string(),
                        "o3-mini".to_string(),
                    ],
                },
                ProviderConfig {
                    id: ProviderId::Ollama,
                    display_name: "Ollama (Local)".to_string(),
                    api_base: "http://localhost:11434".to_string(),
                    api_key_set: true, // no key needed
                    enabled: false,
                    models: vec![],
                },
            ],
            routes: default_routes(),
            monthly_budget_usd: None,
            current_month_usage_usd: 0.0,
        }
    }
}

fn default_routes() -> Vec<TaskRoute> {
    use ProviderId::*;
    use TaskId::*;
    vec![
        TaskRoute { task_id: EditorCompletion, provider_id: Anthropic, model: "claude-haiku-4-5-20251001".to_string() },
        TaskRoute { task_id: EditorChat, provider_id: Anthropic, model: "claude-sonnet-4-6".to_string() },
        TaskRoute { task_id: EditorExplain, provider_id: Anthropic, model: "claude-sonnet-4-6".to_string() },
        TaskRoute { task_id: EditorRefactor, provider_id: Anthropic, model: "claude-sonnet-4-6".to_string() },
        TaskRoute { task_id: BlueprintDraft, provider_id: Anthropic, model: "claude-sonnet-4-6".to_string() },
        TaskRoute { task_id: BlueprintCheck, provider_id: Anthropic, model: "claude-opus-4-6".to_string() },
        TaskRoute { task_id: BlueprintSuggestCriteria, provider_id: Anthropic, model: "claude-sonnet-4-6".to_string() },
        TaskRoute { task_id: PatchboardSuggestSocket, provider_id: Anthropic, model: "claude-sonnet-4-6".to_string() },
        TaskRoute { task_id: PatchboardSuggestAdapter, provider_id: Anthropic, model: "claude-sonnet-4-6".to_string() },
        TaskRoute { task_id: GitCommitMessage, provider_id: Anthropic, model: "claude-sonnet-4-6".to_string() },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageRecord {
    pub task_id: String,
    pub provider_id: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
    pub timestamp: u64,
}
