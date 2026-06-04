use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use tauri::Manager;

/// JSON-RPC client that manages a Node.js codegen-server child process.
/// Communicates via stdio (newline-delimited JSON).
pub struct CodegenProxy {
    child: Arc<Mutex<Option<Child>>>,
    project_root: Arc<Mutex<String>>,
    /// Tauri app handle, injected once at startup via `set_app_handle`. Used to
    /// locate the bundled `codegen-server.cjs` inside the app's resource dir in
    /// release builds. Stored behind a `std::sync::Mutex` (not tokio) so the
    /// setter stays synchronous and can be called from the Tauri `setup` hook
    /// without `block_on`.
    app: Arc<std::sync::Mutex<Option<tauri::AppHandle>>>,
}

/// How to launch the codegen-server child process.
enum Launcher {
    /// Release: bundled self-contained CommonJS, run with plain `node`.
    Bundled(PathBuf),
    /// Dev: TypeScript entry, run via `npx tsx`.
    Dev(String),
}

impl CodegenProxy {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            project_root: Arc::new(Mutex::new(String::new())),
            app: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    /// Inject the Tauri AppHandle (called once from the `setup` hook) so the
    /// proxy can resolve the bundled codegen-server.cjs from the resource dir.
    pub fn set_app_handle(&self, handle: tauri::AppHandle) {
        if let Ok(mut guard) = self.app.lock() {
            *guard = Some(handle);
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

        // Resolve how to launch codegen-server. It is part of the Drafting
        // installation, NOT the user's project — the target project (where files
        // get written) is passed separately via RPC params.
        let child = match self.resolve_launcher() {
            Some(Launcher::Bundled(cjs)) => {
                // On Windows CreateProcess does not auto-append .exe to a bare
                // name, so spell it out.
                let node = if cfg!(target_os = "windows") {
                    "node.exe"
                } else {
                    "node"
                };
                Command::new(node)
                    .arg(&cjs)
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                    .map_err(|e| {
                        format!(
                            "Failed to spawn codegen-server (node {}): {e}. \
                             Drafting needs Node.js >= 18 in PATH.",
                            cjs.display()
                        )
                    })?
            }
            Some(Launcher::Dev(script)) => {
                // On Windows the launcher is `npx.cmd`.
                let npx = if cfg!(target_os = "windows") {
                    "npx.cmd"
                } else {
                    "npx"
                };
                Command::new(npx)
                    .arg("tsx")
                    .arg(&script)
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                    .map_err(|e| {
                        format!(
                            "Failed to spawn codegen-server (npx tsx {script}): {e}. \
                             Drafting needs Node.js >= 18 in PATH."
                        )
                    })?
            }
            None => {
                return Err("Could not locate codegen-server: neither the bundled \
                     codegen-server.cjs (app resource dir) nor the dev entry \
                     (packages/codegen-server/src/index.ts) was found."
                    .to_string());
            }
        };

        log::info!("codegen-server spawned");
        *child_lock = Some(child);
        Ok(())
    }

    /// Resolve the launch strategy: prefer the bundled `.cjs` shipped in the
    /// app's resource dir (release); fall back to the TS source via tsx (dev).
    fn resolve_launcher(&self) -> Option<Launcher> {
        // 1. Release: <resource_dir>/codegen-server/codegen-server.cjs
        //    (see tauri.conf.json bundle.resources).
        if let Ok(guard) = self.app.lock() {
            if let Some(app) = guard.as_ref() {
                if let Ok(res_dir) = app.path().resource_dir() {
                    let cjs = res_dir.join("codegen-server").join("codegen-server.cjs");
                    if cjs.is_file() {
                        return Some(Launcher::Bundled(cjs));
                    }
                }
            }
        }
        // 2. Dev: climb the source tree for the TS entry.
        locate_codegen_server().map(Launcher::Dev)
    }

    pub async fn shutdown(&self) {
        let mut child_lock = self.child.lock().await;
        if let Some(mut child) = child_lock.take() {
            let _ = child.kill().await;
        }
    }
}

/// Find the codegen-server dev entry script (`packages/codegen-server/src/index.ts`).
/// Used only in dev: resolve it relative to this crate's location
/// (CARGO_MANIFEST_DIR = .../apps/desktop/src-tauri) by climbing to the
/// workspace root. Falls back to the current working directory.
fn locate_codegen_server() -> Option<String> {
    const REL: &str = "packages/codegen-server/src/index.ts";

    // 1. Climb from the compiled crate's manifest dir (works in dev + when the
    //    repo layout is preserved).
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut cursor = manifest.to_path_buf();
    for _ in 0..6 {
        let candidate = cursor.join(REL);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
        if !cursor.pop() {
            break;
        }
    }

    // 2. Climb from the current working directory.
    if let Ok(cwd) = std::env::current_dir() {
        let mut cursor = cwd;
        for _ in 0..6 {
            let candidate = cursor.join(REL);
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
            if !cursor.pop() {
                break;
            }
        }
    }

    None
}
