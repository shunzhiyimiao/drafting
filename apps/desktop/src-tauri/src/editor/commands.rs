use std::path::Path;
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::editor::fs_ops;
use crate::editor::identity;
use crate::editor::search;
use crate::editor::search_advanced::{run_advanced_search, SearchRegistry};
use crate::editor::types::*;
use crate::sync_bus::events::{EditorEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;

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

/// Write a file and, on success, publish `EditorEvent::FileSaved` on the bus
/// (S2: the code-change event the S3 estimator subscribes to). Extracted from
/// the Tauri command so the write-then-notify behavior is unit-testable.
/// A rejected (tool-owned) write publishes nothing.
pub fn write_file_and_notify(
    root: &Path,
    rel_path: &str,
    content: &str,
    bus: &SyncBus,
) -> Result<(), String> {
    // Reject write if file is tool-owned
    let current = fs_ops::read_file(root, rel_path).ok();
    if let Some((cur_content, _)) = &current {
        let identity = identity::compute_identity(root, rel_path, cur_content);
        if identity.readonly {
            return Err(format!(
                "File '{}' is tool-owned and read-only. Edit in Patchboard instead.",
                rel_path
            ));
        }
    }
    fs_ops::write_file(root, rel_path, content).map_err(|e| e.to_string())?;
    bus.publish(
        Origin::new("editor"),
        SyncBusEvent::Editor(EditorEvent::FileSaved {
            path: rel_path.to_string(),
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn editor_write_file(
    project_root: String,
    rel_path: String,
    content: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    let root = Path::new(&project_root);
    write_file_and_notify(root, &rel_path, &content, sync_bus.inner())
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn write_publishes_file_saved() {
        let dir = TempDir::new().unwrap();
        let bus = SyncBus::new();
        let mut rx = bus.subscribe();

        write_file_and_notify(dir.path(), "src/a.ts", "export const x = 1;", &bus).unwrap();
        assert_eq!(std::fs::read_to_string(dir.path().join("src/a.ts")).unwrap(), "export const x = 1;");

        let env = rx.try_recv().expect("a FileSaved event should be published");
        match env.payload {
            SyncBusEvent::Editor(EditorEvent::FileSaved { path }) => assert_eq!(path, "src/a.ts"),
            other => panic!("expected Editor(FileSaved), got {other:?}"),
        }
    }

    #[test]
    fn tool_owned_write_rejected_and_silent() {
        let dir = TempDir::new().unwrap();
        // sockets/ is tool-owned → readonly; create the file so the guard reads it
        std::fs::create_dir_all(dir.path().join("packages/sockets/src")).unwrap();
        std::fs::write(
            dir.path().join("packages/sockets/src/x.ts"),
            "// AUTO-GENERATED\n",
        )
        .unwrap();
        let bus = SyncBus::new();
        let mut rx = bus.subscribe();

        let res = write_file_and_notify(dir.path(), "packages/sockets/src/x.ts", "hacked", &bus);
        assert!(res.is_err(), "tool-owned write must be rejected");
        assert!(rx.try_recv().is_err(), "rejected write must publish nothing");
    }
}

// ------------------------------------------------- file-tree mutations (M2) --
// 宪法 Part 14 的文件树右键四件套。全部走 fs_ops 的 P0-1 硬化解析
// (词法 confine + 物理 canonicalize),变更后发 SyncBus 事件让打开的
// tab / 文件树 / 关联系统自行响应。

#[tauri::command]
pub fn editor_create_file(
    project_root: String,
    rel_path: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    fs_ops::create_file(Path::new(&project_root), &rel_path).map_err(|e| e.to_string())?;
    sync_bus.publish(
        Origin::new("editor"),
        SyncBusEvent::Editor(EditorEvent::FileSaved { path: rel_path }),
    );
    Ok(())
}

#[tauri::command]
pub fn editor_create_dir(project_root: String, rel_path: String) -> Result<(), String> {
    fs_ops::create_dir(Path::new(&project_root), &rel_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn editor_rename_path(
    project_root: String,
    from_rel: String,
    to_rel: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    fs_ops::rename(Path::new(&project_root), &from_rel, &to_rel).map_err(|e| e.to_string())?;
    sync_bus.publish(
        Origin::new("editor"),
        SyncBusEvent::Editor(EditorEvent::FileRenamed {
            old_path: from_rel,
            new_path: to_rel,
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn editor_delete_path(
    project_root: String,
    rel_path: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    fs_ops::delete(Path::new(&project_root), &rel_path).map_err(|e| e.to_string())?;
    sync_bus.publish(
        Origin::new("editor"),
        SyncBusEvent::Editor(EditorEvent::FileClosed { path: rel_path }),
    );
    Ok(())
}
