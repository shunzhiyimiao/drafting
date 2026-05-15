// --- Profile model (matches Rust ai_provider::types) ----------------------

export type Protocol = "anthropic" | "openai-compatible" | "ollama";

export type AuthScheme =
  | { kind: "anthropic-key" }
  | { kind: "bearer" }
  | { kind: "none" }
  | { kind: "custom-header"; name: string };

export interface Profile {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  endpointPath: string;
  authScheme: AuthScheme;
  apiKeySet: boolean;
  enabled: boolean;
  models: string[];
  /** Sorted map for deterministic serialization. */
  extraHeaders: Record<string, string>;
  builtin: boolean;
}

export interface ProfilePreset {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  endpointPath: string;
  authScheme: AuthScheme;
  suggestedModels: string[];
  docsUrl: string;
}

// --- Tasks (unchanged ids) -------------------------------------------------

export type TaskId =
  | "editorCompletion"
  | "editorChat"
  | "editorExplain"
  | "editorRefactor"
  | "blueprintDraft"
  | "blueprintCheck"
  | "blueprintSuggestCriteria"
  | "patchboardSuggestSocket"
  | "patchboardSuggestAdapter"
  | "gitCommitMessage";

export const TASK_LABELS: Record<TaskId, string> = {
  editorCompletion: "Code Completion",
  editorChat: "Editor Chat",
  editorExplain: "Code Explain",
  editorRefactor: "Code Refactor",
  blueprintDraft: "Blueprint Draft",
  blueprintCheck: "Blueprint Check",
  blueprintSuggestCriteria: "Suggest Criteria",
  patchboardSuggestSocket: "Suggest Socket",
  patchboardSuggestAdapter: "Suggest Adapter",
  gitCommitMessage: "Commit Message",
};

/** Routes now point at a Profile id (ULID). */
export interface TaskRoute {
  taskId: TaskId;
  profileId: string;
  model: string;
}

export interface AiConfig {
  globalEnabled: boolean;
  profiles: Profile[];
  routes: TaskRoute[];
  monthlyBudgetUsd: number | null;
  currentMonthUsageUsd: number;
}

export interface HealthCheckResult {
  ok: boolean;
  error: string | null;
}

export interface ClaudeCodeImportResult {
  imported: Profile[];
  notes: string[];
}

// --- Streaming chat (unchanged shape; provider field renamed in Rust) ------

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatRequest {
  /** Empty string means "use the route's default model". */
  model: string;
  system?: string | null;
  messages: ChatMessage[];
  temperature?: number | null;
  maxTokens?: number | null;
}

export type StreamEvent =
  | {
      type: "started";
      streamId: string;
      profileId: string;
      model: string;
    }
  | { type: "delta"; streamId: string; text: string }
  | {
      type: "completed";
      streamId: string;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "cancelled"; streamId: string }
  | { type: "failed"; streamId: string; error: string };
