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

/// Create an empty file (parents included). Refuses to clobber.
pub fn create_file(project_root: &Path, rel_path: &str) -> std::io::Result<()> {
    let path = resolve(project_root, rel_path)?;
    if path.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "already exists",
        ));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, "")
}

pub fn create_dir(project_root: &Path, rel_path: &str) -> std::io::Result<()> {
    let path = resolve(project_root, rel_path)?;
    if path.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "already exists",
        ));
    }
    std::fs::create_dir_all(&path)
}

/// Rename/move within the project (both ends confined). Refuses to clobber.
pub fn rename(project_root: &Path, from_rel: &str, to_rel: &str) -> std::io::Result<()> {
    let from = resolve(project_root, from_rel)?;
    let to = resolve(project_root, to_rel)?;
    if !from.exists() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "source missing"));
    }
    if to.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "target already exists",
        ));
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(&from, &to)
}

/// Delete a file or a directory tree. The UI owns the confirmation; this
/// stays a plain project-confined operation.
pub fn delete(project_root: &Path, rel_path: &str) -> std::io::Result<()> {
    let path = resolve(project_root, rel_path)?;
    let meta = std::fs::symlink_metadata(&path)?;
    if meta.is_dir() {
        std::fs::remove_dir_all(&path)
    } else {
        std::fs::remove_file(&path)
    }
}

fn resolve(project_root: &Path, rel_path: &str) -> std::io::Result<PathBuf> {
    confine(rel_path)?;
    let path = project_root.join(rel_path);
    canonicalize_existing_prefix(project_root, &path)?;
    Ok(path)
}

/// Lexical layer: reject inputs that could step outside the project root
/// before any filesystem access. Component-based, so it catches `..` as a
/// path segment (but allows filenames that merely contain dots, e.g.
/// `a..b.ts`), absolute paths (`/etc/passwd`), and Windows drive / UNC
/// prefixes (`C:\`, `\\server\share`) — `PathBuf::join` would silently
/// discard the project root for absolute inputs.
fn confine(rel_path: &str) -> std::io::Result<()> {
    use std::path::Component;
    for component in Path::new(rel_path).components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "path contains ..",
                ));
            }
            Component::Prefix(_) | Component::RootDir => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "absolute path not allowed",
                ));
            }
        }
    }
    Ok(())
}

/// Physical layer: resolve symlinks and verify the target stays under the
/// project root. The target itself may not exist yet (writing a new file),
/// so canonicalize the deepest ancestor that does exist — the loop always
/// terminates because project_root itself exists.
fn canonicalize_existing_prefix(project_root: &Path, candidate: &Path) -> std::io::Result<()> {
    let canonical_root = project_root.canonicalize()?;
    let mut cursor = candidate;
    loop {
        if cursor.exists() {
            let real = cursor.canonicalize()?;
            if real.starts_with(&canonical_root) {
                return Ok(());
            }
            return Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "path escapes project root",
            ));
        }
        match cursor.parent() {
            Some(parent) => cursor = parent,
            None => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "path has no existing ancestor",
                ));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn root() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn normal_relative_path_passes() {
        let dir = root();
        assert!(resolve(dir.path(), "src/main.ts").is_ok());
    }

    #[test]
    fn nested_new_file_passes() {
        let dir = root();
        // Deeply nested target where no ancestor below root exists yet.
        assert!(resolve(dir.path(), "a/b/c/new-file.ts").is_ok());
    }

    #[test]
    fn filename_containing_dots_passes() {
        let dir = root();
        assert!(resolve(dir.path(), "src/a..b.ts").is_ok());
    }

    #[test]
    fn parent_dir_rejected() {
        let dir = root();
        assert!(resolve(dir.path(), "../outside.txt").is_err());
    }

    #[test]
    fn parent_dir_in_middle_rejected() {
        let dir = root();
        assert!(resolve(dir.path(), "src/../../outside.txt").is_err());
    }

    #[test]
    fn absolute_path_rejected() {
        let dir = root();
        let abs = std::env::temp_dir().join("victim.txt");
        assert!(resolve(dir.path(), abs.to_str().unwrap()).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_rejected() {
        let dir = root();
        let outside = TempDir::new().unwrap();
        let outside_file = outside.path().join("secret.txt");
        std::fs::write(&outside_file, "secret").unwrap();
        std::os::unix::fs::symlink(&outside_file, dir.path().join("link.txt")).unwrap();
        assert!(resolve(dir.path(), "link.txt").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn new_file_under_symlinked_dir_escape_rejected() {
        let dir = root();
        let outside = TempDir::new().unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("linkdir")).unwrap();
        // Target doesn't exist; deepest existing ancestor is the symlinked
        // dir, which canonicalizes outside the root.
        assert!(resolve(dir.path(), "linkdir/new-file.ts").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_inside_root_passes() {
        let dir = root();
        let real = dir.path().join("real.txt");
        std::fs::write(&real, "ok").unwrap();
        std::os::unix::fs::symlink(&real, dir.path().join("alias.txt")).unwrap();
        assert!(resolve(dir.path(), "alias.txt").is_ok());
    }
}
