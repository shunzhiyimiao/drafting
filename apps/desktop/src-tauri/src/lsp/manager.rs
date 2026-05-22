//! Per-project LSP server manager. v1 supports one TypeScript server per
//! project root.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tokio::sync::{broadcast, Mutex};

use super::client::{LspClient, LspNotification};
use super::types::LspLanguage;

#[derive(Clone)]
pub struct ServerHandle {
    pub client: Arc<LspClient>,
    pub root: PathBuf,
    pub language: LspLanguage,
}

pub struct LspManager {
    /// Key: (canonical project root, language)
    servers: Arc<Mutex<HashMap<(PathBuf, LspLanguage), ServerHandle>>>,
}

impl LspManager {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Get or spawn a server for the given language at the given project root.
    pub async fn get_or_spawn(
        &self,
        project_root: &Path,
        language: LspLanguage,
    ) -> Result<ServerHandle, String> {
        let canonical = std::fs::canonicalize(project_root)
            .map_err(|e| format!("canonicalize root failed: {e}"))?;
        let key = (canonical.clone(), language);

        {
            let servers = self.servers.lock().await;
            if let Some(h) = servers.get(&key) {
                return Ok(h.clone());
            }
        }

        let handle = spawn_server(language, &canonical).await?;

        let mut servers = self.servers.lock().await;
        // Race check: another caller may have inserted while we spawned.
        if let Some(existing) = servers.get(&key) {
            // Drop the one we just spawned.
            let dropped = handle.client.clone();
            tokio::spawn(async move { dropped.shutdown().await });
            return Ok(existing.clone());
        }
        servers.insert(key, handle.clone());
        Ok(handle)
    }

    /// Subscribe to notifications from a specific server.
    pub async fn subscribe(
        &self,
        project_root: &Path,
        language: LspLanguage,
    ) -> Result<broadcast::Receiver<LspNotification>, String> {
        let handle = self.get_or_spawn(project_root, language).await?;
        Ok(handle.client.subscribe())
    }

    /// Shut down all servers (called on app exit).
    #[allow(dead_code)]
    pub async fn shutdown_all(&self) {
        let mut servers = self.servers.lock().await;
        for (_, handle) in servers.drain() {
            let client = handle.client.clone();
            tokio::spawn(async move { client.shutdown().await });
        }
    }

    /// Drop the server for a project (e.g. after a branch checkout).
    #[allow(dead_code)]
    pub async fn restart(
        &self,
        project_root: &Path,
        language: LspLanguage,
    ) -> Result<(), String> {
        let canonical = std::fs::canonicalize(project_root)
            .map_err(|e| format!("canonicalize root failed: {e}"))?;
        let key = (canonical, language);
        let mut servers = self.servers.lock().await;
        if let Some(handle) = servers.remove(&key) {
            let client = handle.client.clone();
            tokio::spawn(async move { client.shutdown().await });
        }
        Ok(())
    }
}

async fn spawn_server(language: LspLanguage, root: &Path) -> Result<ServerHandle, String> {
    let (program, args) = match language {
        LspLanguage::Typescript => {
            let bin = locate_tsserver_bin(root).ok_or_else(|| {
                "typescript-language-server not found. Run `pnpm install` in the workspace."
                    .to_string()
            })?;
            (bin, vec!["--stdio".to_string()])
        }
    };

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let client = LspClient::spawn(&program, &arg_refs, Some(root)).await?;

    let root_uri = format!("file://{}", root.to_string_lossy());
    client.initialize(&root_uri).await?;

    Ok(ServerHandle {
        client,
        root: root.to_path_buf(),
        language,
    })
}

/// Find the typescript-language-server executable. We search:
///   1. <project_root>/node_modules/.bin/
///   2. The Drafting workspace itself (codegen-server has it as a dep)
///   3. PATH
fn locate_tsserver_bin(project_root: &Path) -> Option<String> {
    // 1. Project-local
    if let Some(p) = resolve_bin(&project_root.join("node_modules/.bin/typescript-language-server")) {
        return Some(p);
    }

    // 2. Drafting workspace fallback (where codegen-server lives).
    // We climb from CARGO_MANIFEST_DIR to find packages/codegen-server.
    if let Some(workspace_bin) = find_workspace_tsserver() {
        return Some(workspace_bin);
    }

    // 3. PATH
    if let Ok(path) = which("typescript-language-server") {
        return Some(path);
    }
    None
}

fn find_workspace_tsserver() -> Option<String> {
    let manifest = env!("CARGO_MANIFEST_DIR");
    let manifest_path = Path::new(manifest);
    // CARGO_MANIFEST_DIR = .../apps/desktop/src-tauri ; climb 3 to reach workspace root.
    let mut cursor = manifest_path.to_path_buf();
    for _ in 0..6 {
        let base = cursor
            .join("packages/codegen-server/node_modules/.bin/typescript-language-server");
        if let Some(p) = resolve_bin(&base) {
            return Some(p);
        }
        if !cursor.pop() {
            break;
        }
    }
    None
}

/// Resolve a binary path, trying platform-specific extensions on Windows
/// (`.cmd`, `.exe`, `.bat`). On Unix, the bare name is checked as-is.
fn resolve_bin(base: &Path) -> Option<String> {
    if base.is_file() {
        return Some(base.to_string_lossy().to_string());
    }
    #[cfg(target_os = "windows")]
    {
        for ext in ["cmd", "exe", "bat"] {
            let candidate = base.with_extension(ext);
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }
    None
}

fn which(name: &str) -> Result<String, ()> {
    let path = std::env::var_os("PATH").ok_or(())?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Ok(candidate.to_string_lossy().to_string());
        }
        // Windows .cmd / .exe
        for ext in ["exe", "cmd", "bat"] {
            let candidate = dir.join(format!("{name}.{ext}"));
            if candidate.is_file() {
                return Ok(candidate.to_string_lossy().to_string());
            }
        }
    }
    Err(())
}
