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

use tauri::Manager;
use sync_bus::SyncBus;
use codegen_proxy::CodegenProxy;
use terminal::manager::TerminalManager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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

    codegen.set_project_root(&project_root).await;

    let mut all_files = Vec::new();

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
    let result = codegen
        .call(
            "generateWiring",
            serde_json::json!({
                "projectRoot": project_root,
                "canvas": canvas_json,
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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(sync_bus)
        .manage(codegen_proxy)
        .manage(terminal_manager)
        .setup(|app| {
            let handle = app.handle().clone();
            let bus = app.state::<SyncBus>();
            sync_bus::bridge::start_bridge(handle, &bus);
            log::info!("SyncBus initialized and bridge started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
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
            editor::commands::editor_list_dir,
            editor::commands::editor_read_file,
            editor::commands::editor_write_file,
            editor::commands::editor_search,
            editor::commands::editor_get_identity,
            atlas::commands::atlas_parse_file,
            terminal::commands::terminal_create_session,
            terminal::commands::terminal_write,
            terminal::commands::terminal_resize,
            terminal::commands::terminal_close,
            terminal::commands::terminal_list,
            git::commands::git_status,
            git::commands::git_branches,
            git::commands::git_log,
            git::commands::git_diff_file,
            git::commands::git_stage_file,
            git::commands::git_unstage_file,
            git::commands::git_commit,
            git::commands::git_checkout_branch,
            git::commands::git_create_branch,
            ai_provider::commands::ai_get_config,
            ai_provider::commands::ai_save_config,
            ai_provider::commands::ai_set_api_key,
            ai_provider::commands::ai_get_task_route,
            ai_provider::commands::ai_set_task_route,
            ai_provider::commands::ai_toggle_global,
            ai_provider::commands::ai_check_provider_health,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
