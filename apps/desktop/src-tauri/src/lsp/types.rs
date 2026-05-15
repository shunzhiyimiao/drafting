use serde::{Deserialize, Serialize};

/// Languages we know how to launch a server for.
/// v1 only supports TypeScript / JavaScript via typescript-language-server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LspLanguage {
    Typescript,
}

impl LspLanguage {
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext {
            "ts" | "tsx" | "js" | "jsx" | "mts" | "cts" | "mjs" | "cjs" => {
                Some(LspLanguage::Typescript)
            }
            _ => None,
        }
    }

    pub fn document_language_id(self, ext: &str) -> &'static str {
        match self {
            LspLanguage::Typescript => match ext {
                "tsx" => "typescriptreact",
                "jsx" => "javascriptreact",
                "js" | "mjs" | "cjs" => "javascript",
                _ => "typescript",
            },
        }
    }
}

/// Position in a text document, 0-based.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionItem {
    pub label: String,
    #[serde(default)]
    pub kind: Option<u32>,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub documentation: Option<String>,
    #[serde(default, rename = "insertText")]
    pub insert_text: Option<String>,
    #[serde(default, rename = "sortText")]
    pub sort_text: Option<String>,
    #[serde(default, rename = "filterText")]
    pub filter_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hover {
    pub contents: String,
    #[serde(default)]
    pub range: Option<Range>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub uri: String,
    pub range: Range,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub range: Range,
    pub message: String,
    /// LSP severity: 1=Error, 2=Warning, 3=Info, 4=Hint
    #[serde(default)]
    pub severity: Option<u32>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub code: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishDiagnostics {
    pub uri: String,
    pub diagnostics: Vec<Diagnostic>,
}
