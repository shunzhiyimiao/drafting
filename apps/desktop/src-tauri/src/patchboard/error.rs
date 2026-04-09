use thiserror::Error;

#[derive(Debug, Error)]
pub enum PatchboardError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Socket not found: {0}")]
    SocketNotFound(String),

    #[error("Canvas not found: {0}")]
    CanvasNotFound(String),

    #[error("Adapter not found: {0}")]
    AdapterNotFound(String),

    #[error("Wire not found: {0}")]
    WireNotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Cycle detected in wire graph")]
    CycleDetected,

    #[error("Adapter must implement at least one Socket")]
    AdapterNoSocket,

    #[error("Duplicate adapter on canvas: {0}")]
    DuplicateAdapter(String),

    #[error("Patchboard not initialized")]
    NotInitialized,

    #[error("{0}")]
    Other(String),
}

impl From<PatchboardError> for String {
    fn from(e: PatchboardError) -> String {
        e.to_string()
    }
}

pub type Result<T> = std::result::Result<T, PatchboardError>;
