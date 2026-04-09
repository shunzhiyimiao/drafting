use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// JSON-RPC client that manages a Node.js codegen-server child process.
/// Communicates via stdio (newline-delimited JSON).
pub struct CodegenProxy {
    child: Arc<Mutex<Option<Child>>>,
    project_root: Arc<Mutex<String>>,
}

impl CodegenProxy {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            project_root: Arc::new(Mutex::new(String::new())),
        }
    }

    pub async fn set_project_root(&self, root: &str) {
        let mut pr = self.project_root.lock().await;
        *pr = root.to_string();
    }

    /// Send a JSON-RPC request and wait for the response.
    pub async fn call(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        self.ensure_running().await?;

        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });

        let mut child_lock = self.child.lock().await;
        let child = child_lock.as_mut().ok_or("Process not running")?;

        let stdin = child.stdin.as_mut().ok_or("No stdin")?;
        let stdout = child.stdout.as_mut().ok_or("No stdout")?;

        let request_line = serde_json::to_string(&request).map_err(|e| e.to_string())? + "\n";
        stdin
            .write_all(request_line.as_bytes())
            .await
            .map_err(|e| format!("Write to codegen-server failed: {}", e))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("Flush failed: {}", e))?;

        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("Read from codegen-server failed: {}", e))?;

        let response: serde_json::Value =
            serde_json::from_str(&line).map_err(|e| format!("Parse response failed: {}", e))?;

        if let Some(error) = response.get("error") {
            return Err(format!(
                "codegen-server error: {}",
                error
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("unknown")
            ));
        }

        Ok(response
            .get("result")
            .cloned()
            .unwrap_or(serde_json::Value::Null))
    }

    async fn ensure_running(&self) -> Result<(), String> {
        let mut child_lock = self.child.lock().await;

        // Check if process is still alive
        if let Some(child) = child_lock.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    // Process exited, need to restart
                    *child_lock = None;
                }
                Ok(None) => return Ok(()), // Still running
                Err(_) => {
                    *child_lock = None;
                }
            }
        }

        // Start the codegen-server
        let project_root = self.project_root.lock().await.clone();
        let server_path = if project_root.is_empty() {
            "packages/codegen-server/src/index.ts".to_string()
        } else {
            format!("{}/packages/codegen-server/src/index.ts", project_root)
        };

        // Try to find npx/tsx in PATH
        let child = Command::new("npx")
            .arg("tsx")
            .arg(&server_path)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn codegen-server: {}", e))?;

        log::info!("codegen-server spawned");
        *child_lock = Some(child);
        Ok(())
    }

    pub async fn shutdown(&self) {
        let mut child_lock = self.child.lock().await;
        if let Some(mut child) = child_lock.take() {
            let _ = child.kill().await;
        }
    }
}
