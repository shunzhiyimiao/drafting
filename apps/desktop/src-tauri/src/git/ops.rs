use std::path::Path;

use git2::{
    BranchType, DiffOptions, Repository, RepositoryOpenFlags, Status, StatusOptions,
};

use crate::git::types::*;

pub fn open_repo(project_root: &Path) -> Result<Repository, git2::Error> {
    Repository::open_ext(
        project_root,
        RepositoryOpenFlags::empty(),
        &[] as &[&std::ffi::OsStr],
    )
}

pub fn status(project_root: &Path) -> Result<GitStatus, String> {
    let repo = match open_repo(project_root) {
        Ok(r) => r,
        Err(_) => {
            return Ok(GitStatus {
                branch: String::new(),
                is_detached: false,
                ahead: 0,
                behind: 0,
                modified: vec![],
                staged: vec![],
                untracked: vec![],
                conflicted: vec![],
                is_clean: true,
                is_repo: false,
            });
        }
    };

    let head = repo.head().ok();
    let (branch, is_detached) = match head.as_ref() {
        Some(h) if h.is_branch() => (
            h.shorthand().unwrap_or("").to_string(),
            false,
        ),
        Some(h) => (
            h.target()
                .map(|oid| oid.to_string()[..7].to_string())
                .unwrap_or_default(),
            true,
        ),
        None => ("".to_string(), false),
    };

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .exclude_submodules(false);

    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

    let mut modified = Vec::new();
    let mut staged = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicted = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let s = entry.status();

        if s.contains(Status::CONFLICTED) {
            conflicted.push(FileStatus {
                path: path.clone(),
                status: "conflicted".to_string(),
            });
            continue;
        }

        if s.contains(Status::WT_NEW) {
            untracked.push(FileStatus {
                path: path.clone(),
                status: "untracked".to_string(),
            });
        }

        if s.intersects(
            Status::WT_MODIFIED | Status::WT_DELETED | Status::WT_RENAMED | Status::WT_TYPECHANGE,
        ) {
            let label = if s.contains(Status::WT_DELETED) {
                "deleted"
            } else if s.contains(Status::WT_RENAMED) {
                "renamed"
            } else {
                "modified"
            };
            modified.push(FileStatus {
                path: path.clone(),
                status: label.to_string(),
            });
        }

        if s.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        ) {
            let label = if s.contains(Status::INDEX_NEW) {
                "added"
            } else if s.contains(Status::INDEX_DELETED) {
                "deleted"
            } else if s.contains(Status::INDEX_RENAMED) {
                "renamed"
            } else {
                "modified"
            };
            staged.push(FileStatus {
                path: path.clone(),
                status: label.to_string(),
            });
        }
    }

    // Ahead/behind — compare HEAD to its upstream
    let (ahead, behind) = {
        if let Some(h) = head.as_ref() {
            if let Ok(branch_ref) = h.resolve() {
                if let Some(oid) = branch_ref.target() {
                    let upstream = repo.revparse_single("@{u}").ok().and_then(|o| o.peel_to_commit().ok());
                    if let Some(up) = upstream {
                        repo.graph_ahead_behind(oid, up.id()).unwrap_or((0, 0))
                    } else {
                        (0, 0)
                    }
                } else {
                    (0, 0)
                }
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        }
    };

    let is_clean =
        modified.is_empty() && staged.is_empty() && untracked.is_empty() && conflicted.is_empty();

    Ok(GitStatus {
        branch,
        is_detached,
        ahead: ahead as u32,
        behind: behind as u32,
        modified,
        staged,
        untracked,
        conflicted,
        is_clean,
        is_repo: true,
    })
}

pub fn list_branches(project_root: &Path) -> Result<Vec<BranchInfo>, String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let head_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_default();

    let mut result = Vec::new();
    let branches = repo.branches(None).map_err(|e| e.to_string())?;
    for branch_res in branches {
        if let Ok((branch, branch_type)) = branch_res {
            if let Ok(Some(name)) = branch.name() {
                result.push(BranchInfo {
                    name: name.to_string(),
                    is_current: name == head_name && branch_type == BranchType::Local,
                    is_remote: branch_type == BranchType::Remote,
                });
            }
        }
    }
    Ok(result)
}

pub fn log(project_root: &Path, limit: usize) -> Result<Vec<CommitInfo>, String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;

    let mut commits = Vec::new();
    for (i, oid_res) in revwalk.enumerate() {
        if i >= limit {
            break;
        }
        let oid = oid_res.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        let hash = commit.id().to_string();
        let short_hash = hash[..7].to_string();
        commits.push(CommitInfo {
            hash,
            short_hash,
            author: commit.author().name().unwrap_or("").to_string(),
            email: commit.author().email().unwrap_or("").to_string(),
            message: commit.message().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
        });
    }
    Ok(commits)
}

pub fn diff_file(project_root: &Path, path: &str) -> Result<FileDiff, String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(path);
    opts.context_lines(3);

    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| e.to_string())?;

    use std::cell::RefCell;
    let hunks_cell: RefCell<Vec<DiffHunk>> = RefCell::new(Vec::new());
    let current_cell: RefCell<Option<DiffHunk>> = RefCell::new(None);

    diff.foreach(
        &mut |_delta, _progress| true,
        None,
        Some(&mut |_delta, hunk| {
            let mut current = current_cell.borrow_mut();
            if let Some(h) = current.take() {
                hunks_cell.borrow_mut().push(h);
            }
            let header = String::from_utf8_lossy(hunk.header()).to_string();
            *current = Some(DiffHunk {
                old_start: hunk.old_start(),
                old_lines: hunk.old_lines(),
                new_start: hunk.new_start(),
                new_lines: hunk.new_lines(),
                header,
                lines: vec![],
            });
            true
        }),
        Some(&mut |_delta, _hunk, line| {
            let origin = line.origin().to_string();
            let content = String::from_utf8_lossy(line.content())
                .trim_end_matches('\n')
                .to_string();
            let mut current = current_cell.borrow_mut();
            if let Some(ref mut h) = *current {
                h.lines.push(DiffLine {
                    origin,
                    content,
                    old_lineno: line.old_lineno(),
                    new_lineno: line.new_lineno(),
                });
            }
            true
        }),
    )
    .map_err(|e| e.to_string())?;

    if let Some(h) = current_cell.into_inner() {
        hunks_cell.borrow_mut().push(h);
    }

    Ok(FileDiff {
        path: path.to_string(),
        hunks: hunks_cell.into_inner(),
    })
}

/// Unified text patch of all staged changes (HEAD → index). Used as input for
/// AI commit message generation.
///
/// Returns an empty string when there are no staged changes. The patch is
/// clamped to [`max_bytes`] bytes so huge refactors don't blow the AI context
/// window.
pub fn staged_diff_patch(project_root: &Path, max_bytes: usize) -> Result<String, String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let head_tree = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_tree().ok());

    let mut opts = DiffOptions::new();
    opts.context_lines(3);
    let diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
        .map_err(|e| e.to_string())?;

    use std::cell::RefCell;
    let buf: RefCell<String> = RefCell::new(String::new());
    let truncated = std::cell::Cell::new(false);

    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        if truncated.get() {
            return true;
        }
        let mut b = buf.borrow_mut();
        if b.len() >= max_bytes {
            truncated.set(true);
            return true;
        }
        // line origins: ' ', '+', '-', 'F' (file header), 'H' (hunk header), etc.
        match line.origin() {
            '+' | '-' | ' ' => b.push(line.origin()),
            _ => {}
        }
        let content = String::from_utf8_lossy(line.content());
        let remaining = max_bytes.saturating_sub(b.len());
        if content.len() > remaining {
            b.push_str(&content[..remaining]);
            truncated.set(true);
        } else {
            b.push_str(&content);
        }
        true
    })
    .map_err(|e| e.to_string())?;

    let mut out = buf.into_inner();
    if truncated.get() {
        out.push_str("\n... [diff truncated] ...\n");
    }
    Ok(out)
}

pub fn stage_file(project_root: &Path, path: &str) -> Result<(), String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index
        .add_path(Path::new(path))
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn unstage_file(project_root: &Path, path: &str) -> Result<(), String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let head = repo.head().and_then(|h| h.peel_to_commit()).ok();
    if let Some(commit) = head {
        repo.reset_default(Some(commit.as_object()), [path])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn commit(
    project_root: &Path,
    message: &str,
) -> Result<String, String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_oid).map_err(|e| e.to_string())?;

    let sig = repo.signature().map_err(|e| e.to_string())?;

    let parent_commit = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok());

    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
        .map_err(|e| e.to_string())?;

    Ok(oid.to_string())
}

pub fn checkout_branch(project_root: &Path, name: &str) -> Result<(), String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let ref_name = format!("refs/heads/{}", name);
    let obj = repo
        .revparse_single(&ref_name)
        .map_err(|e| e.to_string())?;
    repo.checkout_tree(&obj, None).map_err(|e| e.to_string())?;
    repo.set_head(&ref_name).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn create_branch(project_root: &Path, name: &str) -> Result<(), String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let head_commit = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .map_err(|e| e.to_string())?;
    repo.branch(name, &head_commit, false)
        .map_err(|e| e.to_string())?;
    Ok(())
}
