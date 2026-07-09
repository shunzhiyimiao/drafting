//! Tauri commands for Sketch (Rev 4, A4 — text-as-truth).
//!
//! The text is the document: the frontend reads/saves `.sketch` TEXT and
//! parses it itself with sketch-core; Rust stores bytes and keeps the
//! derived index. Where Rust needs structure (index entries, a fresh
//! document's canonical markup) it asks the codegen-server — the dialect's
//! single implementation — over the existing RPC.
//!
//! Saving publishes `FileSaved` itself — the §8 seam: sketch writes don't
//! ride `editor_write_file`, and an event type without a publisher is a
//! dead wire. That keeps sketch edits on the S3–S6 stale/drift machinery
//! and the debounced regeneration pipeline.

use std::path::Path;

use tauri::State;

use crate::codegen_proxy::CodegenProxy;
use crate::sync_bus::events::{EditorEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;

use super::index::{self, SketchIndex};
use super::storage;
use super::types::{SketchMeta, SketchScanReport};

const ORIGIN_SKETCH: &str = "sketch";

fn publish_saved(bus: &SyncBus, rel: &str) {
    bus.publish(
        Origin::new(ORIGIN_SKETCH),
        SyncBusEvent::Editor(EditorEvent::FileSaved { path: rel.to_string() }),
    );
}

/// Entity metadata via the dialect's single parser (codegen-server RPC).
pub async fn scan(proxy: &CodegenProxy, root: &str) -> Result<SketchScanReport, String> {
    let value = proxy
        .call("scanSketches", serde_json::json!({ "projectRoot": root }))
        .await?;
    serde_json::from_value(value).map_err(|e| format!("scanSketches 结果解析失败: {e}"))
}

/// Scan + rebuild the derived index. Scan failures are logged (loud, not
/// fatal — an unparsable file degrades to absence until fixed).
pub async fn refresh_index(proxy: &CodegenProxy, root: &str) -> Result<SketchIndex, String> {
    let report = scan(proxy, root).await?;
    for f in &report.failed {
        log::warn!("sketch scan: {} 未纳入索引: {}", f.file, f.reason);
    }
    index::rebuild_from_entries(Path::new(root), &report.entries)
}

#[tauri::command]
pub async fn sketch_list_meta(
    project_root: String,
    proxy: State<'_, CodegenProxy>,
) -> Result<Vec<SketchMeta>, String> {
    let report = scan(&proxy, &project_root).await?;
    // Opportunistic: a listing is a fresh scan — persist it as the index.
    if let Err(e) = index::rebuild_from_entries(Path::new(&project_root), &report.entries) {
        log::warn!("sketch index rebuild failed: {e}");
    }
    Ok(report.entries)
}

#[tauri::command]
pub async fn sketch_read(project_root: String, file: String) -> Result<String, String> {
    storage::read_text(Path::new(&project_root), &file)
}

#[tauri::command]
pub async fn sketch_save_text(
    project_root: String,
    file: String,
    text: String,
    sync_bus: State<'_, SyncBus>,
    proxy: State<'_, CodegenProxy>,
) -> Result<(), String> {
    storage::write_text(Path::new(&project_root), &file, &text)?;
    publish_saved(&sync_bus, &file);
    if let Err(e) = refresh_index(&proxy, &project_root).await {
        log::warn!("sketch index refresh after save failed (cache stays stale): {e}");
    }
    Ok(())
}

#[tauri::command]
pub async fn sketch_create(
    project_root: String,
    name: String,
    blueprint_ref: Option<String>,
    sync_bus: State<'_, SyncBus>,
    proxy: State<'_, CodegenProxy>,
) -> Result<SketchMeta, String> {
    let root = Path::new(&project_root);
    let sketch_id = ulid::Ulid::new().to_string();
    let value = proxy
        .call(
            "printNewSketch",
            serde_json::json!({
                "sketchId": sketch_id,
                "name": name,
                "blueprintRef": blueprint_ref,
            }),
        )
        .await?;
    let markup = value
        .get("markup")
        .and_then(|m| m.as_str())
        .ok_or("printNewSketch 未返回 markup")?
        .to_string();

    let file = storage::fresh_file_for(root, &name);
    storage::write_text(root, &file, &markup)?;
    publish_saved(&sync_bus, &file);
    if let Err(e) = refresh_index(&proxy, &project_root).await {
        log::warn!("sketch index refresh after create failed: {e}");
    }
    Ok(SketchMeta {
        file,
        id: sketch_id,
        name,
        blueprint_ref,
    })
}

#[tauri::command]
pub async fn sketch_delete(
    project_root: String,
    sketch_id: String,
    proxy: State<'_, CodegenProxy>,
) -> Result<(), String> {
    let root = Path::new(&project_root);
    // Resolve id → file via the cache; fall back to a fresh scan.
    let file = match index::read(root).and_then(|i| i.id_to_file.get(&sketch_id).cloned()) {
        Some(f) => f,
        None => scan(&proxy, &project_root)
            .await?
            .entries
            .into_iter()
            .find(|m| m.id == sketch_id)
            .map(|m| m.file)
            .ok_or_else(|| format!("sketch {sketch_id} not found"))?,
    };
    storage::delete(root, &file)?;
    if let Err(e) = refresh_index(&proxy, &project_root).await {
        log::warn!("sketch index refresh after delete failed: {e}");
    }
    Ok(())
}

#[tauri::command]
pub async fn sketch_rebuild_index(
    project_root: String,
    proxy: State<'_, CodegenProxy>,
) -> Result<SketchIndex, String> {
    refresh_index(&proxy, &project_root).await
}
