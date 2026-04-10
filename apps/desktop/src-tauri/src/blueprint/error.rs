use thiserror::Error;

#[derive(Debug, Error)]
pub enum BlueprintError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("YAML error: {0}")]
    Yaml(String),

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Blueprint not found: {0}")]
    BlueprintNotFound(String),

    #[error("Template not found: {0}")]
    TemplateNotFound(String),

    #[error("Invalid front matter: {0}")]
    InvalidFrontMatter(String),

    #[error("Blueprint not initialized")]
    NotInitialized,

    #[error("{0}")]
    Other(String),
}

impl From<serde_yaml::Error> for BlueprintError {
    fn from(e: serde_yaml::Error) -> Self {
        BlueprintError::Yaml(e.to_string())
    }
}

impl From<BlueprintError> for String {
    fn from(e: BlueprintError) -> String {
        e.to_string()
    }
}

pub type Result<T> = std::result::Result<T, BlueprintError>;
