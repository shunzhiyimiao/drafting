//! Sketch storage (Rev 4 §6): raw `.sketch` TEXT I/O only. The text is the
//! document; parsing/printing live exclusively in sketch-core (reached over
//! the codegen RPC when Rust needs structure). Writes stay inside
//! `sketches/**` — criterion markers remain the blueprint domain's.
//!
//! Retired here by text-as-truth: the Spec serde mirror, node-level
//! heal-on-load (persist-on-need replaces it — ids are minted by editors at
//! need, Rev 4 §6), and version write-back (v2→v3 is the migrator's job;
//! within-v3 forward migration rides the editor's parse-heal-save loop).

use std::path::{Path, PathBuf};

pub fn sketches_dir(root: &Path) -> PathBuf {
    root.join("sketches")
}

/// Guard against paths escaping the sketches dir; returns the absolute path
/// for a project-relative `sketches/<name>.sketch` file.
fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    if !rel.starts_with("sketches/") || rel.contains("..") || !rel.ends_with(".sketch") {
        return Err(format!("非法 sketch 路径: {rel}"));
    }
    Ok(root.join(rel))
}

pub fn read_text(root: &Path, rel: &str) -> Result<String, String> {
    let path = resolve(root, rel)?;
    std::fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()))
}

pub fn write_text(root: &Path, rel: &str, text: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("mkdir {}: {e}", dir.display()))?;
    }
    std::fs::write(&path, text).map_err(|e| format!("write {}: {e}", path.display()))
}

/// All `.sketch` files, project-relative, sorted (deterministic listings).
pub fn list_files(root: &Path) -> Vec<String> {
    let dir = sketches_dir(root);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out: Vec<String> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.ends_with(".sketch").then(|| format!("sketches/{name}"))
        })
        .collect();
    out.sort();
    out
}

/// Are there v2 documents waiting for the migrator? (Startup gate — the
/// migration RPC only runs when there's something to migrate.)
pub fn has_legacy_json(root: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(sketches_dir(root)) else {
        return false;
    };
    entries.flatten().any(|e| {
        e.file_name()
            .to_string_lossy()
            .ends_with(".sketch.json")
    })
}

pub fn slug_of(rel: &str) -> Option<&str> {
    rel.strip_prefix("sketches/")?.strip_suffix(".sketch")
}

/// Delete a sketch file. The generated React half goes with it (tool-owned,
/// regenerated wholesale — its source is gone); the user-owned sibling is
/// never touched: its now-dead import becomes a tsc error, the honest
/// signal. Bound criteria go dangling per §6 — a signal, never a cascade.
pub fn delete(root: &Path, rel: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    if !path.exists() {
        return Err(format!("sketch 文件不存在: {rel}"));
    }
    std::fs::remove_file(&path).map_err(|e| format!("delete {}: {e}", path.display()))?;
    if let Some(slug) = slug_of(rel) {
        let generated = root.join(format!("packages/ui/src/generated/{slug}.generated.tsx"));
        if generated.exists() {
            if let Err(e) = std::fs::remove_file(&generated) {
                log::warn!("sketch delete: generated half not removed: {e}");
            }
        }
    }
    Ok(())
}

fn slugify(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    let slug = slug
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() { "sketch".to_string() } else { slug }
}

/// A fresh project-relative filename for `name`, deduped with -2, -3… on
/// collision (against both `.sketch` and legacy `.sketch.json`).
pub fn fresh_file_for(root: &Path, name: &str) -> String {
    let dir = sketches_dir(root);
    let base = slugify(name);
    let mut candidate = format!("{base}.sketch");
    let mut n = 2;
    while dir.join(&candidate).exists() || dir.join(format!("{candidate}.json")).exists() {
        candidate = format!("{base}-{n}.sketch");
        n += 1;
    }
    format!("sketches/{candidate}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn text_io_round_trips_and_guards_paths() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();

        write_text(root, "sketches/a.sketch", "<Sketch />").unwrap();
        assert_eq!(read_text(root, "sketches/a.sketch").unwrap(), "<Sketch />");
        assert_eq!(list_files(root), vec!["sketches/a.sketch"]);

        // Escapes and foreign paths are refused.
        assert!(write_text(root, "sketches/../x.sketch", "x").is_err());
        assert!(write_text(root, "elsewhere/a.sketch", "x").is_err());
        assert!(write_text(root, "sketches/a.txt", "x").is_err());
    }

    #[test]
    fn fresh_file_for_slugs_and_dedupes_against_both_extensions() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        assert_eq!(fresh_file_for(root, "Login Screen!"), "sketches/login-screen.sketch");

        write_text(root, "sketches/login-screen.sketch", "x").unwrap();
        assert_eq!(fresh_file_for(root, "Login Screen!"), "sketches/login-screen-2.sketch");

        // A legacy json (pre-migration) also blocks the name.
        std::fs::create_dir_all(sketches_dir(root)).unwrap();
        std::fs::write(sketches_dir(root).join("inbox.sketch.json"), "{}").unwrap();
        assert!(has_legacy_json(root));
        assert_eq!(fresh_file_for(root, "inbox"), "sketches/inbox-2.sketch");
    }

    #[test]
    fn delete_removes_sketch_and_its_generated_half_only() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        write_text(root, "sketches/login.sketch", "<Sketch />").unwrap();

        let generated = root.join("packages/ui/src/generated/login.generated.tsx");
        let sibling = root.join("packages/ui/src/login.tsx");
        std::fs::create_dir_all(generated.parent().unwrap()).unwrap();
        std::fs::write(&generated, "// generated\n").unwrap();
        std::fs::write(&sibling, "// USER\n").unwrap();

        delete(root, "sketches/login.sketch").unwrap();
        assert!(list_files(root).is_empty());
        assert!(!generated.exists(), "tool-owned generated half removed");
        assert!(sibling.exists(), "user-owned sibling untouched");

        assert!(delete(root, "sketches/login.sketch").is_err(), "missing file is a clear error");
    }
}
