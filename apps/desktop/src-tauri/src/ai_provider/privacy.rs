//! Outbound privacy filter: file-path blacklist applied before any file
//! content enters an AI prompt.
//!
//! v1 ships the first of the three layers from the design doc (path
//! blacklist); content scanning and per-call user approval are later
//! iterations. Files matched here are NEVER sent — the caller must skip
//! them and publish `PrivacyViolationBlocked` on the Sync Bus.

/// Returns Some(reason) when this path must never be sent to an AI provider.
/// Paths are project-relative; both `/` and `\` separators are handled.
pub fn check_path(rel_path: &str) -> Option<String> {
    let normalized = rel_path.replace('\\', "/").to_lowercase();
    let segments: Vec<&str> = normalized.split('/').filter(|s| !s.is_empty()).collect();
    let file_name = segments.last().copied().unwrap_or("");

    if file_name == ".env" || file_name.starts_with(".env.") {
        return Some("environment file".to_string());
    }

    for ext in [".key", ".pem", ".p12"] {
        if file_name.ends_with(ext) {
            return Some(format!("credential file (*{ext})"));
        }
    }

    const BLOCKED_DIRS: &[&str] = &[
        "secrets",
        "credentials",
        "private",
        "node_modules",
        ".git",
        ".drafting",
    ];
    let dir_segments = &segments[..segments.len().saturating_sub(1)];
    for dir in BLOCKED_DIRS {
        if dir_segments.contains(dir) {
            return Some(format!("inside {dir}/ directory"));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normal_source_file_passes() {
        assert!(check_path("packages/adapters/src/Mailer.ts").is_none());
    }

    #[test]
    fn env_files_blocked() {
        assert!(check_path(".env").is_some());
        assert!(check_path("apps/web/.env.local").is_some());
    }

    #[test]
    fn credential_extensions_blocked() {
        assert!(check_path("deploy/server.key").is_some());
        assert!(check_path("certs/ca.PEM").is_some());
        assert!(check_path("identity.p12").is_some());
    }

    #[test]
    fn sensitive_directories_blocked() {
        assert!(check_path("config/secrets/db.ts").is_some());
        assert!(check_path("node_modules/lodash/index.js").is_some());
        assert!(check_path(".git/config").is_some());
        assert!(check_path(".drafting/keys/profile.key").is_some());
    }

    #[test]
    fn windows_separators_handled() {
        assert!(check_path("config\\secrets\\db.ts").is_some());
    }

    #[test]
    fn dir_names_only_match_directory_segments() {
        // A *file* named "private" or "secrets.ts" is not a directory match.
        assert!(check_path("src/private").is_none());
        assert!(check_path("src/secrets.ts").is_none());
    }
}
