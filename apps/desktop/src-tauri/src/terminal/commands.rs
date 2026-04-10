use tauri::{AppHandle, State};

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
