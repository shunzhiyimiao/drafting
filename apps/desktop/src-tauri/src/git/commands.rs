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

// --- Remote operations -----------------------------------------------------
// Network-bound; run on a blocking thread so the UI never freezes. git2's
// Repository is !Send, so each op opens its own repo inside the closure.

fn publish_op_failed(bus: &SyncBus, operation: &str, reason: &str) {
    bus.publish(
        git_origin(),
        SyncBusEvent::Git(GitEvent::OperationFailed {
            operation: operation.to_string(),
            reason: reason.to_string(),
        }),
    );
}

#[tauri::command]
pub async fn git_fetch(
    project_root: String,
    remote: Option<String>,
    sync_bus: State<'_, SyncBus>,
) -> Result<FetchResult, String> {
    let bus = sync_bus.inner().clone();
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    let pr = project_root.clone();
    let rn = remote_name.clone();
    let res = tokio::task::spawn_blocking(move || ops::fetch(Path::new(&pr), &rn))
        .await
        .map_err(|e| e.to_string())?;
    match res {
        Ok(commits_received) => {
            bus.publish(
                git_origin(),
                SyncBusEvent::Git(GitEvent::FetchCompleted {
                    remote: remote_name.clone(),
                    commits_received,
                }),
            );
            Ok(FetchResult {
                remote: remote_name,
                commits_received,
            })
        }
        Err(e) => {
            publish_op_failed(&bus, "fetch", &e);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn git_pull(
    project_root: String,
    remote: Option<String>,
    sync_bus: State<'_, SyncBus>,
) -> Result<PullResult, String> {
    let bus = sync_bus.inner().clone();
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    let pr = project_root.clone();
    let rn = remote_name.clone();
    let res = tokio::task::spawn_blocking(move || ops::pull(Path::new(&pr), &rn))
        .await
        .map_err(|e| e.to_string())?;
    match res {
        Ok((commits_received, fast_forwarded)) => {
            bus.publish(
                git_origin(),
                SyncBusEvent::Git(GitEvent::PullCompleted {
                    from: remote_name.clone(),
                    commits_received,
                    has_conflicts: false,
                }),
            );
            Ok(PullResult {
                remote: remote_name,
                commits_received,
                fast_forwarded,
            })
        }
        Err(e) => {
            publish_op_failed(&bus, "pull", &e);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn git_push(
    project_root: String,
    sync_bus: State<'_, SyncBus>,
) -> Result<PushResult, String> {
    let bus = sync_bus.inner().clone();
    let pr = project_root.clone();
    let res = tokio::task::spawn_blocking(move || ops::push(Path::new(&pr)))
        .await
        .map_err(|e| e.to_string())?;
    match res {
        Ok((remote, commits_pushed)) => {
            bus.publish(
                git_origin(),
                SyncBusEvent::Git(GitEvent::PushCompleted {
                    to: remote.clone(),
                    commits_pushed,
                }),
            );
            Ok(PushResult {
                remote,
                commits_pushed,
            })
        }
        Err(e) => {
            publish_op_failed(&bus, "push", &e);
            Err(e)
        }
    }
}
