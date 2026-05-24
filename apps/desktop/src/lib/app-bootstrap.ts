import { invoke } from "@tauri-apps/api/core";

/** Rust-resolved project root — backed by the persisted workspace pref or,
 *  if none, the nearest ancestor containing CLAUDE.md / pnpm-workspace.yaml
 *  / .git. */
let cachedRoot: string | null = null;
let pending: Promise<string> | null = null;

export async function getProjectRoot(): Promise<string> {
  if (cachedRoot) return cachedRoot;
  if (pending) return pending;
  pending = invoke<string>("app_get_cwd").then((root) => {
    cachedRoot = root;
    pending = null;
    return root;
  });
  return pending;
}

export function getProjectRootSync(): string {
  return cachedRoot ?? ".";
}

/** Switch the active workspace. Persists, then reloads the window so every
 *  store re-initializes against the new root. */
export async function setWorkspace(path: string): Promise<string> {
  const resolved = await invoke<string>("app_set_workspace", { path });
  cachedRoot = resolved;
  // Full reload is the simplest way to re-bootstrap every subsystem.
  window.location.reload();
  return resolved;
}

export async function getRecentWorkspaces(): Promise<string[]> {
  return invoke<string[]>("app_get_recent_workspaces");
}
