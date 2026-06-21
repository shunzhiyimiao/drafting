mod sync_bus;
mod patchboard;
mod blueprint;
mod editor;
mod atlas;
mod git;
mod terminal;
mod lsp;
mod codegen_proxy;
mod ai_provider;

use std::sync::Arc;

use tauri::Manager;
use sync_bus::SyncBus;
use codegen_proxy::CodegenProxy;
use terminal::manager::TerminalManager;
use terminal::history::HistoryStore;
use lsp::LspManager;
use lsp::commands::LspForwarderRegistry;
use ai_provider::AiRunner;
use editor::search_advanced::SearchRegistry;
use blueprint::estimator::Estimator;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Persisted-workspace pointer. Lives in `~/.drafting/workspace.json` so it
/// survives across sessions and `pnpm tauri dev` rebuilds.
fn workspace_pref_path() -> std::path::PathBuf {
    dirs_home()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".drafting")
        .join("workspace.json")
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(std::path::PathBuf::from)
}

fn read_persisted_workspace() -> Option<String> {
    let path = workspace_pref_path();
    let data = std::fs::read_to_string(&path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&data).ok()?;
    let current = v.get("current")?.as_str()?.to_string();
    // Only return it if the directory still exists.
    if std::path::Path::new(&current).is_dir() {
        Some(current)
    } else {
        None
    }
}

fn write_persisted_workspace(path: &str) -> Result<(), String> {
    let pref_path = workspace_pref_path();
    if let Some(parent) = pref_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Preserve a small recent-list while we're here (max 10 entries).
    let mut recent: Vec<String> = std::fs::read_to_string(&pref_path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| {
            v.get("recent").and_then(|r| {
                r.as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(String::from))
                        .collect()
                })
            })
        })
        .unwrap_or_default();
    recent.retain(|p| p != path);
    recent.insert(0, path.to_string());
    recent.truncate(10);

    let doc = serde_json::json!({
        "current": path,
        "recent": recent,
    });
    std::fs::write(&pref_path, serde_json::to_string_pretty(&doc).unwrap())
        .map_err(|e| e.to_string())
}

/// Resolve the project root the app should operate on. Priority:
///   1. Persisted workspace from `~/.drafting/workspace.json`
///   2. Climb from process cwd looking for a CLAUDE.md / pnpm-workspace.yaml / .git marker
///   3. Raw cwd
#[tauri::command]
fn app_get_cwd() -> String {
    if let Some(persisted) = read_persisted_workspace() {
        return persisted;
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let mut cursor: Option<&std::path::Path> = Some(cwd.as_path());
    while let Some(dir) = cursor {
        let has_marker = dir.join("CLAUDE.md").exists()
            || dir.join("pnpm-workspace.yaml").exists()
            || dir.join(".git").exists();
        if has_marker {
            return dir.to_string_lossy().to_string();
        }
        cursor = dir.parent();
    }
    cwd.to_string_lossy().to_string()
}

/// Switch the active workspace. Validates that the path exists and is a
/// directory; persists it; returns the canonical absolute path.
/// The frontend is expected to reload after a successful call so all stores
/// re-initialize against the new root.
#[tauri::command]
fn app_set_workspace(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    if !p.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }
    let canonical = p
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path: {e}"))?;
    let canonical_str = canonical.to_string_lossy().to_string();
    write_persisted_workspace(&canonical_str)?;
    Ok(canonical_str)
}

/// List recently-opened workspaces (most-recent first, max 10).
#[tauri::command]
fn app_get_recent_workspaces() -> Vec<String> {
    let path = workspace_pref_path();
    let Ok(data) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&data) else {
        return Vec::new();
    };
    v.get("recent")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .filter(|p| std::path::Path::new(p).is_dir())
                .collect()
        })
        .unwrap_or_default()
}

/// S3: query the read-only estimator for a blueprint's current per-criterion
/// estimates. Lazily fills from persisted check results on a cold cache (so
/// "queryable at any time" holds even before any event), then returns the
/// in-memory view (which carries runtime `stale` flags from file changes).
#[tauri::command]
fn blueprint_get_estimates(
    project_root: String,
    blueprint_id: String,
    estimator: tauri::State<'_, Arc<Estimator>>,
) -> Result<Vec<blueprint::estimator::Estimate>, String> {
    let mut est = estimator.estimates_for(&blueprint_id);
    if est.is_empty() {
        estimator.refresh_from_checks(std::path::Path::new(&project_root), &blueprint_id);
        est = estimator.estimates_for(&blueprint_id);
    }
    Ok(est)
}

#[tauri::command]
async fn patchboard_generate_code(
    project_root: String,
    canvas_id: String,
    codegen: tauri::State<'_, CodegenProxy>,
    sync_bus: tauri::State<'_, SyncBus>,
) -> Result<patchboard::types::CodeGenResult, String> {
    use patchboard::{canvas, registry, types::*};
    use sync_bus::events::{PatchboardEvent, SyncBusEvent};
    use sync_bus::types::Origin;

    let root = std::path::Path::new(&project_root);

    // Load canvas
    let canvas_data = canvas::load_canvas(root, &canvas_id).map_err(|e| e.to_string())?;

    // Load all sockets referenced by the canvas
    let reg = registry::load_registry(root).map_err(|e| e.to_string())?;
    let mut sockets = Vec::new();
    for entry in &reg.sockets {
        if let Ok(socket) = registry::load_socket(root, &entry.id) {
            sockets.push(socket);
        }
    }

    // Load config
    let config_path = root.join(".patchboard/config.json");
    let config: PatchboardConfig = if config_path.exists() {
        let data = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| e.to_string())?
    } else {
        PatchboardConfig::default()
    };

    // Type Bridge: refuse to generate if any wire is incompatible.
    let bridges = patchboard::type_bridge::classify_wires(&canvas_data, &sockets);
    let blocking: Vec<_> = bridges.iter().filter(|b| b.blocking).collect();
    if !blocking.is_empty() {
        let msgs: Vec<String> = blocking
            .iter()
            .map(|b| format!("{}: {}", b.wire_id, b.reason))
            .collect();
        return Ok(CodeGenResult {
            success: false,
            files: vec![],
            errors: msgs,
        });
    }

    codegen.set_project_root(&project_root).await;

    let mut all_files = Vec::new();

    // 0. Scaffold workspace files (root package.json / pnpm-workspace.yaml /
    //    tsconfig with paths aliases / packages/*/package.json) so the
    //    generated @scope packages resolve in the editor. Skip-if-exists:
    //    never overwrites user files.
    let result = codegen
        .call(
            "generateScaffolding",
            serde_json::json!({
                "projectRoot": project_root,
                "scopeName": config.scope_name,
            }),
        )
        .await?;
    if let Some(files) = result.get("files").and_then(|f| f.as_array()) {
        for f in files {
            if let Some(s) = f.as_str() {
                all_files.push(s.to_string());
            }
        }
    }

    // 1. Generate sockets
    let sockets_json = serde_json::to_value(&sockets).map_err(|e| e.to_string())?;
    let result = codegen
        .call(
            "generateSockets",
            serde_json::json!({
                "projectRoot": project_root,
                "sockets": sockets_json,
                "scopeName": config.scope_name,
            }),
        )
        .await?;
    if let Some(files) = result.get("files").and_then(|f| f.as_array()) {
        for f in files {
            if let Some(s) = f.as_str() {
                all_files.push(s.to_string());
            }
        }
    }

    // 2. Generate adapter skeletons
    for adapter in &canvas_data.adapters {
        let adapter_json = serde_json::to_value(adapter).map_err(|e| e.to_string())?;
        let result = codegen
            .call(
                "generateAdapterSkeleton",
                serde_json::json!({
                    "projectRoot": project_root,
                    "adapter": adapter_json,
                    "sockets": sockets_json,
                    "scopeName": config.scope_name,
                }),
            )
            .await?;
        if let Some(files) = result.get("files").and_then(|f| f.as_array()) {
            for f in files {
                if let Some(s) = f.as_str() {
                    all_files.push(s.to_string());
                }
            }
        }
    }

    // 3. Generate wiring
    let canvas_json = serde_json::to_value(&canvas_data).map_err(|e| e.to_string())?;
    let bridges_json = serde_json::to_value(&bridges).map_err(|e| e.to_string())?;
    let result = codegen
        .call(
            "generateWiring",
            serde_json::json!({
                "projectRoot": project_root,
                "canvas": canvas_json,
                "sockets": sockets_json,
                "scopeName": config.scope_name,
                "bridges": bridges_json,
            }),
        )
        .await?;
    if let Some(files) = result.get("files").and_then(|f| f.as_array()) {
        for f in files {
            if let Some(s) = f.as_str() {
                all_files.push(s.to_string());
            }
        }
    }

    // Publish event
    sync_bus.publish(
        Origin::new("patchboard"),
        SyncBusEvent::Patchboard(PatchboardEvent::CodeGenerated {
            canvas_id: canvas_id.clone(),
            files: all_files.clone(),
        }),
    );

    Ok(CodeGenResult {
        success: true,
        files: all_files,
        errors: vec![],
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let sync_bus = SyncBus::new();
    let codegen_proxy = CodegenProxy::new();
    let terminal_manager = TerminalManager::new();
    let terminal_history = HistoryStore::new();
    let lsp_manager: Arc<LspManager> = Arc::new(LspManager::new());
    let lsp_forwarder_registry: Arc<LspForwarderRegistry> = Arc::new(LspForwarderRegistry::new());
    let ai_runner: Arc<AiRunner> = Arc::new(AiRunner::new());
    let search_registry: Arc<SearchRegistry> = Arc::new(SearchRegistry::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(sync_bus)
        .manage(codegen_proxy)
        .manage(terminal_manager)
        .manage(terminal_history)
        .manage(lsp_manager)
        .manage(lsp_forwarder_registry)
        .manage(ai_runner)
        .manage(search_registry)
        .manage(Arc::new(Estimator::new()))
        .setup(|app| {
            let handle = app.handle().clone();
            let bus = app.state::<SyncBus>();
            sync_bus::bridge::start_bridge(handle, &bus);
            log::info!("SyncBus initialized and bridge started");

            // Give the codegen proxy the app handle so it can locate the bundled
            // codegen-server.cjs from the resource dir in release builds.
            app.state::<CodegenProxy>().set_app_handle(app.handle().clone());

            // S3: the read-only estimator subscribes to the bus. It only updates
            // its own in-memory state — it never publishes or triggers an action.
            let estimator = app.state::<Arc<Estimator>>().inner().clone();
            let mut est_rx = bus.subscribe();
            tauri::async_runtime::spawn(async move {
                use sync_bus::events::{BlueprintEvent, EditorEvent, SyncBusEvent};
                loop {
                    match est_rx.recv().await {
                        Ok(env) => match env.payload {
                            SyncBusEvent::Blueprint(BlueprintEvent::CheckCompleted {
                                feature_id,
                                ..
                            }) => {
                                estimator.refresh_from_checks(
                                    std::path::Path::new(&app_get_cwd()),
                                    &feature_id,
                                );
                            }
                            SyncBusEvent::Editor(EditorEvent::FileSaved { path }) => {
                                estimator.mark_stale_for_file(
                                    std::path::Path::new(&app_get_cwd()),
                                    &path,
                                );
                            }
                            _ => {}
                        },
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                        Err(_) => {} // lagged — keep consuming
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            app_get_cwd,
            app_set_workspace,
            app_get_recent_workspaces,
            patchboard::commands::patchboard_init,
            patchboard::commands::patchboard_list_sockets,
            patchboard::commands::patchboard_get_socket,
            patchboard::commands::patchboard_create_socket,
            patchboard::commands::patchboard_update_socket,
            patchboard::commands::patchboard_delete_socket,
            patchboard::commands::patchboard_list_canvases,
            patchboard::commands::patchboard_get_canvas,
            patchboard::commands::patchboard_create_canvas,
            patchboard::commands::patchboard_save_canvas,
            patchboard::commands::patchboard_delete_canvas,
            patchboard::commands::patchboard_validate_canvas,
            patchboard::commands::patchboard_classify_wires,
            patchboard::commands::patchboard_existing_generated_output,
            patchboard_generate_code,
            blueprint::commands::blueprint_init,
            blueprint::commands::blueprint_list,
            blueprint::commands::blueprint_get,
            blueprint::commands::blueprint_get_raw,
            blueprint::commands::blueprint_create,
            blueprint::commands::blueprint_create_from_template,
            blueprint::commands::blueprint_update,
            blueprint::commands::blueprint_update_structured,
            blueprint::commands::blueprint_delete,
            blueprint::commands::blueprint_toggle_criterion,
            blueprint::commands::blueprint_list_templates,
            blueprint::commands::blueprint_preview_template,
            blueprint::commands::blueprint_lightweight_check,
            blueprint::commands::blueprint_request_check,
            blueprint::commands::blueprint_get_check_results,
            blueprint::commands::blueprint_rebuild_index,
            blueprint_get_estimates,
            editor::commands::editor_list_dir,
            editor::commands::editor_read_file,
            editor::commands::editor_write_file,
            editor::commands::editor_search,
            editor::commands::editor_search_advanced,
            editor::commands::editor_cancel_search,
            editor::commands::editor_get_identity,
            atlas::commands::atlas_parse_file,
            terminal::commands::terminal_create_session,
            terminal::commands::terminal_write,
            terminal::commands::terminal_resize,
            terminal::commands::terminal_close,
            terminal::commands::terminal_list,
            terminal::commands::terminal_record_command,
            terminal::commands::terminal_history_list,
            terminal::commands::terminal_history_search,
            git::commands::git_status,
            git::commands::git_branches,
            git::commands::git_log,
            git::commands::git_diff_file,
            git::commands::git_staged_diff_patch,
            git::commands::git_stage_file,
            git::commands::git_unstage_file,
            git::commands::git_commit,
            git::commands::git_checkout_branch,
            git::commands::git_create_branch,
            git::commands::git_fetch,
            git::commands::git_pull,
            git::commands::git_push,
            ai_provider::commands::ai_get_config,
            ai_provider::commands::ai_save_config,
            ai_provider::commands::ai_create_profile,
            ai_provider::commands::ai_update_profile,
            ai_provider::commands::ai_delete_profile,
            ai_provider::commands::ai_clone_profile,
            ai_provider::commands::ai_set_profile_api_key,
            ai_provider::commands::ai_clear_profile_api_key,
            ai_provider::commands::ai_list_presets,
            ai_provider::commands::ai_get_task_route,
            ai_provider::commands::ai_set_task_route,
            ai_provider::commands::ai_toggle_global,
            ai_provider::commands::ai_check_profile_health,
            ai_provider::commands::ai_check_draft_health,
            ai_provider::commands::ai_import_from_claude_code,
            ai_provider::commands::ai_stream_chat,
            ai_provider::commands::ai_cancel_stream,
            lsp::commands::lsp_did_open,
            lsp::commands::lsp_did_change,
            lsp::commands::lsp_did_close,
            lsp::commands::lsp_completion,
            lsp::commands::lsp_hover,
            lsp::commands::lsp_definition,
            lsp::commands::lsp_references,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
