use std::path::Path;

use crate::git::ops;
use crate::git::types::*;
use crate::sync_bus::events::{GitEvent, SyncBusEvent};
use crate::sync_bus::types::Origin;
use crate::sync_bus::SyncBus;
use tauri::State;

const ORIGIN: &str = "git";

fn git_origin() -> Origin {
    Origin::new(ORIGIN)
}

#[tauri::command]
pub fn git_status(project_root: String) -> Result<GitStatus, String> {
    ops::status(Path::new(&project_root))
}

#[tauri::command]
pub fn git_branches(project_root: String) -> Result<Vec<BranchInfo>, String> {
    ops::list_branches(Path::new(&project_root))
}

#[tauri::command]
pub fn git_log(
    project_root: String,
    limit: Option<usize>,
) -> Result<Vec<CommitInfo>, String> {
    ops::log(Path::new(&project_root), limit.unwrap_or(50))
}

#[tauri::command]
pub fn git_diff_file(
    project_root: String,
    path: String,
) -> Result<FileDiff, String> {
    ops::diff_file(Path::new(&project_root), &path)
}

#[tauri::command]
pub fn git_staged_diff_patch(
    project_root: String,
    max_bytes: Option<usize>,
) -> Result<String, String> {
    ops::staged_diff_patch(
        Path::new(&project_root),
        max_bytes.unwrap_or(60_000),
    )
}

#[tauri::command]
pub fn git_stage_file(
    project_root: String,
    path: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    ops::stage_file(Path::new(&project_root), &path)?;
    sync_bus.publish(
        git_origin(),
        SyncBusEvent::Git(GitEvent::FileStatusChanged {
            path: path.clone(),
            old_status: "modified".to_string(),
            new_status: "staged".to_string(),
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn git_unstage_file(
    project_root: String,
    path: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    ops::unstage_file(Path::new(&project_root), &path)?;
    sync_bus.publish(
        git_origin(),
        SyncBusEvent::Git(GitEvent::FileStatusChanged {
            path: path.clone(),
            old_status: "staged".to_string(),
            new_status: "modified".to_string(),
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn git_commit(
    project_root: String,
    message: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<String, String> {
    let hash = ops::commit(Path::new(&project_root), &message)?;
    sync_bus.publish(
        git_origin(),
        SyncBusEvent::Git(GitEvent::CommitCreated {
            commit_hash: hash.clone(),
            message: message.clone(),
            files_count: 0,
        }),
    );
    Ok(hash)
}

#[tauri::command]
pub fn git_checkout_branch(
    project_root: String,
    name: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    let prev = ops::status(Path::new(&project_root))
        .ok()
        .map(|s| s.branch)
        .unwrap_or_default();
    ops::checkout_branch(Path::new(&project_root), &name)?;
    sync_bus.publish(
        git_origin(),
        SyncBusEvent::Git(GitEvent::BranchCheckedOut {
            from: prev,
            to: name,
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn git_create_branch(
    project_root: String,
    name: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<(), String> {
    ops::create_branch(Path::new(&project_root), &name)?;
    sync_bus.publish(
        git_origin(),
        SyncBusEvent::Git(GitEvent::BranchCreated { name }),
    );
    Ok(())
}
