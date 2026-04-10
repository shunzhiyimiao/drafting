export interface CreateSessionInput {
  cwd?: string | null;
  shell?: string | null;
  cols: number;
  rows: number;
  command?: string | null;
}

export interface SessionInfo {
  id: string;
  cwd: string;
  shell: string;
  createdAt: number;
  exitCode: number | null;
}

export interface SessionOutputPayload {
  sessionId: string;
  data: string;
}

export interface SessionExitPayload {
  sessionId: string;
  exitCode: number;
}
