//! Anthropic /v1/messages streaming adapter (SSE).

use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures_util::stream::{self, BoxStream, StreamExt};
use serde_json::{json, Value};

use super::super::types::{ChatRequest, Role, StreamEvent};
use super::{ProviderAdapter, ProviderContext};

const API_VERSION: &str = "2023-06-01";

pub struct AnthropicAdapter;

#[async_trait]
impl ProviderAdapter for AnthropicAdapter {
    fn id(&self) -> &'static str {
        "anthropic"
    }

    async fn stream_chat(
        &self,
        ctx: &ProviderContext,
        stream_id: String,
        request: ChatRequest,
    ) -> Result<BoxStream<'static, StreamEvent>, String> {
        // Build Anthropic message payload. Anthropic separates `system` from
        // `messages` and only allows user/assistant in messages.
        let mut messages = Vec::with_capacity(request.messages.len());
        let mut sys_from_messages: Vec<String> = Vec::new();
        for m in &request.messages {
            match m.role {
                Role::System => sys_from_messages.push(m.content.clone()),
                Role::User => messages.push(json!({ "role": "user", "content": m.content })),
                Role::Assistant => {
                    messages.push(json!({ "role": "assistant", "content": m.content }))
                }
            }
        }

        let mut sys_combined = request.system.clone().unwrap_or_default();
        if !sys_from_messages.is_empty() {
            if !sys_combined.is_empty() {
                sys_combined.push_str("\n\n");
            }
            sys_combined.push_str(&sys_from_messages.join("\n\n"));
        }

        let mut body = json!({
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "stream": true,
        });
        if !sys_combined.is_empty() {
            body["system"] = Value::String(sys_combined);
        }
        if let Some(t) = request.temperature {
            body["temperature"] = json!(t);
        }

        let url = ctx.url();

        let client = reqwest::Client::builder()
            .build()
            .map_err(|e| format!("build http client: {e}"))?;

        let mut headers = ctx.build_headers()?;
        // Anthropic-version is required by the Anthropic API and most
        // anthropic-style proxies. Don't override if the user already set it
        // via extra_headers.
        if !headers.contains_key("anthropic-version") {
            headers.insert(
                "anthropic-version",
                reqwest::header::HeaderValue::from_static(API_VERSION),
            );
        }

        let resp = client
            .post(&url)
            .headers(headers)
            .header("content-type", "application/json")
            .header("accept", "text/event-stream")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("anthropic request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("anthropic {status}: {text}"));
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
                        if ev.data == "[DONE]" { continue; }
                        let parsed: Value = match serde_json::from_str(&ev.data) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        let typ = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        match typ {
                            "content_block_delta" => {
                                if let Some(text) = parsed
                                    .get("delta")
                                    .and_then(|d| d.get("text"))
                                    .and_then(|t| t.as_str())
                                {
                                    yield StreamEvent::Delta {
                                        stream_id: stream_id_for_stream.clone(),
                                        text: text.to_string(),
                                    };
                                }
                            }
                            "message_start" => {
                                if let Some(usage) = parsed
                                    .get("message")
                                    .and_then(|m| m.get("usage"))
                                {
                                    input_tokens = usage
                                        .get("input_tokens")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0);
                                }
                            }
                            "message_delta" => {
                                if let Some(usage) = parsed.get("usage") {
                                    if let Some(out) = usage
                                        .get("output_tokens")
                                        .and_then(|v| v.as_u64())
                                    {
                                        output_tokens = out;
                                    }
                                }
                            }
                            "message_stop" => {
                                yield StreamEvent::Completed {
                                    stream_id: stream_id_for_stream.clone(),
                                    input_tokens,
                                    output_tokens,
                                };
                                return;
                            }
                            "error" => {
                                let err = parsed
                                    .get("error")
                                    .and_then(|e| e.get("message"))
                                    .and_then(|m| m.as_str())
                                    .unwrap_or("anthropic stream error")
                                    .to_string();
                                yield StreamEvent::Failed {
                                    stream_id: stream_id_for_stream.clone(),
                                    error: err,
                                };
                                return;
                            }
                            _ => {}
                        }
                    }
                    Err(e) => {
                        yield StreamEvent::Failed {
                            stream_id: stream_id_for_stream.clone(),
                            error: format!("anthropic SSE error: {e}"),
                        };
                        return;
                    }
                }
            }

            // Stream ended without explicit message_stop — emit Completed anyway.
            yield StreamEvent::Completed {
                stream_id: stream_id_for_stream.clone(),
                input_tokens,
                output_tokens,
            };
        };

        Ok(s.boxed())
    }

    async fn health_check(&self, ctx: &ProviderContext) -> Result<(), String> {
        // Anthropic exposes /v1/models for sanity-check. We replace the user's
        // configured endpoint_path (which is the chat path, e.g. /v1/messages)
        // with /v1/models. Anthropic-style proxies may or may not implement
        // /v1/models — fall back to "consider 4xx without auth = healthy"
        // shape if needed.
        let base = ctx.base_url.trim_end_matches('/');
        let url = format!("{base}/v1/models");

        let mut headers = ctx.build_headers()?;
        if !headers.contains_key("anthropic-version") {
            headers.insert(
                "anthropic-version",
                reqwest::header::HeaderValue::from_static(API_VERSION),
            );
        }

        let resp = reqwest::Client::new()
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("anthropic health: {e}"))?;
        let status = resp.status();
        if status.is_success() || status.as_u16() == 404 {
            // 404 is OK: some proxies don't expose /v1/models but accept /v1/messages.
            Ok(())
        } else {
            Err(format!("anthropic health status {status}"))
        }
    }
}

// async-stream is convenient for SSE — declare the dep alias.
#[allow(unused_imports)]
use stream as _stream;
