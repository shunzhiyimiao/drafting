//! Terminal command history, persisted to `.drafting/local/terminal-history.jsonl`.
//!
//! - per-project, shared across tabs
//! - append-only; cap at [`MAX_ENTRIES`] (oldest evicted on rewrite)
//! - filter out commands containing obvious secrets
//! - fuzzy search for Cmd+R
//!
//! The file is NOT committed to Git. Callers should ensure `.gitignore`
//! includes `.drafting/local/`.

use std::collections::VecDeque;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

pub const MAX_ENTRIES: usize = 10_000;
const HISTORY_FILE: &str = ".drafting/local/terminal-history.jsonl";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub command: String,
    pub cwd: String,
    pub timestamp: u64,
}

/// Secret-pattern regex. Keep case-insensitive so FOO_TOKEN / FooToken both hit.
fn is_sensitive(command: &str) -> bool {
    let c = command.to_ascii_lowercase();
    for needle in [
        "password",
        "passwd",
        "token",
        "api_key",
        "apikey",
        "api-key",
        "secret",
        "private_key",
        "aws_secret",
        "bearer ",
        "authorization:",
    ] {
        if c.contains(needle) {
            return true;
        }
    }
    false
}

fn history_path(project_root: &Path) -> PathBuf {
    project_root.join(HISTORY_FILE)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// In-memory + on-disk history for one project root.
struct ProjectHistory {
    entries: VecDeque<HistoryEntry>,
    project_root: PathBuf,
}

impl ProjectHistory {
    fn load(project_root: &Path) -> Self {
        let path = history_path(project_root);
        let mut entries: VecDeque<HistoryEntry> = VecDeque::new();
        if let Ok(content) = std::fs::read_to_string(&path) {
            for line in content.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                if let Ok(entry) = serde_json::from_str::<HistoryEntry>(line) {
                    entries.push_back(entry);
                }
            }
            // Cap at MAX_ENTRIES — oldest evicted.
            while entries.len() > MAX_ENTRIES {
                entries.pop_front();
            }
        }
        Self {
            entries,
            project_root: project_root.to_path_buf(),
        }
    }

    fn append(&mut self, command: String, cwd: String) -> Option<HistoryEntry> {
        let command = command.trim();
        if command.is_empty() {
            return None;
        }
        if is_sensitive(command) {
            return None;
        }
        // Dedupe: if the newest entry is the same command, bump timestamp only.
        let dedup_hit = self
            .entries
            .back()
            .map(|e| e.command == command)
            .unwrap_or(false);
        if dedup_hit {
            let updated = {
                let last = self.entries.back_mut().unwrap();
                last.timestamp = now_ms();
                last.clone()
            };
            self.write_full_file();
            return Some(updated);
        }

        let entry = HistoryEntry {
            id: ulid::Ulid::new().to_string(),
            command: command.to_string(),
            cwd,
            timestamp: now_ms(),
        };
        self.entries.push_back(entry.clone());

        if self.entries.len() > MAX_ENTRIES {
            self.entries.pop_front();
            // Rewrite the file to apply the eviction.
            self.write_full_file();
        } else {
            self.append_line(&entry);
        }
        Some(entry)
    }

    fn append_line(&self, entry: &HistoryEntry) {
        let path = history_path(&self.project_root);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        else {
            return;
        };
        if let Ok(line) = serde_json::to_string(entry) {
            let _ = writeln!(file, "{line}");
        }
    }

    fn write_full_file(&self) {
        let path = history_path(&self.project_root);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let mut buf = String::with_capacity(self.entries.len() * 64);
        for e in &self.entries {
            if let Ok(line) = serde_json::to_string(e) {
                buf.push_str(&line);
                buf.push('\n');
            }
        }
        let _ = std::fs::write(&path, buf);
    }

    fn list(&self, limit: usize) -> Vec<HistoryEntry> {
        self.entries.iter().rev().take(limit).cloned().collect()
    }

    fn search(&self, query: &str, limit: usize) -> Vec<HistoryEntry> {
        let q = query.to_ascii_lowercase();
        if q.is_empty() {
            return self.list(limit);
        }

        // Fuzzy match: all chars of query must appear in order in command.
        // Score by length of command (shorter = better) + recency (newer = better).
        let mut scored: Vec<(i64, &HistoryEntry)> = Vec::new();
        for e in self.entries.iter().rev() {
            if let Some(score) = fuzzy_score(&e.command, &q) {
                scored.push((score, e));
            }
        }
        scored.sort_by(|a, b| b.0.cmp(&a.0));
        scored
            .into_iter()
            .take(limit)
            .map(|(_, e)| e.clone())
            .collect()
    }
}

/// Returns a fuzzy match score, or None if the query doesn't match.
/// Higher is better. Contiguous matches score higher than scattered ones.
fn fuzzy_score(command: &str, query: &str) -> Option<i64> {
    let cmd_lower = command.to_ascii_lowercase();
    let cmd_bytes = cmd_lower.as_bytes();
    let q_bytes = query.as_bytes();

    let mut qi = 0usize;
    let mut score: i64 = 0;
    let mut last_match_idx: Option<usize> = None;
    let mut consecutive = 0i64;

    for (i, &b) in cmd_bytes.iter().enumerate() {
        if qi < q_bytes.len() && b == q_bytes[qi] {
            qi += 1;
            score += 10;
            if let Some(last) = last_match_idx {
                if i == last + 1 {
                    consecutive += 1;
                    score += consecutive * 5;
                } else {
                    consecutive = 0;
                }
            }
            last_match_idx = Some(i);
        }
    }

    if qi < q_bytes.len() {
        return None;
    }

    // Prefer shorter commands (tighter match).
    score -= (cmd_bytes.len() as i64) / 10;
    Some(score)
}

#[derive(Clone)]
pub struct HistoryStore {
    inner: Arc<Mutex<Option<ProjectHistory>>>,
}

impl HistoryStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }

    async fn ensure_loaded(&self, project_root: &Path) -> tokio::sync::MutexGuard<'_, Option<ProjectHistory>> {
        let mut guard = self.inner.lock().await;
        let needs_load = match guard.as_ref() {
            Some(p) => p.project_root != project_root,
            None => true,
        };
        if needs_load {
            *guard = Some(ProjectHistory::load(project_root));
        }
        guard
    }

    pub async fn record(
        &self,
        project_root: &Path,
        command: &str,
        cwd: &str,
    ) -> Option<HistoryEntry> {
        let mut guard = self.ensure_loaded(project_root).await;
        guard.as_mut().and_then(|p| p.append(command.into(), cwd.into()))
    }

    pub async fn list(&self, project_root: &Path, limit: usize) -> Vec<HistoryEntry> {
        let guard = self.ensure_loaded(project_root).await;
        guard.as_ref().map(|p| p.list(limit)).unwrap_or_default()
    }

    pub async fn search(
        &self,
        project_root: &Path,
        query: &str,
        limit: usize,
    ) -> Vec<HistoryEntry> {
        let guard = self.ensure_loaded(project_root).await;
        guard
            .as_ref()
            .map(|p| p.search(query, limit))
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn append_and_list() {
        let dir = TempDir::new().unwrap();
        let store = HistoryStore::new();
        store.record(dir.path(), "ls -la", "/home/me").await;
        store.record(dir.path(), "pnpm install", "/home/me").await;
        let items = store.list(dir.path(), 10).await;
        assert_eq!(items.len(), 2);
        // Newest first.
        assert_eq!(items[0].command, "pnpm install");
    }

    #[tokio::test]
    async fn sensitive_is_filtered() {
        let dir = TempDir::new().unwrap();
        let store = HistoryStore::new();
        assert!(store
            .record(dir.path(), "export API_KEY=sk-abc", "/")
            .await
            .is_none());
        assert!(store
            .record(dir.path(), "curl -H 'Authorization: Bearer xyz'", "/")
            .await
            .is_none());
        let items = store.list(dir.path(), 10).await;
        assert!(items.is_empty());
    }

    #[tokio::test]
    async fn persists_across_instances() {
        let dir = TempDir::new().unwrap();
        {
            let store = HistoryStore::new();
            store.record(dir.path(), "echo hello", "/").await;
        }
        let store = HistoryStore::new();
        let items = store.list(dir.path(), 10).await;
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].command, "echo hello");
    }

    #[tokio::test]
    async fn dedup_consecutive() {
        let dir = TempDir::new().unwrap();
        let store = HistoryStore::new();
        store.record(dir.path(), "ls", "/").await;
        store.record(dir.path(), "ls", "/").await;
        store.record(dir.path(), "ls", "/").await;
        let items = store.list(dir.path(), 10).await;
        assert_eq!(items.len(), 1);
    }

    #[tokio::test]
    async fn search_fuzzy() {
        let dir = TempDir::new().unwrap();
        let store = HistoryStore::new();
        store.record(dir.path(), "pnpm install", "/").await;
        store.record(dir.path(), "cargo build --release", "/").await;
        store.record(dir.path(), "git status", "/").await;

        let hits = store.search(dir.path(), "cb", 10).await;
        assert!(hits.iter().any(|h| h.command == "cargo build --release"));

        let hits = store.search(dir.path(), "nonsense", 10).await;
        assert!(hits.is_empty());
    }

    #[test]
    fn fuzzy_scoring_prefers_contiguous() {
        // "cb" matches both; "cargo build" has them non-contiguous, "scb" has "cb" contiguous.
        // We care that contiguous matches get higher scores.
        let a = fuzzy_score("cargo build", "cb").unwrap();
        let b = fuzzy_score("scb", "cb").unwrap();
        assert!(b > a, "contiguous 'cb' should score higher: {b} vs {a}");
    }
}
