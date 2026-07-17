//! Anthropic /v1/messages streaming adapter (SSE).

use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures_util::stream::{self, BoxStream, StreamExt};
use serde_json::{json, Value};

use super::super::types::{ChatRequest, Role, StreamEvent};
use super::{ProviderAdapter, ProviderContext};

const API_VERSION: &str = "2023-06-01";

pub struct AnthropicAdapter;

/// Assemble the Anthropic /v1/messages request body from a ChatRequest.
///
/// The system prompt is emitted as a content-block array with a single
/// `cache_control: ephemeral` breakpoint at its end, so Anthropic caches the
/// whole (large, stable) system prefix across repeated calls within the cache
/// TTL — the design's mandated prompt caching (Part 13, constraint 17). When
/// the prefix is below the model's minimum cacheable size Anthropic simply
/// ignores the marker and bills normally, so this is always safe to send.
fn build_body(request: &ChatRequest) -> Value {
    // Anthropic separates `system` from `messages` and only allows
    // user/assistant in messages.
    let mut messages = Vec::with_capacity(request.messages.len());
    let mut sys_from_messages: Vec<String> = Vec::new();
    for m in &request.messages {
        match m.role {
            Role::System => sys_from_messages.push(m.content.clone()),
            Role::User => messages.push(json!({ "role": "user", "content": m.content })),
            Role::Assistant => messages.push(json!({ "role": "assistant", "content": m.content })),
        }
    }

    // Vision (P3.2): images ride on the FINAL user message as content
    // blocks, image before text (Anthropic's recommended order). A request
    // with images but no user message gets one, so pixels are never
    // silently dropped.
    if !request.images.is_empty() {
        if !messages.iter().any(|m| m["role"] == "user") {
            messages.push(json!({ "role": "user", "content": "" }));
        }
        if let Some(last_user) = messages
            .iter_mut()
            .rev()
            .find(|m| m["role"] == "user")
        {
            let text = last_user["content"].as_str().unwrap_or_default().to_string();
            let mut blocks: Vec<Value> = request
                .images
                .iter()
                .map(|img| {
                    json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": img.media_type,
                            "data": img.data_base64,
                        },
                    })
                })
                .collect();
            blocks.push(json!({ "type": "text", "text": text }));
            last_user["content"] = json!(blocks);
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
        body["system"] = json!([
            {
                "type": "text",
                "text": sys_combined,
                "cache_control": { "type": "ephemeral" },
            }
        ]);
    }
    if let Some(t) = request.temperature {
        body["temperature"] = json!(t);
    }
    body
}

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
        // Build the request body (system prompt carries the prompt-cache
        // breakpoint — see build_body).
        let body = build_body(&request);

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
            // Surface Retry-After for the runner's 429 retry — the
            // establish-error contract is a string (see retry.rs).
            let retry_after = resp
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .map(|v| format!(" [retry-after:{v}]"))
                .unwrap_or_default();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("anthropic {status}: {text}{retry_after}"));
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
                                    // Prompt-cache observability: non-zero
                                    // cache_read means the cached system prefix
                                    // was reused (cheaper input).
                                    let cache_read = usage
                                        .get("cache_read_input_tokens")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0);
                                    let cache_created = usage
                                        .get("cache_creation_input_tokens")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0);
                                    if cache_read > 0 || cache_created > 0 {
                                        log::info!(
                                            "anthropic prompt cache: read={cache_read} created={cache_created} fresh_input={input_tokens}"
                                        );
                                    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_provider::types::ChatMessage;

    fn req(system: Option<&str>, user: &str) -> ChatRequest {
        ChatRequest {
            model: "claude-x".into(),
            system: system.map(String::from),
            messages: vec![ChatMessage {
                role: Role::User,
                content: user.into(),
            }],
            temperature: Some(0.1),
            max_tokens: Some(1000),
            included_files: vec![],
            images: vec![],
        }
    }

    #[test]
    fn system_prompt_carries_ephemeral_cache_breakpoint() {
        let body = build_body(&req(Some("you are a reviewer"), "check this"));
        let sys = body.get("system").expect("system present");
        let arr = sys.as_array().expect("system is a content-block array");
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["text"], "you are a reviewer");
        assert_eq!(arr[0]["cache_control"]["type"], "ephemeral");
    }

    #[test]
    fn no_system_means_no_system_key() {
        let body = build_body(&req(None, "hi"));
        assert!(body.get("system").is_none());
    }

    #[test]
    fn images_attach_to_final_user_message_before_text() {
        use crate::ai_provider::types::ImageAttachment;
        let mut r = req(Some("sys"), "transcribe this");
        r.images.push(ImageAttachment {
            media_type: "image/png".into(),
            data_base64: "QUJD".into(),
        });
        let body = build_body(&r);
        let content = body["messages"][0]["content"].as_array().expect("blocks");
        assert_eq!(content.len(), 2);
        assert_eq!(content[0]["type"], "image");
        assert_eq!(content[0]["source"]["media_type"], "image/png");
        assert_eq!(content[0]["source"]["data"], "QUJD");
        assert_eq!(content[1]["type"], "text");
        assert_eq!(content[1]["text"], "transcribe this");
    }

    #[test]
    fn no_images_keeps_plain_string_content() {
        let body = build_body(&req(None, "hi"));
        assert!(body["messages"][0]["content"].is_string());
    }

    #[test]
    fn system_role_messages_fold_into_cached_system() {
        let mut r = req(Some("base"), "u");
        r.messages.insert(
            0,
            ChatMessage {
                role: Role::System,
                content: "extra".into(),
            },
        );
        let body = build_body(&r);
        let text = body["system"][0]["text"].as_str().unwrap();
        assert!(text.contains("base") && text.contains("extra"));
        // System-role message must not leak into the messages array.
        let msgs = body["messages"].as_array().unwrap();
        assert!(msgs.iter().all(|m| m["role"] != "system"));
    }
}
