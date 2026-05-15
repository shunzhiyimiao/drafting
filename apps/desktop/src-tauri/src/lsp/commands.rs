//! Tauri commands exposing LSP operations to the frontend.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::sync_bus::events::{EditorEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;

use super::client::LspNotification;
use super::manager::LspManager;
use super::types::{CompletionItem, Hover, Location, LspLanguage, Position};

/// Tracks which (root, language) combos already have a forwarder task running,
/// so we don't spawn duplicate forwarders.
#[derive(Default)]
pub struct LspForwarderRegistry {
    started: Mutex<std::collections::HashSet<(PathBuf, LspLanguage)>>,
    initialized_once: AtomicBool,
}

impl LspForwarderRegistry {
    pub fn new() -> Self {
        Self::default()
    }
}

fn ext_of(path: &str) -> &str {
    path.rsplit_once('.').map(|(_, e)| e).unwrap_or("")
}

fn detect_language(path: &str) -> Option<LspLanguage> {
    LspLanguage::from_extension(ext_of(path))
}

fn file_uri(project_root: &str, rel_path: &str) -> String {
    let p = std::path::Path::new(project_root).join(rel_path);
    let canonical = std::fs::canonicalize(&p).unwrap_or(p);
    format!("file://{}", canonical.to_string_lossy())
}

async fn ensure_forwarder(
    app: &AppHandle,
    manager: &LspManager,
    sync_bus: &SyncBus,
    registry: &LspForwarderRegistry,
    project_root: &std::path::Path,
    language: LspLanguage,
) -> Result<(), String> {
    let canonical = std::fs::canonicalize(project_root)
        .map_err(|e| format!("canonicalize root failed: {e}"))?;
    let key = (canonical.clone(), language);

    {
        let started = registry.started.lock().await;
        if started.contains(&key) {
            return Ok(());
        }
    }

    let mut rx = manager.subscribe(project_root, language).await?;
    {
        let mut started = registry.started.lock().await;
        started.insert(key);
    }

    let app = app.clone();
    let bus = sync_bus.clone();

    // Emit a one-shot LspReady event.
    bus.publish(
        Origin::new("lsp"),
        SyncBusEvent::Editor(EditorEvent::LspReady {
            language: format!("{:?}", language).to_lowercase(),
        }),
    );

    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(LspNotification::PublishDiagnostics(pd)) => {
                    let errors = pd
                        .diagnostics
                        .iter()
                        .filter(|d| d.severity == Some(1))
                        .count() as u32;
                    let warnings = pd
                        .diagnostics
                        .iter()
                        .filter(|d| d.severity == Some(2))
                        .count() as u32;
                    // Push raw diagnostics to the frontend (Monaco needs full ranges).
                    let _ = app.emit("lsp-diagnostics", &pd);
                    // Aggregate counts go through Sync Bus.
                    bus.publish(
                        Origin::new("lsp"),
                        SyncBusEvent::Editor(EditorEvent::DiagnosticsChanged {
                            path: pd.uri.clone(),
                            errors,
                            warnings,
                        }),
                    );
                }
                Ok(LspNotification::ServerExited { reason }) => {
                    bus.publish(
                        Origin::new("lsp"),
                        SyncBusEvent::Editor(EditorEvent::LspFailed {
                            language: "typescript".into(),
                            reason,
                        }),
                    );
                    break;
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    log::warn!("LSP forwarder lagged by {n} events");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn lsp_did_open(
    app: AppHandle,
    project_root: String,
    rel_path: String,
    text: String,
    version: i32,
    manager: State<'_, Arc<LspManager>>,
    registry: State<'_, Arc<LspForwarderRegistry>>,
    sync_bus: State<'_, SyncBus>,
) -> Result<bool, String> {
    let Some(lang) = detect_language(&rel_path) else {
        return Ok(false);
    };
    let root = std::path::Path::new(&project_root);

    ensure_forwarder(
        &app,
        &manager,
        &sync_bus,
        &registry,
        root,
        lang,
    )
    .await?;
    let _ = registry.initialized_once.store(true, Ordering::SeqCst);

    let handle = manager.get_or_spawn(root, lang).await?;
    let uri = file_uri(&project_root, &rel_path);
    let language_id = lang.document_language_id(ext_of(&rel_path));
    handle
        .client
        .did_open(&uri, language_id, version, &text)
        .await?;
    Ok(true)
}

#[tauri::command]
pub async fn lsp_did_change(
    project_root: String,
    rel_path: String,
    text: String,
    version: i32,
    manager: State<'_, Arc<LspManager>>,
) -> Result<bool, String> {
    let Some(lang) = detect_language(&rel_path) else {
        return Ok(false);
    };
    let root = std::path::Path::new(&project_root);
    let handle = manager.get_or_spawn(root, lang).await?;
    let uri = file_uri(&project_root, &rel_path);
    handle.client.did_change_full(&uri, version, &text).await?;
    Ok(true)
}

#[tauri::command]
pub async fn lsp_did_close(
    project_root: String,
    rel_path: String,
    manager: State<'_, Arc<LspManager>>,
) -> Result<bool, String> {
    let Some(lang) = detect_language(&rel_path) else {
        return Ok(false);
    };
    let root = std::path::Path::new(&project_root);
    let handle = manager.get_or_spawn(root, lang).await?;
    let uri = file_uri(&project_root, &rel_path);
    handle.client.did_close(&uri).await?;
    Ok(true)
}

#[tauri::command]
pub async fn lsp_completion(
    project_root: String,
    rel_path: String,
    line: u32,
    character: u32,
    manager: State<'_, Arc<LspManager>>,
) -> Result<Vec<CompletionItem>, String> {
    let Some(lang) = detect_language(&rel_path) else {
        return Ok(vec![]);
    };
    let root = std::path::Path::new(&project_root);
    let handle = manager.get_or_spawn(root, lang).await?;
    let uri = file_uri(&project_root, &rel_path);
    handle
        .client
        .completion(&uri, Position { line, character })
        .await
}

#[tauri::command]
pub async fn lsp_hover(
    project_root: String,
    rel_path: String,
    line: u32,
    character: u32,
    manager: State<'_, Arc<LspManager>>,
) -> Result<Option<Hover>, String> {
    let Some(lang) = detect_language(&rel_path) else {
        return Ok(None);
    };
    let root = std::path::Path::new(&project_root);
    let handle = manager.get_or_spawn(root, lang).await?;
    let uri = file_uri(&project_root, &rel_path);
    handle
        .client
        .hover(&uri, Position { line, character })
        .await
}

#[tauri::command]
pub async fn lsp_definition(
    project_root: String,
    rel_path: String,
    line: u32,
    character: u32,
    manager: State<'_, Arc<LspManager>>,
) -> Result<Vec<Location>, String> {
    let Some(lang) = detect_language(&rel_path) else {
        return Ok(vec![]);
    };
    let root = std::path::Path::new(&project_root);
    let handle = manager.get_or_spawn(root, lang).await?;
    let uri = file_uri(&project_root, &rel_path);
    handle
        .client
        .definition(&uri, Position { line, character })
        .await
}

#[tauri::command]
pub async fn lsp_references(
    project_root: String,
    rel_path: String,
    line: u32,
    character: u32,
    include_declaration: Option<bool>,
    manager: State<'_, Arc<LspManager>>,
) -> Result<Vec<Location>, String> {
    let Some(lang) = detect_language(&rel_path) else {
        return Ok(vec![]);
    };
    let root = std::path::Path::new(&project_root);
    let handle = manager.get_or_spawn(root, lang).await?;
    let uri = file_uri(&project_root, &rel_path);
    handle
        .client
        .references(
            &uri,
            Position { line, character },
            include_declaration.unwrap_or(false),
        )
        .await
}
