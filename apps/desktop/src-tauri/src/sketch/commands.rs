//! Tauri commands for Sketch. Saving publishes `FileSaved` itself — the §8
//! seam: sketch writes don't ride `editor_write_file`, and an event type
//! without a publisher is a dead wire (the S2 lesson). That plugs sketch
//! edits into the existing S3–S6 stale/drift machinery the moment criteria
//! bind to sketch files.

use std::path::Path;

use tauri::State;

use crate::sync_bus::events::{EditorEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;

use super::index::{self, SketchIndex};
use super::storage;
use super::types::Sketch;

const ORIGIN_SKETCH: &str = "sketch";

fn publish_saved(bus: &SyncBus, root: &Path, path: &Path) {
    let rel = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();
    bus.publish(
        Origin::new(ORIGIN_SKETCH),
        SyncBusEvent::Editor(EditorEvent::FileSaved { path: rel }),
    );
}

#[tauri::command]
pub async fn sketch_list(project_root: String) -> Result<Vec<Sketch>, String> {
    Ok(storage::list(Path::new(&project_root))
        .into_iter()
        .map(|(_, s)| s)
        .collect())
}

#[tauri::command]
pub async fn sketch_get(project_root: String, sketch_id: String) -> Result<Sketch, String> {
    storage::find_by_id(Path::new(&project_root), &sketch_id)
        .map(|(_, s)| s)
        .ok_or_else(|| format!("sketch {sketch_id} not found"))
}

#[tauri::command]
pub async fn sketch_create(
    project_root: String,
    name: String,
    blueprint_ref: Option<String>,
    sync_bus: State<'_, SyncBus>,
) -> Result<Sketch, String> {
    let root = Path::new(&project_root);
    let (path, sketch) = storage::create(root, &name, blueprint_ref)?;
    index::rebuild(root)?;
    publish_saved(&sync_bus, root, &path);
    Ok(sketch)
}

#[tauri::command]
pub async fn sketch_save(
    project_root: String,
    sketch: Sketch,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    let root = Path::new(&project_root);
    let (path, _) = storage::find_by_id(root, &sketch.id)
        .ok_or_else(|| format!("sketch {} not found — create it first", sketch.id))?;
    let mut sketch = sketch;
    // Saving is also a healing point: nodes added by the editor without ids
    // (shouldn't happen, but belt-and-braces) get minted before persisting.
    storage::heal(&mut sketch);
    storage::save(&path, &sketch)?;
    index::rebuild(root)?;
    publish_saved(&sync_bus, root, &path);
    Ok(())
}

#[tauri::command]
pub async fn sketch_rebuild_index(project_root: String) -> Result<SketchIndex, String> {
    index::rebuild(Path::new(&project_root))
}
