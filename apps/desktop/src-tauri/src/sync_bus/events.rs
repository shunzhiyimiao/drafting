use serde::{Deserialize, Serialize};

/// Top-level event type that flows through the Sync Bus.
/// Tagged union: serializes as {"domain": "Terminal", "event": {...}}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "domain", content = "event")]
pub enum SyncBusEvent {
    Terminal(TerminalEvent),
    Git(GitEvent),
    Editor(EditorEvent),
    EditorCommand(EditorCommandEvent),
    AiProvider(AiProviderEvent),
    Patchboard(PatchboardEvent),
    Blueprint(BlueprintEvent),
    Headquarters(HeadquartersEvent),
}

// ---------------------------------------------------------------------------
// Terminal events
// NOTE: SessionOutput is intentionally excluded (high frequency, not broadcast)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum TerminalEvent {
    SessionCreated {
        session_id: String,
        display_mode: String,
        cwd: String,
        command: Option<String>,
    },
    SessionFinished {
        session_id: String,
        exit_code: i32,
        duration_ms: u64,
    },
    SessionCancelled {
        session_id: String,
    },
    SessionPromotedToUi {
        session_id: String,
        tab_id: String,
    },
    UserCommandStarted {
        session_id: String,
        command: String,
    },
    UserCommandFinished {
        session_id: String,
        command: String,
        exit_code: i32,
        duration_ms: u64,
    },
}

// ---------------------------------------------------------------------------
// Git events
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum GitEvent {
    StatusChanged {
        modified: u32,
        added: u32,
        deleted: u32,
        untracked: u32,
        conflicted: u32,
    },
    FileStatusChanged {
        path: String,
        old_status: String,
        new_status: String,
    },
    CommitCreated {
        commit_hash: String,
        message: String,
        files_count: u32,
    },
    BranchCreated {
        name: String,
    },
    BranchDeleted {
        name: String,
    },
    BranchCheckedOut {
        from: String,
        to: String,
    },
    FetchCompleted {
        remote: String,
        commits_received: u32,
    },
    PullCompleted {
        from: String,
        commits_received: u32,
        has_conflicts: bool,
    },
    PushCompleted {
        to: String,
        commits_pushed: u32,
    },
    OperationFailed {
        operation: String,
        reason: String,
    },
}

// ---------------------------------------------------------------------------
// Editor events
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum EditorEvent {
    FileOpened {
        path: String,
        identity: Option<String>,
    },
    FileClosed {
        path: String,
    },
    FileSaved {
        path: String,
    },
    FileChanged {
        path: String,
    },
    FileRenamed {
        old_path: String,
        new_path: String,
    },
    TabActivated {
        path: String,
    },
    DiagnosticsChanged {
        path: String,
        errors: u32,
        warnings: u32,
    },
    LspReady {
        language: String,
    },
    LspFailed {
        language: String,
        reason: String,
    },
    CompletionShown {
        stream_id: String,
    },
    CompletionAccepted {
        stream_id: String,
        accepted_chars: u32,
    },
    CompletionRejected {
        stream_id: String,
    },
    FileIdentityChanged {
        path: String,
        identity: String,
    },
}

// ---------------------------------------------------------------------------
// Editor command events (other modules request editor actions)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum EditorCommandEvent {
    OpenFile {
        path: String,
        line: Option<u32>,
        column: Option<u32>,
    },
    CloseFile {
        path: String,
    },
    SaveAll,
    ReloadFile {
        path: String,
    },
    SetReadonly {
        path: String,
        readonly: bool,
    },
}

// ---------------------------------------------------------------------------
// AI Provider events
// NOTE: StreamProgress is intentionally excluded (high frequency, not broadcast)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum AiProviderEvent {
    ProviderAdded {
        provider_id: String,
    },
    ProviderRemoved {
        provider_id: String,
    },
    TaskRouteChanged {
        task_id: String,
        new_provider: String,
        new_model: String,
    },
    StreamStarted {
        stream_id: String,
        task: String,
        provider: String,
        model: String,
    },
    StreamCompleted {
        stream_id: String,
        input_tokens: u64,
        output_tokens: u64,
        cost_usd: f64,
    },
    StreamCancelled {
        stream_id: String,
    },
    StreamFailed {
        stream_id: String,
        error: String,
    },
    BudgetWarning {
        used_usd: f64,
        limit_usd: f64,
        percent: f64,
    },
    BudgetExceeded {
        used_usd: f64,
        limit_usd: f64,
    },
    PrivacyViolationBlocked {
        task: String,
        reason: String,
        file: String,
    },
}

// ---------------------------------------------------------------------------
// Patchboard events
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum PatchboardEvent {
    CodeGenerated {
        canvas_id: String,
        files: Vec<String>,
    },
    RegistryChanged,
    CanvasChanged {
        canvas_id: String,
    },
}

// ---------------------------------------------------------------------------
// Blueprint events
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum BlueprintEvent {
    FeatureCreated {
        feature_id: String,
    },
    FeatureUpdated {
        feature_id: String,
    },
    CheckCompleted {
        feature_id: String,
        passed: bool,
    },
    IndexChanged,
}

// ---------------------------------------------------------------------------
// Headquarters events
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum HeadquartersEvent {
    RefreshRequested,
    SuggestionChanged {
        level: u8,
        message: String,
    },
}
