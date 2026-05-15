//! Async LSP client. Owns one child process (a language server) and a small
//! task that demuxes incoming messages by `id` for request/response, and
//! forwards notifications to a broadcast channel.

use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

use serde_json::{json, Value};
use tokio::io::BufReader;
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{broadcast, oneshot, Mutex};
use tokio::time::{timeout, Duration};

use super::protocol::{read_message, write_message};
use super::types::{CompletionItem, Diagnostic, Hover, Location, Position, PublishDiagnostics};

/// Notifications surfaced to subscribers.
#[derive(Debug, Clone)]
pub enum LspNotification {
    PublishDiagnostics(PublishDiagnostics),
    ServerExited { reason: String },
}

type PendingResponse = oneshot::Sender<Result<Value, String>>;

pub struct LspClient {
    next_id: AtomicI64,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    pending: Arc<Mutex<HashMap<i64, PendingResponse>>>,
    notifications: broadcast::Sender<LspNotification>,
    child: Arc<Mutex<Option<Child>>>,
}

impl LspClient {
    /// Spawn the given command (e.g. `typescript-language-server --stdio`)
    /// and wire up the read loop.
    pub async fn spawn(
        program: &str,
        args: &[&str],
        cwd: Option<&Path>,
    ) -> Result<Arc<Self>, String> {
        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn {program}: {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "no stdin on child".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "no stdout on child".to_string())?;
        let stderr = child.stderr.take();

        let (tx, _rx) = broadcast::channel(256);

        let client = Arc::new(LspClient {
            next_id: AtomicI64::new(1),
            stdin: Arc::new(Mutex::new(Some(stdin))),
            pending: Arc::new(Mutex::new(HashMap::new())),
            notifications: tx,
            child: Arc::new(Mutex::new(Some(child))),
        });

        // Read loop: parse messages, route to pending or notifications.
        {
            let pending = client.pending.clone();
            let notifications = client.notifications.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout);
                loop {
                    match read_message(&mut reader).await {
                        Ok(msg) => {
                            handle_message(&pending, &notifications, msg).await;
                        }
                        Err(e) => {
                            log::warn!("LSP read loop ended: {e}");
                            let _ = notifications.send(LspNotification::ServerExited {
                                reason: e.to_string(),
                            });
                            break;
                        }
                    }
                }
            });
        }

        // Drain stderr so it doesn't fill the pipe; log it.
        if let Some(stderr) = stderr {
            tokio::spawn(async move {
                use tokio::io::AsyncBufReadExt;
                let mut reader = BufReader::new(stderr);
                let mut line = String::new();
                while let Ok(n) = reader.read_line(&mut line).await {
                    if n == 0 {
                        break;
                    }
                    let trimmed = line.trim_end();
                    if !trimmed.is_empty() {
                        log::debug!("[lsp stderr] {trimmed}");
                    }
                    line.clear();
                }
            });
        }

        Ok(client)
    }

    pub fn subscribe(&self) -> broadcast::Receiver<LspNotification> {
        self.notifications.subscribe()
    }

    /// Send a notification (no response expected).
    pub async fn notify(&self, method: &str, params: Value) -> Result<(), String> {
        let msg = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        let mut stdin_lock = self.stdin.lock().await;
        let stdin = stdin_lock
            .as_mut()
            .ok_or_else(|| "LSP stdin closed".to_string())?;
        write_message(stdin, &msg)
            .await
            .map_err(|e| format!("write notification failed: {e}"))
    }

    /// Send a request and await its matching response.
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let msg = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        let (tx, rx) = oneshot::channel::<Result<Value, String>>();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(id, tx);
        }

        {
            let mut stdin_lock = self.stdin.lock().await;
            let stdin = stdin_lock
                .as_mut()
                .ok_or_else(|| "LSP stdin closed".to_string())?;
            if let Err(e) = write_message(stdin, &msg).await {
                self.pending.lock().await.remove(&id);
                return Err(format!("write request failed: {e}"));
            }
        }

        match timeout(Duration::from_secs(30), rx).await {
            Ok(Ok(res)) => res,
            Ok(Err(_)) => Err("LSP response channel dropped".to_string()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err(format!("LSP request '{method}' timed out"))
            }
        }
    }

    pub async fn shutdown(&self) {
        // Best-effort LSP shutdown / exit handshake.
        let _ = self.request("shutdown", Value::Null).await;
        let _ = self.notify("exit", Value::Null).await;

        let mut child_lock = self.child.lock().await;
        if let Some(mut child) = child_lock.take() {
            let _ = child.kill().await;
        }
    }

    // --- High-level helpers --------------------------------------------------

    pub async fn initialize(&self, root_uri: &str) -> Result<Value, String> {
        let params = json!({
            "processId": std::process::id(),
            "rootUri": root_uri,
            "capabilities": {
                "textDocument": {
                    "synchronization": { "didSave": true, "willSave": false },
                    "completion": {
                        "completionItem": { "snippetSupport": false },
                    },
                    "hover": { "contentFormat": ["markdown", "plaintext"] },
                    "definition": { "linkSupport": false },
                    "publishDiagnostics": { "relatedInformation": false },
                },
            },
            "workspaceFolders": [{ "uri": root_uri, "name": "workspace" }],
        });
        let result = self.request("initialize", params).await?;
        self.notify("initialized", json!({})).await?;
        Ok(result)
    }

    pub async fn did_open(
        &self,
        uri: &str,
        language_id: &str,
        version: i32,
        text: &str,
    ) -> Result<(), String> {
        self.notify(
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id,
                    "version": version,
                    "text": text,
                }
            }),
        )
        .await
    }

    pub async fn did_change_full(
        &self,
        uri: &str,
        version: i32,
        text: &str,
    ) -> Result<(), String> {
        self.notify(
            "textDocument/didChange",
            json!({
                "textDocument": { "uri": uri, "version": version },
                "contentChanges": [{ "text": text }],
            }),
        )
        .await
    }

    pub async fn did_close(&self, uri: &str) -> Result<(), String> {
        self.notify(
            "textDocument/didClose",
            json!({ "textDocument": { "uri": uri } }),
        )
        .await
    }

    pub async fn completion(
        &self,
        uri: &str,
        position: Position,
    ) -> Result<Vec<CompletionItem>, String> {
        let res = self
            .request(
                "textDocument/completion",
                json!({
                    "textDocument": { "uri": uri },
                    "position": { "line": position.line, "character": position.character },
                }),
            )
            .await?;

        // Response is either CompletionItem[] or { items: CompletionItem[] }.
        let items = if res.is_array() {
            res
        } else if let Some(items) = res.get("items").cloned() {
            items
        } else {
            return Ok(vec![]);
        };

        serde_json::from_value::<Vec<CompletionItem>>(items)
            .map_err(|e| format!("parse completions: {e}"))
    }

    pub async fn hover(&self, uri: &str, position: Position) -> Result<Option<Hover>, String> {
        let res = self
            .request(
                "textDocument/hover",
                json!({
                    "textDocument": { "uri": uri },
                    "position": { "line": position.line, "character": position.character },
                }),
            )
            .await?;

        if res.is_null() {
            return Ok(None);
        }

        let contents = match res.get("contents") {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Object(map)) => map
                .get("value")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_default(),
            Some(Value::Array(arr)) => arr
                .iter()
                .filter_map(|v| match v {
                    Value::String(s) => Some(s.clone()),
                    Value::Object(m) => m.get("value").and_then(|x| x.as_str()).map(String::from),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("\n\n"),
            _ => String::new(),
        };

        let range = res
            .get("range")
            .cloned()
            .and_then(|r| serde_json::from_value(r).ok());

        Ok(Some(Hover { contents, range }))
    }

    pub async fn definition(
        &self,
        uri: &str,
        position: Position,
    ) -> Result<Vec<Location>, String> {
        let res = self
            .request(
                "textDocument/definition",
                json!({
                    "textDocument": { "uri": uri },
                    "position": { "line": position.line, "character": position.character },
                }),
            )
            .await?;

        parse_locations(res)
    }

    pub async fn references(
        &self,
        uri: &str,
        position: Position,
        include_declaration: bool,
    ) -> Result<Vec<Location>, String> {
        let res = self
            .request(
                "textDocument/references",
                json!({
                    "textDocument": { "uri": uri },
                    "position": { "line": position.line, "character": position.character },
                    "context": { "includeDeclaration": include_declaration },
                }),
            )
            .await?;
        parse_locations(res)
    }
}

fn parse_locations(value: Value) -> Result<Vec<Location>, String> {
    if value.is_null() {
        return Ok(vec![]);
    }
    if let Value::Array(arr) = value {
        let mut out = Vec::with_capacity(arr.len());
        for item in arr {
            // A LocationLink uses "targetUri" + "targetSelectionRange"
            if item.get("targetUri").is_some() {
                let uri = item
                    .get("targetUri")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let range = item
                    .get("targetSelectionRange")
                    .or_else(|| item.get("targetRange"))
                    .cloned()
                    .ok_or_else(|| "missing targetRange".to_string())?;
                let range = serde_json::from_value(range)
                    .map_err(|e| format!("parse targetRange: {e}"))?;
                out.push(Location { uri, range });
            } else {
                let loc: Location = serde_json::from_value(item)
                    .map_err(|e| format!("parse Location: {e}"))?;
                out.push(loc);
            }
        }
        Ok(out)
    } else if value.is_object() {
        let loc: Location =
            serde_json::from_value(value).map_err(|e| format!("parse Location: {e}"))?;
        Ok(vec![loc])
    } else {
        Ok(vec![])
    }
}

async fn handle_message(
    pending: &Arc<Mutex<HashMap<i64, PendingResponse>>>,
    notifications: &broadcast::Sender<LspNotification>,
    msg: Value,
) {
    // Response: has "id" and ("result" or "error"), no "method".
    if msg.get("method").is_none() {
        if let Some(id) = msg.get("id").and_then(|v| v.as_i64()) {
            let mut p = pending.lock().await;
            if let Some(tx) = p.remove(&id) {
                if let Some(err) = msg.get("error") {
                    let _ = tx.send(Err(format!("LSP error: {err}")));
                } else {
                    let _ = tx.send(Ok(msg.get("result").cloned().unwrap_or(Value::Null)));
                }
            }
        }
        return;
    }

    // Request from server (rare, e.g. workspace/configuration). Ignore for now
    // but we must reply if it has an id, otherwise the server may stall. Send
    // a generic null-result response.
    let method = msg.get("method").and_then(|v| v.as_str()).unwrap_or("");

    if let Some(id) = msg.get("id") {
        // Server-initiated request; reply null. Best-effort: we don't have stdin
        // here, so just log. (typescript-language-server tolerates missing reply.)
        log::debug!("LSP server request (id={id}, method={method}) — ignoring");
        return;
    }

    // Notification
    match method {
        "textDocument/publishDiagnostics" => {
            if let Some(params) = msg.get("params") {
                match serde_json::from_value::<PublishDiagnostics>(params.clone()) {
                    Ok(pd) => {
                        let _ = notifications.send(LspNotification::PublishDiagnostics(pd));
                    }
                    Err(e) => log::warn!("parse publishDiagnostics failed: {e}"),
                }
            }
        }
        // Silently ignore window/logMessage and others.
        _ => {
            log::trace!("LSP notification: {method}");
        }
    }
}

#[allow(dead_code)]
pub fn diagnostics_uri(d: &PublishDiagnostics) -> &str {
    &d.uri
}

#[allow(dead_code)]
pub fn diagnostics_list(d: &PublishDiagnostics) -> &[Diagnostic] {
    &d.diagnostics
}
