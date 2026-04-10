use std::path::Path;

use crate::atlas::parser;
use crate::atlas::types::*;
use crate::editor::identity;

#[tauri::command]
pub fn atlas_parse_file(
    project_root: String,
    rel_path: String,
) -> Result<FileMap, String> {
    let root = Path::new(&project_root);
    let full = root.join(&rel_path);
    let content = std::fs::read_to_string(&full).map_err(|e| e.to_string())?;
    let mut map = parser::parse_file(&rel_path, &content);

    // Enrich with FileIdentity information for cross-system navigation
    let identity = identity::compute_identity(root, &rel_path, &content);
    map.adapter_id = identity.adapter_id;
    map.file_blueprint_id = identity.file_blueprint_id;
    map.is_generated = identity.is_generated;

    Ok(map)
}
