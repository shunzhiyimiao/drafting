//! OpenAI /v1/chat/completions streaming adapter (SSE).
//!
//! Also serves OpenAI-compatible endpoints (DeepSeek / Together / Groq /
//! local vLLM): just point `ctx.api_base` somewhere else.

use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures_util::stream::{BoxStream, StreamExt};
use serde_json::{json, Value};

use super::super::types::{ChatRequest, Role, StreamEvent};
use super::{ProviderAdapter, ProviderContext};

pub struct OpenAiAdapter;

#[async_trait]
impl ProviderAdapter for OpenAiAdapter {
    fn id(&self) -> &'static str {
        "openai"
    }

    async fn stream_chat(
        &self,
        ctx: &ProviderContext,
        stream_id: String,
        request: ChatRequest,
    ) -> Result<BoxStream<'static, StreamEvent>, String> {
        // OpenAI takes system as a regular message at the head.
        let mut messages: Vec<Value> = Vec::new();
        if let Some(sys) = &request.system {
            if !sys.is_empty() {
                messages.push(json!({ "role": "system", "content": sys }));
            }
        }
        for m in &request.messages {
            let role = match m.role {
                Role::System => "system",
                Role::User => "user",
                Role::Assistant => "assistant",
            };
            messages.push(json!({ "role": role, "content": m.content }));
        }

        let mut body = json!({
            "model": request.model,
            "messages": messages,
            "stream": true,
            "stream_options": { "include_usage": true },
        });
        if let Some(t) = request.temperature {
            body["temperature"] = json!(t);
        }
        if let Some(m) = request.max_tokens {
            body["max_tokens"] = json!(m);
        }

        let url = ctx.url();
        let headers = ctx.build_headers()?;

        let client = reqwest::Client::new();
        let resp = client
            .post(&url)
            .headers(headers)
            .header("content-type", "application/json")
            .header("accept", "text/event-stream")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("openai request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            // Surface Retry-After for the runner's 429 retry — the
            // establish-error contract is a string (see retry.rs).
            let retry_after = resp
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .map(|v| format!(" [retry-after:{v}]"))
                .unwrap_or_default();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("openai {status}: {text}{retry_after}"));
        }

        let bytes = resp.bytes_stream();
        let mut sse = bytes.eventsource();

        let stream_id_for_stream = stream_id.clone();
        let s = async_stream::stream! {
            let mut input_tokens: u64 = 0;
            let mut output_tokens: u64 = 0;

            while let Some(event) = sse.next().await {
                match event {
                    Ok(ev) => {
                        if ev.data == "[DONE]" {
                            yield StreamEvent::Completed {
                                stream_id: stream_id_for_stream.clone(),
                                input_tokens,
                                output_tokens,
                            };
                            return;
                        }
                        let parsed: Value = match serde_json::from_str(&ev.data) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        // Usage is sent in a final chunk where choices is [].
                        if let Some(usage) = parsed.get("usage").and_then(|v| v.as_object()) {
                            if let Some(prompt) = usage.get("prompt_tokens").and_then(|v| v.as_u64()) {
                                input_tokens = prompt;
                            }
                            if let Some(out) = usage.get("completion_tokens").and_then(|v| v.as_u64()) {
                                output_tokens = out;
                            }
                        }
                        if let Some(choices) = parsed.get("choices").and_then(|v| v.as_array()) {
                            for c in choices {
                                if let Some(text) = c
                                    .get("delta")
                                    .and_then(|d| d.get("content"))
                                    .and_then(|t| t.as_str())
                                {
                                    if !text.is_empty() {
                                        yield StreamEvent::Delta {
                                            stream_id: stream_id_for_stream.clone(),
                                            text: text.to_string(),
                                        };
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        yield StreamEvent::Failed {
                            stream_id: stream_id_for_stream.clone(),
                            error: format!("openai SSE error: {e}"),
                        };
                        return;
                    }
                }
            }

            yield StreamEvent::Completed {
                stream_id: stream_id_for_stream.clone(),
                input_tokens,
                output_tokens,
            };
        };

        Ok(s.boxed())
    }

    async fn health_check(&self, ctx: &ProviderContext) -> Result<(), String> {
        // Most OpenAI-compatible gateways expose /v1/models. Hit base_url +
        // "/v1/models" — but if the user pointed endpoint_path somewhere
        // exotic, we still want a useful sanity check, so we ALSO accept any
        // non-5xx response from the configured chat endpoint as "reachable".
        let base = ctx.base_url.trim_end_matches('/');
        let models_url = format!("{base}/v1/models");

        let headers = ctx.build_headers()?;

        let client = reqwest::Client::new();
        let resp = client
            .get(&models_url)
            .headers(headers.clone())
            .send()
            .await
            .map_err(|e| format!("openai health: {e}"))?;
        let status = resp.status();
        if status.is_success() {
            return Ok(());
        }
        // Fallback: try a HEAD on the actual chat endpoint. Many proxies
        // refuse OPTIONS/HEAD on /v1/models but happily 405/401 on the chat
        // path — both prove reachability.
        let chat_url = ctx.url();
        let head_resp = client
            .head(&chat_url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("openai health (HEAD chat): {e}"))?;
        if head_resp.status().as_u16() < 500 {
            Ok(())
        } else {
            Err(format!("openai health status {status} (chat HEAD: {})", head_resp.status()))
        }
    }
}
