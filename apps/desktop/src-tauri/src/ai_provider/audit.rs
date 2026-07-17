//! Append-only audit log of AI calls: `.drafting/local/ai-audit.jsonl`,
//! one JSON object per line. Local tool artifact — never committed to Git.
//! Capped at 10MB via a single rotation to `ai-audit.jsonl.1`.

use std::io::Write;
use std::path::Path;

use serde::Serialize;

const AUDIT_REL: &str = ".drafting/local/ai-audit.jsonl";
const MAX_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRecord {
    pub timestamp_ms: u64,
    pub task: String,
    pub provider: String,
    pub model: String,
    /// "completed" | "failed" | "cancelled"
    pub outcome: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub included_files: Vec<String>,
    /// Vision calls: image METADATA only ("image/png ~123KB") — the paste
    /// ruling (法 4): pixels never reach any log.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub images: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Best-effort append; an audit failure must never break the AI call itself.
pub fn append(project_root: &Path, record: &AuditRecord) {
    if let Err(e) = try_append(project_root, record) {
        log::warn!("ai-audit append failed: {e}");
    }
}

fn try_append(project_root: &Path, record: &AuditRecord) -> std::io::Result<()> {
    let path = project_root.join(AUDIT_REL);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > MAX_BYTES {
            let _ = std::fs::rename(&path, path.with_extension("jsonl.1"));
        }
    }
    let line = serde_json::to_string(record)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    writeln!(file, "{line}")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn record(task: &str) -> AuditRecord {
        AuditRecord {
            timestamp_ms: now_ms(),
            task: task.to_string(),
            provider: "TestProvider".to_string(),
            model: "test-model".to_string(),
            outcome: "completed".to_string(),
            input_tokens: 10,
            output_tokens: 20,
            included_files: vec!["src/a.ts".to_string()],
            images: vec![],
            error: None,
        }
    }

    #[test]
    fn append_writes_one_json_line_per_record() {
        let dir = TempDir::new().unwrap();
        append(dir.path(), &record("TaskA"));
        append(dir.path(), &record("TaskB"));

        let content = std::fs::read_to_string(dir.path().join(AUDIT_REL)).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        for line in lines {
            let v: serde_json::Value = serde_json::from_str(line).unwrap();
            assert!(v.get("task").is_some());
            assert!(v.get("includedFiles").is_some());
        }
    }
}
