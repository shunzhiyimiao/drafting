use std::path::Path;
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::editor::fs_ops;
use crate::editor::identity;
use crate::editor::search;
use crate::editor::search_advanced::{run_advanced_search, SearchRegistry};
use crate::editor::types::*;

#[tauri::command]
pub fn editor_list_dir(
    project_root: String,
    rel_path: String,
) -> Result<Vec<DirEntry>, String> {
    let root = Path::new(&project_root);
    fs_ops::list_dir(root, &rel_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn editor_read_file(
    project_root: String,
    rel_path: String,
) -> Result<FileContent, String> {
    let root = Path::new(&project_root);
    let (content, size) = fs_ops::read_file(root, &rel_path).map_err(|e| e.to_string())?;
    let identity = identity::compute_identity(root, &rel_path, &content);
    Ok(FileContent {
        path: rel_path,
        content,
        identity,
        size,
    })
}

#[tauri::command]
pub fn editor_write_file(
    project_root: String,
    rel_path: String,
    content: String,
) -> Result<(), String> {
    let root = Path::new(&project_root);
    // Reject write if file is tool-owned
    let current = fs_ops::read_file(root, &rel_path).ok();
    if let Some((cur_content, _)) = &current {
        let identity = identity::compute_identity(root, &rel_path, cur_content);
        if identity.readonly {
            return Err(format!(
                "File '{}' is tool-owned and read-only. Edit in Patchboard instead.",
                rel_path
            ));
        }
    }
    fs_ops::write_file(root, &rel_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn editor_search(
    project_root: String,
    query: String,
    case_sensitive: bool,
) -> Result<SearchResult, String> {
    let root = Path::new(&project_root);
    search::search(root, &query, case_sensitive).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn editor_get_identity(
    project_root: String,
    rel_path: String,
) -> Result<FileIdentity, String> {
    let root = Path::new(&project_root);
    let (content, _) = fs_ops::read_file(root, &rel_path).map_err(|e| e.to_string())?;
    Ok(identity::compute_identity(root, &rel_path, &content))
}

#[tauri::command]
pub async fn editor_search_advanced(
    app: AppHandle,
    project_root: String,
    options: SearchOptions,
    registry: State<'_, Arc<SearchRegistry>>,
) -> Result<AdvancedSearchResult, String> {
    let root = Path::new(&project_root).to_path_buf();
    let reg = registry.inner().clone();
    run_advanced_search(app, &root, options, reg).await
}

#[tauri::command]
pub async fn editor_cancel_search(
    search_id: String,
    registry: State<'_, Arc<SearchRegistry>>,
) -> Result<bool, String> {
    Ok(registry.cancel(&search_id).await)
}
