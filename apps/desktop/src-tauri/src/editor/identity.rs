use std::path::Path;

use crate::editor::types::FileIdentity;

/// Compute the FileIdentity for a file path given its content.
pub fn compute_identity(project_root: &Path, rel_path: &str, content: &str) -> FileIdentity {
    let is_generated = detect_generated(content);
    let adapter_id = detect_adapter_id(content);

    // Check if this path is in a tool-owned directory
    let tool_owned = rel_path.starts_with("packages/sockets/")
        || rel_path.starts_with("packages/wiring/");

    // Try to find matching file-level blueprint
    let file_blueprint_id = find_file_blueprint(project_root, rel_path);

    // Find feature blueprints that reference this file
    let feature_blueprint_ids = find_feature_blueprints(project_root, rel_path);

    FileIdentity {
        path: rel_path.to_string(),
        is_generated: is_generated || tool_owned,
        adapter_id,
        file_blueprint_id,
        feature_blueprint_ids,
        readonly: tool_owned,
    }
}

fn detect_generated(content: &str) -> bool {
    let first_5k = &content[..content.len().min(5000)];
    first_5k.contains("// AUTO-GENERATED")
        || first_5k.contains("/* AUTO-GENERATED")
        || first_5k.contains("// @generated")
}

fn detect_adapter_id(content: &str) -> Option<String> {
    // Look for `// @adapter-id: xxx`
    let first_5k = &content[..content.len().min(5000)];
    for line in first_5k.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("// @adapter-id:") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

fn find_file_blueprint(project_root: &Path, rel_path: &str) -> Option<String> {
    // file-level blueprint mirrors code path under blueprints/files/
    let bp_path = project_root
        .join("blueprints/files")
        .join(format!("{}.blueprint.md", rel_path));
    if !bp_path.exists() {
        return None;
    }
    // Parse just front matter to get ID
    let content = std::fs::read_to_string(&bp_path).ok()?;
    extract_blueprint_id(&content)
}

fn find_feature_blueprints(project_root: &Path, rel_path: &str) -> Vec<String> {
    let index_path = project_root.join("blueprints/index.json");
    if !index_path.exists() {
        return Vec::new();
    }

    let Ok(data) = std::fs::read_to_string(&index_path) else {
        return Vec::new();
    };
    let Ok(index) = serde_json::from_str::<serde_json::Value>(&data) else {
        return Vec::new();
    };

    let mut result = Vec::new();
    let Some(blueprints) = index.get("blueprints").and_then(|b| b.as_array()) else {
        return result;
    };

    for bp in blueprints {
        let bp_type = bp.get("type").and_then(|t| t.as_str());
        if bp_type != Some("feature") {
            continue;
        }
        // Load full blueprint to check relatedFiles
        let Some(file_path) = bp.get("filePath").and_then(|p| p.as_str()) else {
            continue;
        };
        let full_path = project_root.join(file_path);
        if let Ok(bp_content) = std::fs::read_to_string(&full_path) {
            if bp_content.contains(rel_path) {
                if let Some(id) = bp.get("blueprintId").and_then(|i| i.as_str()) {
                    result.push(id.to_string());
                }
            }
        }
    }

    result
}

fn extract_blueprint_id(md: &str) -> Option<String> {
    // Super lightweight: look for blueprintId: xxx in first 20 lines
    for line in md.lines().take(20) {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("blueprintId:") {
            let id = rest.trim().trim_matches('"').trim_matches('\'');
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }
    }
    None
}
