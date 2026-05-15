//! Ollama /api/chat streaming adapter. Ollama emits newline-delimited JSON
//! (one JSON object per line) instead of SSE.

use async_trait::async_trait;
use futures_util::stream::{BoxStream, StreamExt};
use serde_json::{json, Value};

use super::super::types::{ChatRequest, Role, StreamEvent};
use super::{ProviderAdapter, ProviderContext};

pub struct OllamaAdapter;

#[async_trait]
impl ProviderAdapter for OllamaAdapter {
    fn id(&self) -> &'static str {
        "ollama"
    }

    async fn stream_chat(
        &self,
        ctx: &ProviderContext,
        stream_id: String,
        request: ChatRequest,
    ) -> Result<BoxStream<'static, StreamEvent>, String> {
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

        let mut options = json!({});
        if let Some(t) = request.temperature {
            options["temperature"] = json!(t);
        }
        if let Some(m) = request.max_tokens {
            options["num_predict"] = json!(m);
        }

        let body = json!({
            "model": request.model,
            "messages": messages,
            "stream": true,
            "options": options,
        });

        let url = ctx.url();
        let headers = ctx.build_headers()?;
        let resp = reqwest::Client::new()
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("ollama request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("ollama {status}: {text}"));
        }

        let mut bytes_stream = resp.bytes_stream();
        let stream_id_for_stream = stream_id.clone();

        let s = async_stream::stream! {
            let mut buf: Vec<u8> = Vec::new();
            let mut input_tokens: u64 = 0;
            let mut output_tokens: u64 = 0;

            while let Some(chunk) = bytes_stream.next().await {
                let chunk = match chunk {
                    Ok(c) => c,
                    Err(e) => {
                        yield StreamEvent::Failed {
                            stream_id: stream_id_for_stream.clone(),
                            error: format!("ollama stream error: {e}"),
                        };
                        return;
                    }
                };
                buf.extend_from_slice(&chunk);

                while let Some(nl) = buf.iter().position(|b| *b == b'\n') {
                    let line: Vec<u8> = buf.drain(..=nl).collect();
                    let line = &line[..line.len() - 1]; // strip newline
                    if line.is_empty() { continue; }
                    let parsed: Value = match serde_json::from_slice(line) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    if let Some(text) = parsed
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_str())
                    {
                        if !text.is_empty() {
                            yield StreamEvent::Delta {
                                stream_id: stream_id_for_stream.clone(),
                                text: text.to_string(),
                            };
                        }
                    }
                    if parsed.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                        if let Some(c) = parsed.get("prompt_eval_count").and_then(|v| v.as_u64()) {
                            input_tokens = c;
                        }
                        if let Some(c) = parsed.get("eval_count").and_then(|v| v.as_u64()) {
                            output_tokens = c;
                        }
                        yield StreamEvent::Completed {
                            stream_id: stream_id_for_stream.clone(),
                            input_tokens,
                            output_tokens,
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
        let base = ctx.base_url.trim_end_matches('/');
        let url = format!("{base}/api/tags");
        let headers = ctx.build_headers().unwrap_or_default();
        let resp = reqwest::Client::new()
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("ollama health: {e}"))?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("ollama health status {}", resp.status()))
        }
    }
}
