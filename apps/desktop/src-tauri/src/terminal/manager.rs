use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;

use portable_pty::{CommandBuilder, PtyPair, PtySize, native_pty_system};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::terminal::types::*;

pub struct PtySession {
    pub id: String,
    pub cwd: String,
    pub shell: String,
    pub created_at: u64,
    pty: PtyPair,
    writer: Box<dyn Write + Send>,
    exit_code: Option<i32>,
}

pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn create_session(
        &self,
        app: AppHandle,
        input: CreateSessionInput,
    ) -> Result<SessionInfo, String> {
        let shell = input.shell.unwrap_or_else(detect_default_shell);
        let cwd = input
            .cwd
            .unwrap_or_else(|| {
                std::env::current_dir()
                    .ok()
                    .and_then(|p| p.to_str().map(|s| s.to_string()))
                    .unwrap_or_else(|| "/".to_string())
            });

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: input.rows.max(1),
                cols: input.cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("openpty failed: {}", e))?;

        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&cwd);
        // Avoid inheriting env LINES/COLUMNS that might confuse the shell
        cmd.env_remove("LINES");
        cmd.env_remove("COLUMNS");
        if let Some(command) = input.command.as_ref() {
            if shell.contains("powershell") || shell.contains("pwsh") {
                cmd.args(["-NoExit", "-Command", command]);
            } else if shell.contains("cmd.exe") {
                cmd.args(["/K", command]);
            } else {
                cmd.args(["-c", command]);
            }
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("spawn failed: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("take_writer failed: {}", e))?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("clone_reader failed: {}", e))?;

        let id = ulid::Ulid::new().to_string();
        let session_id_for_reader = id.clone();
        let app_clone = app.clone();

        // Spawn reader task — uses std blocking IO on a dedicated thread
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_clone.emit(
                            "terminal://output",
                            SessionOutputPayload {
                                session_id: session_id_for_reader.clone(),
                                data: chunk,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
        });

        // Spawn child-waiter thread
        let sessions_clone = self.sessions.clone();
        let session_id_for_waiter = id.clone();
        let app_waiter = app.clone();
        std::thread::spawn(move || {
            let exit_code = match child.wait() {
                Ok(status) => status.exit_code() as i32,
                Err(_) => -1,
            };
            // Update session
            let rt = tokio::runtime::Handle::try_current();
            if let Ok(handle) = rt {
                let sessions = sessions_clone.clone();
                let sid = session_id_for_waiter.clone();
                handle.spawn(async move {
                    let mut s = sessions.lock().await;
                    if let Some(session) = s.get_mut(&sid) {
                        session.exit_code = Some(exit_code);
                    }
                });
            }
            let _ = app_waiter.emit(
                "terminal://exit",
                SessionExitPayload {
                    session_id: session_id_for_waiter,
                    exit_code,
                },
            );
        });

        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let info = SessionInfo {
            id: id.clone(),
            cwd: cwd.clone(),
            shell: shell.clone(),
            created_at,
            exit_code: None,
        };

        let session = PtySession {
            id: id.clone(),
            cwd,
            shell,
            created_at,
            pty: pair,
            writer,
            exit_code: None,
        };

        let mut sessions = self.sessions.lock().await;
        sessions.insert(id, session);
        Ok(info)
    }

    pub async fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("session {} not found", session_id))?;
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("write failed: {}", e))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("flush failed: {}", e))?;
        Ok(())
    }

    pub async fn resize(
        &self,
        session_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("session {} not found", session_id))?;
        session
            .pty
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("resize failed: {}", e))?;
        Ok(())
    }

    pub async fn close(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().await;
        if let Some(_session) = sessions.remove(session_id) {
            // Dropping PtySession closes the PTY, which SIGHUPs the child
            Ok(())
        } else {
            Err(format!("session {} not found", session_id))
        }
    }

    pub async fn list(&self) -> Vec<SessionInfo> {
        let sessions = self.sessions.lock().await;
        sessions
            .values()
            .map(|s| SessionInfo {
                id: s.id.clone(),
                cwd: s.cwd.clone(),
                shell: s.shell.clone(),
                created_at: s.created_at,
                exit_code: s.exit_code,
            })
            .collect()
    }
}

pub fn detect_default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        if std::env::var("ComSpec").is_ok() {
            return std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string());
        }
        return "powershell.exe".to_string();
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}
