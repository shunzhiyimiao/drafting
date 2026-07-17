use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Profile: a single configured AI endpoint
// ---------------------------------------------------------------------------

/// Wire protocol the endpoint speaks. Picks the adapter and request shape.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum Protocol {
    /// Native Anthropic /v1/messages (also covers proxies that re-emit
    /// Anthropic SSE — packy / yourapi / OpenRouter's anthropic-style endpoints).
    Anthropic,
    /// OpenAI /v1/chat/completions, also covers any "OpenAI-compatible"
    /// endpoint (DeepSeek / Together / Groq / OpenRouter / Moonshot / vLLM /
    /// LiteLLM / one-api). The path can be customized per profile.
    OpenaiCompatible,
    /// Ollama /api/chat — newline-delimited JSON instead of SSE.
    Ollama,
}

impl Protocol {
    pub fn default_endpoint_path(self) -> &'static str {
        match self {
            Protocol::Anthropic => "/v1/messages",
            Protocol::OpenaiCompatible => "/v1/chat/completions",
            Protocol::Ollama => "/api/chat",
        }
    }
}

/// How the API key is presented on outbound requests.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum AuthScheme {
    /// `x-api-key: <key>` plus `anthropic-version` header.
    AnthropicKey,
    /// `Authorization: Bearer <key>`.
    Bearer,
    /// No auth (Ollama / fully local).
    None,
    /// User-named header carrying the raw key, e.g. {"name":"Helicone-Auth"}.
    CustomHeader { name: String },
}

impl AuthScheme {
    pub fn requires_key(&self) -> bool {
        !matches!(self, AuthScheme::None)
    }
}

/// One configured AI endpoint. Identified by ULID so that renames don't break
/// task routes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    /// ULID. Stable forever; do not rebuild.
    pub id: String,
    /// User-visible name (free-form, can be edited).
    pub name: String,
    /// Wire protocol.
    pub protocol: Protocol,
    /// Base URL, no trailing slash. e.g. "https://api.anthropic.com" or
    /// "https://api.deepseek.com".
    pub base_url: String,
    /// Optional override of the chat endpoint path. Empty string = use
    /// `protocol.default_endpoint_path()`.
    #[serde(default)]
    pub endpoint_path: String,
    /// How the key is sent.
    pub auth_scheme: AuthScheme,
    /// True if a secret has been stored for this profile (the key itself
    /// lives in the system keychain, indexed by profile id).
    #[serde(default)]
    pub api_key_set: bool,
    /// Active in the dropdown? Disabled profiles are still kept around so
    /// past routes don't go stale.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Model ids the user wants to surface in the routing dropdown.
    #[serde(default)]
    pub models: Vec<String>,
    /// Extra HTTP headers (e.g. `Helicone-Auth`, `x-stainless-helper-method`).
    /// Sorted for deterministic serialization.
    #[serde(default)]
    pub extra_headers: BTreeMap<String, String>,
    /// True for the three built-in defaults (Anthropic / OpenAI / Ollama). UI
    /// hides destructive actions on these — but they can still be edited /
    /// disabled / cloned.
    #[serde(default)]
    pub builtin: bool,
}

fn default_true() -> bool {
    true
}

// ---------------------------------------------------------------------------
// Tasks (unchanged) + routes now point at a ProfileId (string)
// ---------------------------------------------------------------------------

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
    /// Sketch Lite → a full `.sketch` dialect document (O2 decision:
    /// the AI writes the Spec's text form directly; parse+validate gate it).
    SketchGenerate,
    /// Pasted screenshot → `.sketch` dialect document (P3.2 拓印). Vision
    /// task: the request carries `images`; route it at a vision-capable
    /// model (Claude / qwen-vl / kimi vision).
    SketchTranscribe,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRoute {
    pub task_id: TaskId,
    /// ULID of the target Profile.
    pub profile_id: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub global_enabled: bool,
    pub profiles: Vec<Profile>,
    pub routes: Vec<TaskRoute>,
    pub monthly_budget_usd: Option<f64>,
    pub current_month_usage_usd: f64,
}

impl Default for AiConfig {
    fn default() -> Self {
        let profiles = default_profiles();
        let anthropic_id = profiles
            .iter()
            .find(|p| p.protocol == Protocol::Anthropic && p.builtin)
            .map(|p| p.id.clone())
            .unwrap_or_default();
        let routes = default_routes(&anthropic_id);
        Self {
            global_enabled: true,
            profiles,
            routes,
            monthly_budget_usd: None,
            current_month_usage_usd: 0.0,
        }
    }
}

/// Three built-in profiles to start with. Note the ULIDs are *stable across
/// installs* so existing routes survive a config wipe — we use a small set of
/// hand-picked literals instead of `Ulid::new()`.
pub const BUILTIN_ANTHROPIC_ID: &str = "01J0DRAFTINGANTHROPIC0000";
pub const BUILTIN_OPENAI_ID: &str = "01J0DRAFTINGOPENAI0000000";
pub const BUILTIN_OLLAMA_ID: &str = "01J0DRAFTINGOLLAMA0000000";

fn default_profiles() -> Vec<Profile> {
    vec![
        Profile {
            id: BUILTIN_ANTHROPIC_ID.into(),
            name: "Anthropic".into(),
            protocol: Protocol::Anthropic,
            base_url: "https://api.anthropic.com".into(),
            endpoint_path: String::new(),
            auth_scheme: AuthScheme::AnthropicKey,
            api_key_set: false,
            enabled: false,
            models: vec![
                "claude-opus-4-7".into(),
                "claude-sonnet-4-6".into(),
                "claude-haiku-4-5-20251001".into(),
            ],
            extra_headers: BTreeMap::new(),
            builtin: true,
        },
        Profile {
            id: BUILTIN_OPENAI_ID.into(),
            name: "OpenAI".into(),
            protocol: Protocol::OpenaiCompatible,
            base_url: "https://api.openai.com".into(),
            endpoint_path: String::new(),
            auth_scheme: AuthScheme::Bearer,
            api_key_set: false,
            enabled: false,
            models: vec![
                "gpt-5".into(),
                "gpt-4.1".into(),
                "gpt-4o".into(),
                "o3".into(),
                "o3-mini".into(),
            ],
            extra_headers: BTreeMap::new(),
            builtin: true,
        },
        Profile {
            id: BUILTIN_OLLAMA_ID.into(),
            name: "Ollama (Local)".into(),
            protocol: Protocol::Ollama,
            base_url: "http://localhost:11434".into(),
            endpoint_path: String::new(),
            auth_scheme: AuthScheme::None,
            api_key_set: true,
            enabled: false,
            models: vec![],
            extra_headers: BTreeMap::new(),
            builtin: true,
        },
    ]
}

fn default_routes(anthropic_id: &str) -> Vec<TaskRoute> {
    use TaskId::*;
    let p = anthropic_id.to_string();
    vec![
        TaskRoute { task_id: EditorCompletion, profile_id: p.clone(), model: "claude-haiku-4-5-20251001".into() },
        TaskRoute { task_id: EditorChat, profile_id: p.clone(), model: "claude-sonnet-4-6".into() },
        TaskRoute { task_id: EditorExplain, profile_id: p.clone(), model: "claude-sonnet-4-6".into() },
        TaskRoute { task_id: EditorRefactor, profile_id: p.clone(), model: "claude-sonnet-4-6".into() },
        TaskRoute { task_id: BlueprintDraft, profile_id: p.clone(), model: "claude-sonnet-4-6".into() },
        TaskRoute { task_id: BlueprintCheck, profile_id: p.clone(), model: "claude-opus-4-7".into() },
        TaskRoute { task_id: BlueprintSuggestCriteria, profile_id: p.clone(), model: "claude-sonnet-4-6".into() },
        TaskRoute { task_id: PatchboardSuggestSocket, profile_id: p.clone(), model: "claude-sonnet-4-6".into() },
        TaskRoute { task_id: PatchboardSuggestAdapter, profile_id: p.clone(), model: "claude-sonnet-4-6".into() },
        TaskRoute { task_id: GitCommitMessage, profile_id: p.clone(), model: "claude-sonnet-4-6".into() },
        TaskRoute { task_id: SketchGenerate, profile_id: p.clone(), model: "claude-sonnet-4-6".into() },
        TaskRoute { task_id: SketchTranscribe, profile_id: p, model: "claude-sonnet-4-6".into() },
    ]
}

// ---------------------------------------------------------------------------
// Preset templates (used by the "+ from preset" flow on the frontend)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePreset {
    /// Stable preset id (not a ULID — just a slug).
    pub id: String,
    pub name: String,
    pub protocol: Protocol,
    pub base_url: String,
    pub endpoint_path: String,
    pub auth_scheme: AuthScheme,
    pub suggested_models: Vec<String>,
    pub docs_url: String,
}

pub fn builtin_presets() -> Vec<ProfilePreset> {
    vec![
        ProfilePreset {
            id: "openrouter".into(),
            name: "OpenRouter".into(),
            protocol: Protocol::OpenaiCompatible,
            base_url: "https://openrouter.ai/api".into(),
            endpoint_path: "/v1/chat/completions".into(),
            auth_scheme: AuthScheme::Bearer,
            suggested_models: vec![
                "anthropic/claude-opus-4-7".into(),
                "anthropic/claude-sonnet-4-6".into(),
                "openai/gpt-5".into(),
                "deepseek/deepseek-chat".into(),
            ],
            docs_url: "https://openrouter.ai/docs".into(),
        },
        ProfilePreset {
            id: "deepseek".into(),
            name: "DeepSeek".into(),
            protocol: Protocol::OpenaiCompatible,
            base_url: "https://api.deepseek.com".into(),
            endpoint_path: "/v1/chat/completions".into(),
            auth_scheme: AuthScheme::Bearer,
            suggested_models: vec!["deepseek-chat".into(), "deepseek-reasoner".into()],
            docs_url: "https://api-docs.deepseek.com".into(),
        },
        ProfilePreset {
            id: "moonshot".into(),
            name: "Moonshot (Kimi)".into(),
            protocol: Protocol::OpenaiCompatible,
            base_url: "https://api.moonshot.cn".into(),
            endpoint_path: "/v1/chat/completions".into(),
            auth_scheme: AuthScheme::Bearer,
            suggested_models: vec![
                "kimi-k2-0905-preview".into(),
                "kimi-latest".into(),
                "kimi-latest-128k".into(),
                "moonshot-v1-32k-vision-preview".into(),
                "moonshot-v1-auto".into(),
                "moonshot-v1-128k".into(),
                "moonshot-v1-32k".into(),
                "moonshot-v1-8k".into(),
            ],
            docs_url: "https://platform.moonshot.cn/docs".into(),
        },
        ProfilePreset {
            id: "qwen".into(),
            name: "Qwen (通义千问 / DashScope)".into(),
            protocol: Protocol::OpenaiCompatible,
            base_url: "https://dashscope.aliyuncs.com/compatible-mode".into(),
            endpoint_path: "/v1/chat/completions".into(),
            auth_scheme: AuthScheme::Bearer,
            suggested_models: vec![
                "qwen3-max-preview".into(),
                "qwen3-coder-plus".into(),
                "qwen3-vl-plus".into(),
                "qwen-vl-max".into(),
                "qwen-max".into(),
                "qwen-plus".into(),
                "qwen-turbo".into(),
                "qwen2.5-72b-instruct".into(),
                "qwen2.5-coder-32b-instruct".into(),
            ],
            docs_url: "https://help.aliyun.com/zh/dashscope/developer-reference/compatibility-of-openai-with-dashscope".into(),
        },
        ProfilePreset {
            id: "together".into(),
            name: "Together AI".into(),
            protocol: Protocol::OpenaiCompatible,
            base_url: "https://api.together.xyz".into(),
            endpoint_path: "/v1/chat/completions".into(),
            auth_scheme: AuthScheme::Bearer,
            suggested_models: vec![
                "meta-llama/Llama-3.3-70B-Instruct-Turbo".into(),
                "Qwen/Qwen2.5-72B-Instruct-Turbo".into(),
            ],
            docs_url: "https://docs.together.ai".into(),
        },
        ProfilePreset {
            id: "groq".into(),
            name: "Groq".into(),
            protocol: Protocol::OpenaiCompatible,
            base_url: "https://api.groq.com/openai".into(),
            endpoint_path: "/v1/chat/completions".into(),
            auth_scheme: AuthScheme::Bearer,
            suggested_models: vec!["llama-3.3-70b-versatile".into()],
            docs_url: "https://console.groq.com/docs".into(),
        },
        ProfilePreset {
            id: "packycc".into(),
            name: "PackyCC (Anthropic 中转)".into(),
            protocol: Protocol::Anthropic,
            base_url: "https://api.packycc.com".into(),
            endpoint_path: "/v1/messages".into(),
            auth_scheme: AuthScheme::AnthropicKey,
            suggested_models: vec![
                "claude-opus-4-7".into(),
                "claude-sonnet-4-6".into(),
            ],
            docs_url: "".into(),
        },
        ProfilePreset {
            id: "yourapi".into(),
            name: "YourAPI (Anthropic 中转)".into(),
            protocol: Protocol::Anthropic,
            base_url: "https://yourapi.cn".into(),
            endpoint_path: "/v1/messages".into(),
            auth_scheme: AuthScheme::AnthropicKey,
            suggested_models: vec![
                "claude-opus-4-7".into(),
                "claude-sonnet-4-6".into(),
            ],
            docs_url: "".into(),
        },
        ProfilePreset {
            id: "litellm".into(),
            name: "LiteLLM Gateway".into(),
            protocol: Protocol::OpenaiCompatible,
            base_url: "http://localhost:4000".into(),
            endpoint_path: "/v1/chat/completions".into(),
            auth_scheme: AuthScheme::Bearer,
            suggested_models: vec![],
            docs_url: "https://docs.litellm.ai".into(),
        },
        ProfilePreset {
            id: "custom-anthropic".into(),
            name: "自定义 Anthropic 中转".into(),
            protocol: Protocol::Anthropic,
            base_url: "https://".into(),
            endpoint_path: "/v1/messages".into(),
            auth_scheme: AuthScheme::AnthropicKey,
            suggested_models: vec![],
            docs_url: "".into(),
        },
        ProfilePreset {
            id: "custom-openai".into(),
            name: "自定义 OpenAI 兼容".into(),
            protocol: Protocol::OpenaiCompatible,
            base_url: "https://".into(),
            endpoint_path: "/v1/chat/completions".into(),
            auth_scheme: AuthScheme::Bearer,
            suggested_models: vec![],
            docs_url: "".into(),
        },
    ]
}

// ---------------------------------------------------------------------------
// Usage / chat protocol — unchanged from before
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageRecord {
    pub task_id: String,
    pub profile_id: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

/// An image carried alongside a chat request (P3.2 paste-transcribe).
/// Request-level, not per-message: adapters attach every image to the FINAL
/// user message at serialization time (transcription has exactly one).
/// The pixels exist only in memory and on the wire — never persisted, never
/// logged; the audit records metadata (media type + approximate size) only.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAttachment {
    /// e.g. "image/png".
    pub media_type: String,
    /// Raw base64 payload, no `data:` URL prefix.
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub model: String,
    #[serde(default)]
    pub system: Option<String>,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    /// Project-relative paths of files whose content is embedded in this
    /// request. Not sent to the provider — recorded in the local audit log
    /// (.drafting/local/ai-audit.jsonl). Callers embedding file content
    /// must set this after running the privacy filter.
    #[serde(default)]
    pub included_files: Vec<String>,
    /// Images for vision tasks (see ImageAttachment for the privacy contract).
    #[serde(default)]
    pub images: Vec<ImageAttachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    Started {
        stream_id: String,
        profile_id: String,
        model: String,
    },
    Delta { stream_id: String, text: String },
    Completed {
        stream_id: String,
        input_tokens: u64,
        output_tokens: u64,
    },
    Cancelled { stream_id: String },
    Failed { stream_id: String, error: String },
}

// ---------------------------------------------------------------------------
// Legacy schema (v0) — used only for migration. Mirrors the old shape exactly.
// ---------------------------------------------------------------------------

pub mod legacy {
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
    #[serde(rename_all = "camelCase")]
    pub enum LegacyProviderId {
        Anthropic,
        OpenAi,
        Ollama,
        Custom(String),
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct LegacyProviderConfig {
        pub id: LegacyProviderId,
        pub display_name: String,
        pub api_base: String,
        #[serde(default)]
        pub api_key_set: bool,
        #[serde(default)]
        pub enabled: bool,
        #[serde(default)]
        pub models: Vec<String>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct LegacyTaskRoute {
        pub task_id: super::TaskId,
        pub provider_id: LegacyProviderId,
        pub model: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct LegacyAiConfig {
        #[serde(default = "yes")]
        pub global_enabled: bool,
        pub providers: Vec<LegacyProviderConfig>,
        pub routes: Vec<LegacyTaskRoute>,
        #[serde(default)]
        pub monthly_budget_usd: Option<f64>,
        #[serde(default)]
        pub current_month_usage_usd: f64,
    }

    fn yes() -> bool {
        true
    }
}
