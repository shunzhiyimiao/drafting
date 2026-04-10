use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::editor::types::*;

const HIDDEN_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    ".drafting",
    ".atlas",
    ".blueprint",
    "target",
    "dist",
    ".next",
    ".turbo",
];

pub fn list_dir(project_root: &Path, rel_path: &str) -> std::io::Result<Vec<DirEntry>> {
    let dir = if rel_path.is_empty() || rel_path == "." {
        project_root.to_path_buf()
    } else {
        project_root.join(rel_path)
    };

    let canonical_root = project_root.canonicalize()?;
    let canonical_dir = dir.canonicalize()?;
    if !canonical_dir.starts_with(&canonical_root) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "path escapes project root",
        ));
    }

    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Filter noise
        if HIDDEN_DIRS.contains(&name.as_str()) {
            continue;
        }
        if name.starts_with('.') && !is_allowlisted_dotfile(&name) {
            continue;
        }

        let metadata = entry.metadata()?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let rel = path
            .strip_prefix(project_root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        entries.push(DirEntry {
            name,
            path: rel,
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified_at,
        });
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(entries)
}

fn is_allowlisted_dotfile(name: &str) -> bool {
    matches!(name, ".gitignore" | ".env.example" | ".vscode" | ".github")
}

pub fn read_file(project_root: &Path, rel_path: &str) -> std::io::Result<(String, u64)> {
    let path = resolve(project_root, rel_path)?;
    let metadata = std::fs::metadata(&path)?;

    if metadata.len() > MAX_FILE_SIZE_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("File too large ({} bytes)", metadata.len()),
        ));
    }

    let content = std::fs::read_to_string(&path)?;
    Ok((content, metadata.len()))
}

pub fn write_file(project_root: &Path, rel_path: &str, content: &str) -> std::io::Result<()> {
    let path = resolve(project_root, rel_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, content)?;
    Ok(())
}

fn resolve(project_root: &Path, rel_path: &str) -> std::io::Result<PathBuf> {
    let path = project_root.join(rel_path);
    // Light path traversal check: reject if contains ".."
    if rel_path.contains("..") {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "path contains ..",
        ));
    }
    Ok(path)
}
