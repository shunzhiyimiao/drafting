use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use portable_pty::{ChildKiller, CommandBuilder, PtyPair, PtySize, native_pty_system};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::terminal::types::*;

/// How long a session gets between SIGTERM and SIGKILL when its tab closes
/// (Part 11 constraint 14).
const CLOSE_GRACE: Duration = Duration::from_secs(5);

pub struct PtySession {
    pub id: String,
    pub cwd: String,
    pub shell: String,
    pub created_at: u64,
    pty: PtyPair,
    writer: Box<dyn Write + Send>,
    exit_code: Option<i32>,
    /// The shell's pid. portable-pty's unix spawn calls setsid(), so the
    /// child is a session leader and its pid doubles as its process-group
    /// id — signaling -pid reaches grandchildren too (constraint 16).
    pid: Option<u32>,
    /// Kill handle split from the Child so the waiter thread can stay
    /// blocked in wait() while close/shutdown escalate independently.
    killer: Box<dyn ChildKiller + Send + Sync>,
    /// Set by the waiter thread the moment wait() returns; lets the
    /// escalation timers skip the SIGKILL for processes that exited in time.
    exited: Arc<AtomicBool>,
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
        let cwd = input.cwd.unwrap_or_else(default_home_dir);

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

        let pid = child.process_id();
        let killer = child.clone_killer();
        let exited = Arc::new(AtomicBool::new(false));

        // Spawn child-waiter thread
        let sessions_clone = self.sessions.clone();
        let session_id_for_waiter = id.clone();
        let app_waiter = app.clone();
        let exited_waiter = exited.clone();
        std::thread::spawn(move || {
            let exit_code = match child.wait() {
                Ok(status) => status.exit_code() as i32,
                Err(_) => -1,
            };
            exited_waiter.store(true, Ordering::SeqCst);
            // Record before emitting, so a frontend reacting to the exit
            // event already sees the code via list().
            record_exit_code(&sessions_clone, &session_id_for_waiter, exit_code);
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
            pid,
            killer,
            exited,
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

    /// Close a session: SIGTERM its process group, give it `CLOSE_GRACE` to
    /// exit, then SIGKILL (Part 11 constraint 14). Returns immediately; the
    /// escalation runs in the background.
    pub async fn close(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().await;
        if let Some(session) = sessions.remove(session_id) {
            let PtySession {
                pid,
                mut killer,
                exited,
                ..
            } = session;
            // The rest of the session (pty/writer) dropped above, which
            // closes the PTY and SIGHUPs the foreground process. Now the
            // explicit escalation:
            signal_group(pid, TERM_SIGNAL);
            tokio::spawn(async move {
                escalate_to_kill(pid, &mut killer, &exited, CLOSE_GRACE).await;
            });
            Ok(())
        } else {
            Err(format!("session {} not found", session_id))
        }
    }

    /// App-exit path (Part 11 constraint 15): SIGTERM every session's group,
    /// wait up to `grace` for all of them, SIGKILL whatever is left. Called
    /// from the Tauri Exit hook, so it must complete — never hang.
    pub async fn shutdown_all(&self, grace: Duration) {
        let drained: Vec<PtySession> = {
            let mut sessions = self.sessions.lock().await;
            sessions.drain().map(|(_, s)| s).collect()
        };
        if drained.is_empty() {
            return;
        }
        let mut survivors = Vec::new();
        for session in drained {
            let PtySession {
                pid,
                killer,
                exited,
                ..
            } = session; // pty/writer drop here → PTY closes, SIGHUP
            signal_group(pid, TERM_SIGNAL);
            survivors.push((pid, killer, exited));
        }
        let deadline = tokio::time::Instant::now() + grace;
        while tokio::time::Instant::now() < deadline {
            if survivors
                .iter()
                .all(|(_, _, exited)| exited.load(Ordering::SeqCst))
            {
                return;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        for (pid, mut killer, exited) in survivors {
            if !exited.load(Ordering::SeqCst) {
                let _ = killer.kill();
                signal_group(pid, KILL_SIGNAL);
            }
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

#[cfg(unix)]
const TERM_SIGNAL: i32 = libc::SIGTERM;
#[cfg(unix)]
const KILL_SIGNAL: i32 = libc::SIGKILL;
// Windows has no signals; these are placeholders — signal_group is a no-op
// there and termination goes through ChildKiller::kill (TerminateProcess).
#[cfg(not(unix))]
const TERM_SIGNAL: i32 = 15;
#[cfg(not(unix))]
const KILL_SIGNAL: i32 = 9;

/// Signal a session's whole process group. portable-pty's unix spawn calls
/// setsid(), so the child leads a group whose id equals its pid — `-pid`
/// reaches grandchildren (constraint 16). Falls back to the single pid if
/// the group signal fails (e.g. the leader already exited).
#[cfg(unix)]
fn signal_group(pid: Option<u32>, signal: i32) {
    let Some(pid) = pid else { return };
    let pid = pid as i32;
    unsafe {
        if libc::kill(-pid, signal) != 0 {
            libc::kill(pid, signal);
        }
    }
}

/// Windows: no process signals. Graceful shutdown is the PTY close (already
/// done by dropping the session); forced termination happens via
/// ChildKiller::kill in the escalation path.
#[cfg(not(unix))]
fn signal_group(_pid: Option<u32>, _signal: i32) {}

/// Wait up to `grace` for the child to exit, then force-kill it: SIGKILL to
/// the process group on unix, TerminateProcess via the killer everywhere.
async fn escalate_to_kill(
    pid: Option<u32>,
    killer: &mut Box<dyn ChildKiller + Send + Sync>,
    exited: &Arc<AtomicBool>,
    grace: Duration,
) {
    let deadline = tokio::time::Instant::now() + grace;
    while tokio::time::Instant::now() < deadline {
        if exited.load(Ordering::SeqCst) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    if !exited.load(Ordering::SeqCst) {
        let _ = killer.kill();
        signal_group(pid, KILL_SIGNAL);
    }
}

/// Record a child's exit code on its session entry, if it still exists.
///
/// Runs on the bare child-waiter thread, which has no tokio runtime context
/// (`Handle::try_current()` there always fails — the original bug), so it
/// must use `blocking_lock`. Do NOT call this from async code: `blocking_lock`
/// panics inside a runtime.
fn record_exit_code(
    sessions: &Arc<Mutex<HashMap<String, PtySession>>>,
    session_id: &str,
    exit_code: i32,
) {
    let mut s = sessions.blocking_lock();
    if let Some(session) = s.get_mut(session_id) {
        session.exit_code = Some(exit_code);
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

/// Cross-platform home directory fallback for terminal cwd.
pub fn default_home_dir() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(p) = std::env::var("USERPROFILE") {
            return p;
        }
        if let (Ok(d), Ok(p)) = (std::env::var("HOMEDRIVE"), std::env::var("HOMEPATH")) {
            return format!("{}{}", d, p);
        }
        "C:\\".to_string()
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A ChildKiller stand-in that records whether kill() fired — lets the
    /// escalation tests observe SIGKILL decisions without real processes.
    #[derive(Debug, Clone)]
    struct RecordingKiller {
        killed: Arc<AtomicBool>,
    }

    impl ChildKiller for RecordingKiller {
        fn kill(&mut self) -> std::io::Result<()> {
            self.killed.store(true, Ordering::SeqCst);
            Ok(())
        }
        fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
            Box::new(self.clone())
        }
    }

    fn noop_killer() -> Box<dyn ChildKiller + Send + Sync> {
        Box::new(RecordingKiller {
            killed: Arc::new(AtomicBool::new(false)),
        })
    }

    #[cfg(unix)]
    fn test_session(id: &str, killer: Box<dyn ChildKiller + Send + Sync>, exited: bool) -> PtySession {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 4,
                cols: 20,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("openpty");
        let writer = pair.master.take_writer().expect("writer");
        PtySession {
            id: id.to_string(),
            cwd: "/".to_string(),
            shell: "/bin/sh".to_string(),
            created_at: 0,
            pty: pair,
            writer,
            exit_code: None,
            pid: None,
            killer,
            exited: Arc::new(AtomicBool::new(exited)),
        }
    }

    /// Regression: the child-waiter runs on a bare std thread with no tokio
    /// runtime context. The old implementation called `Handle::try_current()`
    /// there, which always failed, so the exit code was silently never
    /// recorded and `list()` reported `exit_code: None` forever.
    #[cfg(unix)]
    #[tokio::test]
    async fn exit_code_is_recorded_from_bare_waiter_thread() {
        let sessions: Arc<Mutex<HashMap<String, PtySession>>> =
            Arc::new(Mutex::new(HashMap::new()));
        sessions
            .lock()
            .await
            .insert("s1".to_string(), test_session("s1", noop_killer(), false));

        // Mimic production exactly: a bare thread, spawned while a tokio
        // runtime is live on the test thread.
        let sessions_clone = sessions.clone();
        std::thread::spawn(move || {
            record_exit_code(&sessions_clone, "s1", 42);
        })
        .join()
        .expect("waiter thread panicked");

        let s = sessions.lock().await;
        assert_eq!(s.get("s1").and_then(|s| s.exit_code), Some(42));
    }

    /// A session already removed by close() must not panic the waiter.
    #[tokio::test]
    async fn record_exit_code_tolerates_removed_session() {
        let sessions: Arc<Mutex<HashMap<String, PtySession>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let sessions_clone = sessions.clone();
        std::thread::spawn(move || {
            record_exit_code(&sessions_clone, "gone", 0);
        })
        .join()
        .expect("waiter thread panicked");
        assert!(sessions.lock().await.is_empty());
    }

    /// Constraint 14's second half: a session that ignores SIGTERM gets
    /// force-killed once the grace window elapses.
    #[tokio::test]
    async fn escalation_kills_a_survivor_after_grace() {
        let killed = Arc::new(AtomicBool::new(false));
        let mut killer: Box<dyn ChildKiller + Send + Sync> = Box::new(RecordingKiller {
            killed: killed.clone(),
        });
        let exited = Arc::new(AtomicBool::new(false));
        escalate_to_kill(None, &mut killer, &exited, Duration::from_millis(50)).await;
        assert!(killed.load(Ordering::SeqCst));
    }

    /// …and one that exits within the grace window is left alone.
    #[tokio::test]
    async fn escalation_spares_a_process_that_exited_in_time() {
        let killed = Arc::new(AtomicBool::new(false));
        let mut killer: Box<dyn ChildKiller + Send + Sync> = Box::new(RecordingKiller {
            killed: killed.clone(),
        });
        let exited = Arc::new(AtomicBool::new(true));
        escalate_to_kill(None, &mut killer, &exited, Duration::from_millis(50)).await;
        assert!(!killed.load(Ordering::SeqCst));
    }

    /// Constraint 15: shutdown drains every session; ones that exited within
    /// the grace window are not force-killed, stragglers are.
    #[cfg(unix)]
    #[tokio::test]
    async fn shutdown_all_drains_and_only_kills_stragglers() {
        let manager = TerminalManager::new();
        let polite_killed = Arc::new(AtomicBool::new(false));
        let stubborn_killed = Arc::new(AtomicBool::new(false));
        {
            let mut sessions = manager.sessions.lock().await;
            sessions.insert(
                "polite".to_string(),
                test_session(
                    "polite",
                    Box::new(RecordingKiller {
                        killed: polite_killed.clone(),
                    }),
                    true, // already exited → must be spared
                ),
            );
            sessions.insert(
                "stubborn".to_string(),
                test_session(
                    "stubborn",
                    Box::new(RecordingKiller {
                        killed: stubborn_killed.clone(),
                    }),
                    false, // never exits → must be killed
                ),
            );
        }

        manager.shutdown_all(Duration::from_millis(50)).await;

        assert!(manager.sessions.lock().await.is_empty());
        assert!(!polite_killed.load(Ordering::SeqCst));
        assert!(stubborn_killed.load(Ordering::SeqCst));
    }
}
