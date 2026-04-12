export type ProviderId = "anthropic" | "openAi" | "ollama" | { custom: string };

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  apiBase: string;
  apiKeySet: boolean;
  enabled: boolean;
  models: string[];
}

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

export interface TaskRoute {
  taskId: TaskId;
  providerId: ProviderId;
  model: string;
}

export interface AiConfig {
  globalEnabled: boolean;
  providers: ProviderConfig[];
  routes: TaskRoute[];
  monthlyBudgetUsd: number | null;
  currentMonthUsageUsd: number;
}
