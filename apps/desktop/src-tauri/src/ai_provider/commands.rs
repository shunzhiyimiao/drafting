use std::path::Path;

use tauri::State;

use crate::ai_provider::config;
use crate::ai_provider::types::*;
use crate::sync_bus::events::{AiProviderEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;

fn ai_origin() -> Origin {
    Origin::new("ai_provider")
}

#[tauri::command]
pub fn ai_get_config(project_root: String) -> Result<AiConfig, String> {
    Ok(config::load_config(Path::new(&project_root)))
}

#[tauri::command]
pub fn ai_save_config(
    project_root: String,
    config_data: AiConfig,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    config::save_config(Path::new(&project_root), &config_data)?;
    sync_bus.publish(
        ai_origin(),
        SyncBusEvent::AiProvider(AiProviderEvent::TaskRouteChanged {
            task_id: "all".to_string(),
            new_provider: "config".to_string(),
            new_model: "updated".to_string(),
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn ai_set_api_key(
    project_root: String,
    provider_id: ProviderId,
    api_key: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    config::set_api_key(Path::new(&project_root), &provider_id, &api_key)?;

    // Update config to reflect key is set
    let mut cfg = config::load_config(Path::new(&project_root));
    if let Some(provider) = cfg.providers.iter_mut().find(|p| p.id == provider_id) {
        provider.api_key_set = true;
        provider.enabled = true;
    }
    config::save_config(Path::new(&project_root), &cfg)?;

    let pid = format!("{:?}", provider_id);
    sync_bus.publish(
        ai_origin(),
        SyncBusEvent::AiProvider(AiProviderEvent::ProviderAdded {
            provider_id: pid,
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn ai_get_task_route(
    project_root: String,
    task_id: TaskId,
) -> Result<TaskRoute, String> {
    let cfg = config::load_config(Path::new(&project_root));
    cfg.routes
        .iter()
        .find(|r| r.task_id == task_id)
        .cloned()
        .ok_or_else(|| format!("No route for task {:?}", task_id))
}

#[tauri::command]
pub fn ai_set_task_route(
    project_root: String,
    route: TaskRoute,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    let mut cfg = config::load_config(Path::new(&project_root));
    if let Some(existing) = cfg.routes.iter_mut().find(|r| r.task_id == route.task_id) {
        *existing = route.clone();
    } else {
        cfg.routes.push(route.clone());
    }
    config::save_config(Path::new(&project_root), &cfg)?;

    sync_bus.publish(
        ai_origin(),
        SyncBusEvent::AiProvider(AiProviderEvent::TaskRouteChanged {
            task_id: format!("{:?}", route.task_id),
            new_provider: format!("{:?}", route.provider_id),
            new_model: route.model,
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn ai_toggle_global(
    project_root: String,
    enabled: bool,
) -> Result<(), String> {
    let mut cfg = config::load_config(Path::new(&project_root));
    cfg.global_enabled = enabled;
    config::save_config(Path::new(&project_root), &cfg)?;
    Ok(())
}

#[tauri::command]
pub fn ai_check_provider_health(
    project_root: String,
    provider_id: ProviderId,
) -> Result<bool, String> {
    // v1: just check if key is available
    let has_key = config::get_api_key(Path::new(&project_root), &provider_id).is_some();
    Ok(has_key)
}
