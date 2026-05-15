import { invoke } from "@tauri-apps/api/core";

/** Rust-resolved project root — the nearest ancestor containing CLAUDE.md,
 *  pnpm-workspace.yaml, or .git. In dev, the process cwd is src-tauri/ which
 *  is useless, so we never fall back to ".". */
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

/** Synchronous accessor for components that need the root NOW and have already
 *  awaited `getProjectRoot()` once earlier in the app lifecycle. Falls back
 *  to "." so callers using it before bootstrap get the old (broken) behavior
 *  instead of crashing. */
export function getProjectRootSync(): string {
  return cachedRoot ?? ".";
}
