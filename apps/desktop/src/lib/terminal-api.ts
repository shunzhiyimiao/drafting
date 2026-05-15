import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  CreateSessionInput,
  SessionInfo,
  SessionOutputPayload,
  SessionExitPayload,
} from "../types/terminal-types";

export async function createSession(
  input: CreateSessionInput,
): Promise<SessionInfo> {
  return invoke("terminal_create_session", { input });
}

export async function writeSession(
  sessionId: string,
  data: string,
): Promise<void> {
  return invoke("terminal_write", { sessionId, data });
}

export async function resizeSession(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("terminal_resize", { sessionId, cols, rows });
}

export async function closeSession(sessionId: string): Promise<void> {
  return invoke("terminal_close", { sessionId });
}

export async function listSessions(): Promise<SessionInfo[]> {
  return invoke("terminal_list");
}

export function onSessionOutput(
  callback: (payload: SessionOutputPayload) => void,
): Promise<UnlistenFn> {
  return listen<SessionOutputPayload>("terminal://output", (event) =>
    callback(event.payload),
  );
}

export function onSessionExit(
  callback: (payload: SessionExitPayload) => void,
): Promise<UnlistenFn> {
  return listen<SessionExitPayload>("terminal://exit", (event) =>
    callback(event.payload),
  );
}

// --- Command history --------------------------------------------------------

export interface HistoryEntry {
  id: string;
  command: string;
  cwd: string;
  timestamp: number;
}

export async function recordCommand(
  projectRoot: string,
  command: string,
  cwd: string,
): Promise<HistoryEntry | null> {
  return invoke("terminal_record_command", { projectRoot, command, cwd });
}

export async function historyList(
  projectRoot: string,
  limit = 200,
): Promise<HistoryEntry[]> {
  return invoke("terminal_history_list", { projectRoot, limit });
}

export async function historySearch(
  projectRoot: string,
  query: string,
  limit = 50,
): Promise<HistoryEntry[]> {
  return invoke("terminal_history_search", { projectRoot, query, limit });
}
