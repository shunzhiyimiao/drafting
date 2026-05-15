//! Advanced project search: regex / whole-word / glob filters, grouped by
//! file, with progress + cancellation.
//!
//! Blocking IO runs on `tokio::task::spawn_blocking`. The frontend gets a
//! stream of `editor://search-progress` events (one per ~500 files scanned)
//! plus the final grouped result.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

use regex::{Regex, RegexBuilder};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::editor::types::*;

const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    ".drafting",
    ".atlas",
    ".blueprint",
    "target",
    "dist",
    ".next",
    ".turbo",
    ".cache",
    "build",
];

const MAX_FILE_SEARCH_SIZE: u64 = 2 * 1024 * 1024; // 2MB per file
const PROGRESS_EVERY: u32 = 500;

/// Registry of in-flight searches, keyed by search_id.
#[derive(Default)]
pub struct SearchRegistry {
    cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl SearchRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn register(&self, search_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.cancel_flags
            .lock()
            .await
            .insert(search_id.to_string(), flag.clone());
        flag
    }

    pub async fn unregister(&self, search_id: &str) {
        self.cancel_flags.lock().await.remove(search_id);
    }

    pub async fn cancel(&self, search_id: &str) -> bool {
        let flags = self.cancel_flags.lock().await;
        if let Some(flag) = flags.get(search_id) {
            flag.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }
}

struct WalkState {
    total_matches: AtomicU32,
    scanned_files: AtomicU32,
    matched_files: AtomicU32,
    cancel: Arc<AtomicBool>,
}

pub async fn run_advanced_search(
    app: AppHandle,
    project_root: &Path,
    opts: SearchOptions,
    registry: Arc<SearchRegistry>,
) -> Result<AdvancedSearchResult, String> {
    if opts.query.is_empty() {
        return Ok(AdvancedSearchResult {
            total_matches: 0,
            total_files: 0,
            scanned_files: 0,
            files: vec![],
            truncated: false,
            cancelled: false,
        });
    }

    let matcher = build_matcher(&opts)?;
    let include = compile_globs(&opts.include_globs);
    let exclude = compile_globs(&opts.exclude_globs);

    let search_id = opts
        .search_id
        .clone()
        .unwrap_or_else(|| ulid::Ulid::new().to_string());
    let cancel_flag = registry.register(&search_id).await;

    let project_root = project_root.to_path_buf();

    let app_clone = app.clone();
    let search_id_for_task = search_id.clone();
    let result: Result<AdvancedSearchResult, String> =
        tokio::task::spawn_blocking(move || {
            let state = WalkState {
                total_matches: AtomicU32::new(0),
                scanned_files: AtomicU32::new(0),
                matched_files: AtomicU32::new(0),
                cancel: cancel_flag,
            };
            let mut files: Vec<FileMatches> = Vec::new();
            let mut truncated = false;

            walk(
                &project_root,
                &project_root,
                &matcher,
                &include,
                &exclude,
                &state,
                &mut files,
                &mut truncated,
                &app_clone,
                &search_id_for_task,
            );

            Ok(AdvancedSearchResult {
                total_matches: state.total_matches.load(Ordering::Relaxed),
                total_files: state.matched_files.load(Ordering::Relaxed),
                scanned_files: state.scanned_files.load(Ordering::Relaxed),
                files,
                truncated,
                cancelled: state.cancel.load(Ordering::SeqCst),
            })
        })
        .await
        .map_err(|e| format!("search task panicked: {e}"))?;

    registry.unregister(&search_id).await;
    result
}

enum Matcher {
    Literal { needle: String, case_sensitive: bool, whole_word: bool },
    Regex(Regex),
}

fn build_matcher(opts: &SearchOptions) -> Result<Matcher, String> {
    if opts.use_regex {
        let mut builder = RegexBuilder::new(&opts.query);
        builder.case_insensitive(!opts.case_sensitive);
        let rx = builder
            .build()
            .map_err(|e| format!("invalid regex: {e}"))?;
        Ok(Matcher::Regex(rx))
    } else {
        Ok(Matcher::Literal {
            needle: if opts.case_sensitive {
                opts.query.clone()
            } else {
                opts.query.to_lowercase()
            },
            case_sensitive: opts.case_sensitive,
            whole_word: opts.whole_word,
        })
    }
}

/// Minimal glob → regex. Supports `*` (any non-slash), `**` (any), `?` (one),
/// and literal path separators. Case-sensitive on all platforms for
/// predictability — users can lowercase by convention.
fn compile_globs(patterns: &[String]) -> Vec<Regex> {
    patterns
        .iter()
        .filter_map(|p| glob_to_regex(p).and_then(|r| Regex::new(&r).ok()))
        .collect()
}

fn glob_to_regex(pattern: &str) -> Option<String> {
    let mut out = String::with_capacity(pattern.len() * 2);
    out.push('^');
    let mut chars = pattern.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' => {
                if chars.peek() == Some(&'*') {
                    chars.next();
                    // Consume optional trailing slash so **/ matches zero dirs too.
                    if chars.peek() == Some(&'/') {
                        chars.next();
                    }
                    out.push_str("(?:.*/)?");
                } else {
                    out.push_str("[^/]*");
                }
            }
            '?' => out.push_str("[^/]"),
            '.' | '+' | '(' | ')' | '|' | '^' | '$' | '{' | '}' | '[' | ']' | '\\' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out.push('$');
    Some(out)
}

fn path_matches_globs(rel_path: &str, patterns: &[Regex]) -> bool {
    if patterns.is_empty() {
        return true;
    }
    patterns.iter().any(|r| r.is_match(rel_path))
}

fn path_matches_any(rel_path: &str, patterns: &[Regex]) -> bool {
    patterns.iter().any(|r| r.is_match(rel_path))
}

#[allow(clippy::too_many_arguments)]
fn walk(
    root: &Path,
    dir: &Path,
    matcher: &Matcher,
    include: &[Regex],
    exclude: &[Regex],
    state: &WalkState,
    files: &mut Vec<FileMatches>,
    truncated: &mut bool,
    app: &AppHandle,
    search_id: &str,
) {
    if state.cancel.load(Ordering::SeqCst) {
        return;
    }
    if state.scanned_files.load(Ordering::Relaxed) >= MAX_SEARCH_FILES {
        *truncated = true;
        return;
    }

    let read = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };

    for entry in read.flatten() {
        if state.cancel.load(Ordering::SeqCst) {
            return;
        }

        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };

        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        if !exclude.is_empty() && path_matches_any(&rel, exclude) {
            continue;
        }

        if file_type.is_dir() {
            walk(
                root, &path, matcher, include, exclude, state, files, truncated, app, search_id,
            );
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        if !path_matches_globs(&rel, include) {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if metadata.len() > MAX_FILE_SEARCH_SIZE {
            continue;
        }

        let scanned = state.scanned_files.fetch_add(1, Ordering::Relaxed) + 1;
        if scanned >= MAX_SEARCH_FILES {
            *truncated = true;
            return;
        }

        if scanned % PROGRESS_EVERY == 0 {
            let _ = app.emit(
                "editor://search-progress",
                SearchProgressPayload {
                    search_id: search_id.to_string(),
                    scanned_files: scanned,
                    matched_files: state.matched_files.load(Ordering::Relaxed),
                    total_matches: state.total_matches.load(Ordering::Relaxed),
                },
            );
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut file_matches: Vec<SearchMatch> = Vec::new();
        for (line_idx, line) in content.lines().enumerate() {
            if let Some(col) = match_in_line(matcher, line) {
                state.total_matches.fetch_add(1, Ordering::Relaxed);
                if file_matches.len() + files.iter().map(|f| f.matches.len()).sum::<usize>()
                    < MAX_SEARCH_MATCHES as usize
                {
                    file_matches.push(SearchMatch {
                        path: rel.clone(),
                        line: (line_idx + 1) as u32,
                        column: (col + 1) as u32,
                        preview: line.trim().chars().take(200).collect(),
                    });
                } else {
                    *truncated = true;
                }
            }
        }

        if !file_matches.is_empty() {
            state.matched_files.fetch_add(1, Ordering::Relaxed);
            files.push(FileMatches {
                path: rel.clone(),
                matches: file_matches,
            });
        }
    }
}

fn match_in_line(matcher: &Matcher, line: &str) -> Option<usize> {
    match matcher {
        Matcher::Regex(rx) => rx.find(line).map(|m| m.start()),
        Matcher::Literal {
            needle,
            case_sensitive,
            whole_word,
        } => {
            let hay_lower_cached; // keep in scope
            let hay = if *case_sensitive {
                line
            } else {
                hay_lower_cached = line.to_lowercase();
                &hay_lower_cached
            };
            let mut start = 0;
            while let Some(pos) = hay[start..].find(needle.as_str()) {
                let abs = start + pos;
                if !*whole_word || is_word_boundary(hay, abs, abs + needle.len()) {
                    return Some(abs);
                }
                start = abs + 1;
                if start >= hay.len() {
                    break;
                }
            }
            None
        }
    }
}

fn is_word_boundary(hay: &str, start: usize, end: usize) -> bool {
    let before = if start == 0 {
        None
    } else {
        hay.as_bytes().get(start - 1).copied()
    };
    let after = hay.as_bytes().get(end).copied();
    let is_word = |b: Option<u8>| match b {
        None => false,
        Some(b) => b.is_ascii_alphanumeric() || b == b'_',
    };
    !is_word(before) && !is_word(after)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glob_basic() {
        let r = Regex::new(&glob_to_regex("*.ts").unwrap()).unwrap();
        assert!(r.is_match("foo.ts"));
        assert!(!r.is_match("src/foo.ts"));
    }

    #[test]
    fn glob_recursive() {
        let r = Regex::new(&glob_to_regex("src/**/*.tsx").unwrap()).unwrap();
        assert!(r.is_match("src/foo.tsx"));
        assert!(r.is_match("src/a/b/c.tsx"));
        assert!(!r.is_match("tests/foo.tsx"));
    }

    #[test]
    fn whole_word_respected() {
        let m = Matcher::Literal {
            needle: "foo".into(),
            case_sensitive: true,
            whole_word: true,
        };
        assert_eq!(match_in_line(&m, "hello foo world"), Some(6));
        assert_eq!(match_in_line(&m, "hello foobar world"), None);
    }

    #[test]
    fn literal_case_insensitive() {
        let m = Matcher::Literal {
            needle: "foo".into(),
            case_sensitive: false,
            whole_word: false,
        };
        assert_eq!(match_in_line(&m, "HELLO FOO"), Some(6));
    }

    #[test]
    fn regex_match() {
        let opts = SearchOptions {
            query: r"\bfn\s+\w+".into(),
            case_sensitive: true,
            use_regex: true,
            ..Default::default()
        };
        let m = build_matcher(&opts).unwrap();
        assert!(match_in_line(&m, "pub fn hello() {").is_some());
        assert!(match_in_line(&m, "no match here").is_none());
    }
}
