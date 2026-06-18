use std::path::Path;

use git2::{
    BranchType, Cred, CredentialType, DiffOptions, FetchOptions, PushOptions, RemoteCallbacks,
    Repository, RepositoryOpenFlags, Status, StatusOptions,
};

use crate::git::types::*;

pub fn open_repo(project_root: &Path) -> Result<Repository, git2::Error> {
    // NO_SEARCH: only open a repository rooted exactly at the workspace.
    // Without it, open_ext walks up parent directories — a workspace without
    // .git inside e.g. the user's home directory would resolve to a stray
    // ancestor repo and status() would then scan that entire tree (observed:
    // an accidental `git init` in $HOME froze the Git view for minutes).
    Repository::open_ext(
        project_root,
        RepositoryOpenFlags::NO_SEARCH,
        &[] as &[&std::ffi::OsStr],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn open_repo_does_not_search_ancestors() {
        let dir = TempDir::new().unwrap();
        Repository::init(dir.path()).unwrap();
        let nested = dir.path().join("sub/project");
        std::fs::create_dir_all(&nested).unwrap();

        // The repo root itself opens fine…
        assert!(open_repo(dir.path()).is_ok());
        // …but a nested workspace must NOT resolve to the ancestor repo.
        assert!(open_repo(&nested).is_err());
    }

    fn set_identity(repo_path: &Path) {
        let repo = open_repo(repo_path).unwrap();
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@example.com").unwrap();
    }

    #[test]
    fn push_then_pull_roundtrip_via_local_remote() {
        // Bare repo acts as the remote — a local file remote needs no auth,
        // so this exercises the fetch/push/pull plumbing in isolation.
        let remote = TempDir::new().unwrap();
        Repository::init_bare(remote.path()).unwrap();
        let url = remote.path().to_str().unwrap();

        // Clone A, make a commit, push it.
        let a = TempDir::new().unwrap();
        Repository::clone(url, a.path()).unwrap();
        set_identity(a.path());
        std::fs::write(a.path().join("file.txt"), "hello").unwrap();
        stage_file(a.path(), "file.txt").unwrap();
        commit(a.path(), "first").unwrap();
        let (rname, _) = push(a.path()).unwrap();
        assert_eq!(rname, "origin");

        // Clone B sees the pushed commit.
        let b = TempDir::new().unwrap();
        Repository::clone(url, b.path()).unwrap();
        set_identity(b.path());
        assert!(b.path().join("file.txt").exists());

        // A commits again and pushes.
        std::fs::write(a.path().join("file2.txt"), "world").unwrap();
        stage_file(a.path(), "file2.txt").unwrap();
        commit(a.path(), "second").unwrap();
        push(a.path()).unwrap();

        // B fetch sees it as behind; pull fast-forwards and lands the file.
        assert_eq!(fetch(b.path(), "origin").unwrap(), 1);
        let (received, fast_forwarded) = pull(b.path(), "origin").unwrap();
        assert!(fast_forwarded);
        assert_eq!(received, 1);
        assert!(b.path().join("file2.txt").exists());
    }

    #[test]
    fn push_without_remote_errors_clearly() {
        let dir = TempDir::new().unwrap();
        Repository::init(dir.path()).unwrap();
        set_identity(dir.path());
        std::fs::write(dir.path().join("f.txt"), "x").unwrap();
        stage_file(dir.path(), "f.txt").unwrap();
        commit(dir.path(), "c").unwrap();
        let err = push(dir.path()).unwrap_err();
        assert!(err.contains("not found"), "unexpected error: {err}");
    }
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
        None => {
            // Unborn branch (fresh repo, no commits yet): HEAD is a symbolic
            // ref to a branch that doesn't exist yet — surface that name
            // instead of an empty string (which the UI renders as detached).
            let unborn = repo
                .find_reference("HEAD")
                .ok()
                .and_then(|r| r.symbolic_target().map(String::from))
                .and_then(|t| t.strip_prefix("refs/heads/").map(String::from))
                .unwrap_or_default();
            (unborn, false)
        }
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
    // Untracked files (everything, in a freshly-init'd repo) have no index
    // entry — without these flags their diff is silently empty.
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    opts.show_untracked_content(true);

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

// ---------------------------------------------------------------------------
// Remote operations (fetch / pull / push)
//
// Authentication is delegated entirely to the system git credential helper
// and ssh-agent — Drafting stores no tokens, passwords, or SSH keys itself
// (design Part 12, hard constraints 3-4).
// ---------------------------------------------------------------------------

/// Build remote callbacks whose credentials handler tries, in order:
///   1. ssh-agent (for ssh:// and git@host: URLs)
///   2. the system credential helper from git config (for https:// — e.g.
///      osxkeychain on macOS, manager-core on Windows, libsecret on Linux)
/// A try counter aborts after a handful of attempts so a wrong credential
/// can't spin libgit2 in an infinite re-prompt loop.
fn make_remote_callbacks(repo: &Repository) -> RemoteCallbacks<'static> {
    let config = repo.config().ok();
    let tried_ssh = std::cell::Cell::new(false);
    let attempts = std::cell::Cell::new(0u32);

    let mut cb = RemoteCallbacks::new();
    cb.credentials(move |url, username_from_url, allowed| {
        attempts.set(attempts.get() + 1);
        if attempts.get() > 6 {
            return Err(git2::Error::from_str(
                "authentication failed after several attempts — check your \
                 credential helper / ssh-agent",
            ));
        }
        if allowed.contains(CredentialType::SSH_KEY) && !tried_ssh.get() {
            tried_ssh.set(true);
            return Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"));
        }
        if allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
            if let Some(cfg) = config.as_ref() {
                return Cred::credential_helper(cfg, url, username_from_url);
            }
        }
        if allowed.contains(CredentialType::USERNAME) {
            if let Some(user) = username_from_url {
                return Cred::username(user);
            }
        }
        Err(git2::Error::from_str(
            "no supported authentication method for this remote",
        ))
    });
    cb
}

/// Remote name tracked by the current branch, falling back to "origin".
fn upstream_remote_name(repo: &Repository) -> String {
    repo.head()
        .ok()
        .and_then(|h| h.name().map(String::from))
        .and_then(|refname| repo.branch_upstream_remote(&refname).ok())
        .and_then(|buf| buf.as_str().map(String::from))
        .unwrap_or_else(|| "origin".to_string())
}

/// Commits the upstream of HEAD is ahead of HEAD (i.e. waiting to be pulled).
fn behind_upstream(repo: &Repository) -> u32 {
    let head = match repo.head().ok().and_then(|h| h.target()) {
        Some(oid) => oid,
        None => return 0,
    };
    let upstream = repo
        .revparse_single("@{u}")
        .ok()
        .and_then(|o| o.peel_to_commit().ok());
    match upstream {
        Some(up) => repo.graph_ahead_behind(head, up.id()).unwrap_or((0, 0)).1 as u32,
        None => 0,
    }
}

pub fn fetch(project_root: &Path, remote_name: &str) -> Result<u32, String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let mut remote = repo
        .find_remote(remote_name)
        .map_err(|_| format!("remote '{remote_name}' not found"))?;
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(make_remote_callbacks(&repo));
    // Empty refspec list → use the remote's configured fetch refspecs.
    remote
        .fetch(&[] as &[&str], Some(&mut fo), None)
        .map_err(|e| e.to_string())?;
    Ok(behind_upstream(&repo))
}

/// Fast-forward pull only. A real merge (diverged history) is refused with a
/// clear message pointing at the terminal — v1 does not auto-merge to avoid
/// leaving the tree half-merged (design: complex ops go to the terminal).
/// Returns (commits_received, fast_forwarded).
pub fn pull(project_root: &Path, remote_name: &str) -> Result<(u32, bool), String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    {
        let mut remote = repo
            .find_remote(remote_name)
            .map_err(|_| format!("remote '{remote_name}' not found"))?;
        let mut fo = FetchOptions::new();
        fo.remote_callbacks(make_remote_callbacks(&repo));
        remote
            .fetch(&[] as &[&str], Some(&mut fo), None)
            .map_err(|e| e.to_string())?;
    }

    let upstream = repo
        .revparse_single("@{u}")
        .map_err(|_| "current branch has no upstream to pull from".to_string())?
        .peel_to_commit()
        .map_err(|e| e.to_string())?;
    let received = behind_upstream(&repo);

    let annotated = repo
        .find_annotated_commit(upstream.id())
        .map_err(|e| e.to_string())?;
    let (analysis, _) = repo.merge_analysis(&[&annotated]).map_err(|e| e.to_string())?;

    if analysis.is_up_to_date() {
        return Ok((0, true));
    }
    if !analysis.is_fast_forward() {
        return Err(
            "Pull needs a merge (local and remote have diverged). Run \
             `git pull` in the terminal — Drafting v1 only fast-forwards."
                .to_string(),
        );
    }

    // Refuse to fast-forward over uncommitted tracked changes: the forced
    // checkout below would clobber them. Untracked files are left alone.
    let st = status(project_root)?;
    if !st.modified.is_empty() || !st.staged.is_empty() || !st.conflicted.is_empty() {
        return Err(
            "You have uncommitted changes — commit or stash them before pulling.".to_string(),
        );
    }

    // Fast-forward: move the branch ref to the upstream commit, then force the
    // work tree + index to match. Force is correct here precisely because the
    // tree is clean (guarded above) and HEAD is a strict ancestor of the
    // target, so there is nothing of the user's to lose.
    let refname = repo
        .head()
        .ok()
        .and_then(|h| h.name().map(String::from))
        .ok_or_else(|| "cannot resolve HEAD for fast-forward".to_string())?;
    let mut reference = repo.find_reference(&refname).map_err(|e| e.to_string())?;
    reference
        .set_target(upstream.id(), "pull: fast-forward")
        .map_err(|e| e.to_string())?;
    repo.set_head(&refname).map_err(|e| e.to_string())?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .map_err(|e| {
            format!("fast-forward updated the branch but the work tree could not be synced: {e}")
        })?;
    Ok((received, true))
}

/// Push the current branch to its upstream remote (fallback "origin"),
/// returning (remote_name, commits_pushed).
pub fn push(project_root: &Path) -> Result<(String, u32), String> {
    let repo = open_repo(project_root).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    if !head.is_branch() {
        return Err("not on a branch (detached HEAD) — cannot push".to_string());
    }
    let branch = head
        .shorthand()
        .ok_or_else(|| "cannot resolve branch name".to_string())?
        .to_string();

    let ahead = {
        let h = head.target();
        let up = repo
            .revparse_single("@{u}")
            .ok()
            .and_then(|o| o.peel_to_commit().ok());
        match (h, up) {
            (Some(h), Some(up)) => repo.graph_ahead_behind(h, up.id()).unwrap_or((0, 0)).0 as u32,
            // No upstream yet (first push of a new branch): everything is ahead.
            _ => 0,
        }
    };

    let remote_name = upstream_remote_name(&repo);
    let mut remote = repo
        .find_remote(&remote_name)
        .map_err(|_| format!("remote '{remote_name}' not found — add one with `git remote add`"))?;
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    let mut po = PushOptions::new();
    po.remote_callbacks(make_remote_callbacks(&repo));
    remote
        .push(&[&refspec], Some(&mut po))
        .map_err(|e| {
            // The most common failure: remote moved on. Give an actionable hint.
            if e.message().contains("fast-forward") || e.message().contains("rejected") {
                format!("push rejected — pull first, then push again ({e})")
            } else {
                e.to_string()
            }
        })?;
    Ok((remote_name, ahead))
}
