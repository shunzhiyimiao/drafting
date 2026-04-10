use std::path::Path;

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
];

const MAX_FILE_SEARCH_SIZE: u64 = 2 * 1024 * 1024; // 2MB — skip bigger files

pub fn search(
    project_root: &Path,
    query: &str,
    case_sensitive: bool,
) -> std::io::Result<SearchResult> {
    if query.is_empty() {
        return Ok(SearchResult {
            total_matches: 0,
            total_files: 0,
            matches: Vec::new(),
            truncated: false,
        });
    }

    let needle = if case_sensitive {
        query.to_string()
    } else {
        query.to_lowercase()
    };

    let mut matches = Vec::new();
    let mut total_matches = 0u32;
    let mut total_files = 0u32;
    let mut truncated = false;

    walk(
        project_root,
        project_root,
        &needle,
        case_sensitive,
        &mut matches,
        &mut total_matches,
        &mut total_files,
        &mut truncated,
    )?;

    Ok(SearchResult {
        total_matches,
        total_files,
        matches,
        truncated,
    })
}

#[allow(clippy::too_many_arguments)]
fn walk(
    root: &Path,
    dir: &Path,
    needle: &str,
    case_sensitive: bool,
    matches: &mut Vec<SearchMatch>,
    total_matches: &mut u32,
    total_files: &mut u32,
    truncated: &mut bool,
) -> std::io::Result<()> {
    if *total_files > MAX_SEARCH_FILES {
        *truncated = true;
        return Ok(());
    }

    let read = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return Ok(()),
    };

    for entry in read.flatten() {
        if *total_files > MAX_SEARCH_FILES || matches.len() >= MAX_SEARCH_MATCHES as usize {
            *truncated = true;
            return Ok(());
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

        if file_type.is_dir() {
            walk(
                root,
                &path,
                needle,
                case_sensitive,
                matches,
                total_matches,
                total_files,
                truncated,
            )?;
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if metadata.len() > MAX_FILE_SEARCH_SIZE {
            continue;
        }

        *total_files += 1;

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        for (line_idx, line) in content.lines().enumerate() {
            let haystack = if case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };
            if let Some(col) = haystack.find(needle) {
                *total_matches += 1;
                if matches.len() < MAX_SEARCH_MATCHES as usize {
                    matches.push(SearchMatch {
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
    }

    Ok(())
}
