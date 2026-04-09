/**
 * TypeScript mirror of Rust Sync Bus event types.
 * Manually maintained in Phase 0; will use ts-rs auto-generation later.
 *
 * These types match the serde serialization format from events.rs.
 */

// -- Terminal --

export type TerminalEvent =
  | { type: "SessionCreated"; data: { session_id: string; display_mode: string; cwd: string; command: string | null } }
  | { type: "SessionFinished"; data: { session_id: string; exit_code: number; duration_ms: number } }
  | { type: "SessionCancelled"; data: { session_id: string } }
  | { type: "SessionPromotedToUi"; data: { session_id: string; tab_id: string } }
  | { type: "UserCommandStarted"; data: { session_id: string; command: string } }
  | { type: "UserCommandFinished"; data: { session_id: string; command: string; exit_code: number; duration_ms: number } };

// -- Git --

export type GitEvent =
  | { type: "StatusChanged"; data: { modified: number; added: number; deleted: number; untracked: number; conflicted: number } }
  | { type: "FileStatusChanged"; data: { path: string; old_status: string; new_status: string } }
  | { type: "CommitCreated"; data: { commit_hash: string; message: string; files_count: number } }
  | { type: "BranchCreated"; data: { name: string } }
  | { type: "BranchDeleted"; data: { name: string } }
  | { type: "BranchCheckedOut"; data: { from: string; to: string } }
  | { type: "FetchCompleted"; data: { remote: string; commits_received: number } }
  | { type: "PullCompleted"; data: { from: string; commits_received: number; has_conflicts: boolean } }
  | { type: "PushCompleted"; data: { to: string; commits_pushed: number } }
  | { type: "OperationFailed"; data: { operation: string; reason: string } };

// -- Editor --

export type EditorEvent =
  | { type: "FileOpened"; data: { path: string; identity: string | null } }
  | { type: "FileClosed"; data: { path: string } }
  | { type: "FileSaved"; data: { path: string } }
  | { type: "FileChanged"; data: { path: string } }
  | { type: "FileRenamed"; data: { old_path: string; new_path: string } }
  | { type: "TabActivated"; data: { path: string } }
  | { type: "DiagnosticsChanged"; data: { path: string; errors: number; warnings: number } }
  | { type: "LspReady"; data: { language: string } }
  | { type: "LspFailed"; data: { language: string; reason: string } }
  | { type: "CompletionShown"; data: { stream_id: string } }
  | { type: "CompletionAccepted"; data: { stream_id: string; accepted_chars: number } }
  | { type: "CompletionRejected"; data: { stream_id: string } }
  | { type: "FileIdentityChanged"; data: { path: string; identity: string } };

// -- Editor Commands --

export type EditorCommandEvent =
  | { type: "OpenFile"; data: { path: string; line: number | null; column: number | null } }
  | { type: "CloseFile"; data: { path: string } }
  | { type: "SaveAll" }
  | { type: "ReloadFile"; data: { path: string } }
  | { type: "SetReadonly"; data: { path: string; readonly: boolean } };

// -- AI Provider --

export type AiProviderEvent =
  | { type: "ProviderAdded"; data: { provider_id: string } }
  | { type: "ProviderRemoved"; data: { provider_id: string } }
  | { type: "TaskRouteChanged"; data: { task_id: string; new_provider: string; new_model: string } }
  | { type: "StreamStarted"; data: { stream_id: string; task: string; provider: string; model: string } }
  | { type: "StreamCompleted"; data: { stream_id: string; input_tokens: number; output_tokens: number; cost_usd: number } }
  | { type: "StreamCancelled"; data: { stream_id: string } }
  | { type: "StreamFailed"; data: { stream_id: string; error: string } }
  | { type: "BudgetWarning"; data: { used_usd: number; limit_usd: number; percent: number } }
  | { type: "BudgetExceeded"; data: { used_usd: number; limit_usd: number } }
  | { type: "PrivacyViolationBlocked"; data: { task: string; reason: string; file: string } };

// -- Patchboard --

export type PatchboardEvent =
  | { type: "CodeGenerated"; data: { canvas_id: string; files: string[] } }
  | { type: "RegistryChanged" }
  | { type: "CanvasChanged"; data: { canvas_id: string } };

// -- Blueprint --

export type BlueprintEvent =
  | { type: "FeatureCreated"; data: { feature_id: string } }
  | { type: "FeatureUpdated"; data: { feature_id: string } }
  | { type: "CheckCompleted"; data: { feature_id: string; passed: boolean } }
  | { type: "IndexChanged" };

// -- Headquarters --

export type HeadquartersEvent =
  | { type: "RefreshRequested" }
  | { type: "SuggestionChanged"; data: { level: number; message: string } };

// -- Top-level --

export type SyncBusEvent =
  | { domain: "Terminal"; event: TerminalEvent }
  | { domain: "Git"; event: GitEvent }
  | { domain: "Editor"; event: EditorEvent }
  | { domain: "EditorCommand"; event: EditorCommandEvent }
  | { domain: "AiProvider"; event: AiProviderEvent }
  | { domain: "Patchboard"; event: PatchboardEvent }
  | { domain: "Blueprint"; event: BlueprintEvent }
  | { domain: "Headquarters"; event: HeadquartersEvent };
