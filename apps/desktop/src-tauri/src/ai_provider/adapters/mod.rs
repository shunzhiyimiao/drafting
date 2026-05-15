//! Provider adapters: each speaks one HTTP protocol (Anthropic / OpenAI / Ollama)
//! and exposes a uniform streaming interface.

pub mod anthropic;
pub mod ollama;
pub mod openai;

use std::collections::BTreeMap;

use async_trait::async_trait;
use futures_util::stream::BoxStream;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

use super::types::{AuthScheme, ChatRequest, StreamEvent};

/// Everything an adapter needs to make a request: the resolved URL pieces, the
/// auth scheme + secret, and any user-supplied extra headers.
#[derive(Debug, Clone)]
pub struct ProviderContext {
    pub base_url: String,
    pub endpoint_path: String,
    pub api_key: String,
    pub auth_scheme: AuthScheme,
    pub extra_headers: BTreeMap<String, String>,
}

impl ProviderContext {
    /// Concat base_url + endpoint_path with normalized slashes.
    pub fn url(&self) -> String {
        let base = self.base_url.trim_end_matches('/');
        let path = if self.endpoint_path.is_empty() {
            ""
        } else if self.endpoint_path.starts_with('/') {
            self.endpoint_path.as_str()
        } else {
            // Inject leading slash.
            return format!("{base}/{}", self.endpoint_path);
        };
        format!("{base}{path}")
    }

    /// Build a HeaderMap with the auth scheme applied + extra headers merged in.
    /// The caller still adds Content-Type / Accept and any protocol-specific
    /// version headers.
    pub fn build_headers(&self) -> Result<HeaderMap, String> {
        let mut headers = HeaderMap::new();

        // Extra headers first so user-supplied entries can shadow defaults.
        for (k, v) in &self.extra_headers {
            let name = HeaderName::from_bytes(k.as_bytes())
                .map_err(|e| format!("invalid header name '{k}': {e}"))?;
            let value =
                HeaderValue::from_str(v).map_err(|e| format!("invalid header value for '{k}': {e}"))?;
            headers.insert(name, value);
        }

        match &self.auth_scheme {
            AuthScheme::None => {}
            AuthScheme::AnthropicKey => {
                if self.api_key.is_empty() {
                    return Err("API key required (Anthropic)".into());
                }
                headers.insert(
                    "x-api-key",
                    HeaderValue::from_str(&self.api_key)
                        .map_err(|e| format!("invalid api key: {e}"))?,
                );
            }
            AuthScheme::Bearer => {
                if self.api_key.is_empty() {
                    return Err("API key required (Bearer)".into());
                }
                headers.insert(
                    reqwest::header::AUTHORIZATION,
                    HeaderValue::from_str(&format!("Bearer {}", self.api_key))
                        .map_err(|e| format!("invalid api key: {e}"))?,
                );
            }
            AuthScheme::CustomHeader { name } => {
                if self.api_key.is_empty() {
                    return Err(format!("API key required (header '{name}')"));
                }
                let header_name = HeaderName::from_bytes(name.as_bytes())
                    .map_err(|e| format!("invalid custom header name '{name}': {e}"))?;
                headers.insert(
                    header_name,
                    HeaderValue::from_str(&self.api_key)
                        .map_err(|e| format!("invalid api key: {e}"))?,
                );
            }
        }

        Ok(headers)
    }
}

#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    fn id(&self) -> &'static str;

    /// Open a streaming chat. The returned stream emits `StreamEvent::Delta`
    /// items followed by exactly one terminal event (`Completed` / `Failed`).
    /// `Started` is emitted by the runner, not the adapter.
    async fn stream_chat(
        &self,
        ctx: &ProviderContext,
        stream_id: String,
        request: ChatRequest,
    ) -> Result<BoxStream<'static, StreamEvent>, String>;

    /// Lightweight health check (HEAD/GET on a cheap endpoint, or list models).
    async fn health_check(&self, ctx: &ProviderContext) -> Result<(), String>;
}
