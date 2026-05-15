use std::path::Path;

use tauri::{AppHandle, State};

use crate::terminal::history::{HistoryEntry, HistoryStore};
use crate::terminal::manager::TerminalManager;
use crate::terminal::types::*;

#[tauri::command]
pub async fn terminal_create_session(
    app: AppHandle,
    input: CreateSessionInput,
    manager: State<'_, TerminalManager>,
) -> Result<SessionInfo, String> {
    manager.create_session(app, input).await
}

#[tauri::command]
pub async fn terminal_write(
    session_id: String,
    data: String,
    manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    manager.write(&session_id, &data).await
}

#[tauri::command]
pub async fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    manager.resize(&session_id, cols, rows).await
}

#[tauri::command]
pub async fn terminal_close(
    session_id: String,
    manager: State<'_, TerminalManager>,
) -> Result<(), String> {
    manager.close(&session_id).await
}

#[tauri::command]
pub async fn terminal_list(
    manager: State<'_, TerminalManager>,
) -> Result<Vec<SessionInfo>, String> {
    Ok(manager.list().await)
}

// ---------------------------------------------------------------------------
// Command history
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn terminal_record_command(
    project_root: String,
    command: String,
    cwd: String,
    history: State<'_, HistoryStore>,
) -> Result<Option<HistoryEntry>, String> {
    ensure_gitignore(Path::new(&project_root));
    Ok(history.record(Path::new(&project_root), &command, &cwd).await)
}

#[tauri::command]
pub async fn terminal_history_list(
    project_root: String,
    limit: Option<usize>,
    history: State<'_, HistoryStore>,
) -> Result<Vec<HistoryEntry>, String> {
    Ok(history
        .list(Path::new(&project_root), limit.unwrap_or(200))
        .await)
}

#[tauri::command]
pub async fn terminal_history_search(
    project_root: String,
    query: String,
    limit: Option<usize>,
    history: State<'_, HistoryStore>,
) -> Result<Vec<HistoryEntry>, String> {
    Ok(history
        .search(Path::new(&project_root), &query, limit.unwrap_or(50))
        .await)
}

/// Make sure `.drafting/local/` is in `.gitignore`. Idempotent.
fn ensure_gitignore(project_root: &Path) {
    let path = project_root.join(".gitignore");
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    if existing
        .lines()
        .any(|l| l.trim() == ".drafting/local/" || l.trim() == ".drafting/local")
    {
        return;
    }
    let mut next = existing;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    if !next.ends_with("\n\n") && !next.is_empty() {
        next.push('\n');
    }
    next.push_str("# Drafting local-only terminal history / caches\n");
    next.push_str(".drafting/local/\n");
    let _ = std::fs::write(&path, next);
}
