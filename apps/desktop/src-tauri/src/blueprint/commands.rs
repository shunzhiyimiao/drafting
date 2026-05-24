use std::sync::Arc;

use tauri::State;

use crate::ai_provider::AiRunner;
use crate::blueprint::types::*;
use crate::blueprint::{check, parser, storage, templates, validation};
use crate::sync_bus::events::{BlueprintEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;

const ORIGIN: &str = "blueprint";

fn bp_origin() -> Origin {
    Origin::new(ORIGIN)
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn blueprint_init(project_root: String) -> Result<(), String> {
    let root = std::path::Path::new(&project_root);
    storage::init_blueprint_dirs(root).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn blueprint_list(project_root: String) -> Result<BlueprintIndex, String> {
    let root = std::path::Path::new(&project_root);
    storage::load_index(root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn blueprint_get(project_root: String, blueprint_id: String) -> Result<Blueprint, String> {
    let root = std::path::Path::new(&project_root);
    storage::load_blueprint(root, &blueprint_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn blueprint_get_raw(project_root: String, blueprint_id: String) -> Result<String, String> {
    let root = std::path::Path::new(&project_root);
    storage::load_blueprint_raw(root, &blueprint_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn blueprint_create_from_template(
    project_root: String,
    template_name: String,
    variables: serde_json::Value,
    sync_bus: State<'_, SyncBus>,
) -> Result<Blueprint, String> {
    let root = std::path::Path::new(&project_root);
    let template_content =
        templates::get_template_content(&template_name).map_err(|e| e.to_string())?;

    // Ensure we have a blueprintId
    let mut vars = variables.clone();
    if let serde_json::Value::Object(ref mut map) = vars {
        if !map.contains_key("blueprintId") {
            map.insert("blueprintId".to_string(), serde_json::Value::String(new_ulid()));
        }
        if !map.contains_key("displayName") {
            map.insert(
                "displayName".to_string(),
                serde_json::Value::String("New Blueprint".to_string()),
            );
        }
        if !map.contains_key("targetFile") {
            map.insert(
                "targetFile".to_string(),
                serde_json::Value::String("path/to/file".to_string()),
            );
        }
    }

    let rendered = templates::render_template(template_content, &vars);
    let bp = parser::parse(&rendered).map_err(|e| e.to_string())?;
    storage::save_blueprint(root, &bp).map_err(|e| e.to_string())?;

    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::FeatureCreated {
            feature_id: bp.front_matter.blueprint_id.clone(),
        }),
    );
    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::IndexChanged),
    );

    Ok(bp)
}

#[tauri::command]
pub fn blueprint_create(
    project_root: String,
    raw_md: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<Blueprint, String> {
    let root = std::path::Path::new(&project_root);
    let mut bp = parser::parse(&raw_md).map_err(|e| e.to_string())?;
    // Auto-assign a ULID if the input lacks one (the AI draft path doesn't
    // emit blueprintId, and we don't want it picked from the prompt either).
    if bp.front_matter.blueprint_id.is_empty() {
        bp.front_matter.blueprint_id = crate::blueprint::types::new_ulid();
    }
    storage::save_blueprint(root, &bp).map_err(|e| e.to_string())?;

    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::FeatureCreated {
            feature_id: bp.front_matter.blueprint_id.clone(),
        }),
    );
    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::IndexChanged),
    );

    Ok(bp)
}

#[tauri::command]
pub fn blueprint_update(
    project_root: String,
    blueprint_id: String,
    raw_md: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<Blueprint, String> {
    let root = std::path::Path::new(&project_root);
    let bp = parser::parse(&raw_md).map_err(|e| e.to_string())?;

    // Ensure ID matches
    if bp.front_matter.blueprint_id != blueprint_id {
        return Err(format!(
            "Blueprint ID mismatch: expected {}, got {}",
            blueprint_id, bp.front_matter.blueprint_id
        ));
    }

    storage::save_blueprint(root, &bp).map_err(|e| e.to_string())?;

    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::FeatureUpdated {
            feature_id: bp.front_matter.blueprint_id.clone(),
        }),
    );
    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::IndexChanged),
    );

    Ok(bp)
}

#[tauri::command]
pub fn blueprint_update_structured(
    project_root: String,
    blueprint_id: String,
    front_matter: BlueprintFrontMatter,
    sections: Vec<BlueprintSection>,
    sync_bus: State<'_, SyncBus>,
) -> Result<Blueprint, String> {
    let root = std::path::Path::new(&project_root);

    if front_matter.blueprint_id != blueprint_id {
        return Err("Blueprint ID mismatch".to_string());
    }

    let bp = Blueprint {
        front_matter,
        sections,
        raw_md: String::new(),
    };

    // Serialize to ensure round-trip validity, then store with the updated raw_md
    let serialized = parser::serialize(&bp).map_err(|e| e.to_string())?;
    let final_bp = parser::parse(&serialized).map_err(|e| e.to_string())?;

    storage::save_blueprint(root, &final_bp).map_err(|e| e.to_string())?;

    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::FeatureUpdated {
            feature_id: blueprint_id.clone(),
        }),
    );
    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::IndexChanged),
    );

    Ok(final_bp)
}

#[tauri::command]
pub fn blueprint_delete(
    project_root: String,
    blueprint_id: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    let root = std::path::Path::new(&project_root);
    storage::delete_blueprint(root, &blueprint_id).map_err(|e| e.to_string())?;

    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::IndexChanged),
    );

    Ok(())
}

#[tauri::command]
pub fn blueprint_toggle_criterion(
    project_root: String,
    blueprint_id: String,
    criterion_index: usize,
    checked: bool,
    sync_bus: State<'_, SyncBus>,
) -> Result<Blueprint, String> {
    let root = std::path::Path::new(&project_root);
    let mut bp = storage::load_blueprint(root, &blueprint_id).map_err(|e| e.to_string())?;

    let ac_section = bp
        .sections
        .iter_mut()
        .find(|s| s.kind.is_acceptance_criteria())
        .ok_or("No Acceptance Criteria section")?;

    if criterion_index >= ac_section.criteria.len() {
        return Err(format!(
            "Criterion index {} out of bounds",
            criterion_index
        ));
    }

    ac_section.criteria[criterion_index].checked = checked;
    storage::save_blueprint(root, &bp).map_err(|e| e.to_string())?;

    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::FeatureUpdated {
            feature_id: blueprint_id.clone(),
        }),
    );
    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::IndexChanged),
    );

    Ok(bp)
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn blueprint_list_templates() -> Result<Vec<TemplateInfo>, String> {
    Ok(templates::list_templates())
}

#[tauri::command]
pub fn blueprint_preview_template(
    template_name: String,
    variables: serde_json::Value,
) -> Result<String, String> {
    let content = templates::get_template_content(&template_name).map_err(|e| e.to_string())?;
    Ok(templates::render_template(content, &variables))
}

// ---------------------------------------------------------------------------
// Check framework
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn blueprint_lightweight_check(
    project_root: String,
    blueprint_id: String,
) -> Result<ValidationResult, String> {
    let root = std::path::Path::new(&project_root);
    let bp = storage::load_blueprint(root, &blueprint_id).map_err(|e| e.to_string())?;
    Ok(validation::validate_blueprint(&bp))
}

#[tauri::command]
pub async fn blueprint_request_check(
    project_root: String,
    blueprint_id: String,
    sync_bus: State<'_, SyncBus>,
    ai_runner: State<'_, Arc<AiRunner>>,
) -> Result<(), String> {
    // Validate that the blueprint exists before kicking off the AI call.
    let root = std::path::Path::new(&project_root).to_path_buf();
    let _ = storage::load_blueprint(&root, &blueprint_id).map_err(|e| e.to_string())?;

    let bus = sync_bus.inner().clone();
    let runner = ai_runner.inner().clone();

    match check::run_check(root, blueprint_id.clone(), runner, bus.clone()).await {
        Ok(()) => Ok(()),
        Err(e) => {
            log::error!("blueprint_request_check failed for {blueprint_id}: {e}");
            // Surface as a failed check so the UI can react instead of silently hanging.
            bus.publish(
                bp_origin(),
                SyncBusEvent::Blueprint(BlueprintEvent::CheckCompleted {
                    feature_id: blueprint_id,
                    passed: false,
                }),
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub fn blueprint_get_check_results(
    project_root: String,
    blueprint_id: String,
) -> Result<Vec<CheckResult>, String> {
    let root = std::path::Path::new(&project_root);
    storage::load_check_results(root, &blueprint_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn blueprint_rebuild_index(
    project_root: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<BlueprintIndex, String> {
    let root = std::path::Path::new(&project_root);
    let index = storage::rebuild_index(root).map_err(|e| e.to_string())?;

    sync_bus.publish(
        bp_origin(),
        SyncBusEvent::Blueprint(BlueprintEvent::IndexChanged),
    );

    Ok(index)
}
