import { invoke } from "@tauri-apps/api/core";
import type {
  GitStatus,
  BranchInfo,
  CommitInfo,
  FileDiff,
} from "../types/git-types";

export async function getStatus(projectRoot: string): Promise<GitStatus> {
  return invoke("git_status", { projectRoot });
}

export async function getBranches(projectRoot: string): Promise<BranchInfo[]> {
  return invoke("git_branches", { projectRoot });
}

export async function getLog(
  projectRoot: string,
  limit?: number,
): Promise<CommitInfo[]> {
  return invoke("git_log", { projectRoot, limit });
}

export async function getDiff(
  projectRoot: string,
  path: string,
): Promise<FileDiff> {
  return invoke("git_diff_file", { projectRoot, path });
}

export async function stageFile(
  projectRoot: string,
  path: string,
): Promise<void> {
  return invoke("git_stage_file", { projectRoot, path });
}

export async function unstageFile(
  projectRoot: string,
  path: string,
): Promise<void> {
  return invoke("git_unstage_file", { projectRoot, path });
}

export async function commit(
  projectRoot: string,
  message: string,
): Promise<string> {
  return invoke("git_commit", { projectRoot, message });
}

export async function checkoutBranch(
  projectRoot: string,
  name: string,
): Promise<void> {
  return invoke("git_checkout_branch", { projectRoot, name });
}

export async function createBranch(
  projectRoot: string,
  name: string,
): Promise<void> {
  return invoke("git_create_branch", { projectRoot, name });
}
