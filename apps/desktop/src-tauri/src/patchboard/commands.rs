use tauri::State;

use crate::patchboard::error::PatchboardError;
use crate::patchboard::type_bridge::{classify_wires, WireBridge};
use crate::patchboard::types::*;
use crate::patchboard::{canvas, registry, validation};
use crate::sync_bus::events::{PatchboardEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;

const ORIGIN: &str = "patchboard";

fn pb_origin() -> Origin {
    Origin::new(ORIGIN)
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn patchboard_init(project_root: String) -> Result<(), String> {
    let root = std::path::Path::new(&project_root);
    registry::init_registry(root).map_err(|e| e.to_string())?;
    canvas::init_canvases_dir(root).map_err(|e| e.to_string())?;

    // Create config if missing
    let config_path = root.join(".patchboard/config.json");
    if !config_path.exists() {
        let config = PatchboardConfig::default();
        let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(root.join(".patchboard")).map_err(|e| e.to_string())?;
        std::fs::write(&config_path, json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Registry / Socket CRUD
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn patchboard_list_sockets(project_root: String) -> Result<RegistryIndex, String> {
    let root = std::path::Path::new(&project_root);
    registry::load_registry(root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn patchboard_get_socket(
    project_root: String,
    socket_id: String,
) -> Result<SocketDefinition, String> {
    let root = std::path::Path::new(&project_root);
    registry::load_socket(root, &socket_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn patchboard_create_socket(
    project_root: String,
    input: CreateSocketInput,
    sync_bus: State<'_, SyncBus>,
) -> Result<SocketDefinition, String> {
    let root = std::path::Path::new(&project_root);
    let now = now_ms();
    let socket = SocketDefinition {
        id: new_ulid(),
        full_name: input.full_name,
        display_name: input.display_name,
        lifecycle: SocketLifecycle::Draft,
        extends: input.extends,
        methods: input.methods,
        created_at: now,
        updated_at: now,
    };
    registry::save_socket(root, &socket).map_err(|e| e.to_string())?;
    sync_bus.publish(pb_origin(), SyncBusEvent::Patchboard(PatchboardEvent::RegistryChanged));
    Ok(socket)
}

#[tauri::command]
pub fn patchboard_update_socket(
    project_root: String,
    input: UpdateSocketInput,
    sync_bus: State<'_, SyncBus>,
) -> Result<SocketDefinition, String> {
    let root = std::path::Path::new(&project_root);
    let mut socket = registry::load_socket(root, &input.id).map_err(|e| e.to_string())?;

    if let Some(full_name) = input.full_name {
        socket.full_name = full_name;
    }
    if let Some(display_name) = input.display_name {
        socket.display_name = display_name;
    }
    if let Some(lifecycle) = input.lifecycle {
        socket.lifecycle = lifecycle;
    }
    if let Some(extends) = input.extends {
        socket.extends = extends;
    }
    if let Some(methods) = input.methods {
        socket.methods = methods;
    }
    socket.updated_at = now_ms();

    registry::save_socket(root, &socket).map_err(|e| e.to_string())?;
    sync_bus.publish(pb_origin(), SyncBusEvent::Patchboard(PatchboardEvent::RegistryChanged));
    Ok(socket)
}

#[tauri::command]
pub fn patchboard_delete_socket(
    project_root: String,
    socket_id: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    let root = std::path::Path::new(&project_root);
    registry::delete_socket(root, &socket_id).map_err(|e| e.to_string())?;
    sync_bus.publish(pb_origin(), SyncBusEvent::Patchboard(PatchboardEvent::RegistryChanged));
    Ok(())
}

// ---------------------------------------------------------------------------
// Canvas CRUD
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn patchboard_list_canvases(project_root: String) -> Result<Vec<CanvasSummary>, String> {
    let root = std::path::Path::new(&project_root);
    canvas::list_canvases(root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn patchboard_get_canvas(
    project_root: String,
    canvas_id: String,
) -> Result<Canvas, String> {
    let root = std::path::Path::new(&project_root);
    canvas::load_canvas(root, &canvas_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn patchboard_create_canvas(
    project_root: String,
    name: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<Canvas, String> {
    let root = std::path::Path::new(&project_root);
    let now = now_ms();
    let c = Canvas {
        id: new_ulid(),
        name,
        socket_refs: vec![],
        adapters: vec![],
        wires: vec![],
        entry_points: vec![],
        created_at: now,
        updated_at: now,
    };
    canvas::save_canvas(root, &c).map_err(|e| e.to_string())?;
    sync_bus.publish(
        pb_origin(),
        SyncBusEvent::Patchboard(PatchboardEvent::CanvasChanged {
            canvas_id: c.id.clone(),
        }),
    );
    Ok(c)
}

#[tauri::command]
pub fn patchboard_save_canvas(
    project_root: String,
    canvas_data: Canvas,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    let root = std::path::Path::new(&project_root);
    canvas::save_canvas(root, &canvas_data).map_err(|e| e.to_string())?;
    sync_bus.publish(
        pb_origin(),
        SyncBusEvent::Patchboard(PatchboardEvent::CanvasChanged {
            canvas_id: canvas_data.id.clone(),
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn patchboard_delete_canvas(
    project_root: String,
    canvas_id: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    let root = std::path::Path::new(&project_root);
    canvas::delete_canvas(root, &canvas_id).map_err(|e| e.to_string())?;
    sync_bus.publish(
        pb_origin(),
        SyncBusEvent::Patchboard(PatchboardEvent::CanvasChanged {
            canvas_id: canvas_id.clone(),
        }),
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn patchboard_validate_canvas(
    project_root: String,
    canvas_id: String,
) -> Result<ValidationResult, String> {
    let root = std::path::Path::new(&project_root);
    let c = canvas::load_canvas(root, &canvas_id).map_err(|e| e.to_string())?;
    let sockets = load_all_sockets(root);
    Ok(validation::validate_canvas_with_sockets(&c, &sockets))
}

/// Classify every wire on a canvas into a BridgeLevel. The frontend uses this
/// to color wires (green/yellow/red) without needing to re-run full validation.
#[tauri::command]
pub fn patchboard_classify_wires(
    project_root: String,
    canvas_id: String,
) -> Result<Vec<WireBridge>, String> {
    let root = std::path::Path::new(&project_root);
    let c = canvas::load_canvas(root, &canvas_id).map_err(|e| e.to_string())?;
    let sockets = load_all_sockets(root);
    Ok(classify_wires(&c, &sockets))
}

pub(crate) fn load_all_sockets(root: &std::path::Path) -> Vec<SocketDefinition> {
    let reg = match registry::load_registry(root) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    reg.sockets
        .iter()
        .filter_map(|entry| registry::load_socket(root, &entry.id).ok())
        .collect()
}
